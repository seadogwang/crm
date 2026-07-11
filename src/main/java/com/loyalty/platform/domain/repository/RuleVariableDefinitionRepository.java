package com.loyalty.platform.domain.repository;

import com.loyalty.platform.common.repository.BaseRepository;
import com.loyalty.platform.domain.entity.RuleVariableDefinition;
import org.springframework.data.jpa.repository.Query;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

/**
 * 变量定义 Repository。
 *
 * @author Loyalty SaaS Architecture Team
 * @since 2.0.0
 */
@Repository
public interface RuleVariableDefinitionRepository extends BaseRepository<RuleVariableDefinition, String> {

    List<RuleVariableDefinition> findByProgramCodeAndStatus(String programCode, String status);

    Optional<RuleVariableDefinition> findByProgramCodeAndVarCode(String programCode, String varCode);

    @Query("SELECT v FROM RuleVariableDefinition v WHERE v.programCode = :programCode AND v.varCode IN :varCodes")
    List<RuleVariableDefinition> findByProgramCodeAndVarCodeIn(String programCode, List<String> varCodes);

    @Query("SELECT v FROM RuleVariableDefinition v WHERE v.programCode = :programCode AND v.status = 'ACTIVE'")
    List<RuleVariableDefinition> findActiveByProgramCode(String programCode);

    /** 检查是否被规则引用（通过 metadata JSONB 查询） */
    @Query(value = "SELECT COUNT(*) > 0 FROM rule_definition WHERE program_code = :programCode "
            + "AND CAST(metadata AS text) LIKE '%' || :varCode || '%'", nativeQuery = true)
    boolean isReferencedByRule(String programCode, String varCode);
}