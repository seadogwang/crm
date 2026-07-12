package com.loyalty.platform.member;

import com.loyalty.platform.domain.entity.MemberChannelBinding;
import com.loyalty.platform.domain.entity.MemberUniqueKey;
import com.loyalty.platform.domain.repository.ChannelBindingRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import java.time.LocalDateTime;
import java.util.*;

/**
 * One-ID 数据迁移服务 — 从 member_unique_key 迁移到 member_channel_binding。
 */
@Service
public class OneIdMigrationService {

    private static final Logger log = LoggerFactory.getLogger(OneIdMigrationService.class);

    @PersistenceContext
    private EntityManager em;

    private final ChannelBindingRepository bindingRepo;

    public OneIdMigrationService(ChannelBindingRepository bindingRepo) {
        this.bindingRepo = bindingRepo;
    }

    /**
     * 执行迁移：将 member_unique_key 中的渠道数据迁移到 member_channel_binding。
     */
    @Transactional
    public Map<String, Integer> migrate() {
        Map<String, Integer> stats = new LinkedHashMap<>();
        stats.put("total", 0);
        stats.put("migrated", 0);
        stats.put("skipped", 0);

        List<MemberUniqueKey> keys = em.createQuery(
            "FROM MemberUniqueKey k WHERE k.keyCombination IN ('TMALL_OUID','TMALL_OMID','JD_PIN','WECHAT_OPENID','DOUYIN_OPENID')",
            MemberUniqueKey.class).getResultList();

        stats.put("total", keys.size());

        for (MemberUniqueKey key : keys) {
            String channel = mapChannel(key.getKeyCombination());
            if (channel == null) {
                stats.put("skipped", stats.get("skipped") + 1);
                continue;
            }

            String memberId = String.valueOf(key.getMemberId());
            boolean exists = bindingRepo.findByProgramCodeAndChannelAndChannelUserId(
                key.getProgramCode(), channel, key.getKeyValue()).isPresent();

            if (exists) {
                stats.put("skipped", stats.get("skipped") + 1);
                continue;
            }

            MemberChannelBinding binding = MemberChannelBinding.builder()
                .id(UUID.randomUUID().toString())
                .programCode(key.getProgramCode())
                .memberId(memberId)
                .channel(channel)
                .channelUserId(key.getKeyValue())
                .channelUnionId(isUnionId(key.getKeyCombination()) ? key.getKeyValue() : null)
                .status("ACTIVE")
                .createdAt(key.getCreatedAt() != null ? key.getCreatedAt() : LocalDateTime.now())
                .build();

            bindingRepo.save(binding);
            stats.put("migrated", stats.get("migrated") + 1);
        }

        log.info("[OneIdMigration] 迁移完成: total={}, migrated={}, skipped={}",
            stats.get("total"), stats.get("migrated"), stats.get("skipped"));
        return stats;
    }

    private String mapChannel(String keyType) {
        return switch (keyType) {
            case "TMALL_OUID", "TMALL_OMID" -> "TMALL";
            case "JD_PIN" -> "JD";
            case "WECHAT_OPENID" -> "WECHAT";
            case "DOUYIN_OPENID" -> "DOUYIN";
            default -> null;
        };
    }

    private boolean isUnionId(String keyType) {
        return "TMALL_OMID".equals(keyType) || "WECHAT_UNIONID".equals(keyType);
    }
}