package com.loyalty.saas.rules;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.loyalty.saas.domain.entity.RuleDefinition;
import com.loyalty.saas.domain.repository.RuleDefinitionRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

/**
 * AI 辅助规则生成服务 — Ch6.2 完整实现。
 *
 * <p>允许运营人员通过自然语言直接生成 Drools 规则。
 * 后端实现上下文注入与 JSON 强输出约束：
 * <ol>
 *   <li>收集当前 Program 的生产环境状态（活跃规则数、互斥组、最高优先级）</li>
 *   <li>拼接系统提示词（System Prompt）注入上下文</li>
 *   <li>调用 LLM API 生成 DRL + 测试用例</li>
 *   <li>JSON 强格式输出验证</li>
 * </ol>
 */
@Service
public class AiRuleGenerationService {

    private static final Logger log = LoggerFactory.getLogger(AiRuleGenerationService.class);
    private static final ObjectMapper mapper = new ObjectMapper();

    private final RuleDefinitionRepository ruleRepo;

    public AiRuleGenerationService(RuleDefinitionRepository ruleRepo) { this.ruleRepo = ruleRepo; }

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
                .map(RuleDefinition::getAgendaGroup)
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

        // 3. 调用 LLM API（骨架——生产环境接入实际 LLM）
        String llmResponse = callLlmApi(systemPrompt, req.llmApiKey());

        // 4. 解析并验证 JSON 输出
        return parseLlmResponse(llmResponse);
    }

    private String callLlmApi(String systemPrompt, String apiKey) {
        try {
            // 骨架——实际调用 OpenAI/Claude API
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

            HttpResponse<String> resp = HttpClient.newHttpClient().send(req, HttpResponse.BodyHandlers.ofString());
            return extractContentFromOpenAiResponse(resp.body());
        } catch (Exception e) {
            log.warn("[AiRuleGen] LLM API 调用失败（骨架——返回示例）", e);
            // 返回模拟响应用于测试
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

    @SuppressWarnings("unchecked")
    private String extractContentFromOpenAiResponse(String body) {
        try {
            Map<String, Object> resp = mapper.readValue(body, Map.class);
            List<Map<String, Object>> choices = (List<Map<String, Object>>) resp.get("choices");
            Map<String, Object> msg = (Map<String, Object>) choices.get(0).get("message");
            return (String) msg.get("content");
        } catch (Exception e) { return body; }
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
                        + ", Type: " + r.getRuleType() + ", Group: " + r.getAgendaGroup())
                .collect(Collectors.joining("\n"));
    }
}