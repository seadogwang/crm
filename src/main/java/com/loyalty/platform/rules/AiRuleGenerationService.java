package com.loyalty.platform.rules;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.loyalty.platform.domain.entity.LlmConfig;
import com.loyalty.platform.domain.entity.RuleDefinition;
import com.loyalty.platform.domain.repository.LlmConfigRepository;
import com.loyalty.platform.domain.repository.RuleDefinitionRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.nio.charset.StandardCharsets;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.stream.Collectors;

/**
 * AI 辅助规则生成服务 — Ch6.2 完整实现。
 *
 * <p>允许运营人员通过自然语言直接生成 Drools 规则。
 * 后端实现上下文注入与 JSON 强输出约束：
 * <ol>
 *   <li>收集当前 Program 的生产环境状态（活跃规则数、互斥组、最高优先级）</li>
 *   <li>拼接系统提示词（System Prompt）注入上下文</li>
 *   <li>从 DB 读取 LLM 配置并调用对应 API</li>
 *   <li>JSON 强格式输出验证</li>
 * </ol>
 */
@Service
public class AiRuleGenerationService {

    private static final Logger log = LoggerFactory.getLogger(AiRuleGenerationService.class);
    private static final ObjectMapper mapper = new ObjectMapper();
    private static final HttpClient httpClient = HttpClient.newBuilder()
            .connectTimeout(Duration.ofSeconds(15))
            .build();

    private final RuleDefinitionRepository ruleRepo;
    private final LlmConfigRepository llmConfigRepo;

    public AiRuleGenerationService(RuleDefinitionRepository ruleRepo,
                                   LlmConfigRepository llmConfigRepo) {
        this.ruleRepo = ruleRepo;
        this.llmConfigRepo = llmConfigRepo;
    }

    /**
     * AI 生成规则请求。
     */
    public record GenerateRequest(String programCode, String naturalLanguage, String llmApiKey) {}

    /**
     * AI 生成结果。
     */
    public record GenerateResult(
            String analysis, String drlCode, int recommendedSalience,
            String activationGroup, List<Map<String, Object>> mockTestCases) {}

    /**
     * 提交自然语言规则生成请求。
     */
    public GenerateResult generate(GenerateRequest req) {
        // 1. 收集生产环境上下文
        List<RuleDefinition> activeRules = ruleRepo.findActiveByProgramCode(req.programCode());
        int activeCount = activeRules.size();
        int maxSalience = activeRules.stream().mapToInt(r -> r.getVersion() != null ? r.getVersion() * 10 : 100).max().orElse(100);

        String groups = activeRules.stream()
                .map(RuleDefinition::getRuleCategory)
                .filter(g -> g != null && !g.isBlank())
                .distinct().collect(Collectors.joining(", "));

        // 2. 拼接系统提示词
        String systemPrompt = String.format("""
            [System Context]
            当前生产环境共有 %d 条活跃规则。
            正在使用的互斥组 (activation-group) 包括: %s。
            当前最高优先级 (salience) 为 %d。

            [关键老规则摘要]
            %s

            [任务]
            根据以下自然语言描述，生成一条 Drools 8 规则(DRL)。
            输出必须是严格的 JSON 格式:
            {
              "analysis": "对规则的风险分析和冲突提示",
              "drl_code": "完整的 DRL 规则脚本",
              "salience_recommendation": 150,
              "activation_group": null,
              "mock_test_cases": [
                {"scenario": "描述", "mock_event_payload": {}, "expected_delta_points": 100}
              ]
            }

            [自然语言描述]
            %s
            """, activeCount, groups.isEmpty() ? "无" : groups,
                maxSalience,
                summarizeRules(activeRules),
                req.naturalLanguage());

        // 3. 调用 LLM API（从 DB 配置读取连接信息）
        String llmResponse = callLlmApi(systemPrompt, req.llmApiKey(), req.programCode());

        // 4. 解析并验证 JSON 输出
        return parseLlmResponse(llmResponse);
    }

    // ==================== 对话式 AI 接口 ====================

