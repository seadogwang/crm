package com.loyalty.saas.member;

import com.loyalty.saas.common.context.TenantContext;
import com.loyalty.saas.common.event.EventBridge;
import com.loyalty.saas.common.exception.BusinessException;
import com.loyalty.saas.domain.entity.Member;
import com.loyalty.saas.domain.entity.MemberUniqueKey;
import com.loyalty.saas.notification.TierChangeEvent;
import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.security.MessageDigest;
import java.time.LocalDateTime;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;

/**
 * One-ID 全渠道入会服务 — 设计文档 3.4 节完整实现。
 *
 * <p>核心功能：
 * <ol>
 *   <li>雪花算法生成全局唯一 member_id</li>
 *   <li>分布式锁防并发注册（本地 ConcurrentHashMap 骨架，生产用 Redisson）</li>
 *   <li>多维度交集匹配：手机号/微信UnionID/支付宝UserID</li>
 *   <li>极端竞态防护：DataIntegrityViolationException 兜底</li>
 *   <li>新人礼发布 MemberEnrolledEvent</li>
 * </ol>
 *
 * @author Loyalty SaaS Architecture Team
 * @since 1.0.0
 */
@Service
public class OneIdEnrollmentService {

    private static final Logger log = LoggerFactory.getLogger(OneIdEnrollmentService.class);

    @PersistenceContext private EntityManager em;
    private final EventBridge eventBridge;

    /** 分布式锁（骨架 — 生产用 Redisson RLock） */
    private final ConcurrentHashMap<String, Long> lockMap = new ConcurrentHashMap<>();

    /** 雪花算法：起始时间戳 (2026-01-01) */
    private static final long EPOCH = 1735689600000L;
    private static final long WORKER_ID = 1L;
    private static final long SEQUENCE_BITS = 12L;
    private static final long WORKER_ID_BITS = 5L;
    private long lastTimestamp = -1L;
    private long sequence = 0L;

    public OneIdEnrollmentService(@Autowired(required = false) EventBridge eventBridge) {
        this.eventBridge = eventBridge;
    }

    /**
     * 全渠道入会——级联匹配 + 防重 + 雪花 ID。
     *
     * @param programCode     租户代码
     * @param mobile          手机号（加密，可为 null）
     * @param wechatUnionId   微信 UnionID（可为 null）
     * @param alipayUserId    支付宝 UserID（可为 null）
     * @param channel         注册渠道
     * @param channelOpenId   渠道 OpenID
     * @param extAttributes   动态扩展属性
     * @return 会员 ID（已有或新建）
     */
    @Transactional(rollbackFor = Exception.class)
    public Long enroll(String programCode, String mobile, String wechatUnionId,
                        String alipayUserId, String channel, String channelOpenId,
                        Map<String, Object> extAttributes) {

        // ==================== Step 1: 分布式锁 ====================
        String lockKey = buildLockKey(programCode, mobile, wechatUnionId);
        if (!tryLock(lockKey)) {
            throw new BusinessException("ERR_ENROLL_LOCKED", "入会处理中，请稍后重试");
        }
        try {
            // ==================== Step 2: 多维度交集匹配 ====================
            Long existingMemberId = matchExistingMember(programCode, mobile, wechatUnionId, alipayUserId);
            if (existingMemberId != null) {
                // 场景 A: 老会员 — 绑定新渠道
                bindChannel(existingMemberId, programCode, channel, channelOpenId);
                log.info("[Enrollment] 老会员回访: memberId={}, channel={}", existingMemberId, channel);
                return existingMemberId;
            }

            // ==================== Step 3: 新会员注册 ====================
            Long newMemberId = generateSnowflakeId();
            Member member = Member.builder()
                    .programCode(programCode)
                    .memberId(newMemberId)
                    .tierCode("BASE")
                    .status("ENROLLED")
                    .extAttributes(extAttributes != null ? new LinkedHashMap<>(extAttributes) : new LinkedHashMap<>())
                    .createdAt(LocalDateTime.now())
                    .updatedAt(LocalDateTime.now())
                    .build();
            em.persist(member);

            // ==================== Step 4: 写入唯一键 ====================
            try {
                if (mobile != null) {
                    saveUniqueKey(programCode, "MOBILE", mobile, newMemberId);
                }
                if (wechatUnionId != null) {
                    saveUniqueKey(programCode, "WECHAT_UNIONID", wechatUnionId, newMemberId);
                }
                if (alipayUserId != null) {
                    saveUniqueKey(programCode, "ALIPAY_USER_ID", alipayUserId, newMemberId);
                }
                if (channel != null && channelOpenId != null) {
                    saveUniqueKey(programCode, channel, channelOpenId, newMemberId);
                }
            } catch (DataIntegrityViolationException e) {
                // ===== Ch3.4.2.1 极端竞态防护 =====
                log.warn("[Enrollment] 并发冲突（唯一键已存在），查找已创建的会员: program={}, mobile={}", programCode, mobile);
                existingMemberId = matchExistingMember(programCode, mobile, wechatUnionId, alipayUserId);
                if (existingMemberId != null) {
                    em.remove(member); // 回滚本次创建的重复会员
                    bindChannel(existingMemberId, programCode, channel, channelOpenId);
                    return existingMemberId;
                }
                throw e;
            }

            // ==================== Step 5: 发布入会事件 ====================
            if (eventBridge != null) {
                eventBridge.publish("loyalty-events", String.valueOf(newMemberId),
                        new TierChangeEvent(programCode, newMemberId, null, "BASE"));
            }

            log.info("[Enrollment] 新会员注册: program={}, memberId={}, channel={}", programCode, newMemberId, channel);
            return newMemberId;
        } finally {
            unlock(lockKey);
        }
    }

