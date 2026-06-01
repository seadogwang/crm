package com.loyalty.saas.accounting;

import com.loyalty.saas.domain.entity.MemberAccount;
import com.loyalty.saas.domain.repository.MemberAccountRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import java.math.BigDecimal;
import java.time.LocalDateTime;

/**
 * 负资产挂账服务 — Ch5.5 逆向退款超额保护。
 *
 * <p>当逆向扣减超过 overdraft_limit 时：
 * <ul>
 *   <li>停止扣减，只扣至允许的透支极限</li>
 *   <li>生成追偿工单写入 negative_pending 表</li>
 *   <li>标记会员状态为 SUSPENDED（禁止兑换）</li>
 * </ul>
 *
 * <p>未来新入账积分通过瀑布流冲抵 (PointGrantService Step-1)
 * 自动偿还 negative_pending 债务后，恢复会员正常状态。
 */
@Service
public class NegativePendingService {

    private static final Logger log = LoggerFactory.getLogger(NegativePendingService.class);

    @PersistenceContext private EntityManager em;
    private final MemberAccountRepository accountRepo;

    public NegativePendingService(MemberAccountRepository accountRepo) { this.accountRepo = accountRepo; }

    /**
     * 记录无法完成的扣减债务，生成追偿工单。
     *
     * @param programCode  租户代码
     * @param memberId     会员 ID
     * @param accountType  账户类型
     * @param shortfall    无法扣减的缺口
     */
    @Transactional(rollbackFor = Exception.class)
    public void recordNegativePending(String programCode, Long memberId,
                                       String accountType, BigDecimal shortfall) {
        if (shortfall == null || shortfall.compareTo(BigDecimal.ZERO) <= 0) return;

        // 1. 检查透支极限
        MemberAccount account = accountRepo.findByMemberIdAndType(programCode, memberId, accountType)
                .orElse(null);
        if (account != null) {
            BigDecimal maxOverdraft = account.getOverdraftLimit() != null
                    ? account.getOverdraftLimit() : BigDecimal.ZERO;
            if (shortfall.compareTo(maxOverdraft) > 0) {
                log.warn("[NegativePending] 超额透支: member={}, shortfall={}, limit={}",
                        memberId, shortfall, maxOverdraft);
                // 只记录超出部分
                BigDecimal excess = shortfall.subtract(maxOverdraft);
                if (excess.compareTo(BigDecimal.ZERO) > 0) {
                    insertNegativePending(programCode, memberId, accountType, excess);
                }
            } else {
                insertNegativePending(programCode, memberId, accountType, shortfall);
            }
        } else {
            insertNegativePending(programCode, memberId, accountType, shortfall);
        }

        // 2. 冻结兑换权限
        suspendRedemption(programCode, memberId);
    }

    private void insertNegativePending(String programCode, Long memberId,
                                        String accountType, BigDecimal amount) {
        em.createNativeQuery(
                "INSERT INTO negative_pending (program_code, member_id, account_type, "
                        + "pending_amount, status, created_at) VALUES (?,?,?,?,?,?)")
                .setParameter(1, programCode)
                .setParameter(2, memberId)
                .setParameter(3, accountType)
                .setParameter(4, amount)
                .setParameter(5, "PENDING")
                .setParameter(6, LocalDateTime.now())
                .executeUpdate();
        log.warn("[NegativePending] 生成追偿工单: member={}, amount={}", memberId, amount);
    }

    private void suspendRedemption(String programCode, Long memberId) {
        em.createNativeQuery(
                "UPDATE member SET status = 'SUSPENDED' WHERE program_code = ? AND member_id = ? AND status = 'ENROLLED'")
                .setParameter(1, programCode)
                .setParameter(2, memberId)
                .executeUpdate();
        log.info("[NegativePending] 会员兑换已冻结: member={}", memberId);
    }

    /**
     * 新入账积分还清债务后，恢复会员正常状态。
     */
    @Transactional
    public void clearPendingAndRestore(Long memberId) {
        int cleared = em.createNativeQuery(
                "UPDATE negative_pending SET status = 'CLEARED', cleared_at = NOW() "
                        + "WHERE member_id = ? AND status = 'PENDING'")
                .setParameter(1, memberId)
                .executeUpdate();
        if (cleared > 0) {
            em.createNativeQuery(
                    "UPDATE member SET status = 'ENROLLED' WHERE member_id = ? AND status = 'SUSPENDED'")
                    .setParameter(1, memberId)
                    .executeUpdate();
            log.info("[NegativePending] 债务已还清，恢复兑换: member={}", memberId);
        }
    }
}