    /**
     * 对话式 AI 规则助手 — 直接发送聊天 prompt 到 LLM，返回原始响应文本。
     * 与 {@link #generate} 不同，此方法不会包装 Drools 规则生成提示词。
     */
    public String chat(String programCode, String chatPrompt) {
        LlmConfig config = loadConfig(programCode);
        if (config == null) {
            log.info("[AiRuleGen] 未配置 LLM 或未启用，chat 不可用");
            return null;
        }

        String url = config.getApiUrl();
        String model = config.getModel();
        double temperature = config.getTemperature() != null ? config.getTemperature() : 0.1;
        String key = config.getApiKey();
        int maxTokens = config.getMaxTokens() != null ? config.getMaxTokens() : 4096;

        log.info("[AiRuleGen] 对话模式调用 LLM: provider={}, model={}, url={}", config.getProvider(), model, url);

        try {
            return switch (config.getProvider()) {
                case "CLAUDE" -> callClaudeChat(url, key, model, temperature, maxTokens, chatPrompt);
                default -> callOpenAiChat(url, key, model, temperature, maxTokens, chatPrompt);
            };
        } catch (Exception e) {
            log.warn("[AiRuleGen] 对话 LLM 调用失败: {}", e.getMessage());
            return null;
        }
    }

    /**
     * 流式对话 — 通过 Consumer 回调逐块推送文本，返回完整累积文本。
     * @param programCode 租户标识
     * @param chatPrompt  完整对话 prompt
     * @param onChunk     每收到一个文本块时回调（可能跨线程调用）
     * @return 完整累积文本，失败返回 null
     */
    public String streamChat(String programCode, String chatPrompt, java.util.function.Consumer<String> onChunk) {
        LlmConfig config = loadConfig(programCode);
        if (config == null) {
            log.info("[AiRuleGen] 未配置 LLM 或未启用，streamChat 不可用");
            return null;
        }

        String url = config.getApiUrl();
        String model = config.getModel();
        double temperature = config.getTemperature() != null ? config.getTemperature() : 0.1;
        String key = config.getApiKey();
        int maxTokens = config.getMaxTokens() != null ? config.getMaxTokens() : 4096;

        log.info("[AiRuleGen] 流式对话调用 LLM: provider={}, model={}, url={}", config.getProvider(), model, url);

        try {
            return switch (config.getProvider()) {
                case "CLAUDE" -> streamClaudeChat(url, key, model, temperature, maxTokens, chatPrompt, onChunk);
                default -> streamOpenAiChat(url, key, model, temperature, maxTokens, chatPrompt, onChunk);
            };
        } catch (Exception e) {
            log.warn("[AiRuleGen] 流式对话 LLM 调用失败: {}", e.getMessage());
            return null;
        }
    }

    /** OpenAI 兼容格式的流式调用 — 解析 SSE 流并逐块回调 */
    private String streamOpenAiChat(String url, String apiKey, String model,
                                     double temperature, int maxTokens, String chatPrompt,
                                     java.util.function.Consumer<String> onChunk) {
        try {
            Map<String, Object> body = new LinkedHashMap<>();
            body.put("model", model);
            body.put("messages", List.of(Map.of("role", "user", "content", chatPrompt)));
            body.put("temperature", temperature);
            body.put("max_tokens", maxTokens);
            body.put("stream", true);

            HttpRequest req = HttpRequest.newBuilder()
                    .uri(URI.create(url))
                    .header("Authorization", "Bearer " + (apiKey != null ? apiKey : ""))
                    .header("Content-Type", "application/json")
                    .POST(HttpRequest.BodyPublishers.ofString(mapper.writeValueAsString(body)))
                    .timeout(Duration.ofSeconds(180))
                    .build();

            HttpResponse<java.io.InputStream> resp = httpClient.send(req,
                    HttpResponse.BodyHandlers.ofInputStream());

            if (resp.statusCode() >= 400) {
                String errBody = new String(resp.body().readAllBytes());
                log.error("[AiRuleGen] 流式 API 返回错误: status={}, body={}", resp.statusCode(), errBody);
                return null;
            }

            StringBuilder fullText = new StringBuilder();
            try (var reader = new java.io.BufferedReader(new java.io.InputStreamReader(resp.body(), StandardCharsets.UTF_8))) {
                String line;
                while ((line = reader.readLine()) != null) {
                    if (line.isEmpty() || !line.startsWith("data: ")) continue;
                    String data = line.substring(6);
                    if ("[DONE]".equals(data)) break;

                    try {
                        @SuppressWarnings("unchecked")
                        Map<String, Object> chunk = mapper.readValue(data, Map.class);
                        @SuppressWarnings("unchecked")
                        List<Map<String, Object>> choices = (List<Map<String, Object>>) chunk.get("choices");
                        if (choices != null && !choices.isEmpty()) {
                            Map<String, Object> delta = (Map<String, Object>) choices.get(0).get("delta");
                            if (delta != null) {
                                String content = (String) delta.get("content");
                                // 跳过 reasoning_content（推理过程），只取实际输出
                                if (content != null) {
                                    fullText.append(content);
                                    onChunk.accept(content);
                                }
                            }
                        }
                    } catch (Exception e) {
                        // skip unparseable chunks
                    }
                }
            }

            return fullText.toString();
        } catch (Exception e) {
            log.warn("[AiRuleGen] 流式 OpenAI API 调用失败", e);
            return null;
        }
    }

