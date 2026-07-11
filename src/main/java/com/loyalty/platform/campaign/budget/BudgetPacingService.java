package com.loyalty.platform.campaign.budget;

import com.loyalty.platform.campaign.intervention.service.InterventionService;
import com.loyalty.platform.common.exception.BusinessException;
import com.loyalty.platform.domain.entity.campaign.*;
import com.loyalty.platform.domain.repository.campaign.*;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Instant;
import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.util.*;

@Service
@Transactional
public class BudgetPacingService {

    private static final Logger log = LoggerFactory.getLogger(BudgetPacingService.class);

    private final BudgetPacingRepository pacingRepository;
    private final BudgetConsumptionRepository consumptionRepository;
    private final BudgetAlertRepository alertRepository;
    private final InterventionService interventionService;

    public BudgetPacingService(BudgetPacingRepository pacingRepository,
                                BudgetConsumptionRepository consumptionRepository,
                                BudgetAlertRepository alertRepository,
                                InterventionService interventionService) {
        this.pacingRepository = pacingRepository;
        this.consumptionRepository = consumptionRepository;
        this.alertRepository = alertRepository;
        this.interventionService = interventionService;
    }

    // ========================================================================
    // 核心检查方法（Worker / AOP 调用）
    // ========================================================================

    public BudgetCheckResult checkAndConsume(String planId, String nodeId, String memberId,
                                              BigDecimal unitCost, int quantity, String channel) {
        BudgetPacing pacing = getPacing(planId);
        if (pacing == null) {
            return BudgetCheckResult.allow();
        }

        // 1. 总预算检查
        if (pacing.getTotalConsumed().compareTo(pacing.getTotalBudget()) >= 0) {
            handleBudgetExhausted(planId);
            return BudgetCheckResult.block("TOTAL_BUDGET_EXHAUSTED",
                    "Total budget exhausted: " + pacing.getTotalConsumed() + "/" + pacing.getTotalBudget());
        }

        // 2. 今日预算检查
        if (pacing.isDailyCapEnabled() && pacing.getDailyCapAmount() != null) {
            BigDecimal todayRemaining = pacing.getDailyCapAmount().subtract(pacing.getTodayConsumed());
            if (todayRemaining.compareTo(BigDecimal.ZERO) <= 0) {
                return BudgetCheckResult.block("DAILY_CAP_EXHAUSTED",
                        "Daily cap exhausted: " + pacing.getTodayConsumed() + "/" + pacing.getDailyCapAmount());
            }

            BigDecimal totalCost = unitCost.multiply(BigDecimal.valueOf(quantity));
            if (totalCost.compareTo(todayRemaining) > 0) {
                int adjustedQty = todayRemaining.divide(unitCost, 0, RoundingMode.FLOOR).intValue();
                if (adjustedQty <= 0) {
                    return BudgetCheckResult.block("INSUFFICIENT_BUDGET",
                            "Budget insufficient for 1 unit. Remain: " + todayRemaining);
                }
                return BudgetCheckResult.partial(adjustedQty);
            }
        }

        // 3. 告警阈值检查
        checkAlertThresholds(planId, pacing);

        // 4. 执行消耗
        return consumeBudget(planId, nodeId, memberId,
                unitCost.multiply(BigDecimal.valueOf(quantity)), quantity, channel);
    }

    @Transactional
    public BudgetCheckResult consumeBudget(String planId, String nodeId, String memberId,
                                            BigDecimal amount, int quantity, String channel) {
        BudgetPacing pacing = pacingRepository.findByPlanIdForUpdate(planId)
                .orElseThrow(() -> new BusinessException("Budget pacing not found: " + planId));

        BigDecimal totalBefore = pacing.getTotalConsumed();
        BigDecimal todayBefore = pacing.getTodayConsumed();

        pacing.setTotalConsumed(totalBefore.add(amount));
        pacing.setTodayConsumed(todayBefore.add(amount));
        pacingRepository.save(pacing);

        // 消耗明细
        BudgetConsumption consumption = BudgetConsumption.builder()
                .id(UUID.randomUUID().toString())
                .planId(planId).nodeId(nodeId).memberId(memberId)
                .amount(amount).unitCost(amount.divide(BigDecimal.valueOf(quantity), 4, RoundingMode.HALF_UP))
                .quantity(quantity).consumptionType("SEND").channel(channel)
                .totalConsumedBefore(totalBefore).totalConsumedAfter(pacing.getTotalConsumed())
                .todayConsumedBefore(todayBefore).todayConsumedAfter(pacing.getTodayConsumed())
                .consumedAt(Instant.now())
                .build();
        consumptionRepository.save(consumption);

        // 检查是否耗尽
        if (pacing.getTotalConsumed().compareTo(pacing.getTotalBudget()) >= 0) {
            handleBudgetExhausted(planId);
        }

        return BudgetCheckResult.allowWithData(pacing.getTotalConsumed(), pacing.getTotalBudget(),
                pacing.getTodayConsumed(), pacing.getDailyCapAmount(), amount);
    }

