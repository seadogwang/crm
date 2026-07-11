package com.loyalty.platform.campaign.experiment;

import com.loyalty.platform.common.context.TenantContext;
import com.loyalty.platform.common.event.EventBridge;
import com.loyalty.platform.domain.entity.campaign.Experiment;
import com.loyalty.platform.domain.entity.campaign.ExperimentAssignment;
import com.loyalty.platform.domain.entity.campaign.ExperimentLearning;
import com.loyalty.platform.domain.entity.campaign.ExperimentVariant;
import com.loyalty.platform.domain.repository.campaign.ExperimentAssignmentRepository;
import com.loyalty.platform.domain.repository.campaign.ExperimentLearningRepository;
import com.loyalty.platform.domain.repository.campaign.ExperimentRepository;
import com.loyalty.platform.domain.repository.campaign.ExperimentVariantRepository;
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
import java.util.*;

import static org.junit.jupiter.api.Assertions.*;

/**
 * Integration test for Experiment module — tests against real DB.
 *
 * <p>Uses {@code ddl-auto: update} so Hibernate auto-creates experiment tables from
 * JPA entities, ensuring test data survives for inspection.
 *
 * Coverage:
 * - Experiment CRUD via repositories
 * - Variant management (add, query, increment)
 * - Assignment persistence with unique constraint
 * - Full lifecycle: create → start → assign → stats → complete
 * - Scheduler auto-completion
 */
@DataJpaTest
@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.NONE)
@Import({ExperimentStatisticsEngine.class, ExperimentScheduler.class})
@TestPropertySource(properties = {
        "spring.jpa.hibernate.ddl-auto=update",
        "spring.jpa.properties.hibernate.format_sql=true"
})
@TestMethodOrder(MethodOrderer.OrderAnnotation.class)
@DisplayName("Experiment API Integration Tests")
class ExperimentApiIntegrationTest {

    @Autowired private ExperimentRepository experimentRepository;
    @Autowired private ExperimentVariantRepository variantRepository;
    @Autowired private ExperimentAssignmentRepository assignmentRepository;
    @Autowired private ExperimentStatisticsEngine statsEngine;
    @Autowired private ExperimentScheduler scheduler;
    @MockBean private EventBridge eventBridge;
    @MockBean private ExperimentLearningRepository learningRepository;
    @PersistenceContext private EntityManager em;

    private static final String PROG = "PROG001";
    private static final String WS_ID = "WS_INTEGRATION";
    private static final String PLAN_ID = "PLAN_INTEGRATION";
    private static final String TAG = "itg_" + UUID.randomUUID().toString().substring(0, 8);

    private String experimentId;

    @BeforeEach
    void setUp() {
        TenantContext.set(PROG);
    }

    @AfterEach
    void tearDown() {
        if (experimentId != null) {
            try {
                em.createNativeQuery("DELETE FROM campaign_experiment_assignment WHERE experiment_id = :eid")
                        .setParameter("eid", experimentId).executeUpdate();
                em.createNativeQuery("DELETE FROM campaign_experiment_variant WHERE experiment_id = :eid")
                        .setParameter("eid", experimentId).executeUpdate();
                em.createNativeQuery("DELETE FROM campaign_experiment WHERE id = :eid")
                        .setParameter("eid", experimentId).executeUpdate();
            } catch (Exception ignored) {
                // Transaction may be aborted; data will be rolled back by @DataJpaTest
            }
        }
        TenantContext.clear();
    }

    // ========================================================================
    // Experiment CRUD
    // ========================================================================

