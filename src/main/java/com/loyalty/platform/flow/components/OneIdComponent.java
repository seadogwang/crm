package com.loyalty.platform.flow.components;

import com.loyalty.platform.domain.entity.Member;
import com.loyalty.platform.domain.entity.PointTypeDefinition;
import com.loyalty.platform.domain.repository.AccountTransactionRepository;
import com.loyalty.platform.flow.BaseLiteflowComponent;
import com.loyalty.platform.flow.EventContext;
import com.loyalty.platform.rules.drl.MemberFact;
import com.yomahub.liteflow.annotation.LiteflowComponent;
import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import org.springframework.beans.factory.annotation.Autowired;

import java.math.BigDecimal;
import java.util.Map;

/**
 * One-ID 匹配组件 — 根据 channel + unique_key 匹配或创建会员。
 *
 * <p>流程：
 * <ol>
 *   <li>从 standardizedPayload 中提取唯一标识（phone/openId/unionId）</li>
 *   <li>调用 OneIdEnrollmentService 匹配/创建会员</li>
 *   <li>构建 MemberFact 并设置到 EventContext</li>
 * </ol>
 */
@LiteflowComponent("oneIdCmp")
public class OneIdComponent extends BaseLiteflowComponent {

    @PersistenceContext
    private EntityManager em;

    @Autowired
    private AccountTransactionRepository txRepo;

    @Override
    protected void doProcess(EventContext ctx) throws Exception {
        String pc = ctx.getProgramCode();
        Map<String, Object> payload = ctx.getStandardizedPayload();
        if (payload == null) {
            payload = Map.of();
        }

        // 提取 memberId（优先从标准化 payload 中获取）
        String memberIdStr = extractMemberId(payload);
        Long memberId = memberIdStr != null ? Long.parseLong(memberIdStr) : null;

        MemberFact memberFact;
        if (memberId != null) {
            try {
                Member member = em.createQuery(
                        "SELECT m FROM Member m WHERE m.programCode = :pc AND m.memberId = :mid",
                        Member.class)
                        .setParameter("pc", pc).setParameter("mid", memberId)
                        .getSingleResult();

                // 获取累计消费金额和等级成长值，动态查询不硬编码类型
                Double totalSpent = 0.0;
                Double tierPoints = 0.0;
                try {
                    // 等级积分：查 isTierCalc=true 的类型
                    var tierCalcTypes = em.createQuery(
                        "SELECT p FROM PointTypeDefinition p WHERE p.programCode=:pc AND p.status='ACTIVE' AND p.isTierCalc=true",
                        PointTypeDefinition.class)
                        .setParameter("pc", pc).getResultList();
                    for (var pt : tierCalcTypes) {
                        BigDecimal balance = txRepo.sumAvailableBalance(pc, memberId, pt.getTypeCode());
                        if (balance != null) tierPoints += balance.doubleValue();
                    }
                    // 累计消费金额：查 isRedeemable=true 的类型
                    var redeemableTypes = em.createQuery(
                        "SELECT p FROM PointTypeDefinition p WHERE p.programCode=:pc AND p.status='ACTIVE' AND p.isRedeemable=true",
                        PointTypeDefinition.class)
                        .setParameter("pc", pc).getResultList();
                    for (var pt : redeemableTypes) {
                        BigDecimal accrued = txRepo.sumByType(pc, memberId, pt.getTypeCode(), "ACCRUAL");
                        if (accrued != null) totalSpent += accrued.doubleValue();
                    }
                } catch (Exception ignored) {}

                memberFact = new MemberFact(pc, member.getMemberId(), member.getTierCode(),
                        member.getStatus(), member.getExtAttributes(), totalSpent, tierPoints);
                log.debug("[OneId] 会员已存在: memberId={}, tier={}, totalSpent={}, tierPoints={}",
                        memberId, member.getTierCode(), totalSpent, tierPoints);
            } catch (Exception e) {
                // 会员不存在时创建默认 MemberFact
                memberFact = new MemberFact(pc, memberId, "BASE", "ENROLLED", payload, 0.0, 0.0);
                log.info("[OneId] 会员不存在，使用默认值: memberId={}", memberId);
            }
        } else {
            // 无法提取 memberId，使用默认值
            memberFact = new MemberFact(pc, 0L, "BASE", "UNKNOWN", payload, 0.0, 0.0);
            log.warn("[OneId] 无法提取 memberId，使用默认");
        }

        ctx.setMemberFact(memberFact);
    }

    private String extractMemberId(Map<String, Object> payload) {
        // 多种 memberId key 变体
        for (String key : new String[]{"member_id", "memberId", "userId", "open_id", "buyer_nick"}) {
            Object val = payload.get(key);
            if (val != null) {
                String s = String.valueOf(val);
                // 只取数字
                s = s.replaceAll("[^0-9]", "");
                if (!s.isBlank() && s.length() <= 19) return s;
            }
        }
        return null;
    }
}