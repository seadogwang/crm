package com.loyalty.platform.api.service;

import com.loyalty.platform.domain.entity.PointTypeDefinition;
import com.loyalty.platform.domain.repository.PointTypeDefinitionRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.math.BigDecimal;
import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.*;

/**
 * PointTypeService 单元测试。
 */
@ExtendWith(MockitoExtension.class)
@DisplayName("PointTypeService")
class PointTypeServiceTest {

    @Mock
    private PointTypeDefinitionRepository typeRepo;

    private PointTypeService service;

    @BeforeEach
    void setUp() {
        service = new PointTypeService(typeRepo);
    }

    @Nested
    @DisplayName("属性驱动查询")
    class AttributeDrivenQueries {

        @Test
        @DisplayName("获取可兑换类型")
        void getRedeemableTypes() {
            var type = buildType("REWARD", true, false, false);
            when(typeRepo.findByProgramCodeAndIsRedeemableTrue("PROG")).thenReturn(List.of(type));

            List<PointTypeDefinition> result = service.getRedeemableTypes("PROG");
            assertThat(result).hasSize(1);
            assertThat(result.get(0).getTypeCode()).isEqualTo("REWARD");
        }

        @Test
        @DisplayName("获取等级计算类型")
        void getTierCalcTypes() {
            var type = buildType("TIER", false, true, false);
            when(typeRepo.findByProgramCodeAndIsTierCalcTrue("PROG")).thenReturn(List.of(type));

            List<PointTypeDefinition> result = service.getTierCalcTypes("PROG");
            assertThat(result).hasSize(1);
            assertThat(result.get(0).getIsTierCalc()).isTrue();
        }

        @Test
        @DisplayName("获取可冲抵类型")
        void getRepayableTypes() {
            var type = buildType("PREPAY", false, false, true);
            when(typeRepo.findByProgramCodeAndAllowRepayTrue("PROG")).thenReturn(List.of(type));

            List<PointTypeDefinition> result = service.getRepayableTypes("PROG");
            assertThat(result).hasSize(1);
            assertThat(result.get(0).getAllowRepay()).isTrue();
        }

        @Test
        @DisplayName("获取可见类型")
        void getVisibleTypes() {
            var type = buildType("REWARD", true, false, false);
            when(typeRepo.findByProgramCodeAndIsVisibleTrue("PROG")).thenReturn(List.of(type));

            List<PointTypeDefinition> result = service.getVisibleTypes("PROG");
            assertThat(result).hasSize(1);
        }
    }

    @Nested
    @DisplayName("CRUD 操作")
    class CrudOperations {

        @Test
        @DisplayName("创建积分类型")
        void create() {
            var type = buildType("NEW_TYPE", true, false, false);
            when(typeRepo.save(any())).thenReturn(type);

            PointTypeDefinition result = service.create(type);
            assertThat(result.getTypeCode()).isEqualTo("NEW_TYPE");
            verify(typeRepo).save(type);
        }

        @Test
        @DisplayName("更新积分类型")
        void update() {
            var existing = buildType("REWARD", true, false, false);
            when(typeRepo.findByProgramCodeAndTypeCode("PROG", "REWARD")).thenReturn(Optional.of(existing));
            when(typeRepo.save(any())).thenReturn(existing);

            var updated = buildType("REWARD", false, true, true);
            updated.setTypeName("新名称");
            PointTypeDefinition result = service.update("PROG", "REWARD", updated);

            assertThat(result.getTypeName()).isEqualTo("新名称");
            assertThat(result.getIsTierCalc()).isTrue();
            verify(typeRepo).save(any());
        }

        @Test
        @DisplayName("更新不存在的类型抛出异常")
        void updateNonExistent() {
            when(typeRepo.findByProgramCodeAndTypeCode("PROG", "NONEXIST")).thenReturn(Optional.empty());

            assertThatThrownBy(() -> service.update("PROG", "NONEXIST", buildType("X", false, false, false)))
                    .isInstanceOf(IllegalArgumentException.class)
                    .hasMessageContaining("NONEXIST");
        }

        @Test
        @DisplayName("删除被变量引用的类型抛出异常")
        void deleteReferencedType() {
            when(typeRepo.isReferencedByVariable("PROG", "REWARD")).thenReturn(true);

            assertThatThrownBy(() -> service.delete("PROG", "REWARD"))
                    .isInstanceOf(IllegalStateException.class)
                    .hasMessageContaining("被变量引用");
        }

        @Test
        @DisplayName("删除未被引用的类型（软删除）")
        void deleteSuccess() {
            var existing = buildType("REWARD", true, false, false);
            when(typeRepo.isReferencedByVariable("PROG", "REWARD")).thenReturn(false);
            when(typeRepo.findByProgramCodeAndTypeCode("PROG", "REWARD")).thenReturn(Optional.of(existing));
            when(typeRepo.save(any())).thenReturn(existing);

            service.delete("PROG", "REWARD");
            assertThat(existing.getStatus()).isEqualTo("INACTIVE");
            verify(typeRepo).save(existing);
        }
    }

    private PointTypeDefinition buildType(String code, boolean redeemable, boolean tierCalc, boolean repay) {
        return PointTypeDefinition.builder()
                .programCode("PROG")
                .typeCode(code)
                .typeName(code + "类型")
                .isRedeemable(redeemable)
                .isTierCalc(tierCalc)
                .allowRepay(repay)
                .isVisible(true)
                .expiryMode("NONE")
                .expiryValue(0)
                .sortOrder(0)
                .status("ACTIVE")
                .build();
    }
}