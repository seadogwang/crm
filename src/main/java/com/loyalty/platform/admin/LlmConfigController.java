package com.loyalty.platform.admin;

import com.loyalty.platform.common.context.TenantContext;
import com.loyalty.platform.common.dto.ApiResponse;
import com.loyalty.platform.domain.entity.LlmConfig;
import com.loyalty.platform.domain.repository.LlmConfigRepository;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.http.ResponseEntity;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.time.LocalDateTime;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

/**
 * 大模型配置管理 — 按 program 存储 LLM 连接信息。
 */
@RestController
@RequestMapping("/api/admin/llm-config")
public class LlmConfigController {

    private final LlmConfigRepository llmConfigRepo;

    public LlmConfigController(LlmConfigRepository llmConfigRepo) {
        this.llmConfigRepo = llmConfigRepo;
    }

    /** 获取当前 Program 的 LLM 配置（Key 掩码返回） */
    @GetMapping
    public ResponseEntity<ApiResponse<Map<String, Object>>> getConfig() {
        String pc = TenantContext.getRequired();
        Optional<LlmConfig> opt = llmConfigRepo.findByProgramCode(pc);

        Map<String, Object> result = new LinkedHashMap<>();
        if (opt.isPresent()) {
            LlmConfig c = opt.get();
            result.put("provider", c.getProvider());
            result.put("apiUrl", c.getApiUrl());
            result.put("apiKeyMasked", maskApiKey(c.getApiKey()));
            result.put("model", c.getModel());
            result.put("temperature", c.getTemperature());
            result.put("maxTokens", c.getMaxTokens());
            result.put("enabled", c.getEnabled());
            result.put("hasConfig", true);
        } else {
            result.put("hasConfig", false);
        }
        return ResponseEntity.ok(ApiResponse.success(result));
    }

    /** 保存或更新当前 Program 的 LLM 配置 */
    @PutMapping
    @Transactional
    public ResponseEntity<ApiResponse<Map<String, Object>>> saveOrUpdate(
            @RequestBody Map<String, Object> body) {
        String pc = TenantContext.getRequired();

        LlmConfig config = llmConfigRepo.findByProgramCode(pc)
                .orElse(LlmConfig.builder().programCode(pc).build());

        if (body.containsKey("provider")) {
            config.setProvider((String) body.get("provider"));
        }
        if (body.containsKey("apiUrl")) {
            config.setApiUrl((String) body.get("apiUrl"));
        }
        // 如果 apiKey 以 "***" 开头，表示前端未修改密钥，跳过更新
        if (body.containsKey("apiKey") && !((String) body.get("apiKey")).startsWith("***")) {
            config.setApiKey((String) body.get("apiKey"));
        }
        if (body.containsKey("model")) {
            config.setModel((String) body.get("model"));
        }
        if (body.containsKey("temperature")) {
            config.setTemperature(((Number) body.get("temperature")).doubleValue());
        }
        if (body.containsKey("maxTokens")) {
            config.setMaxTokens(((Number) body.get("maxTokens")).intValue());
        }
        if (body.containsKey("enabled")) {
            config.setEnabled((Boolean) body.get("enabled"));
        }

        config.setUpdatedAt(LocalDateTime.now());
        llmConfigRepo.save(config);

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("saved", true);
        result.put("provider", config.getProvider());
        return ResponseEntity.ok(ApiResponse.success(result));
    }

    /** 获取支持的提供商列表及默认值 */
    @GetMapping("/providers")
    public ResponseEntity<ApiResponse<Map<String, Object>>> getProviders() {
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("providers", PROVIDERS);
        return ResponseEntity.ok(ApiResponse.success(result));
    }

    // ==================== 连接测试 ====================

    private static final ObjectMapper testMapper = new ObjectMapper();
    private static final HttpClient testClient = HttpClient.newBuilder()
            .connectTimeout(Duration.ofSeconds(10))
            .build();