    @Test @Order(1)
    @DisplayName("1. 创建实验 + 查询 → 持久化正确")
    void shouldCreateAndQueryExperiment() {
        Experiment exp = Experiment.builder()
                .id("EXP_" + TAG).planId(PLAN_ID).workspaceId(WS_ID).programCode(PROG)
                .name("集成测试-邮件主题A/B测试")
                .description("验证实验CRUD持久化")
                .objectiveMetric("CLICK_RATE")
                .objectiveDirection("HIGHER")
                .trafficAllocationPct(BigDecimal.valueOf(100))
                .statisticalSignificance(BigDecimal.valueOf(0.95))
                .autoPromoteWinner(true)
                .autoPromoteDelayMinutes(1440).build();
        experimentId = exp.getId();

        experimentRepository.save(exp);
        em.flush();
        em.clear();

        Experiment saved = experimentRepository.findById(experimentId).orElseThrow();
        assertEquals("集成测试-邮件主题A/B测试", saved.getName());
        assertEquals("DRAFT", saved.getStatus());
        assertEquals("CLICK_RATE", saved.getObjectiveMetric());
        assertEquals(BigDecimal.valueOf(0.95), saved.getStatisticalSignificance());
        assertTrue(saved.isAutoPromoteWinner());
        assertEquals(1440, saved.getAutoPromoteDelayMinutes());
        System.out.println("[PASS] Experiment CRUD: created and queried successfully");
    }

    @Test @Order(2)
    @DisplayName("2. 按 planId 查询实验列表")
    void shouldFindByPlanId() {
        Experiment exp = Experiment.builder()
                .id("EXP_" + TAG + "_p").planId(PLAN_ID).workspaceId(WS_ID).programCode(PROG)
                .name("计划查询测试").objectiveMetric("OPEN_RATE").build();
        experimentRepository.save(exp);
        experimentId = exp.getId();
        em.flush();

        List<Experiment> list = experimentRepository.findByPlanId(PLAN_ID);
        assertFalse(list.isEmpty());
        assertTrue(list.stream().anyMatch(e -> e.getId().equals(experimentId)));
        System.out.println("[PASS] findByPlanId: found " + list.size() + " experiments");
    }

    @Test @Order(3)
    @DisplayName("3. 更新实验状态 DRAFT→RUNNING")
    void shouldUpdateStatus() {
        Experiment exp = Experiment.builder()
                .id("EXP_" + TAG + "_u").planId(PLAN_ID).workspaceId(WS_ID).programCode(PROG)
                .name("状态更新测试").objectiveMetric("CLICK_RATE").status("DRAFT").build();
        experimentRepository.save(exp);
        experimentId = exp.getId();
        em.flush();
        em.clear();

        exp.setStatus("RUNNING");
        exp.setStartedAt(Instant.now());
        experimentRepository.save(exp);
        em.flush();
        em.clear();

        Experiment updated = experimentRepository.findById(experimentId).orElseThrow();
        assertEquals("RUNNING", updated.getStatus());
        assertNotNull(updated.getStartedAt());
        System.out.println("[PASS] Status update: DRAFT→RUNNING verified");
    }

    @Test @Order(4)
    @DisplayName("4. 按 status 过滤查询")
    void shouldFindByStatus() {
        Experiment exp = Experiment.builder()
                .id("EXP_" + TAG + "_s").planId(PLAN_ID).workspaceId(WS_ID).programCode(PROG)
                .name("状态查询测试").objectiveMetric("CONVERSION_RATE")
                .status("RUNNING").startedAt(Instant.now()).build();
        experimentRepository.save(exp);
        experimentId = exp.getId();
        em.flush();

        List<Experiment> running = experimentRepository.findByStatus("RUNNING");
        assertFalse(running.isEmpty());
        System.out.println("[PASS] findByStatus: found " + running.size() + " running experiments");
    }

    // ========================================================================
    // Variant Management
    // ========================================================================

    @Test @Order(5)
    @DisplayName("5. 变体 CRUD：添加3个变体 + 查询 + 排序")
    void shouldManageVariants() {
        Experiment exp = Experiment.builder()
                .id("EXP_" + TAG + "_v").planId(PLAN_ID).workspaceId(WS_ID).programCode(PROG)
                .name("变体测试").objectiveMetric("CLICK_RATE").build();
        experimentRepository.save(exp);
        experimentId = exp.getId();

        List<ExperimentVariant> variants = List.of(
                buildVariant("VAR_" + TAG + "_A", experimentId, "控制组", "A", 50),
                buildVariant("VAR_" + TAG + "_B", experimentId, "变体B", "B", 30),
                buildVariant("VAR_" + TAG + "_C", experimentId, "变体C", "C", 20));
        variantRepository.saveAll(variants);
        em.flush();

        List<ExperimentVariant> found = variantRepository.findByExperimentId(experimentId);
        assertEquals(3, found.size());

        List<ExperimentVariant> ordered = variantRepository.findByExperimentIdOrderByVariantCodeAsc(experimentId);
        assertEquals("A", ordered.get(0).getVariantCode());
        assertEquals("B", ordered.get(1).getVariantCode());
        assertEquals("C", ordered.get(2).getVariantCode());
        System.out.println("[PASS] Variant CRUD: 3 variants created and ordered");
    }

