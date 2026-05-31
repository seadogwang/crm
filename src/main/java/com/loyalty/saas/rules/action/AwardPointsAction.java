package com.loyalty.saas.rules.action;

import java.math.BigDecimal;

public class AwardPointsAction extends Action {
    private final String programCode;
    private final String memberId;
    private final String accountType;
    private final BigDecimal points;

    public AwardPointsAction(String programCode, String memberId, String accountType,
                              BigDecimal points, String ruleId, String ruleSnapshotId) {
        super(ruleId, ruleSnapshotId);
        this.programCode = programCode; this.memberId = memberId;
        this.accountType = accountType; this.points = points;
    }

    public String getProgramCode() { return programCode; }
    public String getMemberId() { return memberId; }
    public String getAccountType() { return accountType; }
    public BigDecimal getPoints() { return points; }

    @Override public String actionType() { return "AWARD_POINTS"; }
    @Override public String toString() { return "AwardPoints{" + accountType + "=" + points + "}"; }
}