package com.loyalty.saas.spi;

import com.google.common.util.concurrent.ThreadFactoryBuilder;
import com.loyalty.saas.common.context.TenantContext;
import com.loyalty.saas.domain.entity.ChannelAdapterConfig;
import com.loyalty.saas.domain.repository.ChannelAdapterConfigRepository;
import jakarta.annotation.PostConstruct;
import jakarta.annotation.PreDestroy;
import jakarta.servlet.http.HttpServletRequest;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.util.Map;
import java.util.concurrent.*;

/**
 * 统一 SPI 网关控制器。
 *
 * <p>向所有第三方开放平台提供单一的标准化 Webhook 路径：
 * <pre>POST /api/open/spi/{channel}/{programCode}/{action}</pre>
 *
 * <p><b>防雪崩机制</b>：
 * <ul>
 *   <li>异步处理 + 2000ms 超时隔离（CompletableFuture）</li>
 *   <li>超时不返回 HTTP 500，返回 HTTP 200 + 渠道特定错误码</li>
 *   <li>业务异常同样返回 HTTP 200（符合天猫/京东 SPI 规约）</li>
 * </ul>
 *
 * <p><b>请求/响应全量审计</b>：通过 {@link SpiLogService} 记录所有调用。
 *
 * @author Loyalty SaaS Architecture Team
 * @since 1.0.0
 */
@RestController
@RequestMapping("/api/open/spi/{channel}/{programCode}")
public class SpiGatewayController {

    private static final Logger log = LoggerFactory.getLogger(SpiGatewayController.class);

    /** SPI 处理专用线程池：隔离第三方调用，防止耗尽主线程池 */
    private ExecutorService spiThreadPool;

    private final SpiHandlerFactory handlerFactory;
    private final ChannelAdapterConfigRepository configRepo;
    private final SpiLogService spiLogService;

    public SpiGatewayController(SpiHandlerFactory handlerFactory,
                                 ChannelAdapterConfigRepository configRepo,
                                 SpiLogService spiLogService) {
        this.handlerFactory = handlerFactory;
        this.configRepo = configRepo;
        this.spiLogService = spiLogService;
    }

    @PostConstruct
    void init() {
        this.spiThreadPool = new ThreadPoolExecutor(
                4, 16, 60L, TimeUnit.SECONDS,
                new LinkedBlockingQueue<>(200),
                new ThreadFactoryBuilder().setNameFormat("spi-worker-%d").setDaemon(true).build(),
                new ThreadPoolExecutor.CallerRunsPolicy() // 队列满时回退到调用者线程
        );
        log.info("[SpiGateway] SPI 线程池已初始化: core=4, max=16, queue=200");
    }

    @PreDestroy
    void destroy() {
        if (spiThreadPool != null) {
            spiThreadPool.shutdown();
            try { spiThreadPool.awaitTermination(10, TimeUnit.SECONDS); } catch (InterruptedException e) { Thread.currentThread().interrupt(); }
        }
    }

    /**
     * 统一 SPI Webhook 入口。
     *
     * @param channel     渠道标识（TMALL, JD, DOUYIN, WECHAT_MINI）
     * @param programCode 租户计划代码
     * @param action      操作类型（如 order.paid, member.enroll, refund.notify）
     * @param request     HTTP 原始请求
     * @return HTTP 200 + 渠道特定 JSON（即使处理失败也返回 200）
     */
    @PostMapping("/{action}")
    public ResponseEntity<Object> handleSpi(
            @PathVariable String channel,
            @PathVariable String programCode,
            @PathVariable String action,
            HttpServletRequest request) {

        long startTime = System.currentTimeMillis();
        String requestId = request.getHeader("X-Request-Id");
        byte[] rawBody = readBody(request);

        // 设置租户上下文
        TenantContext.set(programCode);

        try {
            // 1. 获取渠道处理器和配置
            ChannelSpiHandler handler = handlerFactory.getHandler(channel);

            var configOpt = configRepo.findActiveByProgramAndChannel(programCode, channel);
            if (configOpt.isEmpty()) {
                spiLogService.logFailed(channel, programCode, action, requestId,
                        "CONFIG_NOT_FOUND", new String(rawBody), "渠道配置不存在或未激活");
                return ResponseEntity.status(HttpStatus.NOT_FOUND)
                        .body(Map.of("code", "ERR_CONFIG_NOT_FOUND", "message", "Channel config not found"));
            }
            ChannelAdapterConfig config = configOpt.get();

            // 2. 安全验签拦截
            if (!handler.verifySignature(request, rawBody, config)) {
                spiLogService.logFailed(channel, programCode, action, requestId,
                        "SIGN_FAILED", new String(rawBody), "签名验证失败");
                return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
                        .body(Map.of("code", "ERR_SIGN_FAILED", "message", "Signature Invalid"));
            }

            // 3. 防雪崩隔离：异步处理 + 2000ms 超时（捕获 effectively final 变量）
            final ChannelSpiHandler finalHandler = handler;
            final ChannelAdapterConfig finalConfig = config;
            CompletableFuture<Object> future = CompletableFuture.supplyAsync(() -> {
                TenantContext.set(programCode);
                try {
                    return finalHandler.handleAction(action, programCode, rawBody, finalConfig);
                } finally {
                    TenantContext.clear();
                }
            }, spiThreadPool);

            try {
                Object spiResponse = future.get(2000, TimeUnit.MILLISECONDS);
                int elapsed = (int) (System.currentTimeMillis() - startTime);
                spiLogService.logSuccess(channel, programCode, action, requestId,
                        null, new String(rawBody), String.valueOf(spiResponse), elapsed);
                return ResponseEntity.ok(spiResponse);

            } catch (TimeoutException te) {
                int elapsed = (int) (System.currentTimeMillis() - startTime);
                log.error("[SpiGateway] SPI 响应超时: channel={}, action={}, elapsed={}ms", channel, action, elapsed);
                spiLogService.logFailed(channel, programCode, action, requestId,
                        "TIMEOUT", new String(rawBody), "处理超时(>2000ms)");
                return ResponseEntity.ok(handler.buildErrorResponse(
                        new RuntimeException("SPI processing timeout")));

            } catch (ExecutionException ee) {
                Throwable cause = ee.getCause() != null ? ee.getCause() : ee;
                log.error("[SpiGateway] SPI 业务异常: channel={}, action={}", channel, action, cause);
                spiLogService.logFailed(channel, programCode, action, requestId,
                        "BUSINESS_ERROR", new String(rawBody), cause.getMessage());
                return ResponseEntity.ok(handler.buildErrorResponse(
                        cause instanceof Exception ? (Exception) cause : new RuntimeException(cause)));

            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
                return ResponseEntity.ok(handler.buildErrorResponse(e));
            }

        } catch (Exception e) {
            spiLogService.logFailed(channel, programCode, action, requestId,
                    "INIT_ERROR", new String(rawBody), e.getMessage());
            // 无法确定 handler 时返回通用错误
            return ResponseEntity.ok(Map.of("code", "ERR_INIT_FAILED", "message", e.getMessage()));
        } finally {
            TenantContext.clear();
        }
    }

    /** 安全读取请求体为字节数组 */
    private byte[] readBody(HttpServletRequest request) {
        try (InputStream is = request.getInputStream();
             ByteArrayOutputStream bos = new ByteArrayOutputStream()) {
            byte[] buf = new byte[4096];
            int len;
            while ((len = is.read(buf)) != -1) bos.write(buf, 0, len);
            return bos.toByteArray();
        } catch (IOException e) {
            log.error("[SpiGateway] 读取请求体失败", e);
            return new byte[0];
        }
    }
}