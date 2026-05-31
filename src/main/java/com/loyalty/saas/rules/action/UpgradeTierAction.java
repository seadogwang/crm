package com.loyalty.saas.rules.action;

public class UpgradeTierAction extends Action {
    private final String memberId, newTier, reason;

    public UpgradeTierAction(String memberId, String newTier, String reason,
                              String ruleId, String ruleSnapshotId) {
        super(ruleId, ruleSnapshotId);
        this.memberId = memberId; this.newTier = newTier; this.reason = reason;
    }

    public String getMemberId() { return memberId; }
    public String getNewTier() { return newTier; }
    public String getReason() { return reason; }

    @Override public String actionType() { return "UPGRADE_TIER"; }
    @Override public String toString() { return "UpgradeTier{" + newTier + "}"; }
}