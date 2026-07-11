package com.loyalty.platform.rules;

import com.loyalty.platform.domain.entity.RuleVariableDefinition;
import com.loyalty.platform.domain.repository.AccountTransactionRepository;
import com.loyalty.platform.domain.repository.RuleVariableDefinitionRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.Collections;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doReturn;
import static org.mockito.Mockito.when;
import static org.mockito.Mockito.when;

/**
 * VariableCalculationService 单元测试。
 *
 * <p>覆盖：表达式替换、变量计算、按需预加载、边界条件。
 */
@ExtendWith(MockitoExtension.class)
@DisplayName("VariableCalculationService")
class VariableCalculationServiceTest {

    @Mock
    private RuleVariableDefinitionRepository varRepo;

    @Mock
    private AccountTransactionRepository txRepo;

    private VariableExpressionParser parser;
    private VariableCalculationService service;

    @BeforeEach
    void setUp() {
        parser = new VariableExpressionParser();
        service = new VariableCalculationService(varRepo, txRepo, parser);
    }

    // ===== 表达式替换 =====

    @Nested
    @DisplayName("replaceFunctionsWithValues")
    class ReplaceFunctionsWithValues {

        @Test
        @DisplayName("替换 sum 函数为数值")
        void replaceSum() {
            String expr = "sum('ACT_A') + sum('ACT_B')";
            Map<String, BigDecimal> sums = Map.of("ACT_A", new BigDecimal("800.00"), "ACT_B", new BigDecimal("350.50"));
            Map<String, BigDecimal> counts = Collections.emptyMap();
            Map<String, BigDecimal> balances = Collections.emptyMap();

            String result = service.replaceFunctionsWithValues(expr, sums, counts, balances);
            assertThat(result).isEqualTo("800.00 + 350.50");
        }

        @Test
        @DisplayName("替换 count 函数为数值")
        void replaceCount() {
            String expr = "count('SIGN_IN')";
            Map<String, BigDecimal> sums = Collections.emptyMap();
            Map<String, BigDecimal> counts = Map.of("SIGN_IN", new BigDecimal("7"));
            Map<String, BigDecimal> balances = Collections.emptyMap();

            String result = service.replaceFunctionsWithValues(expr, sums, counts, balances);
            assertThat(result).isEqualTo("7");
        }

        @Test
        @DisplayName("替换 balance 函数为数值")
        void replaceBalance() {
            String expr = "balance('REWARD')";
            Map<String, BigDecimal> sums = Collections.emptyMap();
            Map<String, BigDecimal> counts = Collections.emptyMap();
            Map<String, BigDecimal> balances = Map.of("REWARD", new BigDecimal("5000.00"));

            String result = service.replaceFunctionsWithValues(expr, sums, counts, balances);
            assertThat(result).isEqualTo("5000.00");
        }

        @Test
        @DisplayName("替换混合函数")
        void replaceMixed() {
            String expr = "sum('ACT_A') + count('SIGN_IN') * 10 + balance('REWARD') * 0.5";
            Map<String, BigDecimal> sums = Map.of("ACT_A", new BigDecimal("100"));
            Map<String, BigDecimal> counts = Map.of("SIGN_IN", new BigDecimal("5"));
            Map<String, BigDecimal> balances = Map.of("REWARD", new BigDecimal("200"));

            String result = service.replaceFunctionsWithValues(expr, sums, counts, balances);
            assertThat(result).isEqualTo("100 + 5 * 10 + 200 * 0.5");
        }

        @Test
        @DisplayName("缺失类型默认值为 0")
        void missingTypeDefaultsToZero() {
            String expr = "sum('ACT_A') + sum('MISSING')";
            Map<String, BigDecimal> sums = Map.of("ACT_A", new BigDecimal("100"));
            Map<String, BigDecimal> counts = Collections.emptyMap();
            Map<String, BigDecimal> balances = Collections.emptyMap();

            String result = service.replaceFunctionsWithValues(expr, sums, counts, balances);
            assertThat(result).isEqualTo("100 + 0");
        }

        @Test
        @DisplayName("常量保持不变")
        void constantsRemain() {
            String expr = "sum('ACT_A') * 0.5 + 100";
            Map<String, BigDecimal> sums = Map.of("ACT_A", new BigDecimal("200"));
            Map<String, BigDecimal> counts = Collections.emptyMap();
            Map<String, BigDecimal> balances = Collections.emptyMap();

            String result = service.replaceFunctionsWithValues(expr, sums, counts, balances);
            assertThat(result).isEqualTo("200 * 0.5 + 100");
        }
    }

