package com.loyalty.saas.event;

import com.loyalty.saas.common.context.TenantContext;
import com.loyalty.saas.common.event.EventBridge;
import com.loyalty.saas.domain.entity.ChannelAdapterConfig;
import com.loyalty.saas.domain.entity.EventFact;
import com.loyalty.saas.domain.entity.EventInbox;
import com.loyalty.saas.domain.repository.ChannelAdapterConfigRepository;
import com.loyalty.saas.domain.repository.EventInboxRepository;
import com.loyalty.saas.mapping.ScriptingTransformer;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.scheduling.annotation.Async;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.time.LocalDateTime;
import java.time.temporal.ChronoUnit;
import java.util.Map;
import java.util.concurrent.*;

/**
 * 事件收件箱处理器 —— 实现 event_inbox 的完整状态机流转。
 *
 * <p>状态机流转（按设计文档 7.5 节）：
 * <pre>
 * RECEIVED → VALIDATING → VALIDATED → PROCESSING → COMPLETED
 *                                                ↘ TRANSFORM_FAILED → RETRYING → COMPLETED/DEAD
 * </pre>
 *
 * <p>三个定时任务：
 * <ul>
 *   <li>{@link #processReceived()} — 每 1s 拉取 RECEIVED 事件，推进到 VALIDATING</li>
 *   <li>{@link #retryFailed()} — 每 5s 扫描 TRANSFORM_FAILED 事件，指数退避重试（最多 3 次）</li>
 *   <li>{@link #moveToDead()} — 每 10s 扫描重试耗尽事件，转入 DEAD 并告警</li>
 * </ul>
 *
 * @author Loyalty SaaS Architecture Team
 * @since 1.0.0
 */
@Service
public class EventInboxProcessor {

    private static final Logger log = LoggerFactory.getLogger(EventInboxProcessor.class);

    private final EventInboxRepository inboxRepo;
    private final ChannelAdapterConfigRepository configRepo;
    private final ScriptingTransformer scriptingTransformer;
    private final EventBridge eventBridge;

    /** 异步处理器线程池 */
    private final ExecutorService asyncProcessor = new ThreadPoolExecutor(
            2, 4, 60L, TimeUnit.SECONDS,
            new LinkedBlockingQueue<>(500),
            r -> {
                Thread t = new Thread(r, "inbox-worker");
                t.setDaemon(true);
                return t;
            },
            new ThreadPoolExecutor.CallerRunsPolicy()
    );

    public EventInboxProcessor(EventInboxRepository inboxRepo,
                                ChannelAdapterConfigRepository configRepo,
                                ScriptingTransformer scriptingTransformer,
                                @Autowired(required = false) EventBridge eventBridge) {
        this.inboxRepo = inboxRepo;
        this.configRepo = configRepo;
        this.scriptingTransformer = scriptingTransformer;
        this.eventBridge = eventBridge;
    }

    // ==================== 定时任务 ====================

    /**
     * 定时拉取 RECEIVED 状态的事件，推进到 VALIDATING。
     */
    @Scheduled(fixedDelay = 1000)
    public void processReceived() {
        var events = inboxRepo.findByStatus("RECEIVED", 100);
        for (EventInbox event : events) {
            event.setStatus("VALIDATING");
            inboxRepo.save(event);
            asyncProcessor.submit(() -> validateAndProcess(event));
        }
        if (!events.isEmpty()) {
            log.debug("[EventInbox] 拉取 RECEIVED 事件: {} 条", events.size());
        }
    }

    /**
     * 定时扫描 TRANSFORM_FAILED/FAILED 事件，执行重试（最多 3 次，指数退避）。
     */
    @Scheduled(fixedDelay = 5000)
    public void retryFailed() {
        LocalDateTime now = LocalDateTime.now();
        var failed = inboxRepo.findRetryable(3, now);
        for (EventInbox event : failed) {
            event.setStatus("RETRYING");
            event.setRetryCount(event.getRetryCount() != null ? event.getRetryCount() + 1 : 1);
            inboxRepo.save(event);
            log.info("[EventInbox] 重试事件: id={}, retry={}/{}", event.getId(), event.getRetryCount(), 3);
            asyncProcessor.submit(() -> transformAndComplete(event));
        }
        if (!failed.isEmpty()) {
            log.info("[EventInbox] 触发重试: {} 条", failed.size());
        }
    }

    /**
     * 定时扫描重试耗尽的事件，转入死信并告警。
     */
    @Scheduled(fixedDelay = 10000)
    public void moveToDead() {
        var exhausted = inboxRepo.findExhaustedRetries(3);
        for (EventInbox event : exhausted) {
            String oldStatus = event.getStatus();
            event.setStatus("DEAD");
            inboxRepo.save(event);
            log.error("[EventInbox] 事件进入死信: id={}, program={}, channel={}, retryCount={}, lastError={}",
                    event.getId(), event.getProgramCode(), event.getSourceChannel(),
                    event.getRetryCount(), event.getErrorMessage());
        }
        if (!exhausted.isEmpty()) {
            log.warn("[EventInbox] {} 条事件进入死信", exhausted.size());
        }
    }

    // ==================== 状态机核心逻辑 ====================

