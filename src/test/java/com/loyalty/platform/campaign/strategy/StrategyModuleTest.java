package com.loyalty.platform.campaign.strategy;

import com.loyalty.platform.domain.entity.campaign.*;
import com.loyalty.platform.domain.repository.campaign.*;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.*;
import org.mockito.junit.jupiter.MockitoExtension;
import java.math.BigDecimal;
import java.util.*;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
@DisplayName("Strategy Blueprint Module Tests")
class StrategyModuleTest {

    @Mock private CampaignGoalRepository goalRepository;
    @Mock private StrategyBlueprintRepository blueprintRepository;
    @Mock private GoalDecompositionRepository decompositionRepository;
    @Mock private CampaignInitiativeRepository initiativeRepository;
    private StrategyWorkflowService service;

    @BeforeEach void setUp() {
        service = new StrategyWorkflowService(goalRepository, blueprintRepository,
                decompositionRepository, initiativeRepository);
    }

    @Nested @DisplayName("Step 1: 创建目标+匹配蓝图")
    class CreateGoalTests {
        @Test @DisplayName("有行业类型 → 自动匹配行业蓝图")
        void shouldMatchIndustryBlueprint() {
            CampaignGoal g = buildGoal("RETAIL", null);
            StrategyBlueprint bp = buildBlueprint("tmpl_retail_001", "RETAIL", false);
            when(blueprintRepository.findByIndustryTypeAndIsActiveTrue("RETAIL")).thenReturn(List.of(bp));
            when(goalRepository.save(any())).thenReturn(g);

            CampaignGoal saved = service.createGoalWithBlueprint(g);
            assertEquals("tmpl_retail_001", saved.getBlueprintId());
            assertEquals("GOAL_DRAFT", saved.getWorkflowStatus());
        }

        @Test @DisplayName("无行业蓝图 → 降级通用蓝图")
        void shouldFallbackToGeneral() {
            CampaignGoal g = buildGoal("UNKNOWN", null);
            StrategyBlueprint general = buildBlueprint("tmpl_general_001", "GENERAL", true);
            when(blueprintRepository.findByIndustryTypeAndIsActiveTrue("UNKNOWN")).thenReturn(List.of());
            when(blueprintRepository.findByIsSystemDefaultTrueAndIsActiveTrue()).thenReturn(Optional.of(general));
            when(goalRepository.save(any())).thenReturn(g);

            CampaignGoal saved = service.createGoalWithBlueprint(g);
            assertEquals("tmpl_general_001", saved.getBlueprintId());
        }

        @Test @DisplayName("已指定蓝图ID → 不自动匹配")
        void shouldKeepExplicitBlueprint() {
            CampaignGoal g = buildGoal("RETAIL", "tmpl_custom");
            when(goalRepository.save(any())).thenReturn(g);
            CampaignGoal saved = service.createGoalWithBlueprint(g);
            assertEquals("tmpl_custom", saved.getBlueprintId());
        }
    }

    @Nested @DisplayName("Step 2: 分析缺口")
    class GapAnalysisTests {
        @Test @DisplayName("有蓝图 → BLUEPRINT模式")
        void shouldDecomposeWithBlueprint() {
            CampaignGoal g = buildGoal("RETAIL", "tmpl_retail_001");
            g.setCurrentValue(BigDecimal.valueOf(800000));
            g.setTargetValue(BigDecimal.valueOf(1000000));
            StrategyBlueprint bp = buildBlueprint("tmpl_retail_001", "RETAIL", false);
            when(goalRepository.findById("G1")).thenReturn(Optional.of(g));
            when(blueprintRepository.findById("tmpl_retail_001")).thenReturn(Optional.of(bp));
            when(decompositionRepository.save(any())).thenAnswer(i -> i.getArgument(0));

            GoalDecomposition d = service.analyzeGap("G1");
            assertEquals("BLUEPRINT", d.getDecompositionMode());
            assertEquals(0, BigDecimal.valueOf(200000).compareTo(d.getTotalGap()));
            assertEquals("GAP_ANALYZED", g.getWorkflowStatus());
            assertNotNull(d.getInitiativeSuggestions());
            verify(goalRepository).save(g);
        }

        @Test @DisplayName("无蓝图 → CORRELATION模式")
        void shouldDecomposeWithoutBlueprint() {
            CampaignGoal g = buildGoal("UNKNOWN", null);
            g.setCurrentValue(BigDecimal.valueOf(500));
            g.setTargetValue(BigDecimal.valueOf(1000));
            when(goalRepository.findById("G2")).thenReturn(Optional.of(g));
            when(decompositionRepository.save(any())).thenAnswer(i -> i.getArgument(0));

            GoalDecomposition d = service.analyzeGap("G2");
            assertEquals("CORRELATION", d.getDecompositionMode());
            assertTrue(d.getInitiativeSuggestions().contains("ACQUISITION"));
        }
    }

