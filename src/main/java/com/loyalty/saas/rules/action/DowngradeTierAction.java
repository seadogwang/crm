package com.loyalty.saas.rules.action;

public class DowngradeTierAction extends Action {
    private final String memberId, newTier, reason;

    public DowngradeTierAction(String memberId, String newTier, String reason,
                                String ruleId, String ruleSnapshotId) {
        super(ruleId, ruleSnapshotId);
        this.memberId = memberId; this.newTier = newTier; this.reason = reason;
    }

    public String getMemberId() { return memberId; }
    public String getNewTier() { return newTier; }
    public String getReason() { return reason; }

    @Override public String actionType() { return "DOWNGRADE_TIER"; }
    @Override public String toString() { return "DowngradeTier{" + newTier + "}"; }
}