    // ========================================================================
    // 每日重置
    // ========================================================================

    @Scheduled(cron = "0 0 0 * * ?")
    @Transactional
    public void resetDailyBudget() {
        List<BudgetPacing> all = pacingRepository.findAll();
        LocalDate today = LocalDate.now();
        for (BudgetPacing pacing : all) {
            pacing.setYesterdayConsumed(pacing.getTodayConsumed());
            pacing.setTodayConsumed(BigDecimal.ZERO);
            pacing.setLastResetDate(today);

            if ("DYNAMIC".equals(pacing.getPacingMode())) {
                pacing.setDailyCapAmount(calculateDynamicDailyBudget(pacing));
            }
            pacingRepository.save(pacing);

            if (pacing.isPausedByBudget()) {
                pacing.setPausedByBudget(false);
                pacing.setPausedAt(null);
                pacingRepository.save(pacing);
                try {
                    interventionService.resumeCampaign(pacing.getPlanId(), "SYSTEM",
                            "Daily budget reset, auto-resume");
                } catch (Exception e) {
                    log.warn("Failed to auto-resume: planId={}, err={}", pacing.getPlanId(), e.getMessage());
                }
            }
        }
        log.info("Daily budget reset completed for {} campaigns", all.size());
    }

    // ========================================================================
    // 动态调速
    // ========================================================================

    private BigDecimal calculateDynamicDailyBudget(BudgetPacing pacing) {
        BigDecimal base = pacing.getDailyCapAmount();
        if (base == null) {
            long days = ChronoUnit.DAYS.between(pacing.getCreatedAt().toLocalDate(),
                    LocalDate.now().plusDays(1));
            base = pacing.getTotalBudget().divide(BigDecimal.valueOf(Math.max(days, 1)),
                    4, RoundingMode.HALF_UP);
        }
        // 简化：基于昨日消耗调整（0.5x ~ 1.5x）
        if (pacing.getYesterdayConsumed() != null &&
                pacing.getYesterdayConsumed().compareTo(BigDecimal.ZERO) > 0) {
            BigDecimal ratio = pacing.getYesterdayConsumed().divide(base, 4, RoundingMode.HALF_UP);
            double factor = Math.min(Math.max(ratio.doubleValue(), 0.5), 1.5);
            return base.multiply(BigDecimal.valueOf(factor * 0.7 + 1.0 * 0.3));
        }
        return base;
    }

    // ========================================================================
    // 告警
    // ========================================================================

    private void checkAlertThresholds(String planId, BudgetPacing pacing) {
        double ratio = pacing.getTotalConsumed()
                .divide(pacing.getTotalBudget(), 4, RoundingMode.HALF_UP).doubleValue();
        if (ratio >= 1.0) triggerAlert(planId, "STOP", "Budget fully consumed", BigDecimal.ONE, pacing);
        else if (ratio >= 0.95) triggerAlert(planId, "CRITICAL", "Budget at " + (int)(ratio*100) + "%", BigDecimal.valueOf(0.95), pacing);
        else if (ratio >= 0.8) triggerAlert(planId, "WARN", "Budget at " + (int)(ratio*100) + "%", BigDecimal.valueOf(0.8), pacing);
    }