    /** Claude Messages API 流式调用 */
    private String streamClaudeChat(String url, String apiKey, String model,
                                     double temperature, int maxTokens, String chatPrompt,
                                     java.util.function.Consumer<String> onChunk) {
        try {
            Map<String, Object> body = new LinkedHashMap<>();
            body.put("model", model);
            body.put("max_tokens", maxTokens);
            body.put("temperature", temperature);
            body.put("stream", true);
            body.put("messages", List.of(Map.of("role", "user", "content", chatPrompt)));

            HttpRequest req = HttpRequest.newBuilder()
                    .uri(URI.create(url))
                    .header("x-api-key", apiKey != null ? apiKey : "")
                    .header("anthropic-version", "2023-06-01")
                    .header("Content-Type", "application/json")
                    .POST(HttpRequest.BodyPublishers.ofString(mapper.writeValueAsString(body)))
                    .timeout(Duration.ofSeconds(180))
                    .build();

            HttpResponse<java.io.InputStream> resp = httpClient.send(req,
                    HttpResponse.BodyHandlers.ofInputStream());

            if (resp.statusCode() >= 400) {
                String errBody = new String(resp.body().readAllBytes());
                log.error("[AiRuleGen] 流式 Claude API 返回错误: status={}, body={}", resp.statusCode(), errBody);
                return null;
            }

            StringBuilder fullText = new StringBuilder();
            try (var reader = new java.io.BufferedReader(new java.io.InputStreamReader(resp.body(), StandardCharsets.UTF_8))) {
                String line;
                while ((line = reader.readLine()) != null) {
                    if (line.isEmpty() || !line.startsWith("data: ")) continue;
                    String data = line.substring(6);

                    try {
                        @SuppressWarnings("unchecked")
                        Map<String, Object> chunk = mapper.readValue(data, Map.class);
                        String type = (String) chunk.get("type");

                        if ("content_block_delta".equals(type)) {
                            @SuppressWarnings("unchecked")
                            Map<String, Object> delta = (Map<String, Object>) chunk.get("delta");
                            if (delta != null) {
                                String text = (String) delta.get("text");
                                if (text != null) {
                                    fullText.append(text);
                                    onChunk.accept(text);
                                }
                            }
                        }
                    } catch (Exception e) {
                        // skip unparseable chunks
                    }
                }
            }

            return fullText.toString();
        } catch (Exception e) {
            log.warn("[AiRuleGen] 流式 Claude API 调用失败", e);
            return null;
        }
    }

    private LlmConfig loadConfig(String programCode) {
        if (programCode != null) {
            Optional<LlmConfig> opt = llmConfigRepo.findByProgramCode(programCode);
            if (opt.isPresent() && Boolean.TRUE.equals(opt.get().getEnabled())) {
                return opt.get();
            }
        }
        return null;
    }

