package com.loyalty.platform.member;

import com.loyalty.platform.common.context.TenantContext;
import com.loyalty.platform.common.event.EventBridge;
import com.loyalty.platform.common.exception.BusinessException;
import com.loyalty.platform.notification.TierChangeEvent;
import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;

/**
 * 显式合并与资产转移服务 — Ch3.4.3 完整实现。
 *
 * <p>当因极端情况或人工客服操作发现两个 member_id 属于同一个人时，
 * 触发 MERGE 操作：
 * <ol>
 *   <li>选取主账号（注册早或等级高的）</li>
 *   <li>被合并账号状态 → MERGED</li>
 *   <li>积分资产：按 accountType 分组 SUM → 主账号</li>
 *   <li>等级资产：取两个账号中等级序列最高的一方</li>
 *   <li>member_unique_key 记录全部重定向指向主账号</li>
 * </ol>
 */
@Service
public class MemberMergeService {

    private static final Logger log = LoggerFactory.getLogger(MemberMergeService.class);

    @PersistenceContext private EntityManager em;
    private final EventBridge eventBridge;

    public MemberMergeService(@Autowired(required = false) EventBridge eventBridge) {
        this.eventBridge = eventBridge;
    }

    /**
     * 执行两个会员的显式合并。
     *
     * @param programCode   租户代码
     * @param primaryMemberId   主账号（保留）
     * @param secondaryMemberId 被合并账号（标记 MERGED）
     */
    @Transactional(rollbackFor = Exception.class)
    public void merge(String programCode, Long primaryMemberId, Long secondaryMemberId) {
        if (primaryMemberId.equals(secondaryMemberId)) {
            throw new BusinessException("ERR_MERGE_SAME_ID", "不能合并同一个会员");
        }

        // 1. 标记被合并账号
        int updated = em.createNativeQuery(
                "UPDATE member SET status = 'MERGED', merged_to_member_id = ?, updated_at = NOW() "
                        + "WHERE program_code = ? AND member_id = ? AND status != 'MERGED'")
                .setParameter(1, primaryMemberId)
                .setParameter(2, programCode)
                .setParameter(3, secondaryMemberId)
                .executeUpdate();
        if (updated == 0) {
            throw new BusinessException("ERR_MERGE_FAILED", "会员不存在或已被合并");
        }

        // 2. 积分资产转移：按 account_type 分组 SUM remaining_amount
        transferPoints(programCode, primaryMemberId, secondaryMemberId);

        // 3. 等级资产：取两个账号中等级最高的一方
        transferTier(programCode, primaryMemberId, secondaryMemberId);

        // 4. member_unique_key 记录重定向：将副会员的唯一键指向主会员
        em.createNativeQuery(
                "UPDATE member_unique_key SET member_id = ? "
                        + "WHERE program_code = ? AND member_id = ?")
                .setParameter(1, primaryMemberId)
                .setParameter(2, programCode)
                .setParameter(3, secondaryMemberId)
                .executeUpdate();

        // 5. 发布合并事件
        if (eventBridge != null) {
            eventBridge.publish("loyalty-events", String.valueOf(primaryMemberId),
                    new TierChangeEvent(programCode, primaryMemberId, null, "MERGED"));
        }

        log.info("[Merge] 会员合并完成: {} → {} (MERGE)", secondaryMemberId, primaryMemberId);
    }

    private void transferPoints(String programCode, Long primary, Long secondary) {
        @SuppressWarnings("unchecked")
        List<Object[]> batches = em.createNativeQuery(
                "SELECT id, account_type, remaining_amount FROM account_transaction "
                        + "WHERE program_code = ? AND member_id = ? "
                        + "AND status = 'ACTIVE' AND remaining_amount > 0 "
                        + "AND (expires_at IS NULL OR expires_at > NOW())",
                Object[].class)
                .setParameter(1, programCode)
                .setParameter(2, secondary)
                .getResultList();

        for (Object[] row : batches) {
            Long batchId = ((Number) row[0]).longValue();
            String accountType = (String) row[1];
            BigDecimal remaining = new BigDecimal(row[2].toString());

            // 将批次所有权转移到主账号
            em.createNativeQuery(
                    "UPDATE account_transaction SET member_id = ? WHERE id = ?")
                    .setParameter(1, primary)
                    .setParameter(2, batchId)
                    .executeUpdate();
        }
        log.info("[Merge] 积分转移完成: {} 批次", batches.size());
    }

    @SuppressWarnings("unchecked")
    private void transferTier(String programCode, Long primary, Long secondary) {
        List<Object[]> tiers = em.createNativeQuery(
                "SELECT current_tier FROM member_tier WHERE program_code = ? AND member_id IN (?,?)",
                Object[].class)
                .setParameter(1, programCode)
                .setParameter(2, primary)
                .setParameter(3, secondary)
                .getResultList();

        String bestTier = "BASE";
        for (Object[] t : tiers) {
            String tier = (String) t[0];
            if (tierRank(tier) > tierRank(bestTier)) bestTier = tier;
        }

        // 删除 secondary 的 tier 记录
        em.createNativeQuery("DELETE FROM member_tier WHERE program_code = ? AND member_id = ?")
                .setParameter(1, programCode).setParameter(2, secondary).executeUpdate();

        // 更新 primary 等级（如果更好）
        em.createNativeQuery(
                "UPDATE member_tier SET current_tier = ?, effective_date = CURRENT_DATE, updated_at = NOW() "
                        + "WHERE program_code = ? AND member_id = ?")
                .setParameter(1, bestTier).setParameter(2, programCode).setParameter(3, primary)
                .executeUpdate();

        // 记录变更
        em.createNativeQuery(
                "INSERT INTO tier_change_log (program_code, member_id, to_tier, change_reason, event_id, changed_at) "
                        + "VALUES (?,?,?,?,?,?)")
                .setParameter(1, programCode).setParameter(2, primary).setParameter(3, bestTier)
                .setParameter(4, "MERGE").setParameter(5, "MERGE_" + System.currentTimeMillis())
                .setParameter(6, LocalDateTime.now())
                .executeUpdate();

        log.info("[Merge] 等级合并: bestTier={}", bestTier);
    }

    private int tierRank(String tier) {
        return switch (tier != null ? tier.toUpperCase() : "BASE") {
            case "PLATINUM" -> 4;
            case "GOLD" -> 3;
            case "SILVER" -> 2;
            case "BASE" -> 1;
            default -> 0;
        };
    }
}