    private void triggerAlert(String planId, String type, String message,
                               BigDecimal threshold, BudgetPacing pacing) {
        boolean exists = alertRepository.existsByPlanIdAndAlertTypeAndTriggeredAtAfter(
                planId, type, Instant.now().minus(1, ChronoUnit.HOURS));
        if (exists) return;

        BudgetAlert alert = BudgetAlert.builder()
                .id(UUID.randomUUID().toString()).planId(planId)
                .alertType(type).alertMessage(message).threshold(threshold)
                .currentConsumption(pacing.getTotalConsumed())
                .totalBudget(pacing.getTotalBudget())
                .status("ACTIVE").triggeredAt(Instant.now())
                .build();
        alertRepository.save(alert);
        log.warn("Budget alert: planId={}, type={}, message={}", planId, type, message);
    }

    private void handleBudgetExhausted(String planId) {
        BudgetPacing pacing = getPacing(planId);
        if (pacing == null || pacing.isPausedByBudget()) return;
        pacing.setPausedByBudget(true);
        pacing.setPausedAt(Instant.now());
        pacingRepository.save(pacing);
        try {
            interventionService.pauseCampaign(planId, "SYSTEM",
                    "Budget exhausted: " + pacing.getTotalConsumed() + "/" + pacing.getTotalBudget());
        } catch (Exception e) {
            log.warn("Failed to pause campaign on budget exhaustion: {}", e.getMessage());
        }
    }

    // ========================================================================
    // 查询
    // ========================================================================

    public BudgetPacing getPacing(String planId) {
        return pacingRepository.findByPlanId(planId).orElse(null);
    }

    public BudgetPacing savePacing(BudgetPacing pacing) {
        if (pacing.getId() == null) pacing.setId(UUID.randomUUID().toString());
        return pacingRepository.save(pacing);
    }

    public BudgetPacing updatePacing(String planId, BudgetPacing update) {
        BudgetPacing p = pacingRepository.findByPlanId(planId)
                .orElseThrow(() -> new BusinessException("Pacing not found: " + planId));
        p.setTotalBudget(update.getTotalBudget());
        p.setPacingMode(update.getPacingMode());
        p.setDailyCapEnabled(update.isDailyCapEnabled());
        p.setDailyCapAmount(update.getDailyCapAmount());
        p.setDynamicPacingConfig(update.getDynamicPacingConfig());
        p.setAlertThresholds(update.getAlertThresholds());
        return pacingRepository.save(p);
    }

    public List<BudgetConsumption> getConsumptions(String planId) {
        return consumptionRepository.findByPlanIdOrderByConsumedAtDesc(planId);
    }

    public List<BudgetAlert> getAlerts(String planId, String status) {
        return status != null
                ? alertRepository.findByPlanIdAndStatus(planId, status)
                : alertRepository.findByPlanIdOrderByTriggeredAtDesc(planId);
    }

    // ========================================================================
    // Result class
    // ========================================================================

    @lombok.Data
    @lombok.Builder
    @lombok.NoArgsConstructor
    @lombok.AllArgsConstructor
    public static class BudgetCheckResult {
        private boolean allowed;
        private boolean blocked;
        private boolean partial;
        private int adjustedQuantity;
        private String blockCode;
        private String blockReason;
        private BigDecimal consumedAmount;
        private BigDecimal remainingBudget;
        private BigDecimal totalBudget;
        private BigDecimal todayConsumed;
        private BigDecimal dailyCap;

        public static BudgetCheckResult allow() {
            return BudgetCheckResult.builder().allowed(true).build();
        }

        public static BudgetCheckResult block(String code, String reason) {
            return BudgetCheckResult.builder().allowed(false).blocked(true)
                    .blockCode(code).blockReason(reason).build();
        }

        public static BudgetCheckResult partial(int adjustedQty) {
            return BudgetCheckResult.builder().allowed(true).partial(true)
                    .adjustedQuantity(adjustedQty).build();
        }

        public static BudgetCheckResult allowWithData(BigDecimal totalConsumed, BigDecimal totalBudget,
                                                       BigDecimal todayConsumed, BigDecimal dailyCap,
                                                       BigDecimal consumedAmount) {
            return BudgetCheckResult.builder().allowed(true)
                    .totalBudget(totalBudget).remainingBudget(totalBudget.subtract(totalConsumed))
                    .consumedAmount(consumedAmount)
                    .todayConsumed(todayConsumed).dailyCap(dailyCap).build();
        }
    }
}
