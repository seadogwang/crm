package com.loyalty.saas.rules.regression;

import com.loyalty.saas.rules.action.*;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.List;

/**
 * 动作差异分析器 — 对比 Baseline 和 Candidate 两套规则引擎的输出差异。
 *
 * <p>能检测以下规则冲突类型：
 * <ul>
 *   <li><b>Double Reward（叠加超发）</b>：Candidate 多发了积分 — 最严重的生产事故</li>
 *   <li><b>Shadowing（规则遮蔽）</b>：Baseline 中存在的发分在 Candidate 中消失</li>
 *   <li><b>Tier Change（等级变更差异）</b>：两套规则产出了不同的升降级结果</li>
 * </ul>
 */
public class ActionDiff {

    private final List<Action> baselineActions;
    private final List<Action> candidateActions;

    /** 积分差异：Candidate - Baseline */
    private final BigDecimal pointDifference;

    /** 是否检测到叠加超发 */
    private final boolean hasDoubleReward;

    /** 是否检测到规则遮蔽 */
    private final boolean hasShadowing;

    /** 等级变更差异 */
    private final boolean hasTierDiff;

    private final List<String> warnings = new ArrayList<>();

    public ActionDiff(List<Action> baseline, List<Action> candidate) {
        this.baselineActions = baseline != null ? baseline : List.of();
        this.candidateActions = candidate != null ? candidate : List.of();

        BigDecimal baselineTotal = sumPoints(this.baselineActions);
        BigDecimal candidateTotal = sumPoints(this.candidateActions);
        this.pointDifference = candidateTotal.subtract(baselineTotal);

        // Double Reward: Candidate 多发了积分
        this.hasDoubleReward = pointDifference.compareTo(BigDecimal.ZERO) > 0;
        if (hasDoubleReward) {
            warnings.add("叠加超发(Double Reward): Candidate 多发 " + pointDifference.toPlainString() + " 积分");
        }

        // Shadowing: Baseline 中有发分但 Candidate 中没有
        this.hasShadowing = hasAwardActions(baselineActions) && !hasAwardActions(candidateActions);
        if (hasShadowing) {
            warnings.add("规则遮蔽(Shadowing): 老规则的积分发放被新规则互斥组遮蔽");
        }

        // Tier Diff
        this.hasTierDiff = hasTierActions(baselineActions) || hasTierActions(candidateActions);
        if (hasTierDiff) {
            String baselineTier = extractTierAction(baselineActions);
            String candidateTier = extractTierAction(candidateActions);
            if (!baselineTier.equals(candidateTier)) {
                warnings.add("等级变更差异: Baseline=" + baselineTier + ", Candidate=" + candidateTier);
            }
        }
    }

    /** 积分差异额度 */
    public BigDecimal getPointDifference() { return pointDifference; }

    /** 是否检测到叠加超发（最严重） */
    public boolean hasUnexpectedDoubleReward() { return hasDoubleReward; }

    /** 是否检测到规则遮蔽 */
    public boolean hasRuleShadowing() { return hasShadowing; }

    /** 是否有等级差异 */
    public boolean hasTierDiff() { return hasTierDiff; }

    /** 获取所有警告信息 */
    public List<String> getWarnings() { return List.copyOf(warnings); }

    /** 是否完全没有差异 */
    public boolean isEmpty() { return !hasDoubleReward && !hasShadowing && !hasTierDiff; }

    // ---- helper ----

    private BigDecimal sumPoints(List<Action> actions) {
        return actions.stream()
                .filter(a -> a instanceof AwardPointsAction)
                .map(a -> ((AwardPointsAction) a).getPoints())
                .reduce(BigDecimal.ZERO, BigDecimal::add);
    }

    private boolean hasAwardActions(List<Action> actions) {
        return actions.stream().anyMatch(a -> a instanceof AwardPointsAction);
    }

    private boolean hasTierActions(List<Action> actions) {
        return actions.stream().anyMatch(a -> a instanceof UpgradeTierAction || a instanceof DowngradeTierAction);
    }

    private String extractTierAction(List<Action> actions) {
        for (Action a : actions) {
            if (a instanceof UpgradeTierAction u) return "UP→" + u.getNewTier();
            if (a instanceof DowngradeTierAction d) return "DOWN→" + d.getNewTier();
        }
        return "NONE";
    }
}