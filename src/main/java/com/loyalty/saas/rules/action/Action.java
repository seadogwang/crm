package com.loyalty.saas.rules.action;

/**
 * 规则引擎输出的抽象动作。
 */
public abstract class Action {
    private final String ruleId;
    private final String ruleSnapshotId;

    protected Action(String ruleId, String ruleSnapshotId) {
        this.ruleId = ruleId;
        this.ruleSnapshotId = ruleSnapshotId;
    }

    public String getRuleId() { return ruleId; }
    public String getRuleSnapshotId() { return ruleSnapshotId; }
    public abstract String actionType();
}