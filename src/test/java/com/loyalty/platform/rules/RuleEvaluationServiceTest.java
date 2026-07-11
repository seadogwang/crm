package com.loyalty.platform.rules;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.loyalty.platform.domain.entity.RuleDefinition;
import com.loyalty.platform.domain.entity.VariableFact;
import com.loyalty.platform.domain.repository.RuleDefinitionRepository;
import com.loyalty.platform.rules.action.Action;
import com.loyalty.platform.rules.drl.MemberFact;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.math.BigDecimal;
import java.util.*;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.when;

/**
 * RuleEvaluationService 单元测试。
 */
@ExtendWith(MockitoExtension.class)
@DisplayName("RuleEvaluationService")
class RuleEvaluationServiceTest {

    @Mock
    private RuleDefinitionRepository ruleRepo;

    @Mock
    private VariableCalculationService varCalcService;

    @Mock
    private KieBaseCacheManager kieManager;

    private final ObjectMapper objectMapper = new ObjectMapper();

    private RuleEvaluationService service;

    @BeforeEach
    void setUp() {
        service = new RuleEvaluationService(ruleRepo, varCalcService, kieManager, objectMapper);
    }

    @Nested
    @DisplayName("extractVariableCodes")
    class ExtractVariableCodes {

        @Test
        @DisplayName("提取 VARIABLE 类型条件中的变量编码")
        void extractVariableConditions() {
            Map<String, Object> metadata = new LinkedHashMap<>();
            List<Map<String, Object>> conditions = new ArrayList<>();
            Map<String, Object> cond1 = new LinkedHashMap<>();
            cond1.put("type", "VARIABLE");
            cond1.put("varCode", "total_act");
            cond1.put("operator", ">=");
            cond1.put("threshold", 1000);
            conditions.add(cond1);

            Map<String, Object> cond2 = new LinkedHashMap<>();
            cond2.put("type", "VARIABLE");
            cond2.put("varCode", "sign_days");
            cond2.put("operator", ">=");
            cond2.put("threshold", 7);
            conditions.add(cond2);
            metadata.put("conditions", conditions);

            RuleDefinition rule = RuleDefinition.builder()
                    .id(1L)
                    .programCode("PROG")
                    .ruleCode("TEST_RULE")
                    .metadata(metadata)
                    .build();

            Set<String> varCodes = service.extractVariableCodes(List.of(rule));
            assertThat(varCodes).containsExactly("total_act", "sign_days");
        }

        @Test
        @DisplayName("无 VARIABLE 条件时返回空集合")
        void noVariableConditions() {
            Map<String, Object> metadata = new LinkedHashMap<>();
            List<Map<String, Object>> conditions = new ArrayList<>();
            Map<String, Object> cond = new LinkedHashMap<>();
            cond.put("type", "FIELD");
            cond.put("field", "order_amount");
            conditions.add(cond);
            metadata.put("conditions", conditions);

            RuleDefinition rule = RuleDefinition.builder()
                    .id(1L)
                    .programCode("PROG")
                    .ruleCode("TEST_RULE")
                    .metadata(metadata)
                    .build();

            Set<String> varCodes = service.extractVariableCodes(List.of(rule));
            assertThat(varCodes).isEmpty();
        }

        @Test
        @DisplayName("无 metadata 的规则跳过")
        void nullMetadata() {
            RuleDefinition rule = RuleDefinition.builder()
                    .id(1L)
                    .programCode("PROG")
                    .ruleCode("TEST_RULE")
                    .metadata(null)
                    .build();

            Set<String> varCodes = service.extractVariableCodes(List.of(rule));
            assertThat(varCodes).isEmpty();
        }

        @Test
        @DisplayName("混合规则提取去重")
        void mixedRulesDeduplication() {
            Map<String, Object> metadata1 = new LinkedHashMap<>();
            List<Map<String, Object>> conds1 = new ArrayList<>();
            Map<String, Object> c1 = new LinkedHashMap<>();
            c1.put("type", "VARIABLE");
            c1.put("varCode", "total_act");
            conds1.add(c1);
            metadata1.put("conditions", conds1);

            Map<String, Object> metadata2 = new LinkedHashMap<>();
            List<Map<String, Object>> conds2 = new ArrayList<>();
            Map<String, Object> c2 = new LinkedHashMap<>();
            c2.put("type", "VARIABLE");
            c2.put("varCode", "total_act");  // 重复
            conds2.add(c2);
            Map<String, Object> c3 = new LinkedHashMap<>();
            c3.put("type", "VARIABLE");
            c3.put("varCode", "vip_score");
            conds2.add(c3);
            metadata2.put("conditions", conds2);

            RuleDefinition rule1 = RuleDefinition.builder().id(1L).programCode("PROG").ruleCode("R1").metadata(metadata1).build();
            RuleDefinition rule2 = RuleDefinition.builder().id(2L).programCode("PROG").ruleCode("R2").metadata(metadata2).build();

            Set<String> varCodes = service.extractVariableCodes(List.of(rule1, rule2));
            assertThat(varCodes).containsExactly("total_act", "vip_score");
        }
    }

    @Nested
    @DisplayName("evaluateWithDetails")
    class EvaluateWithDetails {

        @Test
        @DisplayName("无规则时返回空结果")
        void noRules() {
            when(ruleRepo.findActiveByProgramCode("PROG")).thenReturn(Collections.emptyList());

            MemberFact member = new MemberFact("PROG", 1L, "BASE", "ACTIVE", null);
            var result = service.evaluateWithDetails("PROG", new Object(), member, 365);

            assertThat(result.actions()).isEmpty();
            assertThat(result.variableValues()).isEmpty();
            assertThat(result.extractedVarCodes()).isEmpty();
        }
    }
}