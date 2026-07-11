package com.loyalty.platform.member;

import com.loyalty.platform.domain.entity.Member;
import com.loyalty.platform.domain.entity.MemberChannelBinding;
import com.loyalty.platform.domain.repository.ChannelBindingRepository;
import com.loyalty.platform.domain.repository.MemberRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

/**
 * 渠道绑定服务 — 管理 member_channel_binding 表。
 */
@Service
public class ChannelBindingService {

    private static final Logger log = LoggerFactory.getLogger(ChannelBindingService.class);

    private final ChannelBindingRepository bindingRepo;
    private final MemberRepository memberRepo;

    public ChannelBindingService(ChannelBindingRepository bindingRepo, MemberRepository memberRepo) {
        this.bindingRepo = bindingRepo;
        this.memberRepo = memberRepo;
    }

    /**
     * 绑定渠道到会员。
     */
    @Transactional
    public MemberChannelBinding bindChannel(String programCode, String memberId, String channel,
                                             BindRequest request) {
        Optional<MemberChannelBinding> existing = bindingRepo
                .findByProgramCodeAndChannelAndChannelUserId(programCode, channel, request.channelUserId());

        if (existing.isEmpty()) {
            MemberChannelBinding binding = MemberChannelBinding.builder()
                    .id(UUID.randomUUID().toString())
                    .programCode(programCode)
                    .memberId(memberId)
                    .channel(channel)
                    .channelUserId(request.channelUserId())
                    .channelUnionId(request.channelUnionId())
                    .channelNickname(request.nickname())
                    .channelAvatar(request.avatar())
                    .channelMobileEncrypted(request.encryptedMobile())
                    .channelMobilePlain(request.plainMobile())
                    .encryptType(request.encryptType())
                    .authorizedAt(LocalDateTime.now())
                    .status("ACTIVE")
                    .build();
            log.info("[ChannelBinding] 新建绑定: member={}, channel={}, userId={}", memberId, channel, request.channelUserId());
            return bindingRepo.save(binding);
        }

        MemberChannelBinding b = existing.get();
        if ("INACTIVE".equals(b.getStatus())) {
            b.setStatus("ACTIVE");
            b.setMemberId(memberId);
            b.setChannelNickname(request.nickname());
            b.setChannelAvatar(request.avatar());
            b.setAuthorizedAt(LocalDateTime.now());
            log.info("[ChannelBinding] 重新激活绑定: member={}, channel={}", memberId, channel);
        } else {
            b.setChannelNickname(request.nickname());
            b.setChannelAvatar(request.avatar());
            b.setChannelMobileEncrypted(request.encryptedMobile());
            b.setUpdatedAt(LocalDateTime.now());
        }
        return bindingRepo.save(b);
    }

    /**
     * 解绑渠道。
     */
    @Transactional
    public void unbindChannel(String programCode, String channel, String channelUserId, String reason) {
        bindingRepo.findByProgramCodeAndChannelAndChannelUserId(programCode, channel, channelUserId)
                .ifPresent(b -> {
                    b.setStatus("INACTIVE");
                    b.setUnbindAt(LocalDateTime.now());
                    b.setUnbindReason(reason);
                    bindingRepo.save(b);
                    log.info("[ChannelBinding] 解绑: channel={}, userId={}, reason={}", channel, channelUserId, reason);
                });
    }

    /**
     * 获取会员的所有渠道绑定。
     */
    @Transactional(readOnly = true)
    public List<MemberChannelBinding> getMemberBindings(String programCode, String memberId) {
        return bindingRepo.findAll().stream()
                .filter(b -> programCode.equals(b.getProgramCode()) && memberId.equals(b.getMemberId()))
                .toList();
    }

    // ===== DTO =====
    public record BindRequest(String channelUserId, String channelUnionId, String nickname,
                               String avatar, String encryptedMobile, String plainMobile,
                               String encryptType, String type) {}
}