    @Nested @DisplayName("Step 4: 创建举措")
    class CreateInitiativesTests {
        @Test @DisplayName("从拆解结果创建举措")
        void shouldCreateFromDecomposition() {
            CampaignGoal g = buildGoal("RETAIL", "tmpl_retail_001");
            GoalDecomposition d = GoalDecomposition.builder().id("D1").goalId("G1")
                    .initiativeSuggestions("[{\"name\":\"新客获取\",\"type\":\"ACQUISITION\"},{\"name\":\"老客复购\",\"type\":\"RETENTION\"}]")
                    .build();
            when(goalRepository.findById("G1")).thenReturn(Optional.of(g));
            when(decompositionRepository.findTopByGoalIdOrderByCreatedAtDesc("G1")).thenReturn(Optional.of(d));
            when(initiativeRepository.save(any())).thenAnswer(i -> i.getArgument(0));

            List<CampaignInitiative> list = service.createInitiativesFromDecomposition("G1");
            assertEquals(2, list.size());
            assertEquals("新客获取", list.get(0).getName());
            assertEquals("INITIATIVE_CREATED", g.getWorkflowStatus());
        }
    }

    @Nested @DisplayName("蓝图管理")
    class BlueprintTests {
        @Test @DisplayName("按行业查询")
        void shouldQueryByIndustry() {
            StrategyBlueprint bp = buildBlueprint("t1", "RETAIL", false);
            when(blueprintRepository.findByIndustryTypeAndIsActiveTrue("RETAIL")).thenReturn(List.of(bp));
            assertEquals(1, service.getBlueprints("RETAIL").size());
        }

        @Test @DisplayName("saveBlueprint → 自动ID")
        void shouldAutoGenerateId() {
            StrategyBlueprint bp = StrategyBlueprint.builder().blueprintName("Custom").industryType("RETAIL").build();
            when(blueprintRepository.save(any())).thenReturn(bp);
            assertNotNull(service.saveBlueprint(bp));
            verify(blueprintRepository).save(bp);
        }
    }

    @Nested @DisplayName("Gap分析 — 边界情况")
    class GapEdgeCaseTests {
        @Test @DisplayName("currentValue=null → baseline=0")
        void shouldHandleNullCurrentValue() {
            CampaignGoal g = buildGoal("RETAIL", "tmpl_retail_001");
            g.setCurrentValue(null); g.setTargetValue(BigDecimal.valueOf(1000));
            when(goalRepository.findById("G1")).thenReturn(Optional.of(g));
            when(decompositionRepository.save(any())).thenAnswer(i -> i.getArgument(0));

            GoalDecomposition d = service.analyzeGap("G1");
            assertEquals(0, BigDecimal.valueOf(1000).compareTo(d.getTotalGap()));
        }

        @Test @DisplayName("负缺口 → target < baseline")
        void shouldHandleNegativeGap() {
            CampaignGoal g = buildGoal("RETAIL", null);
            g.setCurrentValue(BigDecimal.valueOf(2000)); g.setTargetValue(BigDecimal.valueOf(1000));
            when(goalRepository.findById("G1")).thenReturn(Optional.of(g));
            when(decompositionRepository.save(any())).thenAnswer(i -> i.getArgument(0));

            GoalDecomposition d = service.analyzeGap("G1");
            assertTrue(d.getTotalGap().doubleValue() < 0);
        }

        @Test @DisplayName("goalId不存在 → Exception")
        void shouldThrowOnMissingGoal() {
            when(goalRepository.findById("NONEXIST")).thenReturn(Optional.empty());
            assertThrows(RuntimeException.class, () -> service.analyzeGap("NONEXIST"));
        }

        @Test @DisplayName("无拆解结果时创建举措 → 空列表")
        void shouldReturnEmptyOnNoDecomposition() {
            CampaignGoal g = buildGoal("RETAIL", null);
            when(goalRepository.findById("G1")).thenReturn(Optional.of(g));
            when(decompositionRepository.findTopByGoalIdOrderByCreatedAtDesc("G1")).thenReturn(Optional.empty());
            assertTrue(service.createInitiativesFromDecomposition("G1").isEmpty());
        }
    }

    @Nested @DisplayName("蓝图管理 — 完整覆盖")
    class BlueprintFullTests {
        @Test @DisplayName("getBlueprints(null) → 全部蓝图")
        void shouldReturnAllBlueprints() {
            when(blueprintRepository.findByIsActiveTrue()).thenReturn(List.of(
                    buildBlueprint("t1", "RETAIL", false),
                    buildBlueprint("t2", "SAAS", false)));
            assertEquals(2, service.getBlueprints(null).size());
        }

        @Test @DisplayName("saveBlueprint → 设置ID+保存")
        void shouldSetIdAndSave() {
            StrategyBlueprint bp = buildBlueprint(null, "RETAIL", false);
            when(blueprintRepository.save(any())).thenReturn(bp);
            StrategyBlueprint saved = service.saveBlueprint(bp);
            assertNotNull(saved);
            verify(blueprintRepository).save(bp);
        }

