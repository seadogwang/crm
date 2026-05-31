package com.loyalty.saas.rules;

import com.loyalty.saas.rules.action.*;
import com.loyalty.saas.rules.drl.MemberFact;
import com.loyalty.saas.rules.regression.ActionDiff;
import com.loyalty.saas.rules.regression.RegressionReport;
import org.junit.jupiter.api.*;

import java.math.BigDecimal;
import java.util.*;

import static org.junit.jupiter.api.Assertions.*;

class RulesUnitTest {

    // ---- MemberFact ----

    @Test @DisplayName("MemberFact getExtNumber 从 extAttributes 提取数值")
    void memberFactExtractNumber() {
        MemberFact fact = new MemberFact("PROG001", 8821L, "SILVER", "ENROLLED",
                Map.of("shoe_size", 42, "pet_name", "旺财"));
        assertEquals(42.0, fact.getExtNumber("shoe_size"));
        assertEquals(0.0, fact.getExtNumber("nonexist"));
    }

    @Test @DisplayName("MemberFact getExtString 提取字符串")
    void memberFactExtractString() {
        MemberFact fact = new MemberFact("PROG001", 8821L, "GOLD", "ENROLLED",
                Map.of("pet_name", "旺财"));
        assertEquals("旺财", fact.getExtString("pet_name"));
        assertNull(fact.getExtString("nonexist"));
    }

    @Test @DisplayName("MemberFact hasExt 检查 key 存在")
    void memberFactHasExt() {
        MemberFact fact = new MemberFact("P", 1L, "BASE", "ENROLLED", Map.of("vip", true));
        assertTrue(fact.hasExt("vip"));
        assertFalse(fact.hasExt("nonexist"));
    }

    // ---- Action & ActionCollector ----

    @Test @DisplayName("ActionCollector 收集多种动作")
    void actionCollectorCollectsAll() {
        ActionCollector collector = new ActionCollector();
        collector.awardPoints("PROG001", "8821", "REWARD_POINTS",
                new BigDecimal("50.0000"), "RULE-1", "SNAP-1");
        collector.upgradeTier("8821", "GOLD", "实时升级", "RULE-2", "SNAP-2");

        assertEquals(2, collector.size());
        assertFalse(collector.isEmpty());

        List<Action> actions = collector.getActions();
        assertTrue(actions.get(0) instanceof AwardPointsAction);
        assertTrue(actions.get(1) instanceof UpgradeTierAction);
    }

    @Test @DisplayName("AwardPointsAction 存储正确的积分值")
    void awardPointsActionFields() {
        var action = new AwardPointsAction("PROG001", "8821", "REWARD_POINTS",
                new BigDecimal("50.0000"), "RULE-1", "SNAP-1");
        assertEquals("PROG001", action.getProgramCode());
        assertEquals("8821", action.getMemberId());
        assertEquals(0, new BigDecimal("50.0000").compareTo(action.getPoints()));
        assertEquals("AWARD_POINTS", action.actionType());
    }

    // ---- ActionDiff ----

    @Test @DisplayName("ActionDiff: 无差异时 isEmpty=true")
    void actionDiffEmpty() {
        var baseline = List.<Action>of();
        var candidate = List.<Action>of();
        ActionDiff diff = new ActionDiff(baseline, candidate);
        assertTrue(diff.isEmpty());
    }

    @Test @DisplayName("ActionDiff: Candidate 多发积分 → Double Reward")
    void actionDiffDoubleReward() {
        var baseline = List.<Action>of(
                new AwardPointsAction("P", "M1", "TP", new BigDecimal("100"), "R1", "S1"));
        var candidate = List.<Action>of(
                new AwardPointsAction("P", "M1", "TP", new BigDecimal("100"), "R1", "S1"),
                new AwardPointsAction("P", "M1", "TP", new BigDecimal("50"), "R2", "S2"));
        ActionDiff diff = new ActionDiff(baseline, candidate);
        assertTrue(diff.hasUnexpectedDoubleReward());
        assertEquals(0, new BigDecimal("50").compareTo(diff.getPointDifference()));
    }

    @Test @DisplayName("ActionDiff: Baseline 有发分但 Candidate 无 → Shadowing")
    void actionDiffShadowing() {
        var baseline = List.<Action>of(
                new AwardPointsAction("P", "M1", "TP", new BigDecimal("100"), "R1", "S1"));
        var candidate = List.<Action>of();
        ActionDiff diff = new ActionDiff(baseline, candidate);
        assertTrue(diff.hasRuleShadowing());
    }

    // ---- RegressionReport ----

    @Test @DisplayName("RegressionReport: 全部通过 → PASS")
    void reportAllPass() {
        RegressionReport report = new RegressionReport();
        report.addPass(); report.addPass();
        assertEquals(RegressionReport.Level.PASS, report.getHighestLevel());
        assertFalse(report.hasCriticalWarning());
    }

    @Test @DisplayName("RegressionReport: 有差异 → WARNING")
    void reportWarning() {
        RegressionReport report = new RegressionReport();
        ActionDiff diff = new ActionDiff(
                List.of(new AwardPointsAction("P","M","T",new BigDecimal("100"),"R","S")),
                List.of());
        report.addDiff(diff, "case-1");
        assertEquals(RegressionReport.Level.WARNING, report.getHighestLevel());
    }

    @Test @DisplayName("RegressionReport: Double Reward → CRITICAL")
    void reportCritical() {
        RegressionReport report = new RegressionReport();
        var baseline = List.<Action>of(
                new AwardPointsAction("P","M","T",new BigDecimal("100"),"R","S"));
        var candidate = List.<Action>of(
                new AwardPointsAction("P","M","T",new BigDecimal("100"),"R1","S1"),
                new AwardPointsAction("P","M","T",new BigDecimal("50"),"R2","S2"));
        report.addDiff(new ActionDiff(baseline, candidate), "double reward");
        assertEquals(RegressionReport.Level.CRITICAL, report.getHighestLevel());
        assertTrue(report.hasCriticalWarning());
    }
}