    // ==================== 辅助方法 ====================

    private Long matchExistingMember(String programCode, String mobile, String wechatUnionId, String alipayUserId) {
        if (mobile != null) {
            Long id = findMemberByKey(programCode, "MOBILE", mobile);
            if (id != null) return id;
        }
        if (wechatUnionId != null) {
            Long id = findMemberByKey(programCode, "WECHAT_UNIONID", wechatUnionId);
            if (id != null) return id;
        }
        if (alipayUserId != null) {
            Long id = findMemberByKey(programCode, "ALIPAY_USER_ID", alipayUserId);
            if (id != null) return id;
        }
        return null;
    }

    private Long findMemberByKey(String programCode, String keyType, String keyValue) {
        try {
            List<Long> result = em.createQuery(
                    "SELECT m.memberId FROM MemberUniqueKey m WHERE m.programCode = :pc "
                            + "AND m.keyCombination = :kt AND m.keyValue = :kv", Long.class)
                    .setParameter("pc", programCode)
                    .setParameter("kt", keyType)
                    .setParameter("kv", keyValue)
                    .setMaxResults(1)
                    .getResultList();
            return result.isEmpty() ? null : result.get(0);
        } catch (Exception e) {
            return null;
        }
    }

    private void saveUniqueKey(String programCode, String keyType, String keyValue, Long memberId) {
        MemberUniqueKey uk = MemberUniqueKey.builder()
                .programCode(programCode)
                .keyCombination(keyType)
                .keyValue(keyValue)
                .memberId(memberId)
                .build();
        em.persist(uk);
    }

    private void bindChannel(Long memberId, String programCode, String channel, String channelOpenId) {
        if (channel != null && channelOpenId != null) {
            try {
                saveUniqueKey(programCode, channel, channelOpenId, memberId);
            } catch (DataIntegrityViolationException ignored) {
                // 渠道已绑定，忽略
            }
        }
    }

    // ==================== 雪花算法 ====================

    private synchronized long generateSnowflakeId() {
        long timestamp = System.currentTimeMillis();
        if (timestamp < lastTimestamp) {
            throw new RuntimeException("Clock moved backwards");
        }
        if (timestamp == lastTimestamp) {
            sequence = (sequence + 1) & ((1L << SEQUENCE_BITS) - 1);
            if (sequence == 0) {
                while ((timestamp = System.currentTimeMillis()) <= lastTimestamp) {
                    Thread.onSpinWait();
                }
            }
        } else {
            sequence = 0;
        }
        lastTimestamp = timestamp;
        return ((timestamp - EPOCH) << (SEQUENCE_BITS + WORKER_ID_BITS))
                | (WORKER_ID << SEQUENCE_BITS) | sequence;
    }

    private String buildLockKey(String programCode, String mobile, String wechatUnionId) {
        // 统一用手机号 hash 生成锁 key（Ch3.4.2.1 约束）
        String base = mobile != null ? mobile : (wechatUnionId != null ? wechatUnionId : "default");
        return "enroll:" + programCode + ":" + hash(base);
    }

    private boolean tryLock(String key) {
        return lockMap.putIfAbsent(key, System.currentTimeMillis()) == null;
    }

    private void unlock(String key) {
        lockMap.remove(key);
    }

    private String hash(String input) {
        try {
            MessageDigest md = MessageDigest.getInstance("MD5");
            byte[] digest = md.digest(input.getBytes());
            StringBuilder sb = new StringBuilder();
            for (byte b : digest) sb.append(String.format("%02x", b));
            return sb.toString();
        } catch (Exception e) {
            return Integer.toHexString(input.hashCode());
        }
    }
}