package com.loyalty.saas.event;

import com.loyalty.saas.common.context.TenantContext;
import com.loyalty.saas.domain.entity.EventInbox;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import java.time.LocalDateTime;
import java.util.*;

/**
 * 1:N 级联持久化服务 — Ch7.4 完善。
 *
 * <p>将映射引擎清洗后的标准 JSON 拆分为主表 (transaction_event) +
 * 子表 (custom_entity_data 明细)，在一个强事务中落盘。
 *
 * <p>完成后将整合的 EventFact 投递到 Drools 规则引擎。
 */
@Service
public class CascadePersistenceService {

    private static final Logger log = LoggerFactory.getLogger(CascadePersistenceService.class);

    @PersistenceContext private EntityManager em;

    /**
     * 将 1:N 树状 JSON 拆解落盘。
     *
     * @param programCode 租户代码
     * @param eventPayload 映射后的标准 JSON（含 lines 子数组）
     * @param inbox 关联的 EventInbox 记录
     */
    @Transactional(rollbackFor = Exception.class)
    public void persistCascade(String programCode, Map<String, Object> eventPayload, EventInbox inbox) {
        // Step 1: 写主表 transaction_event
        String eventId = UUID.randomUUID().toString();
        String eventType = (String) eventPayload.getOrDefault("event_type", "UNKNOWN");
        Object memberId = eventPayload.getOrDefault("member_id", null);
        String channel = inbox.getSourceChannel();

        em.createNativeQuery(
                "INSERT INTO transaction_event (event_id, program_code, member_id, event_type, "
                        + "event_time, channel, source_event_id, idempotency_key, "
                        + "ext_attributes, processing_status, created_at) "
                        + "VALUES (?,?,?,?,?,?,?,?,?::jsonb,?,?)")
                .setParameter(1, eventId)
                .setParameter(2, programCode)
                .setParameter(3, memberId)
                .setParameter(4, eventType)
                .setParameter(5, LocalDateTime.now())
                .setParameter(6, channel)
                .setParameter(7, inbox.getSourceEventId())
                .setParameter(8, inbox.getIdempotencyKey())
                .setParameter(9, toJson(eventPayload))
                .setParameter(10, "PROCESSING")
                .setParameter(11, LocalDateTime.now())
                .executeUpdate();

        int lineCount = 0;

        // Step 2: 拆解 1:N 明细
        Object linesObj = eventPayload.get("lines");
        if (linesObj instanceof List<?> lines) {
            for (Object line : lines) {
                if (line instanceof Map<?, ?> lineMap) {
                    @SuppressWarnings("unchecked")
                    Map<String, Object> data = (Map<String, Object>) lineMap;
                    persistLine(programCode, eventId, channel, data, ++lineCount);
                }
            }
        }

        log.info("[CascadePersistence] 持久化完成: eventId={}, type={}, lines={}",
                eventId, eventType, lineCount);
    }

    private void persistLine(String programCode, String parentEventId, String channel,
                              Map<String, Object> data, int order) {
        em.createNativeQuery(
                "INSERT INTO custom_entity_data (program_code, entity_code, parent_event_id, "
                        + "attributes, created_at) VALUES (?,?,?,?::jsonb,?)")
                .setParameter(1, programCode)
                .setParameter(2, "ORDER_LINE_" + channel)
                .setParameter(3, parentEventId)
                .setParameter(4, toJson(data))
                .setParameter(5, LocalDateTime.now())
                .executeUpdate();
    }

    private String toJson(Object obj) {
        try { return new com.fasterxml.jackson.databind.ObjectMapper().writeValueAsString(obj); }
        catch (Exception e) { return "{}"; }
    }
}