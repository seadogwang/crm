package com.loyalty.platform.campaign.experiment.event;

import com.loyalty.platform.common.event.BaseDomainEvent;

/**
 * 实验曝光事件 — 用户被分流到某个变体时发布。
 *
 * <p>由 {@link com.loyalty.platform.campaign.execution.worker.ExperimentRouterWorker}
 * 在完成确定性哈希分流并保存分配记录后发布。
 *
 * <p>Topic: {@code campaign.experiment.exposure}
 */
public class ExperimentExposureEvent extends BaseDomainEvent {

    private static final long serialVersionUID = 1L;

    public static final String TOPIC = "campaign.experiment.exposure";
    public static final String EVENT_TYPE = "EXPERIMENT_EXPOSURE";

    private final String experimentId;
    private final String memberId;
    private final String variantId;
    private final String variantCode;
    private final String planId;

    public ExperimentExposureEvent(String programCode, String experimentId,
                                   String memberId, String variantId,
                                   String variantCode, String planId) {
        super(programCode, EVENT_TYPE);
        this.experimentId = experimentId;
        this.memberId = memberId;
        this.variantId = variantId;
        this.variantCode = variantCode;
        this.planId = planId;
    }

    /** 无参构造（供序列化框架使用） */
    protected ExperimentExposureEvent() {
        this.experimentId = null;
        this.memberId = null;
        this.variantId = null;
        this.variantCode = null;
        this.planId = null;
    }

    public String getExperimentId() { return experimentId; }
    public String getMemberId() { return memberId; }
    public String getVariantId() { return variantId; }
    public String getVariantCode() { return variantCode; }
    public String getPlanId() { return planId; }

    @Override
    public String toString() {
        return "ExperimentExposureEvent{" +
                "experimentId='" + experimentId + '\'' +
                ", memberId='" + memberId + '\'' +
                ", variantCode='" + variantCode + '\'' +
                "} " + super.toString();
    }
}
