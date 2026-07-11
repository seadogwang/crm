package com.loyalty.platform.domain.repository.campaign;

import com.loyalty.platform.domain.entity.campaign.CalendarCache;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.time.LocalDate;
import java.util.List;

@Repository
public interface CalendarCacheRepository extends CampaignBaseRepository<CalendarCache, String> {

    List<CalendarCache> findByWorkspaceIdOrderByStartDateAsc(String workspaceId);

    @Query("SELECT c FROM CalendarCache c WHERE c.workspaceId = :wsId AND c.startDate <= :end AND c.endDate >= :start")
    List<CalendarCache> findByWorkspaceIdAndDateRange(@Param("wsId") String wsId,
                                                       @Param("start") LocalDate start,
                                                       @Param("end") LocalDate end);
}
