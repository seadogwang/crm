package com.loyalty.platform.rules;

import com.loyalty.platform.rules.VariableExpressionParser.FunctionCall;
import com.loyalty.platform.rules.VariableExpressionParser.ValidationResult;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.junit.jupiter.params.provider.NullAndEmptySource;
import org.junit.jupiter.params.provider.ValueSource;

import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * VariableExpressionParser 单元测试。
 *
 * <p>覆盖：原子类型提取、表达式验证、函数调用解析、边界条件。
 */
@DisplayName("VariableExpressionParser")
class VariableExpressionParserTest {

    private VariableExpressionParser parser;

    @BeforeEach
    void setUp() {
        parser = new VariableExpressionParser();
    }

    // ===== 原子类型提取 =====

    @Nested
    @DisplayName("extractAtomicTypes")
    class ExtractAtomicTypes {

        @Test
        @DisplayName("提取单个 sum('TYPE')")
        void extractSingleSum() {
            Set<String> types = parser.extractAtomicTypes("sum('ACT_A')");
            assertThat(types).containsExactly("ACT_A");
        }

        @Test
        @DisplayName("提取多个 sum 函数中的类型")
        void extractMultipleSums() {
            Set<String> types = parser.extractAtomicTypes("sum('ACT_A') + sum('ACT_B')");
            assertThat(types).containsExactly("ACT_A", "ACT_B");
        }

        @Test
        @DisplayName("提取 count 函数中的类型")
        void extractCount() {
            Set<String> types = parser.extractAtomicTypes("count('SIGN_IN')");
            assertThat(types).containsExactly("SIGN_IN");
        }

        @Test
        @DisplayName("提取 balance 函数中的类型")
        void extractBalance() {
            Set<String> types = parser.extractAtomicTypes("balance('REWARD')");
            assertThat(types).containsExactly("REWARD");
        }

        @Test
        @DisplayName("提取混合函数中的类型")
        void extractMixedFunctions() {
            Set<String> types = parser.extractAtomicTypes(
                    "sum('ACT_A') + count('SIGN_IN') + balance('REWARD') * 0.5");
            assertThat(types).containsExactly("ACT_A", "SIGN_IN", "REWARD");
        }

        @Test
        @DisplayName("复杂表达式提取去重")
        void extractComplexExpression() {
            Set<String> types = parser.extractAtomicTypes(
                    "sum('ACT_A') + sum('ACT_B') + count('ACT_A') + sum('REWARD') * 0.5 + 100");
            assertThat(types).containsExactly("ACT_A", "ACT_B", "REWARD");
        }

        @Test
        @DisplayName("null 表达式返回空集合")
        void nullExpressionReturnsEmpty() {
            assertThat(parser.extractAtomicTypes(null)).isEmpty();
        }

        @Test
        @DisplayName("空字符串返回空集合")
        void emptyExpressionReturnsEmpty() {
            assertThat(parser.extractAtomicTypes("")).isEmpty();
            assertThat(parser.extractAtomicTypes("   ")).isEmpty();
        }

        @Test
        @DisplayName("无函数调用的表达式返回空集合")
        void noFunctionCallsReturnsEmpty() {
            Set<String> types = parser.extractAtomicTypes("100 + 200");
            assertThat(types).isEmpty();
        }
    }

    // ===== 表达式验证 =====

    @Nested
    @DisplayName("validate")
    class Validate {

        @Test
        @DisplayName("有效表达式验证通过")
        void validExpression() {
            ValidationResult result = parser.validate("sum('ACT_A') + sum('ACT_B')",
                    Set.of("ACT_A", "ACT_B"));
            assertThat(result.valid()).isTrue();
            assertThat(result.message()).isEqualTo("OK");
        }

        @Test
        @DisplayName("null 表达式返回错误")
        void nullExpression() {
            ValidationResult result = parser.validate(null);
            assertThat(result.valid()).isFalse();
            assertThat(result.message()).contains("不能为空");
        }

        @Test
        @DisplayName("空表达式返回错误")
        void emptyExpression() {
            ValidationResult result = parser.validate("");
            assertThat(result.valid()).isFalse();
            assertThat(result.message()).contains("不能为空");
        }

