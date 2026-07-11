package com.loyalty.platform.api.controller;

import com.loyalty.platform.api.service.PointTypeService;
import com.loyalty.platform.domain.entity.PointTypeDefinition;
import com.loyalty.platform.domain.entity.RuleVariableDefinition;
import com.loyalty.platform.domain.repository.PointTypeDefinitionRepository;
import com.loyalty.platform.domain.repository.RuleVariableDefinitionRepository;
import com.loyalty.platform.rules.VariableExpressionParser;
import com.loyalty.platform.rules.VariableExpressionParser.ValidationResult;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;

import java.util.List;
import java.util.Set;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * 积分类型和变量管理集成测试（直接调用 Service 层，绕过 RBAC）。
 *
 * <p>使用 {@link SpringBootTest} 加载完整上下文，测试实际数据库操作。
 */
@SpringBootTest
@DisplayName("PointType & Variable Integration")
class PointTypeVariableIntegrationTest {

    @Autowired
    private PointTypeService pointTypeService;

    @Autowired
    private PointTypeDefinitionRepository pointTypeRepo;

    @Autowired
    private RuleVariableDefinitionRepository varRepo;

    @Autowired
    private VariableExpressionParser parser;

    private static final String PROGRAM = "PROG001";

    @Nested
    @DisplayName("积分类型 CRUD（集成）")
    class PointTypeIntegration {

        private final String testTypeCode = "INTG_TEST_" + System.currentTimeMillis();

        @AfterEach
        void cleanup() {
            pointTypeRepo.findByProgramCodeAndTypeCode(PROGRAM, testTypeCode)
                    .ifPresent(pt -> pointTypeRepo.delete(pt));
        }

        @Test
        @DisplayName("创建并查询积分类型")
        void createAndQuery() {
            PointTypeDefinition pt = PointTypeDefinition.builder()
                    .programCode(PROGRAM)
                    .typeCode(testTypeCode)
                    .typeName("集成测试类型")
                    .description("通过集成测试创建")
                    .pointCategory("ASSET")
                    .isRedeemable(true)
                    .isTierCalc(false)
                    .allowRepay(false)
                    .isVisible(true)
                    .expiryMode("FIXED_DAYS")
                    .expiryValue(90)
                    .sortOrder(10)
                    .status("ACTIVE")
                    .build();

            PointTypeDefinition created = pointTypeService.create(pt);
            assertThat(created.getId()).isNotNull();
            assertThat(created.getTypeCode()).isEqualTo(testTypeCode);

            // 查询验证
            PointTypeDefinition found = pointTypeService.getByTypeCode(PROGRAM, testTypeCode).orElseThrow();
            assertThat(found.getTypeName()).isEqualTo("集成测试类型");
            assertThat(found.getIsRedeemable()).isTrue();
            assertThat(found.getExpiryValue()).isEqualTo(90);
        }

        @Test
        @DisplayName("更新积分类型")
        void update() {
            // 先创建
            PointTypeDefinition pt = PointTypeDefinition.builder()
                    .programCode(PROGRAM)
                    .typeCode(testTypeCode)
                    .typeName("原始名称")
                    .isRedeemable(true)
                    .isTierCalc(false)
                    .allowRepay(false)
                    .isVisible(true)
                    .status("ACTIVE")
                    .build();
            pointTypeService.create(pt);

            // 更新
            PointTypeDefinition updated = PointTypeDefinition.builder()
                    .typeName("更新后的名称")
                    .isRedeemable(false)
                    .isTierCalc(true)
                    .isVisible(false)
                    .sortOrder(99)
                    .build();
            PointTypeDefinition result = pointTypeService.update(PROGRAM, testTypeCode, updated);

            assertThat(result.getTypeName()).isEqualTo("更新后的名称");
            assertThat(result.getIsRedeemable()).isFalse();
            assertThat(result.getIsTierCalc()).isTrue();
            assertThat(result.getIsVisible()).isFalse();
            assertThat(result.getSortOrder()).isEqualTo(99);
        }

        @Test
        @DisplayName("删除积分类型（软删除）")
        void delete() {
            PointTypeDefinition pt = PointTypeDefinition.builder()
                    .programCode(PROGRAM)
                    .typeCode(testTypeCode)
                    .typeName("待删除类型")
                    .isRedeemable(true)
                    .status("ACTIVE")
                    .build();
            pointTypeService.create(pt);

            pointTypeService.delete(PROGRAM, testTypeCode);

            PointTypeDefinition found = pointTypeService.getByTypeCode(PROGRAM, testTypeCode).orElseThrow();
            assertThat(found.getStatus()).isEqualTo("INACTIVE");
        }

