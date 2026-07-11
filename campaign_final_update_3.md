## 缺失项 1（P0）：用户偏好与退订管理（Consent & Preference Management）详细设计
> **优先级**：P0（必须项）\
> **原因**：GDPR、CASL、CAN-SPAM 等法规要求，无此功能无法合规上线。\
> **对应章节**：第13章（Content & Compliance Governance）扩展\
> **影响范围**：所有 Channel Worker、Loyalty 会员数据同步、前端偏好中心
***
## 一、设计目标
1. **全局退订（Global Unsubscribe）**：用户一键退订所有营销通讯。
2. **渠道偏好（Channel Opt-in）**：用户分别控制 Email/SMS/Push 的接收意愿。
3. **品类偏好（Category Preference）**：用户选择感兴趣的品类，屏蔽不感兴趣的品类。
4. **静默时段（Quiet Hours）**：用户在特定时间段不接收营销消息。
5. **合规审计**：完整记录用户每一次偏好变更，满足监管要求。
6. **Worker 强制拦截**：所有发送动作执行前，必须检查偏好设置。
***
## 二、数据模型设计
### 2.1 用户偏好主表（campaign\_user\_consent）
```sql
-- ============================================================
-- 用户偏好与授权管理表（核心）
-- ============================================================
CREATE TABLE IF NOT EXISTS campaign_user_consent (
    member_id VARCHAR(64) PRIMARY KEY,
    program_code VARCHAR(32) NOT NULL,
    -- ===== 1. 全局退订 =====
    global_unsubscribe BOOLEAN DEFAULT FALSE,
    unsubscribe_reason VARCHAR(64),                -- SPAM / NOT_INTERESTED / TOO_FREQUENT / OTHER
    unsubscribe_channel VARCHAR(32),               -- 从哪个渠道退订的（EMAIL / SMS / PUSH / WEB）
    unsubscribe_at TIMESTAMPTZ,
    -- ===== 2. 渠道偏好（独立控制） =====
    email_opt_in BOOLEAN DEFAULT TRUE,
    sms_opt_in BOOLEAN DEFAULT TRUE,
    push_opt_in BOOLEAN DEFAULT TRUE,
    -- 渠道级别的退订时间记录
    email_opt_out_at TIMESTAMPTZ,
    sms_opt_out_at TIMESTAMPTZ,
    push_opt_out_at TIMESTAMPTZ,
    -- ===== 3. 品类偏好（灵活 JSON） =====
    -- 结构：{"included": ["服装", "美妆"], "excluded": ["3C", "家电"]}
    category_preferences JSONB DEFAULT '{"included": [], "excluded": []}',
    -- 品类偏好更新时间
    category_preferences_updated_at TIMESTAMPTZ,
    -- ===== 4. 静默时段 =====
    quiet_hours_enabled BOOLEAN DEFAULT FALSE,
    quiet_hours_start TIME,                        -- 如 '22:00'
    quiet_hours_end TIME,                          -- 如 '08:00'
    timezone VARCHAR(64) DEFAULT 'Asia/Shanghai',
    -- ===== 5. 偏好来源与元数据 =====
    preference_source VARCHAR(32),                 -- WEB_UI / EMAIL_LINK / SMS_REPLY / API / DEFAULT
    last_updated_by VARCHAR(64),                   -- 操作人（用户ID 或 SYSTEM）
    last_updated_at TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW()
);
-- 索引
CREATE INDEX idx_cuc_program ON campaign_user_consent(program_code);
CREATE INDEX idx_cuc_global ON campaign_user_consent(global_unsubscribe) WHERE global_unsubscribe = TRUE;
CREATE INDEX idx_cuc_email ON campaign_user_consent(email_opt_in) WHERE email_opt_in = FALSE;
CREATE INDEX idx_cuc_sms ON campaign_user_consent(sms_opt_in) WHERE sms_opt_in = FALSE;
```
### 2.2 偏好变更日志表（campaign\_consent\_change\_log）
```sql
-- ============================================================
-- 偏好变更审计日志（满足 GDPR 审计要求）
-- ============================================================
CREATE TABLE IF NOT EXISTS campaign_consent_change_log (
    id BIGSERIAL PRIMARY KEY,
    member_id VARCHAR(64) NOT NULL,
    program_code VARCHAR(32) NOT NULL,
    -- 变更内容
    field_changed VARCHAR(64),                     -- global_unsubscribe / email_opt_in / category_preferences
    old_value TEXT,
    new_value TEXT,
    -- 来源
    source VARCHAR(32),                            -- WEB_UI / EMAIL_LINK / SMS_REPLY / API / SYSTEM
    source_detail TEXT,                            -- 如："点击邮件中的退订链接，IP: 192.168.1.1"
    ip_address INET,
    user_agent TEXT,
    -- 操作人
    operated_by VARCHAR(64),                       -- 用户ID 或 SYSTEM
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_cccl_member ON campaign_consent_change_log(member_id);
CREATE INDEX idx_cccl_created ON campaign_consent_change_log(created_at DESC);
```
### 2.3 GDPR 数据删除请求表（campaign\_gdpr\_request）
```sql
-- ============================================================
-- GDPR 数据删除请求
-- ============================================================
CREATE TABLE IF NOT EXISTS campaign_gdpr_request (
    id VARCHAR(64) PRIMARY KEY,
    member_id VARCHAR(64) NOT NULL,
    program_code VARCHAR(32) NOT NULL,
    request_type VARCHAR(32),                      -- DELETE / ANONYMIZE / EXPORT
    request_source VARCHAR(32),                    -- USER / ADMIN / API
    request_reason TEXT,
    request_time TIMESTAMPTZ DEFAULT NOW(),
    status VARCHAR(32) DEFAULT 'PENDING',          -- PENDING / PROCESSING / COMPLETED / REJECTED
    processed_by VARCHAR(64),
    processed_at TIMESTAMPTZ,
    completion_summary TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_cgr_member ON campaign_gdpr_request(member_id);
CREATE INDEX idx_cgr_status ON campaign_gdpr_request(status);
```
***
## 三、后端 Service 设计
### 3.1 偏好管理核心服务（ConsentService）
```java
package com.loyalty.platform.campaign.consent;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.time.Instant;
import java.time.LocalTime;
@Slf4j
@Service
@RequiredArgsConstructor
public class ConsentService {
    private final UserConsentRepository consentRepository;
    private final ConsentChangeLogRepository changeLogRepository;
    private final GDPRErasureRepository gdprRepository;
    // ===== 核心检查方法（Worker 调用） =====
    /**
     * 检查是否可以发送（最核心的拦截方法）
     * 所有 Channel Worker 在执行前必须调用此方法
     */
    public SendCheckResult canSend(String memberId, String channel, String category) {
        // 1. 获取用户偏好（优先从 Redis 缓存读取）
        UserConsent consent = getConsentWithCache(memberId);
        if (consent == null) {
            // 没有偏好记录 → 默认允许（但要记录）
            return SendCheckResult.allow("DEFAULT_ALLOWED");
        }
        // 2. 检查全局退订（最高优先级）
        if (consent.isGlobalUnsubscribe()) {
            return SendCheckResult.block("GLOBAL_UNSUBSCRIBED", 
                "User has globally unsubscribed at " + consent.getUnsubscribeAt());
        }
        // 3. 检查渠道 Opt-in
        boolean channelOptIn = checkChannelOptIn(consent, channel);
        if (!channelOptIn) {
            return SendCheckResult.block("CHANNEL_OPT_OUT", 
                "User has opted out of channel: " + channel);
        }
        // 4. 检查品类偏好
        boolean categoryAllowed = checkCategoryPreference(consent, category);
        if (!categoryAllowed) {
            return SendCheckResult.block("CATEGORY_OPT_OUT", 
                "User has opted out of category: " + category);
        }
        // 5. 检查静默时段
        if (consent.isQuietHoursEnabled()) {
            boolean inQuietHours = checkQuietHours(consent);
            if (inQuietHours) {
                return SendCheckResult.block("QUIET_HOURS", 
                    "User is in quiet hours: " + consent.getQuietHoursStart() + 
                    " ~ " + consent.getQuietHoursEnd());
            }
        }
        return SendCheckResult.allow("ALL_CHECKS_PASSED");
    }
    /**
     * 批量检查（用于大批量发送前的预过滤）
     */
    public Map<String, SendCheckResult> batchCanSend(List<String> memberIds, 
                                                      String channel, 
                                                      String category) {
        Map<String, SendCheckResult> results = new HashMap<>();
        for (String memberId : memberIds) {
            results.put(memberId, canSend(memberId, channel, category));
        }
        return results;
    }
    // ===== 更新偏好（从 UI / 退订链接 / API 调用） =====
    @Transactional
    public UserConsent updateGlobalUnsubscribe(String memberId, String reason, 
                                               String source, String sourceDetail) {
        UserConsent consent = getOrCreateConsent(memberId);
        
        String oldValue = String.valueOf(consent.isGlobalUnsubscribe());
        consent.setGlobalUnsubscribe(true);
        consent.setUnsubscribeReason(reason);
        consent.setUnsubscribeAt(Instant.now());
        consent.setLastUpdatedAt(Instant.now());
        consent = consentRepository.save(consent);
        // 记录审计日志
        logChange(memberId, "global_unsubscribe", oldValue, "true", source, sourceDetail);
        // 清除 Redis 缓存
        evictCache(memberId);
        log.info("User unsubscribed globally: memberId={}, reason={}", memberId, reason);
        return consent;
    }
    @Transactional
    public UserConsent updateChannelOptIn(String memberId, String channel, boolean optIn, 
                                          String source) {
        UserConsent consent = getOrCreateConsent(memberId);
        String oldValue;
        String newValue = String.valueOf(optIn);
        switch (channel.toUpperCase()) {
            case "EMAIL":
                oldValue = String.valueOf(consent.isEmailOptIn());
                consent.setEmailOptIn(optIn);
                if (!optIn) consent.setEmailOptOutAt(Instant.now());
                break;
            case "SMS":
                oldValue = String.valueOf(consent.isSmsOptIn());
                consent.setSmsOptIn(optIn);
                if (!optIn) consent.setSmsOptOutAt(Instant.now());
                break;
            case "PUSH":
                oldValue = String.valueOf(consent.isPushOptIn());
                consent.setPushOptIn(optIn);
                if (!optIn) consent.setPushOptOutAt(Instant.now());
                break;
            default:
                throw new IllegalArgumentException("Unknown channel: " + channel);
        }
        consent.setLastUpdatedAt(Instant.now());
        consent = consentRepository.save(consent);
        logChange(memberId, channel + "_opt_in", oldValue, newValue, source, null);
        evictCache(memberId);
        log.info("User channel preference updated: memberId={}, channel={}, optIn={}", 
                 memberId, channel, optIn);
        return consent;
    }
    @Transactional
    public UserConsent updateCategoryPreference(String memberId, List<String> included, 
                                                 List<String> excluded, String source) {
        UserConsent consent = getOrCreateConsent(memberId);
        Map<String, Object> oldPrefs = consent.getCategoryPreferences();
        Map<String, Object> newPrefs = new HashMap<>();
        newPrefs.put("included", included != null ? included : Collections.emptyList());
        newPrefs.put("excluded", excluded != null ? excluded : Collections.emptyList());
        consent.setCategoryPreferences(newPrefs);
        consent.setCategoryPreferencesUpdatedAt(Instant.now());
        consent.setLastUpdatedAt(Instant.now());
        consent = consentRepository.save(consent);
        logChange(memberId, "category_preferences", 
                  JsonUtil.toJson(oldPrefs), JsonUtil.toJson(newPrefs), source, null);
        evictCache(memberId);
        log.info("User category preference updated: memberId={}", memberId);
        return consent;
    }
    // ===== GDPR 数据删除 =====
    @Transactional
    public void requestDataDeletion(String memberId, String reason) {
        // 1. 记录请求
        GDPRRequest request = GDPRRequest.builder()
                .id(UUID.randomUUID().toString())
                .memberId(memberId)
                .requestType("DELETE")
                .requestReason(reason)
                .status("PENDING")
                .requestTime(Instant.now())
                .build();
        gdprRepository.save(request);
        // 2. 执行删除（异步，但这里简化同步执行）
        processDataDeletion(memberId);
        log.warn("GDPR deletion processed: memberId={}", memberId);
    }
    private void processDataDeletion(String memberId) {
        // 1. 删除偏好数据
        consentRepository.deleteById(memberId);
        // 2. 删除触发日志（保留脱敏后的审计记录）
        // 实际场景：需要匿名化或删除所有关联数据
        // 3. 调用 Loyalty 核心服务删除会员数据（如果有接口）
        // memberService.anonymizeMember(memberId);
        log.info("GDPR data deleted for member: {}", memberId);
    }
    // ===== 工具方法 =====
    private UserConsent getOrCreateConsent(String memberId) {
        return consentRepository.findById(memberId)
                .orElseGet(() -> {
                    UserConsent newConsent = UserConsent.builder()
                            .memberId(memberId)
                            .programCode(getProgramCode(memberId))
                            .globalUnsubscribe(false)
                            .emailOptIn(true)
                            .smsOptIn(true)
                            .pushOptIn(true)
                            .quietHoursEnabled(false)
                            .categoryPreferences(Map.of("included", List.of(), "excluded", List.of()))
                            .build();
                    return consentRepository.save(newConsent);
                });
    }
    private UserConsent getConsentWithCache(String memberId) {
        // 1. 查 Redis 缓存
        String cacheKey = "consent:" + memberId;
        UserConsent cached = (UserConsent) redisTemplate.opsForValue().get(cacheKey);
        if (cached != null) {
            return cached;
        }
        // 2. 查数据库
        UserConsent consent = consentRepository.findById(memberId).orElse(null);
        if (consent != null) {
            redisTemplate.opsForValue().set(cacheKey, consent, Duration.ofMinutes(5));
        }
        return consent;
    }
    private void evictCache(String memberId) {
        redisTemplate.delete("consent:" + memberId);
    }
    private boolean checkChannelOptIn(UserConsent consent, String channel) {
        switch (channel.toUpperCase()) {
            case "EMAIL": return consent.isEmailOptIn();
            case "SMS": return consent.isSmsOptIn();
            case "PUSH": return consent.isPushOptIn();
            default: return true;
        }
    }
    private boolean checkCategoryPreference(UserConsent consent, String category) {
        if (category == null || category.isEmpty()) {
            return true; // 没有指定品类，默认允许
        }
        Map<String, Object> prefs = consent.getCategoryPreferences();
        if (prefs == null) return true;
        List<String> excluded = (List<String>) prefs.getOrDefault("excluded", Collections.emptyList());
        if (excluded.contains(category)) {
            return false;
        }
        List<String> included = (List<String>) prefs.getOrDefault("included", Collections.emptyList());
        if (included.isEmpty()) {
            return true; // 没有设置 include 列表，默认全部允许
        }
        return included.contains(category);
    }
    private boolean checkQuietHours(UserConsent consent) {
        if (!consent.isQuietHoursEnabled()) return false;
        LocalTime now = LocalTime.now(ZoneId.of(consent.getTimezone()));
        LocalTime start = consent.getQuietHoursStart();
        LocalTime end = consent.getQuietHoursEnd();
        if (start.isBefore(end)) {
            return now.isAfter(start) && now.isBefore(end);
        } else {
            // 跨午夜（如 22:00 ~ 08:00）
            return now.isAfter(start) || now.isBefore(end);
        }
    }
    private void logChange(String memberId, String field, String oldVal, 
                           String newVal, String source, String detail) {
        ConsentChangeLog log = ConsentChangeLog.builder()
                .memberId(memberId)
                .fieldChanged(field)
                .oldValue(oldVal)
                .newValue(newVal)
                .source(source)
                .sourceDetail(detail)
                .ipAddress(WebUtils.getClientIp())
                .userAgent(WebUtils.getUserAgent())
                .operatedBy(SecurityContext.getCurrentUserId())
                .createdAt(Instant.now())
                .build();
        changeLogRepository.save(log);
    }
}
```
### 3.2 Worker 防护拦截器（集成到所有 Channel Worker）
```java
package com.loyalty.platform.campaign.execution.worker.guard;
import com.loyalty.platform.campaign.consent.ConsentService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.aspectj.lang.ProceedingJoinPoint;
import org.aspectj.lang.annotation.Around;
import org.aspectj.lang.annotation.Aspect;
import org.springframework.stereotype.Component;
/**
 * 统一拦截器：所有 Channel Worker 自动执行偏好检查
 */
@Slf4j
@Aspect
@Component
@RequiredArgsConstructor
public class ConsentGuardAspect {
    private final ConsentService consentService;
    @Around("execution(* com.loyalty.platform.campaign.execution.worker.*Worker.doExecute(..))")
    public Object checkConsent(ProceedingJoinPoint joinPoint) throws Throwable {
        // 1. 提取 memberIds 和 channel
        Object[] args = joinPoint.getArgs();
        Map<String, Object> variables = (Map<String, Object>) args[0];
        List<String> memberIds = getMemberIds(variables);
        String channel = getChannel(variables);
        String category = getCategory(variables);
        if (memberIds == null || memberIds.isEmpty()) {
            return joinPoint.proceed();
        }
        // 2. 批量检查偏好
        Map<String, SendCheckResult> results = consentService.batchCanSend(memberIds, channel, category);
        // 3. 过滤出可发送的用户
        List<String> allowedMemberIds = new ArrayList<>();
        List<Map<String, Object>> blockedUsers = new ArrayList<>();
        for (String memberId : memberIds) {
            SendCheckResult result = results.get(memberId);
            if (result.isAllowed()) {
                allowedMemberIds.add(memberId);
            } else {
                Map<String, Object> blockInfo = new HashMap<>();
                blockInfo.put("memberId", memberId);
                blockInfo.put("reason", result.getBlockReason());
                blockInfo.put("code", result.getBlockCode());
                blockedUsers.add(blockInfo);
                log.debug("User blocked by consent: memberId={}, reason={}", 
                          memberId, result.getBlockReason());
            }
        }
        // 4. 更新变量（只对允许的用户执行）
        variables.put("memberIds", allowedMemberIds);
        variables.put("blockedUsers", blockedUsers);
        variables.put("blockedCount", blockedUsers.size());
        // 5. 如果全部被拦截，跳过执行
        if (allowedMemberIds.isEmpty()) {
            log.info("All users blocked by consent, skipping worker execution");
            Map<String, Object> result = new HashMap<>();
            result.put("status", "SKIPPED");
            result.put("reason", "ALL_USERS_BLOCKED_BY_CONSENT");
            result.put("blockedCount", blockedUsers.size());
            return result;
        }
        // 6. 执行 Worker
        return joinPoint.proceed();
    }
}
```
### 3.3 退订链接处理 Controller（供邮件中的链接调用）
```java
@RestController
@RequestMapping("/api/campaign/consent")
@RequiredArgsConstructor
public class ConsentController {
    private final ConsentService consentService;
    /**
     * 处理邮件中的退订链接
     * GET /api/campaign/consent/unsubscribe?token={token}
     */
    @GetMapping("/unsubscribe")
    public ResponseEntity<Void> handleUnsubscribe(@RequestParam String token) {
        // 1. 解析 Token（包含 memberId + 渠道 + 签名）
        UnsubscribeToken parsed = parseToken(token);
        if (parsed == null) {
            return ResponseEntity.badRequest().build();
        }
        // 2. 如果是全局退订
        if ("GLOBAL".equals(parsed.getType())) {
            consentService.updateGlobalUnsubscribe(
                parsed.getMemberId(),
                "CLICKED_UNSUBSCRIBE_LINK",
                "EMAIL_LINK",
                "User clicked unsubscribe link in email"
            );
        } else {
            // 渠道级别退订
            consentService.updateChannelOptIn(
                parsed.getMemberId(),
                parsed.getChannel(),
                false,
                "EMAIL_LINK"
            );
        }
        // 3. 返回退订成功页面
        return ResponseEntity.ok().build();
    }
    /**
     * 用户偏好管理 API（前端调用）
     */
    @GetMapping("/{memberId}")
    public ApiResponse<UserConsent> getPreference(@PathVariable String memberId) {
        return ApiResponse.success(consentService.getConsent(memberId));
    }
    @PutMapping("/{memberId}")
    public ApiResponse<UserConsent> updatePreference(@PathVariable String memberId,
                                                     @RequestBody UpdatePreferenceRequest request) {
        // 更新渠道偏好
        if (request.getChannelOptIns() != null) {
            for (Map.Entry<String, Boolean> entry : request.getChannelOptIns().entrySet()) {
                consentService.updateChannelOptIn(memberId, entry.getKey(), entry.getValue(), "WEB_UI");
            }
        }
        // 更新品类偏好
        if (request.getCategoryPreferences() != null) {
            consentService.updateCategoryPreference(
                memberId,
                request.getCategoryPreferences().getIncluded(),
                request.getCategoryPreferences().getExcluded(),
                "WEB_UI"
            );
        }
        // 更新静默时段
        if (request.getQuietHours() != null) {
            // 更新静默时段
        }
        return ApiResponse.success(consentService.getConsent(memberId));
    }
}
```
***
## 四、前端界面设计
### 4.1 管理后台 - 用户偏好详情页
```text
┌─ 用户偏好管理 ──────────────────────────────────────────────────────────────┐
│  会员ID: M_12345  |  姓名: 张三  |  Program: BRAND_A                       │
├──────────────────────────────────────────────────────────────────────────────┤
│  ┌─ 全局授权状态 ──────────────────────────────────────────────────────────┐ │
│  │  状态: ● 已授权 (可接收营销消息)                                       │ │
│  │  [一键全局退订]  ⚠️ 此操作将阻止所有渠道的营销消息                      │ │
│  └─────────────────────────────────────────────────────────────────────────┘ │
│                                                                              │
│  ┌─ 渠道偏好 ──────────────────────────────────────────────────────────────┐ │
│  │  邮箱 (Email)    [✅ 已订阅]   [取消订阅]                               │ │
│  │  短信 (SMS)      [✅ 已订阅]   [取消订阅]                               │ │
│  │  推送 (Push)     [❌ 已退订]   [重新订阅]                               │ │
│  └─────────────────────────────────────────────────────────────────────────┘ │
│                                                                              │
│  ┌─ 品类偏好 ──────────────────────────────────────────────────────────────┐ │
│  │  [x] 服装     [x] 美妆     [ ] 3C        [ ] 家电                     │ │
│  │  [x] 食品     [ ] 母婴     [x] 运动户外   [ ] 图书                    │ │
│  │  说明：取消勾选的品类将不会收到相关营销消息                              │ │
│  └─────────────────────────────────────────────────────────────────────────┘ │
│                                                                              │
│  ┌─ 静默时段 ──────────────────────────────────────────────────────────────┐ │
│  │  [x] 启用静默时段  22:00 ~ 08:00  时区: [Asia/Shanghai ▼]              │ │
│  │  说明：静默时段内不会发送任何营销消息                                    │ │
│  └─────────────────────────────────────────────────────────────────────────┘ │
│                                                                              │
│  ┌─ 最近变更记录 ─────────────────────────────────────────────────────────┐ │
│  │  时间          │ 字段              │ 操作    │ 来源                   │ │
│  │  2026-06-28    │ email_opt_in      │ 退订    │ EMAIL_LINK             │ │
│  │  2026-06-27    │ category_prefs    │ 更新    │ WEB_UI                 │ │
│  └─────────────────────────────────────────────────────────────────────────┘ │
│                                                                              │
│  [💾 保存偏好]  [📋 导出偏好报告]  [🗑️ GDPR 删除请求]                      │
└──────────────────────────────────────────────────────────────────────────────┘
```
### 4.2 用户端 - 偏好中心（营销邮件中的链接跳转页）
```text
┌─ 我的营销偏好 ──────────────────────────────────────────────────────────────┐
│  📧 管理您的营销订阅                                                         │
│  您当前订阅了 BRAND_A 的营销消息，您可以随时调整以下偏好：                   │
├──────────────────────────────────────────────────────────────────────────────┤
│  ┌─ 接收渠道 ──────────────────────────────────────────────────────────────┐ │
│  │  [✅] 邮件   [✅] 短信   [ ] 推送                                      │ │
│  └─────────────────────────────────────────────────────────────────────────┘ │
│                                                                              │
│  ┌─ 感兴趣的内容 ──────────────────────────────────────────────────────────┐ │
│  │  [x] 服装     [x] 美妆     [ ] 3C        [ ] 家电                     │ │
│  │  [x] 食品     [ ] 母婴     [x] 运动户外                                │ │
│  └─────────────────────────────────────────────────────────────────────────┘ │
│                                                                              │
│  ┌─ 消息频率 ──────────────────────────────────────────────────────────────┐ │
│  │  [ ] 允许每周接收促销消息                                               │ │
│  │  [x] 仅接收重要通知（订单更新、会员权益变更）                           │ │
│  └─────────────────────────────────────────────────────────────────────────┘ │
│                                                                              │
│  ┌─ 全局退订 ──────────────────────────────────────────────────────────────┐ │
│  │  [不再接收任何营销消息]                                                 │ │
│  │  ⚠️ 此操作将取消所有渠道的订阅                                          │ │
│  └─────────────────────────────────────────────────────────────────────────┘ │
│                                                                              │
│  [保存偏好]                                                                  │
│  🔒 您的数据安全受 GDPR 保护，我们不会泄露您的偏好信息                       │
└──────────────────────────────────────────────────────────────────────────────┘
```
***
## 五、API 设计
### 5.1 检查是否可以发送（内部服务调用）
**Request:**
```json
GET /internal/consent/check?memberId=M_12345&channel=EMAIL&category=服装
```
**Response:**
```json
{
    "allowed": true,
    "reason": "ALL_CHECKS_PASSED"
}
```
### 5.2 更新偏好（前端调用）
**Request:**
```json
PUT /api/campaign/consent/M_12345
{
    "channelOptIns": {
        "EMAIL": true,
        "SMS": false,
        "PUSH": true
    },
    "categoryPreferences": {
        "included": ["服装", "美妆"],
        "excluded": ["3C"]
    },
    "quietHours": {
        "enabled": true,
        "start": "22:00",
        "end": "08:00",
        "timezone": "Asia/Shanghai"
    }
}
```
**Response:**
```json
{
    "code": 0,
    "data": {
        "memberId": "M_12345",
        "globalUnsubscribe": false,
        "emailOptIn": true,
        "smsOptIn": false,
        "pushOptIn": true,
        "categoryPreferences": {
            "included": ["服装", "美妆"],
            "excluded": ["3C"]
        },
        "quietHoursEnabled": true,
        "quietHoursStart": "22:00",
        "quietHoursEnd": "08:00",
        "timezone": "Asia/Shanghai",
        "lastUpdatedAt": "2026-06-28T10:00:00Z"
    }
}
```
### 5.3 GDPR 删除请求
**Request:**
```json
POST /api/campaign/consent/gdpr/delete
{
    "memberId": "M_12345",
    "reason": "用户通过客服渠道申请删除所有数据"
}
```
**Response:**
```json
{
    "code": 0,
    "data": {
        "requestId": "gdpr_001",
        "status": "PROCESSING",
        "message": "Data deletion request accepted, processing may take up to 30 days"
    }
}
```
***
## 六、定时清理任务
```java
@Component
@Slf4j
public class ConsentCleanupTask {
    @Autowired
    private ConsentChangeLogRepository changeLogRepository;
    /**
     * 定期清理超过 2 年的审计日志（归档到冷存储）
     */
    @Scheduled(cron = "0 0 3 * * ?")  // 每天凌晨3点执行
    @Transactional
    public void archiveOldLogs() {
        Instant threshold = Instant.now().minus(730, ChronoUnit.DAYS);
        int deleted = changeLogRepository.deleteByCreatedAtBefore(threshold);
        log.info("Archived {} old consent change logs", deleted);
    }
}
```
***
## 七、与现有模块集成点
| 集成点           | 现有模块                       | 集成方式                           |
| ------------- | -------------------------- | ------------------------------ |
| **Worker 拦截** | 第5章（所有 Channel Worker）     | 添加 `ConsentGuardAspect` AOP 拦截 |
| **偏好数据来源**    | Loyalty `member` 表         | 定时同步或实时查询                      |
| **退订事件**      | 第6章（Event System）          | 退订时发布 `CONSENT_CHANGED` 事件     |
| **前端页面**      | 第7章（前端）                    | 新增偏好管理页面 + 用户端偏好中心             |
| **合规审计**      | 第13章（Content & Compliance） | 集成到现有审批/合规模块                   |
***
## 八、实施检查清单
* 执行 DDL：创建 `campaign_user_consent` 表
* 执行 DDL：创建 `campaign_consent_change_log` 表
* 执行 DDL：创建 `campaign_gdpr_request` 表
* 实现 `ConsentService` 核心服务
* 实现 `ConsentGuardAspect`（AOP 拦截所有 Channel Worker）
* 实现退订链接处理 Controller
* 实现前端管理后台偏好页面
* 实现用户端偏好中心页面（可选）
* 实现 GDPR 删除流程
* 集成 Redis 缓存（偏好数据缓存）
* 编写单元测试（`canSend` 覆盖所有场景）
* 编写集成测试（AOP 拦截 + 退订流程）
***
## 九、总结
本设计为 Campaign Tools 补齐了**法律合规层面的最后一块拼图**：
| 能力            | 实现方式                                          |
| ------------- | --------------------------------------------- |
| **全局退订**      | `global_unsubscribe` 字段，最高优先级拦截               |
| **渠道偏好**      | `email_opt_in` / `sms_opt_in` / `push_opt_in` |
| **品类偏好**      | `category_preferences` JSONB，灵活扩展             |
| **静默时段**      | `quiet_hours_start/end` + 时区支持                |
| **合规审计**      | `campaign_consent_change_log` 完整记录            |
| **GDPR 删除**   | `campaign_gdpr_request` + 删除流程                |
| **Worker 拦截** | AOP 统一拦截，对现有业务代码零侵入                           |
**影响范围**：所有 Channel Worker 会自动获得偏好检查能力，无需逐个修改 Worker 代码。退订链接可以直接嵌入邮件模板，用户点击后自动更新偏好并阻断后续营销。
