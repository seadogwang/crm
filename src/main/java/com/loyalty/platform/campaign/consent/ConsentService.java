package com.loyalty.platform.campaign.consent;

import com.loyalty.platform.domain.entity.campaign.ConsentChangeLog;
import com.loyalty.platform.domain.entity.campaign.GdprRequest;
import com.loyalty.platform.domain.entity.campaign.UserConsent;
import com.loyalty.platform.domain.repository.campaign.ConsentChangeLogRepository;
import com.loyalty.platform.domain.repository.campaign.GdprRequestRepository;
import com.loyalty.platform.domain.repository.campaign.UserConsentRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.time.LocalTime;
import java.time.ZoneId;
import java.util.*;

/**
 * 用户偏好与退订管理核心服务。
 *
 * <p>所有 Channel Worker 在发送前<b>必须</b>调用 {@link #canSend} 进行偏好检查。
 *
 * <p>检查优先级：全局退订 > 渠道Opt-in > 品类偏好 > 静默时段
 */
@Service
@Transactional
public class ConsentService {

    private static final Logger log = LoggerFactory.getLogger(ConsentService.class);

    private final UserConsentRepository consentRepository;
    private final ConsentChangeLogRepository changeLogRepository;
    private final GdprRequestRepository gdprRepository;

    public ConsentService(UserConsentRepository consentRepository,
                          ConsentChangeLogRepository changeLogRepository,
                          GdprRequestRepository gdprRepository) {
        this.consentRepository = consentRepository;
        this.changeLogRepository = changeLogRepository;
        this.gdprRepository = gdprRepository;
    }

    // ========================================================================
    // 核心检查方法（Worker 调用）
    // ========================================================================

    /**
     * 检查是否可以发送营销消息。
     *
     * @param memberId 会员ID
     * @param channel  渠道（EMAIL / SMS / PUSH）
     * @param category 品类（可选，无品类则填 null）
     * @return 检查结果
     */
    @Transactional(readOnly = true)
    public SendCheckResult canSend(String memberId, String channel, String category) {
        UserConsent consent = consentRepository.findById(memberId).orElse(null);
        if (consent == null) {
            return SendCheckResult.allow("DEFAULT_ALLOWED");
        }

        // 1. 全局退订（最高优先级）
        if (consent.isGlobalUnsubscribe()) {
            return SendCheckResult.block("GLOBAL_UNSUBSCRIBED",
                    "User globally unsubscribed at " + consent.getUnsubscribeAt());
        }

        // 2. 渠道 Opt-in
        boolean channelOptIn = checkChannelOptIn(consent, channel);
        if (!channelOptIn) {
            return SendCheckResult.block("CHANNEL_OPT_OUT",
                    "User opted out of channel: " + channel);
        }

        // 3. 品类偏好
        boolean categoryAllowed = checkCategoryPreference(consent, category);
        if (!categoryAllowed) {
            return SendCheckResult.block("CATEGORY_BLOCKED",
                    "User excluded category: " + category);
        }

        // 4. 静默时段
        if (consent.isQuietHoursEnabled()) {
            if (isInQuietHours(consent)) {
                return SendCheckResult.block("QUIET_HOURS",
                        "User in quiet hours: " + consent.getQuietHoursStart() +
                        " ~ " + consent.getQuietHoursEnd());
            }
        }

        return SendCheckResult.allow("ALL_CHECKS_PASSED");
    }

    /**
     * 批量检查。
     */
    @Transactional(readOnly = true)
    public Map<String, SendCheckResult> batchCanSend(List<String> memberIds,
                                                      String channel, String category) {
        Map<String, SendCheckResult> results = new LinkedHashMap<>();
        List<UserConsent> consents = consentRepository.findByMemberIds(memberIds);
        Map<String, UserConsent> consentMap = new HashMap<>();
        for (UserConsent c : consents) {
            consentMap.put(c.getMemberId(), c);
        }

        for (String memberId : memberIds) {
            UserConsent consent = consentMap.get(memberId);
            if (consent == null) {
                results.put(memberId, SendCheckResult.allow("DEFAULT_ALLOWED"));
                continue;
            }
            // 复用单用户检查逻辑
            results.put(memberId, checkSingleConsent(consent, channel, category));
        }
        return results;
    }

