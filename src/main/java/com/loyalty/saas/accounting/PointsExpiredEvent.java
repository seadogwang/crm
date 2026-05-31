package com.loyalty.saas.accounting;

import com.loyalty.saas.common.event.BaseDomainEvent;
import lombok.Getter;

import java.math.BigDecimal;

/**
 * 积分过期事件 —— 惰性过期检查触发。
 *
 * <p>当 FIFO 核销遍历或用户查询余额时检测到已过期批次，
 * 标记批次状态为 EXPIRED 后发布此事件。
 * EventBridge 消费端负责：
 * <ul>
 *   <li>生成 EXPIRATION 类型审计流水</li>
 *   <li>触发用户通知（微信模板消息等）</li>
 *   <li>异步累加 member_account.total_expired</li>
 * </ul>
 */
@Getter
public class PointsExpiredEvent extends BaseDomainEvent {

    private static final long serialVersionUID = 1L;

    /** 会员 ID */
    private final Long memberId;

    /** 过期金额 */
    private final BigDecimal expiredAmount;

    /** 原始发分批次 ID */
    private final Long batchId;

    /** 账户类型 */
    private final String accountType;

    public PointsExpiredEvent(String programCode, Long memberId, BigDecimal expiredAmount,
                               Long batchId, String accountType) {
        super(programCode, "POINTS_EXPIRED");
        this.memberId = memberId;
        this.expiredAmount = expiredAmount;
        this.batchId = batchId;
        this.accountType = accountType;
    }
}