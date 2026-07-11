package com.loyalty.platform.campaign.budget;

import com.loyalty.platform.common.context.TenantContext;
import com.loyalty.platform.domain.entity.campaign.*;
import com.loyalty.platform.domain.repository.campaign.*;
import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.jdbc.AutoConfigureTestDatabase;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.context.annotation.Import;
import org.springframework.test.context.TestPropertySource;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.*;

import static org.junit.jupiter.api.Assertions.*;

/**
 * Integration test for Budget Pacing — tests against real DB.
 * Each test is self-contained because @DataJpaTest rolls back per test.
 */
@DataJpaTest
@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.NONE)
@Import({BudgetPacingService.class})
@TestPropertySource(properties = {"spring.jpa.hibernate.ddl-auto=update"})
@DisplayName("Budget Pacing Integration Tests")
class BudgetPacingApiIntegrationTest {

    @Autowired private BudgetPacingRepository pacingRepository;
    @Autowired private BudgetConsumptionRepository consumptionRepository;
    @Autowired private BudgetAlertRepository alertRepository;
    @Autowired private BudgetPacingService service;
    @MockBean private com.loyalty.platform.campaign.intervention.service.InterventionService interventionService;
    @PersistenceContext private EntityManager em;

    private static final String PROG = "PROG001";
    private static final String TAG = "bpt_" + UUID.randomUUID().toString().substring(0, 8);

    private String planId(String suffix) { return "PLAN_" + TAG + "_" + suffix; }

    @BeforeEach
    void setUp() {
        TenantContext.set(PROG);
    }

    @AfterEach
    void tearDown() {
        TenantContext.clear();
    }

    private BudgetPacing createAndSave(String suffix) {
        String pid = planId(suffix);
        BudgetPacing p = BudgetPacing.builder()
                .id("BP_" + TAG + "_" + suffix).planId(pid).workspaceId("WS_INT").programCode(PROG)
                .totalBudget(BigDecimal.valueOf(100000))
                .pacingMode("EVEN").dailyCapEnabled(true)
                .dailyCapAmount(BigDecimal.valueOf(10000))
                .build();
        return pacingRepository.save(p);
    }

    // ========================================================================
    // Pacing CRUD
    // ========================================================================

    @Test
    @DisplayName("1. 创建预算节奏配置 → 持久化 + 查询")
    void shouldCreateAndPersistPacing() {
        BudgetPacing p = createAndSave("crud");
        em.flush();
        em.clear();

        BudgetPacing found = pacingRepository.findByPlanId(p.getPlanId()).orElseThrow();
        assertEquals("EVEN", found.getPacingMode());
        assertEquals(0, BigDecimal.valueOf(100000).compareTo(found.getTotalBudget()));
        assertEquals(0, BigDecimal.valueOf(10000).compareTo(found.getDailyCapAmount()));
        assertTrue(found.isDailyCapEnabled());
        assertEquals("CNY", found.getTotalBudgetCurrency());
        assertEquals(0, BigDecimal.ZERO.compareTo(found.getTotalConsumed()));
        assertFalse(found.isPausedByBudget());
        System.out.println("[PASS] Budget pacing created: " + found.getId());
    }

    @Test
    @DisplayName("2. 更新节奏配置")
    void shouldUpdatePacing() {
        BudgetPacing p = createAndSave("upd");
        em.flush();

        BudgetPacing update = BudgetPacing.builder()
                .totalBudget(BigDecimal.valueOf(200000))
                .pacingMode("DYNAMIC")
                .dailyCapEnabled(false)
                .dailyCapAmount(BigDecimal.valueOf(20000))
                .build();
        service.updatePacing(p.getPlanId(), update);
        em.flush();
        em.clear();

        BudgetPacing updated = pacingRepository.findByPlanId(p.getPlanId()).orElseThrow();
        assertEquals(0, BigDecimal.valueOf(200000).compareTo(updated.getTotalBudget()));
        assertEquals("DYNAMIC", updated.getPacingMode());
        assertFalse(updated.isDailyCapEnabled());
        System.out.println("[PASS] Pacing updated: mode=" + updated.getPacingMode());
    }

    @Test
    @DisplayName("3. service.savePacing → 自动生成ID")
    void shouldAutoGenerateIdViaService() {
        BudgetPacing p = BudgetPacing.builder()
                .planId(planId("svc")).workspaceId("WS").programCode(PROG)
                .totalBudget(BigDecimal.valueOf(50000)).build();
        BudgetPacing saved = service.savePacing(p);
        assertNotNull(saved.getId());
        System.out.println("[PASS] Auto-generated ID: " + saved.getId());
    }

    // ========================================================================
    // Consume Budget
    // ========================================================================