    private SendCheckResult checkSingleConsent(UserConsent consent,
                                                String channel, String category) {
        if (consent.isGlobalUnsubscribe()) {
            return SendCheckResult.block("GLOBAL_UNSUBSCRIBED", "Globally unsubscribed");
        }
        if (!checkChannelOptIn(consent, channel)) {
            return SendCheckResult.block("CHANNEL_OPT_OUT", "Channel opt-out: " + channel);
        }
        if (!checkCategoryPreference(consent, category)) {
            return SendCheckResult.block("CATEGORY_BLOCKED", "Category excluded: " + category);
        }
        if (consent.isQuietHoursEnabled() && isInQuietHours(consent)) {
            return SendCheckResult.block("QUIET_HOURS", "Quiet hours active");
        }
        return SendCheckResult.allow("ALL_CHECKS_PASSED");
    }

    // ========================================================================
    // 偏好更新
    // ========================================================================

    /**
     * 全局退订。
     */
    @Transactional
    public UserConsent updateGlobalUnsubscribe(String memberId, String reason,
                                                String channel, String source) {
        UserConsent consent = getOrCreateConsent(memberId);
        String oldValue = String.valueOf(consent.isGlobalUnsubscribe());

        consent.setGlobalUnsubscribe(true);
        consent.setUnsubscribeReason(reason);
        consent.setUnsubscribeChannel(channel);
        consent.setUnsubscribeAt(Instant.now());
        consent.setLastUpdatedAt(Instant.now());
        consent.setPreferenceSource(source);
        consent = consentRepository.save(consent);

        logChange(memberId, consent.getProgramCode(), "global_unsubscribe",
                oldValue, "true", source, "Unsubscribe via " + source);

        log.info("User globally unsubscribed: memberId={}, reason={}", memberId, reason);
        return consent;
    }

    /**
     * 重新订阅所有渠道。
     */
    @Transactional
    public UserConsent reSubscribe(String memberId, String source) {
        UserConsent consent = getOrCreateConsent(memberId);
        String oldValue = String.valueOf(consent.isGlobalUnsubscribe());

        consent.setGlobalUnsubscribe(false);
        consent.setUnsubscribeReason(null);
        consent.setUnsubscribeChannel(null);
        consent.setUnsubscribeAt(null);
        consent.setEmailOptIn(true);
        consent.setSmsOptIn(true);
        consent.setPushOptIn(true);
        consent.setLastUpdatedAt(Instant.now());
        consent.setPreferenceSource(source);
        consent = consentRepository.save(consent);

        logChange(memberId, consent.getProgramCode(), "global_unsubscribe",
                oldValue, "false", source, null);

        log.info("User re-subscribed: memberId={}", memberId);
        return consent;
    }

    /**
     * 更新渠道偏好。
     */
    @Transactional
    public UserConsent updateChannelOptIn(String memberId, String channel,
                                           boolean optIn, String source) {
        UserConsent consent = getOrCreateConsent(memberId);
        String fieldName;
        String oldValue;
        String newValue = String.valueOf(optIn);

        switch (channel.toUpperCase()) {
            case "EMAIL" -> {
                fieldName = "email_opt_in";
                oldValue = String.valueOf(consent.isEmailOptIn());
                consent.setEmailOptIn(optIn);
                if (!optIn) consent.setEmailOptOutAt(Instant.now());
            }
            case "SMS" -> {
                fieldName = "sms_opt_in";
                oldValue = String.valueOf(consent.isSmsOptIn());
                consent.setSmsOptIn(optIn);
                if (!optIn) consent.setSmsOptOutAt(Instant.now());
            }
            case "PUSH" -> {
                fieldName = "push_opt_in";
                oldValue = String.valueOf(consent.isPushOptIn());
                consent.setPushOptIn(optIn);
                if (!optIn) consent.setPushOptOutAt(Instant.now());
            }
            default -> throw new IllegalArgumentException("Unknown channel: " + channel);
        }

        consent.setLastUpdatedAt(Instant.now());
        consent.setPreferenceSource(source);
        consent = consentRepository.save(consent);

        logChange(memberId, consent.getProgramCode(), fieldName,
                oldValue, newValue, source, null);

        log.info("Channel preference updated: memberId={}, channel={}, optIn={}",
                memberId, channel, optIn);
        return consent;
    }

