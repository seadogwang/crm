package com.loyalty.saas.domain.repository;

import com.loyalty.saas.common.repository.BaseRepository;
import com.loyalty.saas.domain.entity.RuleDefinition;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface RuleDefinitionRepository extends BaseRepository<RuleDefinition, Long> {

    /** 获取指定 Program 的所有 ACTIVE 规则 */
    @Query("SELECT r FROM RuleDefinition r WHERE r.programCode = :pc AND r.status = 'ACTIVE'")
    List<RuleDefinition> findActiveByProgramCode(@Param("pc") String programCode);

    /** 按 ruleCode 查找 */
    @Query("SELECT r FROM RuleDefinition r WHERE r.programCode = :pc AND r.ruleCode = :ruleCode")
    Optional<RuleDefinition> findByRuleCode(@Param("pc") String programCode, @Param("ruleCode") String ruleCode);
}