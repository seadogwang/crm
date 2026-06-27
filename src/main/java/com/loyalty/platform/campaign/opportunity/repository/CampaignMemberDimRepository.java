package com.loyalty.platform.campaign.opportunity.repository;

import com.loyalty.platform.campaign.opportunity.entity.CampaignMemberDim;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.time.Instant;
import java.util.List;

/**
 * 会员宽表 Repository — 实时动态规则查询。
 * 注意：已废弃 segmentCode 预计算分群，改用动态 SQL WHERE 子句。
 */
@Repository
public interface CampaignMemberDimRepository extends JpaRepository<CampaignMemberDim, String> {

    /**
     * SQL 预过滤：硬性门槛筛选符合条件的会员。
     * 不再使用 segmentCode，改用实时动态规则。
     */
    @Query(value = """
        SELECT * FROM campaign_member_dim
        WHERE program_code = :programCode
          AND status IN (:statuses)
          AND (:tierCodes IS NULL OR tier_code IN (:tierCodes))
        ORDER BY total_order_amount DESC
        LIMIT 50000
        """, nativeQuery = true)
    List<CampaignMemberDim> findEligibleMembers(
            @Param("programCode") String programCode,
            @Param("statuses") List<String> statuses,
            @Param("tierCodes") List<String> tierCodes
    );

    CampaignMemberDim findByMemberId(String memberId);

    List<CampaignMemberDim> findByProgramCode(String programCode);

    /** @deprecated 使用动态规则查询替代 */
    @Deprecated
    List<CampaignMemberDim> findBySegmentCode(String segmentCode);
}
