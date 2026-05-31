package com.loyalty.saas.rules.action;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

/**
 * 线程安全的动作收集器 — DRL 脚本通过此收集器输出指令。
 *
 * <p>在 DRL 中作为全局变量使用:
 * <pre>{@code
 * global ActionCollector collector;
 *
 * rule "example"
 * when ... then
 *     collector.add(new AwardPointsAction(...));
 * end
 * }</pre>
 *
 * <p><b>强制约束</b>：DRL 的 then 块中禁止直接调用 JPA/SQL，
 * 只能通过 ActionCollector 收集指令。
 *
 * <p><b>线程安全</b>：使用 {@code synchronized} 保护内部列表。
 * 每个 {@code StatelessKieSession.execute()} 调用使用独立的 collector 实例，
 * 天然线程隔离。
 */
public class ActionCollector {

    private final List<Action> actions = Collections.synchronizedList(new ArrayList<>());

    /** DRL 调用入口：添加动作 */
    public void add(Action action) {
        if (action != null) {
            actions.add(action);
        }
    }

    /** 便捷方法：发分 */
    public void awardPoints(String programCode, String memberId, String accountType,
                             java.math.BigDecimal points, String ruleId, String snapshotId) {
        add(new AwardPointsAction(programCode, memberId, accountType, points, ruleId, snapshotId));
    }

    /** 便捷方法：升级 */
    public void upgradeTier(String memberId, String newTier, String reason,
                             String ruleId, String snapshotId) {
        add(new UpgradeTierAction(memberId, newTier, reason, ruleId, snapshotId));
    }

    /** 便捷方法：降级 */
    public void downgradeTier(String memberId, String newTier, String reason,
                               String ruleId, String snapshotId) {
        add(new DowngradeTierAction(memberId, newTier, reason, ruleId, snapshotId));
    }

    /** 获取收集到的所有动作 */
    public List<Action> getActions() {
        return List.copyOf(actions);
    }

    /** 动作数量 */
    public int size() { return actions.size(); }

    /** 是否有动作 */
    public boolean isEmpty() { return actions.isEmpty(); }
}