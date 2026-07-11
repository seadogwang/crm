package com.loyalty.platform.domain.repository.campaign;

import com.loyalty.platform.domain.entity.campaign.TermsAcceptance;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import java.util.List;
import java.util.Optional;

/**
 * 条款接受记录 Repository。
 */
public interface TermsAcceptanceRepository extends CampaignBaseRepository<TermsAcceptance, Long> {

    /** 查找会员对特定类型+版本的接受记录 */
    @Query("SELECT t FROM TermsAcceptance t WHERE t.memberId = :memberId AND t.termsType = :termsType AND t.termsVersion = :termsVersion")
    Optional<TermsAcceptance> findByMemberTypeAndVersion(@Param("memberId") String memberId,
                                                          @Param("termsType") String termsType,
                                                          @Param("termsVersion") String termsVersion);

    /** 查找会员所有接受记录 */
    @Query("SELECT t FROM TermsAcceptance t WHERE t.memberId = :memberId ORDER BY t.createdAt DESC")
    List<TermsAcceptance> findByMemberId(@Param("memberId") String memberId);

    /** 按类型和版本查找所有接受记录（管理员审计） */
    @Query("SELECT t FROM TermsAcceptance t WHERE t.termsType = :termsType AND t.termsVersion = :termsVersion ORDER BY t.acceptedAt DESC")
    List<TermsAcceptance> findByTypeAndVersion(@Param("termsType") String termsType,
                                                @Param("termsVersion") String termsVersion);

    /** 查找会员对特定类型的所有接受记录 */
    @Query("SELECT t FROM TermsAcceptance t WHERE t.memberId = :memberId AND t.termsType = :termsType ORDER BY t.createdAt DESC")
    List<TermsAcceptance> findByMemberIdAndType(@Param("memberId") String memberId,
                                                 @Param("termsType") String termsType);
}