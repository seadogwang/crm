package com.loyalty.saas.domain.repository;

import com.loyalty.saas.common.repository.BaseRepository;
import com.loyalty.saas.domain.entity.EventInbox;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

@Repository
public interface EventInboxRepository extends BaseRepository<EventInbox, Long> {

    @Query("SELECT e FROM EventInbox e WHERE e.status = :status ORDER BY e.firstSeenAt ASC LIMIT :limit")
    List<EventInbox> findByStatus(@Param("status") String status, @Param("limit") int limit);

    @Query("SELECT e FROM EventInbox e WHERE e.status IN ('TRANSFORM_FAILED','FAILED') AND e.retryCount < :maxRetry AND e.nextRetryAt < :now ORDER BY e.nextRetryAt ASC LIMIT 50")
    List<EventInbox> findRetryable(@Param("maxRetry") int maxRetry, @Param("now") LocalDateTime now);

    @Query("SELECT e FROM EventInbox e WHERE e.status IN ('TRANSFORM_FAILED','FAILED') AND e.retryCount >= :maxRetry")
    List<EventInbox> findExhaustedRetries(@Param("maxRetry") int maxRetry);

    @Query("SELECT e FROM EventInbox e WHERE e.idempotencyKey = :key")
    Optional<EventInbox> findByIdempotencyKey(@Param("key") String idempotencyKey);

    @Query("SELECT COUNT(e) > 0 FROM EventInbox e WHERE e.idempotencyKey = :key AND e.status = :status")
    boolean existsByIdempotencyKeyAndStatus(@Param("key") String idempotencyKey, @Param("status") String status);
}