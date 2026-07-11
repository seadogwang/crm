package com.loyalty.platform.domain.repository;

import com.loyalty.platform.common.repository.BaseRepository;
import com.loyalty.platform.domain.entity.PointTypeDefinition;
import org.springframework.data.jpa.repository.Query;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface PointTypeDefinitionRepository extends BaseRepository<PointTypeDefinition, Long> {

    List<PointTypeDefinition> findByProgramCodeAndStatus(String programCode, String status);

    Optional<PointTypeDefinition> findByProgramCodeAndTypeCode(String programCode, String typeCode);

    @Query("SELECT p FROM PointTypeDefinition p WHERE p.programCode = :programCode AND p.status = 'ACTIVE'")
    List<PointTypeDefinition> findActiveByProgramCode(String programCode);

    // ===== 属性驱动查询（设计文档 §6.1） =====

    /** 获取所有可兑换的积分类型（兑换引擎使用） */
    List<PointTypeDefinition> findByProgramCodeAndIsRedeemableTrue(String programCode);

    /** 获取所有计入等级的积分类型（等级引擎使用） */
    List<PointTypeDefinition> findByProgramCodeAndIsTierCalcTrue(String programCode);

    /** 获取所有可冲抵的积分类型（冲抵引擎使用） */
    List<PointTypeDefinition> findByProgramCodeAndAllowRepayTrue(String programCode);

    /** 获取所有对用户可见的积分类型 */
    List<PointTypeDefinition> findByProgramCodeAndIsVisibleTrue(String programCode);

    /** 检查类型是否被变量引用 */
    @Query(value = "SELECT COUNT(*) > 0 FROM rule_variable_definition WHERE program_code = :programCode "
            + "AND CAST(expression AS text) LIKE '%' || :typeCode || '%'", nativeQuery = true)
    boolean isReferencedByVariable(String programCode, String typeCode);
}