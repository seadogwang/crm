package com.loyalty.saas.common.event;

import java.io.Serializable;
import java.time.Instant;
import java.util.UUID;

/**
 * 领域事件基类。
 *
 * <p>所有领域事件必须继承此类，提供统一的事件元数据：
 * <ul>
 *   <li>{@code eventId}：全局唯一事件 ID，用于幂等和去重。</li>
 *   <li>{@code eventType}：事件类型标签，用于消费端路由。</li>
 *   <li>{@code programCode}：租户代码，用于跨租户校验和隔离。</li>
 *   <li>{@code occurredAt}：事件发生时间（业务时间）。</li>
 * </ul>
 *
 * <p><b>序列化要求</b>：所有子类必须实现 {@link Serializable} 并声明
 * {@code serialVersionUID}，确保跨 JVM 版本的序列化兼容性。
 *
 * <p><b>使用示例</b>：
 * <pre>{@code
 * public class PointsGrantedEvent extends BaseDomainEvent {
 *     private static final long serialVersionUID = 1L;
 *     private final String memberId;
 *     private final int points;
 *
 *     public PointsGrantedEvent(String programCode, String memberId, int points) {
 *         super(programCode, "POINTS_GRANTED");
 *         this.memberId = memberId;
 *         this.points = points;
 *     }
 * }
 * }</pre>
 *
 * @author Loyalty SaaS Architecture Team
 * @since 1.0.0
 */
public abstract class BaseDomainEvent implements Serializable {

    private static final long serialVersionUID = 1L;

    /** 全局唯一事件 ID */
    private final String eventId;

    /** 事件类型标签 */
    private final String eventType;

    /** 归属租户计划代码 */
    private final String programCode;

    /** 事件发生时间（业务时间），不可变 */
    private final Instant occurredAt;

    /**
     * 构造领域事件。
     *
     * @param programCode 租户计划代码，不能为 null
     * @param eventType   事件类型标签，不能为 null
     * @throws IllegalArgumentException 如果参数为 null
     */
    protected BaseDomainEvent(String programCode, String eventType) {
        if (programCode == null) {
            throw new IllegalArgumentException("programCode must not be null");
        }
        if (eventType == null) {
            throw new IllegalArgumentException("eventType must not be null");
        }
        this.eventId = UUID.randomUUID().toString();
        this.eventType = eventType;
        this.programCode = programCode;
        this.occurredAt = Instant.now();
    }

    /** 无参构造（供 JPA/序列化框架使用） */
    protected BaseDomainEvent() {
        this.eventId = UUID.randomUUID().toString();
        this.eventType = "UNKNOWN";
        this.programCode = null;
        this.occurredAt = Instant.now();
    }

    /**
     * 获取事件唯一 ID。
     */
    public String getEventId() {
        return eventId;
    }

    /**
     * 获取事件类型标签。
     */
    public String getEventType() {
        return eventType;
    }

    /**
     * 获取归属租户计划代码。
     */
    public String getProgramCode() {
        return programCode;
    }

    /**
     * 获取事件发生时间。
     */
    public Instant getOccurredAt() {
        return occurredAt;
    }

    @Override
    public String toString() {
        return getClass().getSimpleName() + "{" +
                "eventId='" + eventId + '\'' +
                ", eventType='" + eventType + '\'' +
                ", programCode='" + programCode + '\'' +
                ", occurredAt=" + occurredAt +
                '}';
    }
}