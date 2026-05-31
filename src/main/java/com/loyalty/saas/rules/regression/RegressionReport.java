package com.loyalty.saas.rules.regression;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.List;

/**
 * 沙箱回归测试报告。
 *
 * <p>警告分级（设计文档 6.4.1 节）：
 * <ul>
 *   <li><b>PASS (绿色)</b>: 完全符合预期，允许常规提交</li>
 *   <li><b>WARNING (黄色)</b>: 轻微规则遮蔽，高亮提示</li>
 *   <li><b>CRITICAL (红色)</b>: 叠加超发或积分差异不符预期，强阻断</li>
 * </ul>
 */
public class RegressionReport {

    public enum Level { PASS, WARNING, CRITICAL }

    /** 回归测试的总用例数 */
    private int totalCases = 0;

    /** 通过用例数 */
    private int passCount = 0;

    /** 有差异的用例数 */
    private int diffCount = 0;

    /** 累积积分差异（Candidate - Baseline） */
    private BigDecimal totalPointDelta = BigDecimal.ZERO;

    /** 所有差异记录 */
    private final List<CaseDiff> diffs = new ArrayList<>();

    /** 测试数据集描述 */
    private String datasetDescription;

    public void addPass() {
        totalCases++;
        passCount++;
    }

    public void addDiff(ActionDiff diff, String caseDescription) {
        totalCases++;
        diffCount++;
        totalPointDelta = totalPointDelta.add(diff.getPointDifference());
        diffs.add(new CaseDiff(caseDescription, diff));
    }

    /** 最高警告级别 */
    public Level getHighestLevel() {
        if (diffs.stream().anyMatch(d -> d.diff.hasUnexpectedDoubleReward())) {
            return Level.CRITICAL;
        }
        if (diffCount > 0) {
            return Level.WARNING;
        }
        return Level.PASS;
    }

    /** 是否有 CRITICAL 警告（需要 forceOverride） */
    public boolean hasCriticalWarning() {
        return getHighestLevel() == Level.CRITICAL;
    }

    public int getTotalCases() { return totalCases; }
    public int getPassCount() { return passCount; }
    public int getDiffCount() { return diffCount; }
    public BigDecimal getTotalPointDelta() { return totalPointDelta; }
    public List<CaseDiff> getDiffs() { return List.copyOf(diffs); }

    public void setDatasetDescription(String d) { this.datasetDescription = d; }
    public String getDatasetDescription() { return datasetDescription; }

    public record CaseDiff(String description, ActionDiff diff) {}

    @Override
    public String toString() {
        return String.format("RegressionReport{level=%s, cases=%d, pass=%d, diff=%d, delta=%s}",
                getHighestLevel(), totalCases, passCount, diffCount, totalPointDelta.toPlainString());
    }
}