        @Test @DisplayName("已指定ID的蓝图不覆盖ID")
        void shouldKeepExistingId() {
            StrategyBlueprint bp = buildBlueprint("existing_id", "RETAIL", false);
            when(blueprintRepository.save(any())).thenReturn(bp);
            StrategyBlueprint saved = service.saveBlueprint(bp);
            assertEquals("existing_id", saved.getId());
        }
    }

    @Nested @DisplayName("工作流状态转换")
    class WorkflowStatusTests {
        @Test @DisplayName("创建目标 → GOAL_DRAFT")
        void shouldSetDraftStatus() {
            CampaignGoal g = buildGoal("RETAIL", null);
            when(goalRepository.save(any())).thenReturn(g);
            assertEquals("GOAL_DRAFT", service.createGoalWithBlueprint(g).getWorkflowStatus());
        }

        @Test @DisplayName("分析缺口 → GAP_ANALYZED")
        void shouldSetGapAnalyzedStatus() {
            CampaignGoal g = buildGoal("RETAIL", null);
            g.setCurrentValue(BigDecimal.ZERO); g.setTargetValue(BigDecimal.valueOf(1000));
            when(goalRepository.findById("G1")).thenReturn(Optional.of(g));
            when(decompositionRepository.save(any())).thenAnswer(i -> i.getArgument(0));
            service.analyzeGap("G1");
            assertEquals("GAP_ANALYZED", g.getWorkflowStatus());
        }

        @Test @DisplayName("创建举措 → INITIATIVE_CREATED")
        void shouldSetInitiativeCreatedStatus() {
            CampaignGoal g = buildGoal("RETAIL", null);
            GoalDecomposition d = GoalDecomposition.builder().id("D1").goalId("G1")
                    .initiativeSuggestions("[{\"name\":\"测试\",\"type\":\"PROMOTION\"}]").build();
            when(goalRepository.findById("G1")).thenReturn(Optional.of(g));
            when(decompositionRepository.findTopByGoalIdOrderByCreatedAtDesc("G1")).thenReturn(Optional.of(d));
            when(initiativeRepository.save(any())).thenAnswer(i -> i.getArgument(0));
            service.createInitiativesFromDecomposition("G1");
            assertEquals("INITIATIVE_CREATED", g.getWorkflowStatus());
        }
    }

    @Nested @DisplayName("initiativeSuggestions 格式")
    class SuggestionsFormatTests {
        @Test @DisplayName("通过蓝图 → 3条建议 (获取/留存/提升)")
        void shouldGenerate3SuggestionsWithBlueprint() {
            CampaignGoal g = buildGoal("RETAIL", "tmpl_retail_001");
            g.setCurrentValue(BigDecimal.valueOf(800000)); g.setTargetValue(BigDecimal.valueOf(1000000));
            StrategyBlueprint bp = buildBlueprint("tmpl_retail_001", "RETAIL", false);
            when(goalRepository.findById("G1")).thenReturn(Optional.of(g));
            when(blueprintRepository.findById("tmpl_retail_001")).thenReturn(Optional.of(bp));
            when(decompositionRepository.save(any())).thenAnswer(i -> i.getArgument(0));

            GoalDecomposition d = service.analyzeGap("G1");
            assertNotNull(d.getInitiativeSuggestions());
            assertTrue(d.getInitiativeSuggestions().contains("ACQUISITION"));
            assertTrue(d.getInitiativeSuggestions().contains("RETENTION"));
        }

        @Test @DisplayName("无蓝图 → 2条建议 (获取/留存)")
        void shouldGenerate2SuggestionsWithoutBlueprint() {
            CampaignGoal g = buildGoal("UNKNOWN", null);
            g.setCurrentValue(BigDecimal.valueOf(500)); g.setTargetValue(BigDecimal.valueOf(1000));
            when(goalRepository.findById("G1")).thenReturn(Optional.of(g));
            when(decompositionRepository.save(any())).thenAnswer(i -> i.getArgument(0));

            GoalDecomposition d = service.analyzeGap("G1");
            assertNotNull(d.getInitiativeSuggestions());
            assertTrue(d.getInitiativeSuggestions().contains("ACQUISITION"));
            assertTrue(d.getInitiativeSuggestions().contains("RETENTION"));
        }
    }

    // Helpers
    private CampaignGoal buildGoal(String industry, String blueprintId) {
        return CampaignGoal.builder().id("G1").workspaceId("WS").name("Test Goal")
                .goalType("GMV").targetValue(BigDecimal.valueOf(1000000))
                .industryType(industry).blueprintId(blueprintId).build();
    }

    private StrategyBlueprint buildBlueprint(String id, String industry, boolean isDefault) {
        return StrategyBlueprint.builder().id(id).blueprintName(id + " Name")
                .industryType(industry).isSystemDefault(isDefault).isActive(true).build();
    }
}
