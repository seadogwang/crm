package com.loyalty.platform.domain.repository.campaign;

import com.loyalty.platform.domain.entity.campaign.TermsMaster;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import java.util.List;
import java.util.Optional;

/**
 * 条款版本主表 Repository。
 */
public interface TermsMasterRepository extends CampaignBaseRepository<TermsMaster, Long> {

    /** 查找指定类型的当前活动版本 */
    @Query("SELECT t FROM TermsMaster t WHERE t.termsType = :termsType AND t.isActive = true")
    Optional<TermsMaster> findActiveByType(@Param("termsType") String termsType);

    /** 查找所有活动版本 */
    @Query("SELECT t FROM TermsMaster t WHERE t.isActive = true ORDER BY t.effectiveDate DESC")
    List<TermsMaster> findAllActive();

    /** 按类型查找所有版本（含历史） */
    @Query("SELECT t FROM TermsMaster t WHERE t.termsType = :termsType ORDER BY t.effectiveDate DESC")
    List<TermsMaster> findByTermsType(@Param("termsType") String termsType);

    /** 查找指定类型的所有活动版本（用于批量激活切换） */
    @Query("SELECT t FROM TermsMaster t WHERE t.termsType = :termsType AND t.isActive = true")
    List<TermsMaster> findActiveByTermsType(@Param("termsType") String termsType);
}