    @Test
    @DisplayName("4. 消耗预算 → 累计+明细")
    void shouldConsumeAndRecordDetail() {
        BudgetPacing p = createAndSave("cons");
        em.flush();

        BudgetPacingService.BudgetCheckResult r = service.consumeBudget(
                p.getPlanId(), "N1", "M1", BigDecimal.valueOf(250), 500, "EMAIL");
        assertTrue(r.isAllowed());
        em.flush();
        em.clear();

        BudgetPacing after = pacingRepository.findByPlanId(p.getPlanId()).orElseThrow();
        assertEquals(0, BigDecimal.valueOf(250).compareTo(after.getTotalConsumed()));
        assertEquals(0, BigDecimal.valueOf(250).compareTo(after.getTodayConsumed()));

        List<BudgetConsumption> cons = consumptionRepository.findByPlanIdOrderByConsumedAtDesc(p.getPlanId());
        assertEquals(1, cons.size());
        assertEquals(0, BigDecimal.valueOf(250).compareTo(cons.get(0).getAmount()));
        assertEquals("EMAIL", cons.get(0).getChannel());
        System.out.println("[PASS] Consumed: " + cons.get(0).getAmount());
    }

    @Test
    @DisplayName("5. 多次消耗 → 累计正确")
    void shouldAccumulateCorrectly() {
        BudgetPacing p = createAndSave("acc");
        em.flush();

        service.consumeBudget(p.getPlanId(), "N1", null, BigDecimal.valueOf(100), 200, "SMS");
        service.consumeBudget(p.getPlanId(), "N2", null, BigDecimal.valueOf(150), 300, "PUSH");
        em.flush();
        em.clear();

        BudgetPacing after = pacingRepository.findByPlanId(p.getPlanId()).orElseThrow();
        assertEquals(0, BigDecimal.valueOf(250).compareTo(after.getTotalConsumed()));
        assertEquals(2, consumptionRepository.findByPlanIdOrderByConsumedAtDesc(p.getPlanId()).size());
        System.out.println("[PASS] Accumulated: total=" + after.getTotalConsumed());
    }

    // ========================================================================
    // Check & Consume Flow
    // ========================================================================

    @Test
    @DisplayName("6. checkAndConsume 完整流程 → 允许")
    void shouldAllowCheckAndConsumeFlow() {
        BudgetPacing p = createAndSave("flow");
        em.flush();

        // checkAndConsume → findById → then findByPlanIdForUpdate inside consumeBudget
        BudgetPacingService.BudgetCheckResult r = service.checkAndConsume(
                p.getPlanId(), "N3", "M2", BigDecimal.valueOf(0.5), 10, "EMAIL");
        assertTrue(r.isAllowed());
        System.out.println("[PASS] checkAndConsume: allowed, consumed=" + r.getConsumedAmount());
    }

    @Test
    @DisplayName("7. 预算检查阻断 → 日上限超限")
    void shouldBlockWhenDailyCapExceeded() {
        BudgetPacing p = createAndSave("blk");
        p.setTodayConsumed(p.getDailyCapAmount().subtract(BigDecimal.valueOf(0.01)));
        pacingRepository.save(p);
        em.flush();

        BudgetPacingService.BudgetCheckResult r = service.checkAndConsume(
                p.getPlanId(), "N4", "M3", BigDecimal.valueOf(0.5), 100, "EMAIL");
        assertFalse(r.isAllowed(), "Should be blocked or partial");
        System.out.println("[PASS] Budget guard: blocked=" + r.isBlocked() + " code=" + r.getBlockCode());
    }

    // ========================================================================
    // Alerts
    // ========================================================================

    @Test
    @DisplayName("8. 告警 CRUD + 按状态查询")
    void shouldPersistAndQueryAlerts() {
        String pid = planId("alerts");
        BudgetAlert a1 = BudgetAlert.builder()
                .id("ALERT_" + TAG + "_w").planId(pid).alertType("WARN")
                .alertMessage("Budget at 80%").threshold(BigDecimal.valueOf(0.8))
                .currentConsumption(BigDecimal.valueOf(80000))
                .totalBudget(BigDecimal.valueOf(100000)).status("ACTIVE").build();
        BudgetAlert a2 = BudgetAlert.builder()
                .id("ALERT_" + TAG + "_r").planId(pid).alertType("CRITICAL")
                .alertMessage("Budget at 95%").threshold(BigDecimal.valueOf(0.95))
                .currentConsumption(BigDecimal.valueOf(95000))
                .totalBudget(BigDecimal.valueOf(100000)).status("RESOLVED")
                .resolvedAt(Instant.now()).resolvedBy("U1").build();
        alertRepository.save(a1);
        alertRepository.save(a2);
        em.flush();

        assertEquals(2, alertRepository.findByPlanIdOrderByTriggeredAtDesc(pid).size());
        assertEquals(1, alertRepository.findByPlanIdAndStatus(pid, "ACTIVE").size());
        assertEquals(1, alertRepository.findByPlanIdAndStatus(pid, "RESOLVED").size());

        boolean exists = alertRepository.existsByPlanIdAndAlertTypeAndTriggeredAtAfter(
                pid, "WARN", Instant.now().minus(1, java.time.temporal.ChronoUnit.HOURS));
        assertTrue(exists);
        System.out.println("[PASS] Alerts: created + dedup check passed");
    }

