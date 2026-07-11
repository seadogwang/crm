package com.loyalty.platform.domain.repository.campaign;

import com.loyalty.platform.domain.entity.campaign.GdprRequest;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface GdprRequestRepository extends CampaignBaseRepository<GdprRequest, String> {

    /** 按会员ID查询 */
    List<GdprRequest> findByMemberIdOrderByRequestTimeDesc(String memberId);

    /** 按状态查询 */
    List<GdprRequest> findByStatusOrderByRequestTimeAsc(String status);

    /** 统计待处理请求数 */
    long countByStatus(String status);
}
