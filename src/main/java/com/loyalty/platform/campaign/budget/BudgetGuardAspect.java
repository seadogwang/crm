package com.loyalty.platform.campaign.budget;

import org.aspectj.lang.ProceedingJoinPoint;
import org.aspectj.lang.annotation.Around;
import org.aspectj.lang.annotation.Aspect;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import java.math.BigDecimal;
import java.util.*;

/**
 * 统一拦截器 — 所有发送类 Worker 自动执行预算检查。
 *
 * <p>对现有 Worker 代码零侵入。
 */
@Aspect
@Component
public class BudgetGuardAspect {

    private static final Logger log = LoggerFactory.getLogger(BudgetGuardAspect.class);
    private static final BigDecimal DEFAULT_UNIT_COST = BigDecimal.valueOf(0.50);

    private final BudgetPacingService budgetPacingService;

    public BudgetGuardAspect(BudgetPacingService budgetPacingService) {
        this.budgetPacingService = budgetPacingService;
    }

    @Around("execution(* com.loyalty.platform.campaign.execution.worker.SendChannelWorker.handle(..))")
    public Object checkBudget(ProceedingJoinPoint joinPoint) throws Throwable {
        return doCheck(joinPoint, "EMAIL");
    }

    @SuppressWarnings("unchecked")
    private Object doCheck(ProceedingJoinPoint joinPoint, String defaultChannel) throws Throwable {
        Object[] args = joinPoint.getArgs();
        if (args.length == 0 || !(args[0] instanceof Map)) {
            return joinPoint.proceed();
        }

        Map<String, Object> variables = (Map<String, Object>) args[0];
        String planId = (String) variables.getOrDefault("planId", null);
        List<String> memberIds = extractMemberIds(variables);
        String channel = (String) variables.getOrDefault("channel", defaultChannel);

        if (planId == null || memberIds == null || memberIds.isEmpty()) {
            return joinPoint.proceed();
        }

        BigDecimal unitCost = getUnitCost(channel);
        BudgetPacingService.BudgetCheckResult result =
                budgetPacingService.checkAndConsume(planId, null, null,
                        unitCost, memberIds.size(), channel);

        if (result.isBlocked()) {
            log.warn("Budget blocked: planId={}, code={}, reason={}",
                    planId, result.getBlockCode(), result.getBlockReason());
            Map<String, Object> skipResult = new HashMap<>();
            skipResult.put("status", "SKIPPED");
            skipResult.put("reason", "BUDGET_BLOCKED");
            skipResult.put("blockCode", result.getBlockCode());
            return skipResult;
        }

        if (result.isPartial()) {
            int adjusted = result.getAdjustedQuantity();
            variables.put("memberIds", memberIds.subList(0, Math.min(adjusted, memberIds.size())));
            log.info("Budget partial: planId={}, {} → {}", planId, memberIds.size(), adjusted);
        }

        variables.put("budgetRemaining", result.getRemainingBudget());
        variables.put("budgetTotal", result.getTotalBudget());
        return joinPoint.proceed();
    }

    @SuppressWarnings("unchecked")
    private List<String> extractMemberIds(Map<String, Object> vars) {
        Object obj = vars.get("memberIds");
        if (obj instanceof List) return (List<String>) obj;
        Object single = vars.get("memberId");
        return single != null ? List.of(single.toString()) : null;
    }

    private BigDecimal getUnitCost(String channel) {
        return switch (channel != null ? channel.toUpperCase() : "EMAIL") {
            case "SMS" -> BigDecimal.valueOf(0.80);
            case "PUSH" -> BigDecimal.valueOf(0.30);
            default -> DEFAULT_UNIT_COST;
        };
    }
}