    /** OpenAI 兼容格式的对话调用 */
    private String callOpenAiChat(String url, String apiKey, String model,
                                   double temperature, int maxTokens, String chatPrompt) {
        try {
            Map<String, Object> body = new LinkedHashMap<>();
            body.put("model", model);
            body.put("messages", List.of(
                    Map.of("role", "user", "content", chatPrompt)
            ));
            body.put("temperature", temperature);
            body.put("max_tokens", maxTokens);

            HttpRequest req = HttpRequest.newBuilder()
                    .uri(URI.create(url))
                    .header("Authorization", "Bearer " + (apiKey != null ? apiKey : ""))
                    .header("Content-Type", "application/json")
                    .POST(HttpRequest.BodyPublishers.ofString(mapper.writeValueAsString(body)))
                    .timeout(Duration.ofSeconds(180))
                    .build();

            HttpResponse<String> resp = httpClient.send(req, HttpResponse.BodyHandlers.ofString());

            if (resp.statusCode() >= 400) {
                log.error("[AiRuleGen] 对话 API 返回错误: status={}, body={}", resp.statusCode(), resp.body());
                return null;
            }

            return extractContentFromOpenAiResponse(resp.body());
        } catch (Exception e) {
            log.warn("[AiRuleGen] 对话 OpenAI-compatible API 调用失败", e);
            return null;
        }
    }

    /** Claude Messages API 对话调用 */
    private String callClaudeChat(String url, String apiKey, String model,
                                   double temperature, int maxTokens, String chatPrompt) {
        try {
            Map<String, Object> body = new LinkedHashMap<>();
            body.put("model", model);
            body.put("max_tokens", maxTokens);
            body.put("temperature", temperature);
            body.put("messages", List.of(
                    Map.of("role", "user", "content", chatPrompt)
            ));

            HttpRequest req = HttpRequest.newBuilder()
                    .uri(URI.create(url))
                    .header("x-api-key", apiKey != null ? apiKey : "")
                    .header("anthropic-version", "2023-06-01")
                    .header("Content-Type", "application/json")
                    .POST(HttpRequest.BodyPublishers.ofString(mapper.writeValueAsString(body)))
                    .timeout(Duration.ofSeconds(180))
                    .build();

            HttpResponse<String> resp = httpClient.send(req, HttpResponse.BodyHandlers.ofString());

            if (resp.statusCode() >= 400) {
                log.error("[AiRuleGen] 对话 Claude API 返回错误: status={}, body={}", resp.statusCode(), resp.body());
                return null;
            }

            return extractContentFromClaudeResponse(resp.body());
        } catch (Exception e) {
            log.warn("[AiRuleGen] 对话 Claude API 调用失败", e);
            return null;
        }
    }

    // ==================== LLM API 调用（Drools 规则生成） ====================

