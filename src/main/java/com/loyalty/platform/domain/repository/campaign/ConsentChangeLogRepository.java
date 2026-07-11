package com.loyalty.platform.domain.repository.campaign;

import com.loyalty.platform.domain.entity.campaign.ConsentChangeLog;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.time.Instant;
import java.util.List;

@Repository
public interface ConsentChangeLogRepository extends CampaignBaseRepository<ConsentChangeLog, Long> {

    /** 按会员查询变更记录 */
    List<ConsentChangeLog> findByMemberIdOrderByCreatedAtDesc(String memberId);

    /** 按会员和字段查询 */
    List<ConsentChangeLog> findByMemberIdAndFieldChangedOrderByCreatedAtDesc(String memberId, String fieldChanged);

    /** 删除超过指定时间的记录（归档到冷存储） */
    @Modifying
    @Query("DELETE FROM ConsentChangeLog l WHERE l.createdAt < :threshold")
    int deleteByCreatedAtBefore(@Param("threshold") Instant threshold);
}