        @Test
        @DisplayName("括号不匹配返回错误")
        void unbalancedParentheses() {
            ValidationResult result = parser.validate("sum('ACT_A' + sum('ACT_B'");
            assertThat(result.valid()).isFalse();
            assertThat(result.message()).contains("括号不匹配");
        }

        @Test
        @DisplayName("右括号多余返回错误")
        void extraClosingParenthesis() {
            ValidationResult result = parser.validate("sum('ACT_A'))");
            assertThat(result.valid()).isFalse();
            assertThat(result.message()).contains("括号不匹配");
        }

        @Test
        @DisplayName("积分类型不存在返回错误")
        void unknownType() {
            ValidationResult result = parser.validate("sum('UNKNOWN_TYPE')",
                    Set.of("ACT_A", "ACT_B"));
            assertThat(result.valid()).isFalse();
            assertThat(result.message()).contains("积分类型不存在");
            assertThat(result.message()).contains("UNKNOWN_TYPE");
        }

        @Test
        @DisplayName("未知函数名返回错误")
        void unknownFunction() {
            ValidationResult result = parser.validate("avg('ACT_A')",
                    Set.of("ACT_A"));
            assertThat(result.valid()).isFalse();
            assertThat(result.message()).contains("未知函数");
        }

        @Test
        @DisplayName("无函数调用返回错误")
        void noFunctionCall() {
            ValidationResult result = parser.validate("100 + 200");
            assertThat(result.valid()).isFalse();
            assertThat(result.message()).contains("至少需要包含一个函数调用");
        }

        @Test
        @DisplayName("非法字符返回错误")
        void illegalCharacters() {
            ValidationResult result = parser.validate("sum('ACT_A'); DROP TABLE users;");
            assertThat(result.valid()).isFalse();
            assertThat(result.message()).contains("非法字符");
        }

        @Test
        @DisplayName("不检查类型存在性时验证通过")
        void skipTypeValidation() {
            ValidationResult result = parser.validate("sum('ACT_A')");
            assertThat(result.valid()).isTrue();
        }

        @Test
        @DisplayName("带常量运算的表达式验证通过")
        void expressionWithConstants() {
            ValidationResult result = parser.validate("sum('REWARD') * 0.5 + 100",
                    Set.of("REWARD"));
            assertThat(result.valid()).isTrue();
        }
    }

    // ===== 函数调用提取 =====

    @Nested
    @DisplayName("extractFunctionCalls")
    class ExtractFunctionCalls {

        @Test
        @DisplayName("提取单个函数调用")
        void extractSingleCall() {
            var calls = parser.extractFunctionCalls("sum('ACT_A')");
            assertThat(calls).hasSize(1);
            assertThat(calls.get(0).function()).isEqualTo("sum");
            assertThat(calls.get(0).typeCode()).isEqualTo("ACT_A");
            assertThat(calls.get(0).raw()).isEqualTo("sum('ACT_A')");
        }

        @Test
        @DisplayName("提取多个函数调用")
        void extractMultipleCalls() {
            var calls = parser.extractFunctionCalls("sum('ACT_A') + count('SIGN_IN')");
            assertThat(calls).hasSize(2);
            assertThat(calls.get(0).function()).isEqualTo("sum");
            assertThat(calls.get(1).function()).isEqualTo("count");
        }

        @Test
        @DisplayName("空表达式返回空列表")
        void nullOrEmptyReturnsEmpty() {
            assertThat(parser.extractFunctionCalls(null)).isEmpty();
            assertThat(parser.extractFunctionCalls("")).isEmpty();
        }
    }

    // ===== 参数化测试 =====

    @ParameterizedTest
    @DisplayName("多种有效表达式格式")
    @CsvSource({
            "sum('TYPE1'), TYPE1",
            "sum('TYPE1') + sum('TYPE2'), TYPE1;TYPE2",
            "count('EVENT'), EVENT",
            "balance('WALLET'), WALLET",
            "sum('A') + count('B') + balance('C'), A;B;C",
            "sum('REWARD') * 0.5 + 100, REWARD",
    })
    void validExpressions(String expression, String expectedTypes) {
        Set<String> types = parser.extractAtomicTypes(expression);
        for (String expected : expectedTypes.split(";")) {
            assertThat(types).contains(expected.trim());
        }
    }
}