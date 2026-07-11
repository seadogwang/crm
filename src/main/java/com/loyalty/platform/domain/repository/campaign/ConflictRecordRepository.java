package com.loyalty.platform.domain.repository.campaign;

import com.loyalty.platform.domain.entity.campaign.ConflictRecord;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface ConflictRecordRepository extends CampaignBaseRepository<ConflictRecord, String> {

    List<ConflictRecord> findByWorkspaceIdOrderByDetectedAtDesc(String workspaceId);

    List<ConflictRecord> findByWorkspaceIdAndStatus(String workspaceId, String status);

    @Modifying
    @Query("UPDATE ConflictRecord c SET c.status = :status WHERE c.workspaceId = :workspaceId AND c.status = 'ACTIVE'")
    void updateStatusByWorkspace(@Param("workspaceId") String workspaceId, @Param("status") String status);
}
