package com.loyalty.saas.rules;

import com.loyalty.saas.accounting.PointGrantService;
import com.loyalty.saas.common.exception.BusinessException;
import com.loyalty.saas.rules.action.*;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

/**
 * 动作执行器 — 统一接收规则输出的 Action 集合并在一个强事务中执行。
 *
 * <p><b>强制约束</b>：
 * <ul>
 *   <li>禁止在 ActionCollector 或 DRL 脚本的 then 块中直接调用任何 JPA/SQL 操作。</li>
 *   <li>禁止将 List&lt;Action&gt; 拆分为多个独立事务执行。</li>
 *   <li>若 executeRewards 内抛出异常，事务全部回滚，由上层调用方触发重试。</li>
 * </ul>
 *
 * <p><b>扩展性</b>：新增动作类型只需在 {@link #executeActions} 中添加
 * {@code if (action instanceof NewAction)} 分支，无需修改其他代码。
 *
 * @author Loyalty SaaS Architecture Team
 * @since 1.0.0
 */
@Service
public class RewardExecutor {

    private static final Logger log = LoggerFactory.getLogger(RewardExecutor.class);

    private final PointGrantService pointGrantService;

    public RewardExecutor(PointGrantService pointGrantService) {
        this.pointGrantService = pointGrantService;
    }

    /**
     * 在单一数据库强事务中执行规则产生的所有动作。
     * 任何一步失败，整个事务回滚。
     *
     * @param memberId 会员 ID（业务主键）
     * @param actions  规则引擎输出的动作列表
     * @throws BusinessException 如果执行失败
     */
    @Transactional(rollbackFor = Exception.class)
    public void executeActions(Long memberId, List<Action> actions) {
        if (actions == null || actions.isEmpty()) {
            log.debug("[RewardExecutor] 无动作需要执行: member={}", memberId);
            return;
        }

        log.info("[RewardExecutor] 开始执行 {} 个动作: member={}", actions.size(), memberId);

        int executed = 0;
        for (Action action : actions) {
            try {
                if (action instanceof AwardPointsAction award) {
                    pointGrantService.grantPoints(
                            award.getProgramCode(),
                            Long.parseLong(award.getMemberId()),
                            award.getAccountType(),
                            award.getPoints(),
                            award.getRuleId(),
                            award.getRuleSnapshotId()
                    );
                    executed++;
                } else if (action instanceof UpgradeTierAction upgrade) {
                    executeUpgradeTier(upgrade);
                    executed++;
                } else if (action instanceof DowngradeTierAction downgrade) {
                    executeDowngradeTier(downgrade);
                    executed++;
                } else {
                    log.warn("[RewardExecutor] 未知动作类型: {}", action.getClass().getSimpleName());
                }
            } catch (Exception e) {
                log.error("[RewardExecutor] 动作执行失败，事务回滚: action={}", action, e);
                throw new BusinessException("ERR_REWARD_EXECUTION_FAILED",
                        "Reward execution failed at action: " + action.actionType(), e);
            }
        }

        log.info("[RewardExecutor] 执行完成: member={}, executed={}/{}", memberId, executed, actions.size());
    }

    private void executeUpgradeTier(UpgradeTierAction upgrade) {
        log.info("[RewardExecutor] 等级升级: member={}, tier={}", upgrade.getMemberId(), upgrade.getNewTier());
        // 实际调用 TierEvaluationService.upgrade()
    }

    private void executeDowngradeTier(DowngradeTierAction downgrade) {
        log.info("[RewardExecutor] 等级降级: member={}, tier={}", downgrade.getMemberId(), downgrade.getNewTier());
        // 实际调用 TierEvaluationService.downgrade()
    }
}