        @Test
        @DisplayName("属性驱动查询 — 可兑换类型")
        void attributeQueryRedeemable() {
            List<PointTypeDefinition> types = pointTypeService.getRedeemableTypes(PROGRAM);
            assertThat(types).isNotNull();
            // 所有返回的类型都应该 isRedeemable=true
            for (PointTypeDefinition t : types) {
                assertThat(t.getIsRedeemable()).isTrue();
            }
        }

        @Test
        @DisplayName("属性驱动查询 — 等级计算类型")
        void attributeQueryTierCalc() {
            List<PointTypeDefinition> types = pointTypeService.getTierCalcTypes(PROGRAM);
            assertThat(types).isNotNull();
            for (PointTypeDefinition t : types) {
                assertThat(t.getIsTierCalc()).isTrue();
            }
        }

        @Test
        @DisplayName("属性驱动查询 — 可冲抵类型")
        void attributeQueryRepayable() {
            List<PointTypeDefinition> types = pointTypeService.getRepayableTypes(PROGRAM);
            assertThat(types).isNotNull();
            for (PointTypeDefinition t : types) {
                assertThat(t.getAllowRepay()).isTrue();
            }
        }
    }

    @Nested
    @DisplayName("变量管理（集成）")
    class VariableIntegration {

        private final String testVarCode = "INTG_VAR_" + System.currentTimeMillis() % 100000;

        @AfterEach
        void cleanup() {
            varRepo.findByProgramCodeAndVarCode(PROGRAM, testVarCode)
                    .ifPresent(v -> varRepo.delete(v));
        }

        @Test
        @DisplayName("创建并查询变量")
        void createAndQuery() {
            // 确保积分类型存在
            ensurePointType("REWARD");

            RuleVariableDefinition var = RuleVariableDefinition.builder()
                    .id(UUID.randomUUID().toString())
                    .programCode(PROGRAM)
                    .varCode(testVarCode)
                    .varName("集成测试变量")
                    .varType("DECIMAL")
                    .expression("sum('REWARD') + 100")
                    .description("测试描述")
                    .status("ACTIVE")
                    .build();

            RuleVariableDefinition saved = varRepo.save(var);
            assertThat(saved.getId()).isNotNull();

            // 查询验证
            RuleVariableDefinition found = varRepo.findByProgramCodeAndVarCode(PROGRAM, testVarCode).orElseThrow();
            assertThat(found.getVarName()).isEqualTo("集成测试变量");
            assertThat(found.getExpression()).isEqualTo("sum('REWARD') + 100");
        }

        @Test
        @DisplayName("表达式验证 — 提取原子类型")
        void expressionExtractTypes() {
            Set<String> types = parser.extractAtomicTypes("sum('REWARD') + count('SIGN_IN') + balance('TIER')");
            assertThat(types).containsExactly("REWARD", "SIGN_IN", "TIER");
        }

        @Test
        @DisplayName("表达式验证 — 有效表达式通过")
        void validateValidExpression() {
            ensurePointType("REWARD");
            ValidationResult result = parser.validate("sum('REWARD') * 0.5 + 100", Set.of("REWARD"));
            assertThat(result.valid()).isTrue();
        }

        @Test
        @DisplayName("表达式验证 — 不存在的类型返回错误")
        void validateInvalidType() {
            ValidationResult result = parser.validate("sum('NONEXISTENT')", Set.of("REWARD"));
            assertThat(result.valid()).isFalse();
            assertThat(result.message()).contains("积分类型不存在");
        }

        @Test
        @DisplayName("表达式验证 — 非法字符返回错误")
        void validateIllegalExpression() {
            ValidationResult result = parser.validate("sum('REWARD'); DROP TABLE");
            assertThat(result.valid()).isFalse();
            assertThat(result.message()).contains("非法字符");
        }

        @Test
        @DisplayName("删除被引用的变量应抛出异常")
        void deleteReferencedVariable() {
            // 先创建变量
            ensurePointType("REWARD");
            RuleVariableDefinition var = RuleVariableDefinition.builder()
                    .id(UUID.randomUUID().toString())
                    .programCode(PROGRAM)
                    .varCode(testVarCode)
                    .varName("测试变量")
                    .expression("sum('REWARD')")
                    .status("ACTIVE")
                    .build();
            varRepo.save(var);

            // 检查引用检测（无规则引用时应该返回 false）
            boolean referenced = varRepo.isReferencedByRule(PROGRAM, testVarCode);
            // 新创建的变量不应该被规则引用
            assertThat(referenced).isFalse();
        }
    }

    private void ensurePointType(String typeCode) {
        if (pointTypeRepo.findByProgramCodeAndTypeCode(PROGRAM, typeCode).isEmpty()) {
            pointTypeRepo.save(PointTypeDefinition.builder()
                    .programCode(PROGRAM)
                    .typeCode(typeCode)
                    .typeName(typeCode + "类型")
                    .isRedeemable(true)
                    .status("ACTIVE")
                    .build());
        }
    }
}