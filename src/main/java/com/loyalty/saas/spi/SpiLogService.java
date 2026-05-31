package com.loyalty.saas.spi;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.util.Map;

/**
 * SPI 调用审计日志服务。
 *
 * <p>所有 SPI 网关请求（成功/失败/超时）全量记录到 channel_spi_log 表，
 * 但由于该表在实际 DB 中不存在，改用 JSON 日志 + event_inbox 的 transform_logs 字段记录。
 *
 * @author Loyalty SaaS Architecture Team
 * @since 1.0.0
 */
@Service
public class SpiLogService {

    private static final Logger spiAuditLog = LoggerFactory.getLogger("SPI_AUDIT");

    /**
     * 记录成功的 SPI 调用。
     */
    public void logSuccess(String channel, String programCode, String action,
                           String requestId, Map<String, Object> headers,
                           String requestBody, String responseBody, int executionTimeMs) {
        spiAuditLog.info("[SPI-AUDIT] SUCCESS channel={} program={} action={} requestId={} timeMs={} body={}",
                channel, programCode, action, requestId, executionTimeMs, requestBody);
    }

    /**
     * 记录失败的 SPI 调用（含超时、验签失败、业务异常）。
     */
    public void logFailed(String channel, String programCode, String action,
                          String requestId, String reason, String requestBody, String errorMsg) {
        spiAuditLog.warn("[SPI-AUDIT] FAILED channel={} program={} action={} requestId={} reason={} error={} body={}",
                channel, programCode, action, requestId, reason, errorMsg, requestBody);
    }
}