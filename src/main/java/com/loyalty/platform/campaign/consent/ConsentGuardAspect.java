package com.loyalty.platform.campaign.consent;

import org.aspectj.lang.ProceedingJoinPoint;
import org.aspectj.lang.annotation.Around;
import org.aspectj.lang.annotation.Aspect;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import java.util.*;

/**
 * 统一拦截器 — 所有 Channel Worker 自动执行偏好检查。
 *
 * <p>AOP 环绕通知拦截 {@code BaseCampaignWorker.handle()}，
 * 在发送前检查用户偏好（全局退订/渠道Opt-in/品类/静默时段）。
 *
 * <p>对现有 Worker 代码<b>零侵入</b>，无需逐个修改 Worker。
 */
@Aspect
@Component
public class ConsentGuardAspect {

    private static final Logger log = LoggerFactory.getLogger(ConsentGuardAspect.class);

    private final ConsentService consentService;

    public ConsentGuardAspect(ConsentService consentService) {
        this.consentService = consentService;
    }

    /**
     * 拦截所有 Channel Worker（发送类）的 handle 方法。
     * 仅拦截 SEND_EMAIL, SEND_SMS, SEND_PUSH worker。
     */
    @Around("execution(* com.loyalty.platform.campaign.execution.worker.SendChannelWorker.handle(..))")
    public Object checkSendConsent(ProceedingJoinPoint joinPoint) throws Throwable {
        return doCheck(joinPoint, "EMAIL"); // SendChannelWorker handles multiple channels
    }

    /**
     * 检查发送类 Worker 调用 — 提取 memberIds、channel、category 并过滤。
     */
    @SuppressWarnings("unchecked")
    private Object doCheck(ProceedingJoinPoint joinPoint, String defaultChannel) throws Throwable {
        Object[] args = joinPoint.getArgs();
        if (args.length == 0 || !(args[0] instanceof Map)) {
            return joinPoint.proceed();
        }

        Map<String, Object> variables = (Map<String, Object>) args[0];

        // 提取 memberIds
        List<String> memberIds = extractMemberIds(variables);
        if (memberIds == null || memberIds.isEmpty()) {
            return joinPoint.proceed();
        }

        // 提取 channel
        String channel = (String) variables.getOrDefault("channel", defaultChannel);

        // 提取 category
        String category = (String) variables.getOrDefault("category", null);

        // 批量检查偏好
        Map<String, ConsentService.SendCheckResult> results =
                consentService.batchCanSend(memberIds, channel, category);

        // 分离允许/阻止的用户
        List<String> allowed = new ArrayList<>();
        List<Map<String, String>> blocked = new ArrayList<>();
        for (String memberId : memberIds) {
            ConsentService.SendCheckResult r = results.get(memberId);
            if (r != null && r.isAllowed()) {
                allowed.add(memberId);
            } else {
                Map<String, String> info = new HashMap<>();
                info.put("memberId", memberId);
                info.put("reason", r != null ? r.getCode() : "NO_CONSENT_RECORD");
                blocked.add(info);
                log.debug("User blocked by consent: memberId={}, reason={}",
                        memberId, r != null ? r.getCode() : "unknown");
            }
        }

        // 更新变量
        variables.put("memberIds", allowed);
        variables.put("blockedUsers", blocked);
        variables.put("blockedCount", blocked.size());
        variables.put("consentFiltered", true);

        // 全部被拦截则跳过
        if (allowed.isEmpty()) {
            log.info("All {} users blocked by consent, skipping worker", memberIds.size());
            Map<String, Object> result = new HashMap<>();
            result.put("status", "SKIPPED");
            result.put("reason", "ALL_USERS_BLOCKED_BY_CONSENT");
            result.put("blockedCount", blocked.size());
            return result;
        }

        // 部分过滤：继续执行
        log.info("Consent filter: {} allowed, {} blocked out of {}",
                allowed.size(), blocked.size(), memberIds.size());

        return joinPoint.proceed();
    }

    @SuppressWarnings("unchecked")
    private List<String> extractMemberIds(Map<String, Object> variables) {
        Object memberIdsObj = variables.get("memberIds");
        if (memberIdsObj instanceof List) {
            return (List<String>) memberIdsObj;
        }
        // 尝试单个 memberId
        Object memberIdObj = variables.get("memberId");
        if (memberIdObj != null) {
            return List.of(memberIdObj.toString());
        }
        return null;
    }
}