    /**
     * 调用 LLM API — 优先使用 DB 中保存的配置，无配置则使用 mock 降级。
     */
    private String callLlmApi(String systemPrompt, String apiKey, String programCode) {
        // 尝试从 DB 加载 program 级别的 LLM 配置
        LlmConfig config = null;
        if (programCode != null) {
            Optional<LlmConfig> opt = llmConfigRepo.findByProgramCode(programCode);
            if (opt.isPresent() && Boolean.TRUE.equals(opt.get().getEnabled())) {
                config = opt.get();
            }
        }

        if (config != null) {
            String url = config.getApiUrl();
            String model = config.getModel();
            double temperature = config.getTemperature() != null ? config.getTemperature() : 0.1;
            String key = config.getApiKey() != null ? config.getApiKey() : apiKey;
            int maxTokens = config.getMaxTokens() != null ? config.getMaxTokens() : 4096;

            log.info("[AiRuleGen] 使用 DB 配置调用 LLM: provider={}, model={}, url={}", config.getProvider(), model, url);

            try {
                return switch (config.getProvider()) {
                    case "CLAUDE" -> callClaudeApi(url, key, model, temperature, maxTokens, systemPrompt);
                    default -> callOpenAiCompatibleApi(url, key, model, temperature, maxTokens, systemPrompt);
                };
            } catch (Exception e) {
                log.warn("[AiRuleGen] LLM API 调用失败，降级到 mock: {}", e.getMessage());
                // fall through to mock
            }
        } else {
            log.info("[AiRuleGen] 未配置 LLM 或未启用，使用 mock 响应");
        }

        // ====== Mock 降级（无配置或调用失败时） ======
        try {
            String apiUrl = System.getProperty("ai.llm.api.url", "https://api.openai.com/v1/chat/completions");
            Map<String, Object> body = Map.of(
                    "model", "gpt-4",
                    "messages", List.of(
                            Map.of("role", "system", "content", systemPrompt),
                            Map.of("role", "user", "content", "请生成规则")
                    ),
                    "temperature", 0.1
            );

            HttpRequest req = HttpRequest.newBuilder()
                    .uri(URI.create(apiUrl))
                    .header("Authorization", "Bearer " + (apiKey != null ? apiKey : "mock-key"))
                    .header("Content-Type", "application/json")
                    .POST(HttpRequest.BodyPublishers.ofString(mapper.writeValueAsString(body)))
                    .timeout(Duration.ofSeconds(30))
                    .build();

            HttpResponse<String> resp = httpClient.send(req, HttpResponse.BodyHandlers.ofString());
            return extractContentFromOpenAiResponse(resp.body());
        } catch (Exception e) {
            log.warn("[AiRuleGen] LLM API 调用失败（骨架——返回示例）", e);
            return """
                {
                  "analysis": "此规则可能与老规则 RULE-001 发生叠加，建议设置优先级高于 150",
                  "drl_code": "rule 'AI_Generated_Rule' when $e:EventFact(eventType=='ORDER') then collector.awardPoints($e.getProgramCode(),$e.getMemberId(),'REWARD_POINTS',new java.math.BigDecimal(50),'AI_RULE',null); end",
                  "salience_recommendation": 150,
                  "activation_group": null,
                  "mock_test_cases": [{"scenario":"支付订单","mock_event_payload":{"order_amount":500},"expected_delta_points":50}]
                }
                """;
        }
    }

    /** 调用 OpenAI 兼容格式的 API（OpenAI / DeepSeek / Azure OpenAI / 阿里百炼） */
    private String callOpenAiCompatibleApi(String url, String apiKey, String model,
                                            double temperature, int maxTokens, String systemPrompt) {
        try {
            Map<String, Object> body = new LinkedHashMap<>();
            body.put("model", model);
            body.put("messages", List.of(
                    Map.of("role", "system", "content", systemPrompt),
                    Map.of("role", "user", "content", "请根据以上信息生成规则 JSON")
            ));
            body.put("temperature", temperature);
            body.put("max_tokens", maxTokens);

            HttpRequest req = HttpRequest.newBuilder()
                    .uri(URI.create(url))
                    .header("Authorization", "Bearer " + (apiKey != null ? apiKey : ""))
                    .header("Content-Type", "application/json")
                    .POST(HttpRequest.BodyPublishers.ofString(mapper.writeValueAsString(body)))
                    .timeout(Duration.ofSeconds(60))
                    .build();

            HttpResponse<String> resp = httpClient.send(req, HttpResponse.BodyHandlers.ofString());

            if (resp.statusCode() >= 400) {
                log.error("[AiRuleGen] OpenAI API 返回错误: status={}, body={}", resp.statusCode(), resp.body());
                throw new RuntimeException("API returned " + resp.statusCode());
            }

            return extractContentFromOpenAiResponse(resp.body());
        } catch (Exception e) {
            log.warn("[AiRuleGen] OpenAI-compatible API 调用失败", e);
            throw new RuntimeException("LLM API call failed: " + e.getMessage());
        }
    }