    @Test @Order(6)
    @DisplayName("6. 变体 node_overrides JSONB 持久化")
    void shouldPersistNodeOverridesJson() {
        Experiment exp = Experiment.builder()
                .id("EXP_" + TAG + "_j").planId(PLAN_ID).workspaceId(WS_ID).programCode(PROG)
                .name("JSONB测试").objectiveMetric("CLICK_RATE").build();
        experimentRepository.save(exp);
        experimentId = exp.getId();

        ExperimentVariant v = ExperimentVariant.builder()
                .id("VAR_" + TAG + "_json").experimentId(experimentId)
                .variantName("JSON变体").variantCode("A")
                .trafficPercentage(BigDecimal.valueOf(100))
                .nodeOverrides("{\"SEND_EMAIL\":{\"asset_id\":\"asset_test\"},\"OFFER_POINTS\":{\"amount\":500}}")
                .build();
        variantRepository.save(v);
        em.flush();
        em.clear();

        ExperimentVariant found = variantRepository.findById(v.getId()).orElseThrow();
        assertNotNull(found.getNodeOverrides());
        assertTrue(found.getNodeOverrides().contains("asset_test"));
        assertTrue(found.getNodeOverrides().contains("500"));
        System.out.println("[PASS] JSONB node_overrides persisted correctly");
    }

    @Test @Order(7)
    @DisplayName("7. 递增曝光/事件计数（@Modifying update query）")
    void shouldIncrementCounters() {
        Experiment exp = Experiment.builder()
                .id("EXP_" + TAG + "_inc").planId(PLAN_ID).workspaceId(WS_ID).programCode(PROG)
                .name("计数递增测试").objectiveMetric("CLICK_RATE").build();
        experimentRepository.save(exp);
        experimentId = exp.getId();

        ExperimentVariant v = buildVariant("VAR_" + TAG + "_inc", experimentId, "测试", "A", 100);
        variantRepository.save(v);
        em.flush();

        variantRepository.incrementExposureCount(v.getId());
        variantRepository.incrementExposureCount(v.getId());
        variantRepository.incrementEventCount(v.getId());
        em.flush();
        em.clear();

        ExperimentVariant updated = variantRepository.findById(v.getId()).orElseThrow();
        assertEquals(2, updated.getExposureCount());
        assertEquals(1, updated.getEventCount());
        System.out.println("[PASS] Counter increment: exposure=2, event=1");
    }

    // ========================================================================
    // Assignment Management
    // ========================================================================

    @Test @Order(8)
    @DisplayName("8. 分流记录唯一约束：(experiment_id, member_id)")
    void shouldEnforceUniqueConstraint() {
        Experiment exp = Experiment.builder()
                .id("EXP_" + TAG + "_uc").planId(PLAN_ID).workspaceId(WS_ID).programCode(PROG)
                .name("唯一约束测试").objectiveMetric("CLICK_RATE").build();
        experimentRepository.save(exp);
        experimentId = exp.getId();

        // First insert succeeds
        assignmentRepository.save(ExperimentAssignment.builder()
                .id("ASG_" + TAG + "_1").experimentId(experimentId)
                .memberId("MEMBER_UC").variantId("VAR_A")
                .bucketKey("MEMBER_UC:" + experimentId).build());
        em.flush();

        // Second insert with same (experiment_id, member_id) must fail
        // Use try-catch to avoid aborting the test transaction
        boolean constraintViolated = false;
        try {
            assignmentRepository.save(ExperimentAssignment.builder()
                    .id("ASG_" + TAG + "_1_dup").experimentId(experimentId)
                    .memberId("MEMBER_UC").variantId("VAR_B")
                    .bucketKey("MEMBER_UC:" + experimentId).build());
            em.flush();
        } catch (Exception e) {
            constraintViolated = true;
        }
        assertTrue(constraintViolated, "Unique constraint must be enforced on (experiment_id, member_id)");
        System.out.println("[PASS] Unique constraint enforced on (experiment_id, member_id)");
    }

