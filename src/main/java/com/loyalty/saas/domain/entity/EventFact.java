package com.loyalty.saas.domain.entity;

import com.loyalty.saas.common.event.BaseDomainEvent;
import lombok.*;

import java.io.Serializable;
import java.time.Instant;
import java.util.Map;

/**
 * 标准领域事件事实 —— 插入 Drools KieSession 的事实包装器。
 *
 * <p>继承 {@link BaseDomainEvent}（含 eventId/programCode/eventType/occurredAt 元数据），
 * 可直接通过 {@code EventBridge} 发布。
 *
 * <p>Drools DRL 规则可通过:
 * <pre>{@code $event : EventFact(eventType == "ORDER_PAID", getPayloadNumber("order_amount") > 100)}</pre>
 */
@Getter @Setter @NoArgsConstructor
public class EventFact extends BaseDomainEvent {

    private static final long serialVersionUID = 1L;

    private String memberId;
    private String channel;
    private Instant eventTime;
    private String idempotentKey;
    private String ruleSnapshotId;
    private Map<String, Object> payload;

    public EventFact(String programCode, String eventType, String memberId, String channel,
                     Instant eventTime, String idempotentKey, String ruleSnapshotId,
                     Map<String, Object> payload) {
        super(programCode, eventType);
        this.memberId = memberId;
        this.channel = channel;
        this.eventTime = eventTime;
        this.idempotentKey = idempotentKey;
        this.ruleSnapshotId = ruleSnapshotId;
        this.payload = payload;
    }

    /** DRL 辅助：从 payload 中提取字符串值 */
    public String getPayloadString(String key) {
        return payload != null && payload.containsKey(key) ? String.valueOf(payload.get(key)) : null;
    }

    /** DRL 辅助：从 payload 中提取数值 */
    public Double getPayloadNumber(String key) {
        if (payload == null || !payload.containsKey(key)) return 0.0;
        return Double.parseDouble(String.valueOf(payload.get(key)));
    }

    /** DRL 辅助：从 payload 中提取布尔值 */
    public Boolean getPayloadBool(String key) {
        return payload != null && payload.containsKey(key) && Boolean.parseBoolean(String.valueOf(payload.get(key)));
    }
}