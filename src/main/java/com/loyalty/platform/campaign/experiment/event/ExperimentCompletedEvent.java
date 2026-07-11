package com.loyalty.platform.campaign.experiment.event;

import com.loyalty.platform.common.event.BaseDomainEvent;

/**
 * 实验完成事件 — 实验达到样本量或手动完成时发布。
 *
 * <p>由 {@link com.loyalty.platform.campaign.experiment.ExperimentScheduler}
 * 或 {@link com.loyalty.platform.campaign.experiment.ExperimentController#complete}
 * 在实验完成后发布。
 *
 * <p>Topic: {@code campaign.experiment.completed}
 */
public class ExperimentCompletedEvent extends BaseDomainEvent {

    private static final long serialVersionUID = 1L;

    public static final String TOPIC = "campaign.experiment.completed";
    public static final String EVENT_TYPE = "EXPERIMENT_COMPLETED";

    private final String experimentId;
    private final String experimentName;
    private final String winningVariantId;
    private final String planId;
    private final String workspaceId;
    private final double overallImprovement;

    public ExperimentCompletedEvent(String programCode, String experimentId,
                                    String experimentName, String winningVariantId,
                                    String planId, String workspaceId,
                                    double overallImprovement) {
        super(programCode, EVENT_TYPE);
        this.experimentId = experimentId;
        this.experimentName = experimentName;
        this.winningVariantId = winningVariantId;
        this.planId = planId;
        this.workspaceId = workspaceId;
        this.overallImprovement = overallImprovement;
    }

    /** 无参构造（供序列化框架使用） */
    protected ExperimentCompletedEvent() {
        this.experimentId = null;
        this.experimentName = null;
        this.winningVariantId = null;
        this.planId = null;
        this.workspaceId = null;
        this.overallImprovement = 0;
    }

    public String getExperimentId() { return experimentId; }
    public String getExperimentName() { return experimentName; }
    public String getWinningVariantId() { return winningVariantId; }
    public String getPlanId() { return planId; }
    public String getWorkspaceId() { return workspaceId; }
    public double getOverallImprovement() { return overallImprovement; }

    @Override
    public String toString() {
        return "ExperimentCompletedEvent{" +
                "experimentId='" + experimentId + '\'' +
                ", experimentName='" + experimentName + '\'' +
                ", winningVariantId='" + winningVariantId + '\'' +
                ", overallImprovement=" + String.format("%.1f%%", overallImprovement * 100) +
                "} " + super.toString();
    }
}