    @Test @Order(9)
    @DisplayName("9. 分流记录批量查询 + 统计")
    void shouldQueryAssignmentsAndCount() {
        Experiment exp = Experiment.builder()
                .id("EXP_" + TAG + "_qa").planId(PLAN_ID).workspaceId(WS_ID).programCode(PROG)
                .name("批量查询测试").objectiveMetric("CLICK_RATE").build();
        experimentRepository.save(exp);
        experimentId = exp.getId();

        for (int i = 0; i < 50; i++) {
            assignmentRepository.save(ExperimentAssignment.builder()
                    .id("ASG_" + TAG + "_q" + i).experimentId(experimentId)
                    .memberId("MQ_" + i).variantId(i < 25 ? "VAR_A" : "VAR_B")
                    .bucketKey("MQ_" + i + ":" + experimentId).build());
        }
        em.flush();

        assertEquals(50, assignmentRepository.countByExperimentId(experimentId));

        List<ExperimentAssignment> all = assignmentRepository.findByExperimentId(experimentId);
        assertEquals(50, all.size());

        List<ExperimentAssignment> varB = assignmentRepository
                .findByExperimentIdAndVariantId(experimentId, "VAR_B");
        assertEquals(25, varB.size());
        System.out.println("[PASS] Assignments: 50 total, 25 per variant");
    }

    @Test @Order(10)
    @DisplayName("10. 更新分流记录的曝光+转化状态")
    void shouldUpdateExposureAndConversion() {
        Experiment exp = Experiment.builder()
                .id("EXP_" + TAG + "_ec").planId(PLAN_ID).workspaceId(WS_ID).programCode(PROG)
                .name("转化更新测试").objectiveMetric("REVENUE_PER_USER").build();
        experimentRepository.save(exp);
        experimentId = exp.getId();

        ExperimentAssignment a = ExperimentAssignment.builder()
                .id("ASG_" + TAG + "_ec").experimentId(experimentId).memberId("M_EC")
                .variantId("VAR_A").bucketKey("M_EC:" + experimentId).build();
        assignmentRepository.save(a);
        em.flush();

        // Simulate exposure + conversion event
        Instant now = Instant.now();
        a.setExposed(true);
        a.setExposedAt(now);
        a.setConverted(true);
        a.setConvertedAt(now);
        a.setConversionValue(BigDecimal.valueOf(299.99));
        assignmentRepository.save(a);
        em.flush();
        em.clear();

        ExperimentAssignment updated = assignmentRepository.findById(a.getId()).orElseThrow();
        assertTrue(updated.isExposed());
        assertTrue(updated.isConverted());
        assertEquals(0, BigDecimal.valueOf(299.99).compareTo(updated.getConversionValue()),
                "Conversion value should be 299.99");
        assertNotNull(updated.getExposedAt());
        assertNotNull(updated.getConvertedAt());
        System.out.println("[PASS] Exposure + conversion state updated");
    }

    // ========================================================================
    // Full Lifecycle
    // ========================================================================

