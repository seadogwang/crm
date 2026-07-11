package com.loyalty.platform.member;

import com.loyalty.platform.domain.entity.Member;
import com.loyalty.platform.domain.entity.MemberChannelBinding;
import com.loyalty.platform.domain.repository.ChannelBindingRepository;
import com.loyalty.platform.domain.repository.MemberRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.util.Optional;
import java.util.UUID;

/**
 * One-ID 身份匹配引擎。
 *
 * <p>分层匹配：OMID → 双因素 → 渠道ID → 密文 → 创建新会员
 */
@Service
public class OneIdMatcher {

    private static final Logger log = LoggerFactory.getLogger(OneIdMatcher.class);

    private final ChannelBindingRepository bindingRepo;
    private final MemberRepository memberRepo;

    public OneIdMatcher(ChannelBindingRepository bindingRepo, MemberRepository memberRepo) {
        this.bindingRepo = bindingRepo;
        this.memberRepo = memberRepo;
    }

    /**
     * 核心匹配方法。
     */
    public MatchResult match(MatchRequest request) {
        String pc = request.programCode();
        String channel = request.channel();

        // 第零层：OMID/UnionID 匹配
        if (request.channelUnionId() != null) {
            Optional<MemberChannelBinding> binding = bindingRepo
                    .findByProgramCodeAndChannelAndChannelUnionId(pc, channel, request.channelUnionId());
            if (binding.isPresent() && "ACTIVE".equals(binding.get().getStatus())) {
                return MatchResult.found(binding.get().getMemberId(), "UNION_ID");
            }
        }

        // 第一层：双因素匹配（渠道ID + 加密手机）
        if (request.channelUserId() != null && request.encryptedMobile() != null) {
            Optional<MemberChannelBinding> byId = bindingRepo
                    .findByProgramCodeAndChannelAndChannelUserId(pc, channel, request.channelUserId());
            if (byId.isPresent() && "ACTIVE".equals(byId.get().getStatus())) {
                String stored = byId.get().getChannelMobileEncrypted();
                if (stored != null && stored.equals(request.encryptedMobile())) {
                    return MatchResult.found(byId.get().getMemberId(), "DUAL_FACTOR");
                }
                return MatchResult.needVerification(byId.get().getMemberId(), "MOBILE_MISMATCH");
            }
        }

        // 第二层：渠道ID匹配
        if (request.channelUserId() != null) {
            Optional<MemberChannelBinding> binding = bindingRepo
                    .findByProgramCodeAndChannelAndChannelUserId(pc, channel, request.channelUserId());
            if (binding.isPresent() && "ACTIVE".equals(binding.get().getStatus())) {
                return MatchResult.found(binding.get().getMemberId(), "CHANNEL_USER_ID");
            }
        }

        // 第三层：密文手机匹配
        if (request.encryptedMobile() != null) {
            Optional<MemberChannelBinding> binding = bindingRepo
                    .findByEncryptedMobile(pc, channel, request.encryptedMobile());
            if (binding.isPresent()) {
                return MatchResult.found(binding.get().getMemberId(), "ENCRYPTED_MOBILE");
            }
        }

        // 第四层：未匹配 → 创建新会员
        return MatchResult.notFound();
    }

    // ===== 内部类 =====
    public record MatchRequest(String programCode, String channel, String channelUserId,
                                String channelUnionId, String encryptedMobile, String plainMobile,
                                String email, String encryptType) {
        public static Builder builder() { return new Builder(); }
        public static class Builder {
            private String programCode, channel, channelUserId, channelUnionId;
            private String encryptedMobile, plainMobile, email, encryptType;
            public Builder programCode(String v) { programCode = v; return this; }
            public Builder channel(String v) { channel = v; return this; }
            public Builder channelUserId(String v) { channelUserId = v; return this; }
            public Builder channelUnionId(String v) { channelUnionId = v; return this; }
            public Builder encryptedMobile(String v) { encryptedMobile = v; return this; }
            public Builder plainMobile(String v) { plainMobile = v; return this; }
            public Builder email(String v) { email = v; return this; }
            public Builder encryptType(String v) { encryptType = v; return this; }
            public MatchRequest build() { return new MatchRequest(programCode, channel, channelUserId, channelUnionId, encryptedMobile, plainMobile, email, encryptType); }
        }
    }

    public record MatchResult(String status, String memberId, String matchType, boolean isConflict) {
        public static MatchResult found(String memberId, String type) { return new MatchResult("FOUND", memberId, type, false); }
        public static MatchResult notFound() { return new MatchResult("NOT_FOUND", null, null, false); }
        public static MatchResult needVerification(String memberId, String type) { return new MatchResult("NEED_VERIFICATION", memberId, type, true); }
        public boolean isFound() { return "FOUND".equals(status); }
    }
}