    /** 测试 LLM 连接 — 发送一条简单消息验证 API Key 和 URL 是否可用 */
    @PostMapping("/test")
    public ResponseEntity<ApiResponse<Map<String, Object>>> testConnection(
            @RequestBody Map<String, Object> body) {
        String provider = (String) body.getOrDefault("provider", "DEEPSEEK");
        String apiUrl = (String) body.get("apiUrl");
        String apiKey = (String) body.get("apiKey");
        String model = (String) body.getOrDefault("model", "deepseek-chat");

        // 如果 apiKey 是掩码格式（***xxxx），则从 DB 中查找真实密钥
        if (apiKey != null && apiKey.startsWith("***")) {
            String pc = TenantContext.getRequired();
            Optional<LlmConfig> opt = llmConfigRepo.findByProgramCode(pc);
            if (opt.isPresent() && opt.get().getApiKey() != null) {
                apiKey = opt.get().getApiKey();
            }
        }

        Map<String, Object> result = new LinkedHashMap<>();

        try {
            String responseText;
            long start = System.currentTimeMillis();

            if ("CLAUDE".equals(provider)) {
                Map<String, Object> reqBody = new LinkedHashMap<>();
                reqBody.put("model", model);
                reqBody.put("max_tokens", 20);
                reqBody.put("temperature", 0.1);
                reqBody.put("messages", List.of(Map.of("role", "user", "content", "回复OK")));

                HttpRequest req = HttpRequest.newBuilder()
                        .uri(URI.create(apiUrl))
                        .header("x-api-key", apiKey != null ? apiKey : "")
                        .header("anthropic-version", "2023-06-01")
                        .header("Content-Type", "application/json")
                        .POST(HttpRequest.BodyPublishers.ofString(testMapper.writeValueAsString(reqBody)))
                        .timeout(Duration.ofSeconds(15))
                        .build();

                HttpResponse<String> resp = testClient.send(req, HttpResponse.BodyHandlers.ofString());

                if (resp.statusCode() >= 400) {
                    result.put("success", false);
                    result.put("error", "HTTP " + resp.statusCode() + ": " + resp.body());
                } else {
                    @SuppressWarnings("unchecked")
                    Map<String, Object> respMap = testMapper.readValue(resp.body(), Map.class);
                    @SuppressWarnings("unchecked")
                    List<Map<String, Object>> content = (List<Map<String, Object>>) respMap.get("content");
                    responseText = content != null && !content.isEmpty()
                            ? (String) content.get(0).get("text") : "ok";
                    result.put("success", true);
                    result.put("response", responseText);
                }
            } else {
                // OpenAI 兼容格式（DeepSeek / 阿里百炼）
                Map<String, Object> reqBody = new LinkedHashMap<>();
                reqBody.put("model", model);
                reqBody.put("messages", List.of(Map.of("role", "user", "content", "回复OK")));
                reqBody.put("max_tokens", 20);
                reqBody.put("temperature", 0.1);

                HttpRequest req = HttpRequest.newBuilder()
                        .uri(URI.create(apiUrl))
                        .header("Authorization", "Bearer " + (apiKey != null ? apiKey : ""))
                        .header("Content-Type", "application/json")
                        .POST(HttpRequest.BodyPublishers.ofString(testMapper.writeValueAsString(reqBody)))
                        .timeout(Duration.ofSeconds(15))
                        .build();

                HttpResponse<String> resp = testClient.send(req, HttpResponse.BodyHandlers.ofString());

                if (resp.statusCode() >= 400) {
                    result.put("success", false);
                    result.put("error", "HTTP " + resp.statusCode() + ": " + resp.body());
                } else {
                    @SuppressWarnings("unchecked")
                    Map<String, Object> respMap = testMapper.readValue(resp.body(), Map.class);
                    @SuppressWarnings("unchecked")
                    List<Map<String, Object>> choices = (List<Map<String, Object>>) respMap.get("choices");
                    if (choices != null && !choices.isEmpty()) {
                        @SuppressWarnings("unchecked")
                        Map<String, Object> msg = (Map<String, Object>) choices.get(0).get("message");
                        responseText = msg != null ? (String) msg.get("content") : "ok";
                    } else {
                        responseText = resp.body().substring(0, Math.min(100, resp.body().length()));
                    }
                    result.put("success", true);
                    result.put("response", responseText);
                }
            }

            result.put("elapsedMs", System.currentTimeMillis() - start);
            result.put("model", model);

        } catch (java.net.UnknownHostException e) {
            result.put("success", false);
            result.put("error", "DNS 解析失败，无法找到服务器: " + e.getMessage());
        } catch (java.net.ConnectException e) {
            result.put("success", false);
            result.put("error", "连接被拒绝，请检查 API URL 是否正确: " + e.getMessage());
        } catch (javax.net.ssl.SSLException e) {
            result.put("success", false);
            result.put("error", "SSL/HTTPS 握手失败: " + e.getMessage());
        } catch (java.net.http.HttpTimeoutException e) {
            result.put("success", false);
            result.put("error", "连接超时（15秒未响应）");
        } catch (java.io.IOException e) {
            result.put("success", false);
            result.put("error", "网络请求异常: " + e.getClass().getSimpleName() + " - " + e.getMessage());
        } catch (Exception e) {
            result.put("success", false);
            result.put("error", "未知错误: " + e.getClass().getSimpleName() + " - " + e.getMessage());
        }

        return ResponseEntity.ok(ApiResponse.success(result));
    }

    // ==================== 内部工具 ====================

    private String maskApiKey(String key) {
        if (key == null || key.length() < 8) return null;
        return "***" + key.substring(key.length() - 4);
    }

    private static final Map<String, Map<String, Object>> PROVIDERS = new LinkedHashMap<>();

    static {
        PROVIDERS.put("DEEPSEEK", Map.of(
                "name", "DeepSeek",
                "defaultUrl", "https://api.deepseek.com/v1/chat/completions",
                "defaultModel", "deepseek-chat",
                "models", java.util.List.of("deepseek-chat", "deepseek-coder")
        ));
        PROVIDERS.put("BAILIAN", Map.of(
                "name", "阿里百炼",
                "defaultUrl", "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions",
                "defaultModel", "qwen-plus",
                "models", java.util.List.of("qwen-plus", "qwen-max", "qwen-turbo", "qwen2.5-72b-instruct", "qwen2.5-32b-instruct", "qwen2.5-14b-instruct", "qwen2.5-7b-instruct")
        ));
    }
}