    @Test @Order(11)
    @DisplayName("11. 完整生命周期：创建→变体→启动→分流→统计→完成")
    void shouldCompleteFullLifecycle() {
        // 1. Create
        Experiment exp = Experiment.builder()
                .id("EXP_" + TAG + "_full").planId(PLAN_ID).workspaceId(WS_ID).programCode(PROG)
                .name("完整生命周期").objectiveMetric("CLICK_RATE")
                .objectiveDirection("HIGHER").trafficAllocationPct(BigDecimal.valueOf(100))
                .statisticalSignificance(BigDecimal.valueOf(0.95)).build();
        experimentRepository.save(exp);
        experimentId = exp.getId();

        // 2. Variants (50%/50%)
        ExperimentVariant varA = buildVariant("VAR_" + TAG + "_fA", experimentId, "控制组", "A", 50);
        ExperimentVariant varB = buildVariant("VAR_" + TAG + "_fB", experimentId, "变体B", "B", 50);
        variantRepository.saveAll(List.of(varA, varB));

        // 3. Start
        exp.setStatus("RUNNING");
        exp.setStartedAt(Instant.now());
        experimentRepository.save(exp);

        // 4. Simulate 1000 users: 500 each, A:10% conversion, B:15% conversion
        for (int i = 0; i < 500; i++) {
            assignmentRepository.save(ExperimentAssignment.builder()
                    .id("ASG_" + TAG + "_fA" + i).experimentId(experimentId)
                    .memberId("F_A_" + i).variantId(varA.getId())
                    .bucketKey("F_A_" + i + ":" + experimentId).exposed(true)
                    .converted(i < 50).build()); // 10%
            assignmentRepository.save(ExperimentAssignment.builder()
                    .id("ASG_" + TAG + "_fB" + i).experimentId(experimentId)
                    .memberId("F_B_" + i).variantId(varB.getId())
                    .bucketKey("F_B_" + i + ":" + experimentId).exposed(true)
                    .converted(i < 75).build()); // 15%
        }
        varA.setExposureCount(500); varA.setEventCount(50);
        varB.setExposureCount(500); varB.setEventCount(75);
        variantRepository.saveAll(List.of(varA, varB));
        em.flush();

        // 5. Stats calculation
        List<ExperimentVariant> variants = variantRepository.findByExperimentId(experimentId);
        List<ExperimentAssignment> assignments = assignmentRepository.findByExperimentId(experimentId);
        ExperimentStatisticsEngine.ExperimentStats stats = statsEngine.calculate(exp, variants, assignments);

        assertNotNull(stats.getOverallWinnerId(), "Should have a significant winner");
        assertEquals(varB.getId(), stats.getOverallWinnerId(), "Variant B (15%) should beat A (10%)");
        assertTrue(stats.getOverallImprovement() > 0);
        assertTrue(stats.getSignificantVariants().contains(varB.getId()));

        // 6. Complete
        exp.setStatus("COMPLETED");
        exp.setWinningVariantId(stats.getOverallWinnerId());
        exp.setCompletedAt(Instant.now());
        experimentRepository.save(exp);
        em.flush();
        em.clear();

        Experiment completed = experimentRepository.findById(experimentId).orElseThrow();
        assertEquals("COMPLETED", completed.getStatus());
        assertEquals(varB.getId(), completed.getWinningVariantId());
        System.out.println("[PASS] Full lifecycle: winner=" + varB.getVariantName()
                + ", improvement=" + String.format("%.1f%%", stats.getOverallImprovement() * 100));
    }

    @Test @Order(12)
    @DisplayName("12. REVENUE_PER_USER 指标完整流程")
    void shouldHandleRevenueMetric() {
        Experiment exp = Experiment.builder()
                .id("EXP_" + TAG + "_rev").planId(PLAN_ID).workspaceId(WS_ID).programCode(PROG)
                .name("收入指标测试").objectiveMetric("REVENUE_PER_USER")
                .objectiveDirection("HIGHER").trafficAllocationPct(BigDecimal.valueOf(100)).build();
        experimentRepository.save(exp);
        experimentId = exp.getId();

        ExperimentVariant varA = ExperimentVariant.builder()
                .id("VAR_" + TAG + "_rA").experimentId(experimentId)
                .variantName("控制组").variantCode("A").trafficPercentage(BigDecimal.valueOf(50))
                .exposureCount(100).eventCount(10).totalRevenue(BigDecimal.valueOf(5000)).build();
        ExperimentVariant varB = ExperimentVariant.builder()
                .id("VAR_" + TAG + "_rB").experimentId(experimentId)
                .variantName("变体B").variantCode("B").trafficPercentage(BigDecimal.valueOf(50))
                .exposureCount(100).eventCount(15).totalRevenue(BigDecimal.valueOf(7500)).build();
        variantRepository.saveAll(List.of(varA, varB));
        em.flush();

        List<ExperimentVariant> variants = variantRepository.findByExperimentId(experimentId);
        ExperimentStatisticsEngine.ExperimentStats stats =
                statsEngine.calculate(exp, variants, new ArrayList<>());

        assertEquals(50.0, stats.getMetricValues().get(varA.getId()), 0.01, "$50/user for control");
        assertEquals(75.0, stats.getMetricValues().get(varB.getId()), 0.01, "$75/user for variant");
        System.out.println("[PASS] Revenue metric: control=$50/user, variant=$75/user");
    }