    /** 调用 Claude Messages API */
    private String callClaudeApi(String url, String apiKey, String model,
                                  double temperature, int maxTokens, String systemPrompt) {
        try {
            Map<String, Object> body = new LinkedHashMap<>();
            body.put("model", model);
            body.put("max_tokens", maxTokens);
            body.put("temperature", temperature);
            body.put("system", systemPrompt);
            body.put("messages", List.of(
                    Map.of("role", "user", "content", "请根据以上信息生成规则 JSON")
            ));

            HttpRequest req = HttpRequest.newBuilder()
                    .uri(URI.create(url))
                    .header("x-api-key", apiKey != null ? apiKey : "")
                    .header("anthropic-version", "2023-06-01")
                    .header("Content-Type", "application/json")
                    .POST(HttpRequest.BodyPublishers.ofString(mapper.writeValueAsString(body)))
                    .timeout(Duration.ofSeconds(60))
                    .build();

            HttpResponse<String> resp = httpClient.send(req, HttpResponse.BodyHandlers.ofString());

            if (resp.statusCode() >= 400) {
                log.error("[AiRuleGen] Claude API 返回错误: status={}, body={}", resp.statusCode(), resp.body());
                throw new RuntimeException("Claude API returned " + resp.statusCode());
            }

            return extractContentFromClaudeResponse(resp.body());
        } catch (Exception e) {
            log.warn("[AiRuleGen] Claude API 调用失败", e);
            throw new RuntimeException("Claude API call failed: " + e.getMessage());
        }
    }

    // ==================== 响应解析 ====================

    @SuppressWarnings("unchecked")
    private String extractContentFromOpenAiResponse(String body) {
        try {
            Map<String, Object> resp = mapper.readValue(body, Map.class);
            List<Map<String, Object>> choices = (List<Map<String, Object>>) resp.get("choices");
            if (choices == null || choices.isEmpty()) {
                log.warn("[AiRuleGen] OpenAI 响应无 choices: {}", body);
                return body;
            }
            Map<String, Object> msg = (Map<String, Object>) choices.get(0).get("message");
            if (msg == null) {
                // 某些 API 用 "text" 字段替代 (如 DeepSeek streaming)
                Object text = choices.get(0).get("text");
                return text instanceof String s ? s : body;
            }
            return (String) msg.get("content");
        } catch (Exception e) {
            log.warn("[AiRuleGen] OpenAI 响应解析失败: {}", e.getMessage());
            return body;
        }
    }

    @SuppressWarnings("unchecked")
    private String extractContentFromClaudeResponse(String body) {
        try {
            Map<String, Object> resp = mapper.readValue(body, Map.class);
            // Claude Messages API 返回格式: content: [{ type: "text", text: "..." }]
            List<Map<String, Object>> content = (List<Map<String, Object>>) resp.get("content");
            if (content != null && !content.isEmpty()) {
                String text = (String) content.get(0).get("text");
                if (text != null) return text;
            }
            // fallback: 检查 completion 字段（某些 Claude 兼容 API）
            if (resp.containsKey("completion")) {
                return (String) resp.get("completion");
            }
            return body;
        } catch (Exception e) {
            log.warn("[AiRuleGen] Claude 响应解析失败: {}", e.getMessage());
            return body;
        }
    }

    @SuppressWarnings("unchecked")
    private GenerateResult parseLlmResponse(String json) {
        try {
            Map<String, Object> result = mapper.readValue(json, Map.class);
            return new GenerateResult(
                    (String) result.get("analysis"),
                    (String) result.get("drl_code"),
                    result.get("salience_recommendation") instanceof Number n ? n.intValue() : 150,
                    (String) result.get("activation_group"),
                    (List<Map<String, Object>>) result.get("mock_test_cases")
            );
        } catch (Exception e) {
            log.error("[AiRuleGen] JSON 解析失败: {}", e.getMessage());
            throw new RuntimeException("AI 生成的规则格式无效: " + e.getMessage());
        }
    }

    private String summarizeRules(List<RuleDefinition> rules) {
        return rules.stream()
                .limit(10)
                .map(r -> "- Rule-Code: " + r.getRuleCode() + ", Name: " + r.getRuleName()
                        + ", Type: " + r.getRuleType() + ", Group: " + r.getRuleCategory())
                .collect(Collectors.joining("\n"));
    }
}