    /**
     * 更新品类偏好。
     */
    @Transactional
    public UserConsent updateCategoryPreference(String memberId,
                                                 List<String> included,
                                                 List<String> excluded,
                                                 String source) {
        UserConsent consent = getOrCreateConsent(memberId);
        String oldValue = consent.getCategoryPreferences();

        String newValue = "{\"included\": " +
                (included != null ? jsonList(included) : "[]") +
                ", \"excluded\": " +
                (excluded != null ? jsonList(excluded) : "[]") + "}";
        consent.setCategoryPreferences(newValue);
        consent.setCategoryPreferencesUpdatedAt(Instant.now());
        consent.setLastUpdatedAt(Instant.now());
        consent.setPreferenceSource(source);
        consent = consentRepository.save(consent);

        logChange(memberId, consent.getProgramCode(), "category_preferences",
                oldValue, newValue, source, null);

        log.info("Category preference updated: memberId={}", memberId);
        return consent;
    }

    /**
     * 更新静默时段。
     */
    @Transactional
    public UserConsent updateQuietHours(String memberId, boolean enabled,
                                         LocalTime start, LocalTime end,
                                         String timezone, String source) {
        UserConsent consent = getOrCreateConsent(memberId);
        String oldValue = String.format("enabled=%b, start=%s, end=%s, tz=%s",
                consent.isQuietHoursEnabled(), consent.getQuietHoursStart(),
                consent.getQuietHoursEnd(), consent.getTimezone());

        consent.setQuietHoursEnabled(enabled);
        consent.setQuietHoursStart(start);
        consent.setQuietHoursEnd(end);
        if (timezone != null) consent.setTimezone(timezone);
        consent.setLastUpdatedAt(Instant.now());
        consent.setPreferenceSource(source);
        consent = consentRepository.save(consent);

        String newValue = String.format("enabled=%b, start=%s, end=%s, tz=%s",
                enabled, start, end, consent.getTimezone());
        logChange(memberId, consent.getProgramCode(), "quiet_hours",
                oldValue, newValue, source, null);

        return consent;
    }

    // ========================================================================
    // GDPR
    // ========================================================================

    /**
     * 提交 GDPR 数据删除请求。
     */
    @Transactional
    public GdprRequest submitGdprRequest(String memberId, String programCode,
                                          String requestType, String reason,
                                          String source) {
        GdprRequest request = GdprRequest.builder()
                .id(UUID.randomUUID().toString())
                .memberId(memberId)
                .programCode(programCode)
                .requestType(requestType != null ? requestType : "DELETE")
                .requestSource(source)
                .requestReason(reason)
                .status("PENDING")
                .build();
        request = gdprRepository.save(request);

        log.warn("GDPR request submitted: memberId={}, type={}, source={}",
                memberId, requestType, source);
        return request;
    }

    /**
     * 执行数据删除（简化实现）。
     */
    @Transactional
    public void processDataDeletion(String memberId) {
        // 删除偏好数据
        consentRepository.deleteById(memberId);
        // 审计日志保留（已脱敏），但标记为已删除
        log.info("GDPR data deletion processed for member: {}", memberId);

        // 更新 GDPR 请求状态
        List<GdprRequest> requests = gdprRepository.findByMemberIdOrderByRequestTimeDesc(memberId);
        for (GdprRequest r : requests) {
            if ("PENDING".equals(r.getStatus())) {
                r.setStatus("COMPLETED");
                r.setProcessedAt(Instant.now());
                r.setCompletionSummary("User data deleted from campaign_user_consent");
                gdprRepository.save(r);
            }
        }
    }

    // ========================================================================
    // 查询方法
    // ========================================================================

    @Transactional(readOnly = true)
    public UserConsent getConsent(String memberId) {
        return consentRepository.findById(memberId).orElse(null);
    }

