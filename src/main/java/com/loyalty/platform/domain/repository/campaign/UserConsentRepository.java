package com.loyalty.platform.domain.repository.campaign;

import com.loyalty.platform.domain.entity.campaign.UserConsent;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface UserConsentRepository extends CampaignBaseRepository<UserConsent, String> {

    /** 查找全局退订的用户 */
    @Query("SELECT u FROM UserConsent u WHERE u.globalUnsubscribe = true")
    List<UserConsent> findGloballyUnsubscribed();

    /** 按渠道查找退订用户 */
    @Query("SELECT u FROM UserConsent u WHERE " +
           "(:channel = 'EMAIL' AND u.emailOptIn = false) OR " +
           "(:channel = 'SMS' AND u.smsOptIn = false) OR " +
           "(:channel = 'PUSH' AND u.pushOptIn = false)")
    List<UserConsent> findOptedOutByChannel(@Param("channel") String channel);

    /** 批量查询用户偏好 */
    @Query("SELECT u FROM UserConsent u WHERE u.memberId IN :memberIds")
    List<UserConsent> findByMemberIds(@Param("memberIds") List<String> memberIds);
}
