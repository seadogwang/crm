package com.loyalty.platform.campaign.experiment.event;

import com.loyalty.platform.common.event.BaseDomainEvent;

import java.math.BigDecimal;

/**
 * 实验转化事件 — 用户产生目标行为（点击/打开/转化/购买）时发布。
 *
 * <p>由外部系统（如 Loyalty Event 系统、Webhook）通过
 * {@link com.loyalty.platform.campaign.event.controller.EventTriggerController}
 * 或直接调用 EventBridge 发布。
 *
 * <p>Topic: {@code loyalty.event.user}
 */
public class ExperimentConversionEvent extends BaseDomainEvent {

    private static final long serialVersionUID = 1L;

    public static final String TOPIC = "loyalty.event.user";
    public static final String EVENT_TYPE = "EXPERIMENT_CONVERSION";

    /** 用户行为类型 */
    public enum ConversionType {
        CLICK, OPEN, CONVERSION, PURCHASE
    }

    private final String experimentId;
    private final String memberId;
    private final ConversionType conversionType;
    private final BigDecimal conversionValue;

    public ExperimentConversionEvent(String programCode, String experimentId,
                                     String memberId, ConversionType conversionType,
                                     BigDecimal conversionValue) {
        super(programCode, EVENT_TYPE);
        this.experimentId = experimentId;
        this.memberId = memberId;
        this.conversionType = conversionType;
        this.conversionValue = conversionValue;
    }

    /** 无参构造（供序列化框架使用） */
    protected ExperimentConversionEvent() {
        this.experimentId = null;
        this.memberId = null;
        this.conversionType = null;
        this.conversionValue = null;
    }

    public String getExperimentId() { return experimentId; }
    public String getMemberId() { return memberId; }
    public ConversionType getConversionType() { return conversionType; }
    public BigDecimal getConversionValue() { return conversionValue; }

    @Override
    public String toString() {
        return "ExperimentConversionEvent{" +
                "experimentId='" + experimentId + '\'' +
                ", memberId='" + memberId + '\'' +
                ", conversionType=" + conversionType +
                ", conversionValue=" + conversionValue +
                "} " + super.toString();
    }
}