    // ===== 表达式计算 =====

    @Nested
    @DisplayName("evaluateExpression")
    class EvaluateExpression {

        @Test
        @DisplayName("简单加法")
        void simpleAddition() {
            BigDecimal result = service.evaluateExpression("100 + 200");
            assertThat(result).isEqualByComparingTo(new BigDecimal("300"));
        }

        @Test
        @DisplayName("带小数的乘除")
        void multiplicationAndDivision() {
            BigDecimal result = service.evaluateExpression("200 * 0.5 + 100");
            assertThat(result).isEqualByComparingTo(new BigDecimal("200.00"));
        }

        @Test
        @DisplayName("复合运算")
        void complexArithmetic() {
            BigDecimal result = service.evaluateExpression("100 + 5 * 10 + 200 * 0.5");
            assertThat(result).isEqualByComparingTo(new BigDecimal("250.0"));
        }

        @Test
        @DisplayName("空表达式返回 0")
        void emptyReturnsZero() {
            assertThat(service.evaluateExpression(null)).isEqualByComparingTo(BigDecimal.ZERO);
            assertThat(service.evaluateExpression("")).isEqualByComparingTo(BigDecimal.ZERO);
        }
    }

    // ===== 变量计算 =====

    @Nested
    @DisplayName("calculateVariables")
    class CalculateVariables {

        @Test
        @DisplayName("空变量列表返回空 Map")
        void emptyVarCodes() {
            Map<String, BigDecimal> result = service.calculateVariables("PROG", Collections.emptyList(), 1L, 365);
            assertThat(result).isEmpty();
        }

        @Test
        @DisplayName("null 变量列表返回空 Map")
        void nullVarCodes() {
            Map<String, BigDecimal> result = service.calculateVariables("PROG", null, 1L, 365);
            assertThat(result).isEmpty();
        }

        @Test
        @DisplayName("无变量定义返回空 Map")
        void noVarDefinitions() {
            when(varRepo.findByProgramCodeAndVarCodeIn(eq("PROG"), any()))
                    .thenReturn(Collections.emptyList());

            Map<String, BigDecimal> result = service.calculateVariables("PROG", List.of("total_act"), 1L, 365);
            assertThat(result).isEmpty();
        }

        @Test
        @DisplayName("正常计算变量值")
        void normalCalculation() {
            // 准备变量定义
            RuleVariableDefinition var = RuleVariableDefinition.builder()
                    .id("v1")
                    .programCode("PROG")
                    .varCode("total_act")
                    .varName("活动总积分")
                    .expression("sum('ACT_A') + sum('ACT_B')")
                    .build();

            when(varRepo.findByProgramCodeAndVarCodeIn(eq("PROG"), eq(List.of("total_act"))))
                    .thenReturn(List.of(var));

            // 模拟数据库返回
            List<Object[]> mockResults = new java.util.ArrayList<>();
            mockResults.add(new Object[]{"ACT_A", new BigDecimal("800.00"), 5L});
            mockResults.add(new Object[]{"ACT_B", new BigDecimal("350.50"), 3L});
            doReturn(mockResults).when(txRepo).sumAndCountByMemberIdAndTypesAndTimeRange(
                    eq("PROG"), eq(1L), any(), any(LocalDateTime.class));

            Map<String, BigDecimal> result = service.calculateVariables("PROG", List.of("total_act"), 1L, 365);
            assertThat(result).containsKey("total_act");
            assertThat(result.get("total_act")).isEqualByComparingTo(new BigDecimal("1150.50"));
        }

        @Test
        @DisplayName("单个变量预览计算")
        void singleVariablePreview() {
            RuleVariableDefinition var = RuleVariableDefinition.builder()
                    .id("v1")
                    .programCode("PROG")
                    .varCode("sign_days")
                    .varName("签到天数")
                    .expression("count('SIGN_IN')")
                    .build();

            when(varRepo.findByProgramCodeAndVarCodeIn(eq("PROG"), eq(List.of("sign_days"))))
                    .thenReturn(List.of(var));

            List<Object[]> mockResults = new java.util.ArrayList<>();
            mockResults.add(new Object[]{"SIGN_IN", new BigDecimal("0"), 7L});
            doReturn(mockResults).when(txRepo).sumAndCountByMemberIdAndTypesAndTimeRange(
                    eq("PROG"), eq(1L), any(), any(LocalDateTime.class));

            BigDecimal value = service.calculateSingleVariable("PROG", "sign_days", 1L, 365);
            assertThat(value).isEqualByComparingTo(new BigDecimal("7"));
        }
    }
}