    // ========================================================================
    // Scheduler Integration
    // ========================================================================

    @Test @Order(13)
    @DisplayName("13. 调度器：达到样本量自动完成")
    void shouldSchedulerAutoComplete() {
        Experiment exp = Experiment.builder()
                .id("EXP_" + TAG + "_sch").planId(PLAN_ID).workspaceId(WS_ID).programCode(PROG)
                .name("调度器测试").objectiveMetric("CLICK_RATE")
                .status("RUNNING").startedAt(Instant.now())
                .totalSampleSize(50).build();
        experimentRepository.save(exp);
        experimentId = exp.getId();

        ExperimentVariant varA = buildVariant("VAR_" + TAG + "_sA", experimentId, "控制组", "A", 100);
        variantRepository.save(varA);

        // Add 50 assignments → reaches sample size
        for (int i = 0; i < 50; i++) {
            assignmentRepository.save(ExperimentAssignment.builder()
                    .id("ASG_" + TAG + "_s" + i).experimentId(experimentId)
                    .memberId("MS_" + i).variantId(varA.getId())
                    .bucketKey("MS_" + i + ":" + experimentId).build());
        }
        em.flush();

        scheduler.checkExperiments();
        em.flush();
        em.clear();

        Experiment updated = experimentRepository.findById(experimentId).orElseThrow();
        assertEquals("COMPLETED", updated.getStatus());
        assertNotNull(updated.getCompletedAt());
        System.out.println("[PASS] Scheduler auto-completed at " + updated.getCompletedAt());
    }

    // ========================================================================
    // Workspace-scoped queries
    // ========================================================================

    @Test @Order(14)
    @DisplayName("14. 按 workspaceId + status 组合查询")
    void shouldFindByWorkspaceAndStatus() {
        Experiment exp = Experiment.builder()
                .id("EXP_" + TAG + "_ws").planId(PLAN_ID).workspaceId(WS_ID).programCode(PROG)
                .name("工作区查询").objectiveMetric("OPEN_RATE")
                .status("COMPLETED").completedAt(Instant.now()).build();
        experimentRepository.save(exp);
        experimentId = exp.getId();
        em.flush();

        List<Experiment> byWs = experimentRepository.findByWorkspaceId(WS_ID);
        assertFalse(byWs.isEmpty());

        List<Experiment> byWsAndStatus = experimentRepository.findByWorkspaceIdAndStatus(WS_ID, "COMPLETED");
        assertFalse(byWsAndStatus.isEmpty());
        System.out.println("[PASS] Workspace query: " + byWs.size() + " in workspace, "
                + byWsAndStatus.size() + " completed");
    }

    // ========================================================================
    // Summary
    // ========================================================================

    @Test @Order(99)
    @DisplayName("集成测试总结")
    void printSummary() {
        // Count total persisted data
        List<Experiment> all = experimentRepository.findByWorkspaceId(WS_ID);
        long totalVariants = all.stream()
                .flatMap(e -> variantRepository.findByExperimentId(e.getId()).stream())
                .count();
        System.out.println("\n==============================================================");
        System.out.println("  Experiment Integration Test Summary");
        System.out.println("==============================================================");
        System.out.println("  Experiments created : " + all.size());
        System.out.println("  Variants created    : " + totalVariants);
        System.out.println("  Workspace           : " + WS_ID);
        System.out.println("  Plan                : " + PLAN_ID);
        System.out.println("  Test data preserved for inspection in campaign_experiment*");
        System.out.println("==============================================================");
        assertTrue(true);
    }

    // ========================================================================
    // Helpers
    // ========================================================================

    private ExperimentVariant buildVariant(String id, String expId, String name, String code, int trafficPct) {
        return ExperimentVariant.builder()
                .id(id).experimentId(expId)
                .variantName(name).variantCode(code)
                .trafficPercentage(BigDecimal.valueOf(trafficPct))
                .exposureCount(0).eventCount(0).build();
    }
}