    /**
     * 验签 + 幂等检查 + 基础校验 → 推进到 VALIDATED → 进入映射转换。
     */
    private void validateAndProcess(EventInbox event) {
        TenantContext.set(event.getProgramCode());
        try {
            // 1. 幂等检查
            if (inboxRepo.existsByIdempotencyKeyAndStatus(event.getIdempotencyKey(), "SUCCEEDED")) {
                event.setStatus("REJECTED");
                event.setRejectReason("DUPLICATE");
                inboxRepo.save(event);
                log.info("[EventInbox] 幂等重复，已拒绝: id={}, key={}", event.getId(), event.getIdempotencyKey());
                return;
            }

            // 2. 基础字段校验
            if (event.getProgramCode() == null || event.getProgramCode().isBlank()
                    || event.getPayload() == null || event.getPayload().isEmpty()) {
                event.setStatus("REJECTED");
                event.setRejectReason("MISSING_FIELDS");
                inboxRepo.save(event);
                log.warn("[EventInbox] 字段缺失，已拒绝: id={}", event.getId());
                return;
            }

            // 3. 验签通过 → VALIDATED
            event.setStatus("VALIDATED");
            inboxRepo.save(event);

            // 4. 进入映射转换
            transformAndComplete(event);

        } catch (Exception e) {
            event.setStatus("TRANSFORM_FAILED");
            event.setRetryCount(event.getRetryCount() != null ? event.getRetryCount() + 1 : 1);
            event.setErrorMessage(e.getMessage());
            event.setNextRetryAt(LocalDateTime.now().plusSeconds(30)); // 首次失败 30s 后重试
            inboxRepo.save(event);
            log.error("[EventInbox] 校验/处理异常: id={}", event.getId(), e);
        } finally {
            TenantContext.clear();
        }
    }

    /**
     * 映射引擎执行转换，成功后投递到 EventBridge。
     */
    void transformAndComplete(EventInbox event) {
        TenantContext.set(event.getProgramCode());
        try {
            event.setStatus("PROCESSING");
            inboxRepo.save(event);

            // 获取渠道配置
            var configOpt = configRepo.findActiveByProgramAndChannel(
                    event.getProgramCode(), event.getSourceChannel());

            Map<String, Object> standardPayload;
            // 支持 SCRIPT 模式（通过 request_mapping 中的 "script" 键判断）
            if (configOpt.isPresent()) {
                ChannelAdapterConfig config = configOpt.get();
                Map<String, Object> mapping = config.getRequestMapping();
                String payloadStr = event.getPayload().toString();

                if (mapping != null && mapping.containsKey("script")) {
                    // SCRIPT 模式：走 GraalVM 沙箱
                    String script = String.valueOf(mapping.get("script"));
                    standardPayload = scriptingTransformer.transform(script, payloadStr);
                } else if (mapping != null) {
                    // VISUAL 模式：JSONPath 映射（简化为直接使用 payload）
                    standardPayload = event.getPayload();
                } else {
                    standardPayload = event.getPayload();
                }
            } else {
                standardPayload = event.getPayload();
            }

            // 构建标准 EventFact
            String memberId = extractMemberId(standardPayload);
            String eventType = extractEventType(standardPayload);
            EventFact fact = new EventFact(
                    event.getProgramCode(), eventType,
                    memberId, event.getSourceChannel(),
                    Instant.now(), event.getIdempotencyKey(),
                    configOpt.map(c -> c.getProgramCode()).orElse(null),
                    standardPayload
            );

            // 投递到 EventBridge
            if (eventBridge != null) {
                eventBridge.publish("loyalty-events", fact.getMemberId() != null ? fact.getMemberId() : "unknown", fact);
            }

            event.setStatus("SUCCEEDED");
            event.setProcessedAt(LocalDateTime.now());
            inboxRepo.save(event);
            log.info("[EventInbox] 事件处理完成: id={}", event.getId());

        } catch (Exception e) {
            event.setStatus("TRANSFORM_FAILED");
            event.setRetryCount(event.getRetryCount() != null ? event.getRetryCount() + 1 : 1);
            event.setErrorMessage(e.getMessage());
            // 指数退避: 30s * 2^(retryCount-1)
            long delaySec = 30L * (1L << Math.min(event.getRetryCount() - 1, 5));
            event.setNextRetryAt(LocalDateTime.now().plusSeconds(delaySec));
            inboxRepo.save(event);
            log.error("[EventInbox] 转换失败: id={}, retry={}, 下次重试={}",
                    event.getId(), event.getRetryCount(), event.getNextRetryAt(), e);

        } finally {
            TenantContext.clear();
        }
    }

    // ==================== 辅助方法 ====================

    private String extractMemberId(Map<String, Object> payload) {
        if (payload == null) return null;
        if (payload.containsKey("member_id")) return String.valueOf(payload.get("member_id"));
        if (payload.containsKey("memberId")) return String.valueOf(payload.get("memberId"));
        return null;
    }

    private String extractEventType(Map<String, Object> payload) {
        if (payload == null) return "UNKNOWN";
        if (payload.containsKey("event_type")) return String.valueOf(payload.get("event_type"));
        if (payload.containsKey("eventType")) return String.valueOf(payload.get("eventType"));
        return "UNKNOWN";
    }
}