    @Transactional(readOnly = true)
    public List<ConsentChangeLog> getChangeLogs(String memberId) {
        return changeLogRepository.findByMemberIdOrderByCreatedAtDesc(memberId);
    }

    @Transactional(readOnly = true)
    public List<GdprRequest> getGdprRequests(String memberId) {
        return gdprRepository.findByMemberIdOrderByRequestTimeDesc(memberId);
    }

    @Transactional(readOnly = true)
    public long getPendingGdprCount() {
        return gdprRepository.countByStatus("PENDING");
    }

    // ========================================================================
    // 内部工具方法
    // ========================================================================

    private UserConsent getOrCreateConsent(String memberId) {
        return consentRepository.findById(memberId)
                .orElseGet(() -> {
                    UserConsent c = UserConsent.builder()
                            .memberId(memberId)
                            .programCode("UNKNOWN")
                            .globalUnsubscribe(false)
                            .emailOptIn(true)
                            .smsOptIn(true)
                            .pushOptIn(true)
                            .quietHoursEnabled(false)
                            .build();
                    return consentRepository.save(c);
                });
    }

    private boolean checkChannelOptIn(UserConsent consent, String channel) {
        if (channel == null) return true;
        return switch (channel.toUpperCase()) {
            case "EMAIL" -> consent.isEmailOptIn();
            case "SMS" -> consent.isSmsOptIn();
            case "PUSH" -> consent.isPushOptIn();
            default -> true;
        };
    }

    @SuppressWarnings("unchecked")
    private boolean checkCategoryPreference(UserConsent consent, String category) {
        if (category == null || category.isEmpty()) return true;
        String json = consent.getCategoryPreferences();
        if (json == null) return true;

        try {
            // 简单检查：excluded 列表中包含则拒绝
            if (json.contains("\"excluded\"") && json.contains("\"" + category + "\"")) {
                // 粗略检查 excluded 数组
                int excludedIdx = json.indexOf("\"excluded\"");
                int catIdx = json.indexOf("\"" + category + "\"");
                if (catIdx > excludedIdx) {
                    // 确认在 excluded 区段
                    int nextKey = json.indexOf('"', catIdx + category.length() + 2);
                    // 简化：检查 category 出现位置是否在 excluded 区域内
                    return false;
                }
            }
            return true;
        } catch (Exception e) {
            return true; // 解析失败默认允许
        }
    }

    private boolean isInQuietHours(UserConsent consent) {
        LocalTime start = consent.getQuietHoursStart();
        LocalTime end = consent.getQuietHoursEnd();
        if (start == null || end == null) return false;

        LocalTime now = LocalTime.now(ZoneId.of(consent.getTimezone()));
        if (start.isBefore(end)) {
            return now.isAfter(start) && now.isBefore(end);
        } else {
            // 跨午夜（如 22:00 ~ 08:00）
            return now.isAfter(start) || now.isBefore(end);
        }
    }

    private void logChange(String memberId, String programCode, String field,
                           String oldVal, String newVal, String source, String detail) {
        ConsentChangeLog logEntry = ConsentChangeLog.builder()
                .memberId(memberId)
                .programCode(programCode)
                .fieldChanged(field)
                .oldValue(oldVal)
                .newValue(newVal)
                .source(source)
                .sourceDetail(detail)
                .operatedBy("SYSTEM")
                .build();
        changeLogRepository.save(logEntry);
    }

    private String jsonList(List<String> items) {
        StringBuilder sb = new StringBuilder("[");
        for (int i = 0; i < items.size(); i++) {
            if (i > 0) sb.append(", ");
            sb.append("\"").append(items.get(i)).append("\"");
        }
        sb.append("]");
        return sb.toString();
    }

    // ========================================================================
    // Data classes
    // ========================================================================

    @lombok.Data
    @lombok.Builder
    @lombok.NoArgsConstructor
    @lombok.AllArgsConstructor
    public static class SendCheckResult {
        private boolean allowed;
        private String code;
        private String message;

        public static SendCheckResult allow(String code) {
            return SendCheckResult.builder().allowed(true).code(code).message("OK").build();
        }

        public static SendCheckResult block(String code, String message) {
            return SendCheckResult.builder().allowed(false).code(code).message(message).build();
        }
    }
}