    // ========================================================================
    // Daily Reset
    // ========================================================================

    @Test
    @DisplayName("9. 每日重置 → 今日归零 + 昨日记录")
    void shouldResetDailyBudget() {
        BudgetPacing p = createAndSave("rst");
        p.setTodayConsumed(BigDecimal.valueOf(3456));
        p.setPausedByBudget(true);
        p.setPausedAt(Instant.now());
        pacingRepository.save(p);
        em.flush();

        service.resetDailyBudget();
        em.flush();
        em.clear();

        BudgetPacing after = pacingRepository.findByPlanId(p.getPlanId()).orElseThrow();
        assertEquals(0, BigDecimal.valueOf(3456).compareTo(after.getYesterdayConsumed()));
        assertEquals(0, BigDecimal.ZERO.compareTo(after.getTodayConsumed()));
        assertEquals(LocalDate.now(), after.getLastResetDate());
        assertFalse(after.isPausedByBudget(), "Should auto-resume");
        System.out.println("[PASS] Daily reset: yesterday=" + after.getYesterdayConsumed() + ", today=0");
    }

    // ========================================================================
    // Budget Exhaustion
    // ========================================================================

    @Test
    @DisplayName("10. 预算耗尽 → pausedByBudget=true")
    void shouldPauseOnBudgetExhaustion() {
        BudgetPacing p = createAndSave("exh");
        p.setTotalConsumed(p.getTotalBudget());
        pacingRepository.save(p);
        em.flush();
        em.clear();

        BudgetPacingService.BudgetCheckResult r = service.checkAndConsume(
                p.getPlanId(), "N5", "M4", BigDecimal.valueOf(0.5), 1, "EMAIL");
        assertTrue(r.isBlocked());
        assertEquals("TOTAL_BUDGET_EXHAUSTED", r.getBlockCode());

        em.flush();
        em.clear();
        BudgetPacing after = pacingRepository.findByPlanId(p.getPlanId()).orElseThrow();
        assertTrue(after.isPausedByBudget(), "Should be paused, got: " + after.isPausedByBudget());
        System.out.println("[PASS] Budget exhausted: paused=" + after.isPausedByBudget());
    }

    // ========================================================================
    // Consumption query
    // ========================================================================

    @Test
    @DisplayName("11. 消耗明细按时间倒序")
    void shouldQueryConsumptionsOrderedByTime() {
        BudgetPacing p = createAndSave("qry");
        em.flush();

        service.consumeBudget(p.getPlanId(), "N1", null, BigDecimal.valueOf(10), 20, "EMAIL");
        service.consumeBudget(p.getPlanId(), "N2", null, BigDecimal.valueOf(20), 40, "SMS");
        service.consumeBudget(p.getPlanId(), "N3", null, BigDecimal.valueOf(30), 60, "PUSH");
        em.flush();

        List<BudgetConsumption> cons = consumptionRepository.findByPlanIdOrderByConsumedAtDesc(p.getPlanId());
        assertEquals(3, cons.size());
        for (int i = 0; i < cons.size() - 1; i++) {
            assertTrue(cons.get(i).getConsumedAt().compareTo(cons.get(i + 1).getConsumedAt()) >= 0,
                    "Should be DESC");
        }
        System.out.println("[PASS] Consumption records: " + cons.size() + " ordered DESC");
    }

    @Test
    @DisplayName("12. 按日期聚合消耗")
    void shouldAggregateByDate() {
        BudgetPacing p = createAndSave("agg");
        em.flush();

        service.consumeBudget(p.getPlanId(), "N1", null, BigDecimal.valueOf(500), 1000, "EMAIL");
        em.flush();

        BigDecimal sum = consumptionRepository.sumAmountByPlanIdAndDate(p.getPlanId(), LocalDate.now());
        assertNotNull(sum);
        assertTrue(sum.compareTo(BigDecimal.ZERO) > 0);
        long count = consumptionRepository.countByPlanIdAndDate(p.getPlanId(), LocalDate.now());
        assertTrue(count > 0);
        System.out.println("[PASS] Today: sum=" + sum + ", count=" + count);
    }

    // ========================================================================
    // Summary
    // ========================================================================

    @Test
    @DisplayName("集成测试总结")
    void printSummary() {
        System.out.println("\n==============================================================");
        System.out.println("  Budget Pacing Integration Test — All Tests Self-Contained");
        System.out.println("  Tag: " + TAG);
        System.out.println("==============================================================");
        assertTrue(true);
    }
}
