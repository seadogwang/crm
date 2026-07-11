package com.loyalty.platform.rules.ai;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.loyalty.platform.common.context.TenantContext;
import com.loyalty.platform.common.dto.ApiResponse;
import com.loyalty.platform.domain.entity.RuleDefinition;
import com.loyalty.platform.domain.repository.RuleDefinitionRepository;
import com.loyalty.platform.rules.AiRuleGenerationService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDateTime;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;

@RestController
@RequestMapping("/api/rules/ai")
public class AiRuleController {

    private static final Logger log = LoggerFactory.getLogger(AiRuleController.class);
    private static final ObjectMapper mapper = new ObjectMapper();

    private final RuleContextBuilder contextBuilder;
    private final AiRuleGenerationService aiRuleGen;
    private final RuleDefinitionRepository ruleRepo;

    // 会话存储（生产环境应使用 Redis）
    private final ConcurrentHashMap<String, AiSession> sessions = new ConcurrentHashMap<>();

    public AiRuleController(RuleContextBuilder contextBuilder,
                            AiRuleGenerationService aiRuleGen,
                            RuleDefinitionRepository ruleRepo) {
        this.contextBuilder = contextBuilder;
        this.aiRuleGen = aiRuleGen;
        this.ruleRepo = ruleRepo;
    }

    static class AiSession {
        String sessionId;
        String programCode;
        String ruleType = "积分累积规则";
        String systemPrompt;
        List<Map<String, String>> history = new ArrayList<>();
        Map<String, Object> rulePreview;

        AiSession(String id, String pc) {
            this.sessionId = id;
            this.programCode = pc;
        }
    }

    @PostMapping("/start")
    public ResponseEntity<ApiResponse<Map<String, Object>>> start(@RequestBody Map<String, Object> body) {
        String pc = TenantContext.getRequired();
        String ruleType = (String) body.getOrDefault("ruleType", "积分累积规则");
        String initialMessage = (String) body.get("initialMessage");

        String sessionId = UUID.randomUUID().toString().substring(0, 8);
        AiSession session = new AiSession(sessionId, pc);
        session.ruleType = ruleType;
        session.systemPrompt = contextBuilder.buildSystemPrompt(pc, ruleType);
        sessions.put(sessionId, session);

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("sessionId", sessionId);

        // 如果用户提供了初始消息，直接调用 LLM 生成 formSchema
        if (initialMessage != null && !initialMessage.isBlank()) {
            session.history.add(Map.of("speaker", "USER", "content", initialMessage));
            String llmPrompt = buildFullPrompt(session, initialMessage);
            Map<String, Object> llmResult = callLlm(llmPrompt);

            String status = (String) llmResult.getOrDefault("status", "CLARIFYING");
            String aiMessage = (String) llmResult.getOrDefault("message", "");
            session.history.add(Map.of("speaker", "AI", "content", aiMessage));

            result.put("status", status);
            result.put("message", aiMessage);
            result.put("context", llmResult.getOrDefault("context", Map.of()));
            // 透传 question 和 suggestions
            if (llmResult.containsKey("question")) {
                result.put("question", llmResult.get("question"));
            }
            if (llmResult.containsKey("suggestions")) {
                result.put("suggestions", llmResult.get("suggestions"));
            }

            if ("READY".equals(status)) {
                session.rulePreview = llmResult;
                result.put("rulePreview", llmResult);
            } else if (llmResult.containsKey("formSchema")) {
                result.put("formSchema", llmResult.get("formSchema"));
            }
        } else {
            result.put("message", "您好！请描述您想配置的规则，我会帮您生成配置表单。\n\n例如：\n· 「618活动，购买指定商品送双倍积分」\n· 「会员生日当天消费送3倍积分」");
            result.put("suggestions", List.of(
                    "618活动，指定商品双倍积分",
                    "黄金会员每消费1元得双倍积分",
                    "会员生日当天消费送3倍积分"
            ));
        }

        return ResponseEntity.ok(ApiResponse.success(result));
    }

    /** V3: 澄清对话（流式 SSE — text + question 事件） */
    @PostMapping("/clarify")
    public org.springframework.web.servlet.mvc.method.annotation.SseEmitter clarify(
            @RequestBody Map<String, Object> body) {
        String pc = TenantContext.getRequired();
        String sessionId = (String) body.get("sessionId");
        String message = (String) body.get("message");

        org.springframework.web.servlet.mvc.method.annotation.SseEmitter emitter =
                new org.springframework.web.servlet.mvc.method.annotation.SseEmitter(180_000L);

        if (sessionId == null || message == null) {
            safeEmit(emitter, "error", "sessionId and message required");
            emitter.complete();
            return emitter;
        }

        AiSession session = sessions.get(sessionId);
        if (session == null) {
            safeEmit(emitter, "error", "会话已过期");
            emitter.complete();
            return emitter;
        }

        session.history.add(Map.of("speaker", "USER", "content", message));
        String llmPrompt = buildClarifyPrompt(session, message);

        new Thread(() -> {
            try {
                String fullText = aiRuleGen.streamChat(pc, llmPrompt, chunk -> {
                    safeEmit(emitter, "text", chunk);
                });

                if (fullText != null && !fullText.isEmpty()) {
                    session.history.add(Map.of("speaker", "AI", "content", fullText));
                    Map<String, Object> parsed = parseJsonResponse(fullText);
                    if (parsed != null) {
                        String status = (String) parsed.getOrDefault("status", "CLARIFYING");
                        if ("CLARIFIED".equals(status) || "READY".equals(status)) {
                            updateSessionPreview(session, parsed);
                        }
                        // 发送完整的解析结果
                        emitter.send(org.springframework.web.servlet.mvc.method.annotation.SseEmitter
                                .event().name("done").data(mapper.writeValueAsString(parsed)));
                    } else {
                        emitter.send(org.springframework.web.servlet.mvc.method.annotation.SseEmitter
                                .event().name("done").data("{}"));
                    }
                }
                emitter.complete();
            } catch (Exception e) {
                log.warn("[AiRule] clarify异常: {}", e.getMessage());
                try { emitter.complete(); } catch (Exception ignored) {}
            }
        }).start();

        return emitter;
    }

    /** V3: 提交澄清答案，返回 formSchema */
    @PostMapping("/clarify/submit")
    public ResponseEntity<ApiResponse<Map<String, Object>>> clarifySubmit(
            @RequestBody Map<String, Object> body) {
        String pc = TenantContext.getRequired();
        String sessionId = (String) body.get("sessionId");
        @SuppressWarnings("unchecked")
        Map<String, Object> answers = (Map<String, Object>) body.get("answers");

        if (sessionId == null || answers == null) {
            return ResponseEntity.ok(ApiResponse.error("ERR_INVALID", "sessionId and answers required"));
        }

        AiSession session = sessions.get(sessionId);
        if (session == null) {
            return ResponseEntity.ok(ApiResponse.error("ERR_SESSION_NOT_FOUND", "会话已过期"));
        }

        String answerSummary = "用户已确认以下信息：\n";
        for (var entry : answers.entrySet()) {
            answerSummary += "- " + entry.getKey() + ": " + entry.getValue() + "\n";
        }
        session.history.add(Map.of("speaker", "USER", "content", answerSummary));

        String llmPrompt = buildFormGenPrompt(session, answers);
        Map<String, Object> llmResult = callLlm(llmPrompt);

        Map<String, Object> result = new LinkedHashMap<>();
        if (llmResult != null) {
            result.put("status", llmResult.getOrDefault("status", "CLARIFIED"));
            result.put("message", llmResult.getOrDefault("message", ""));
            if (llmResult.containsKey("formSchema")) {
                result.put("formSchema", llmResult.get("formSchema"));
            }
            if ("READY".equals(llmResult.get("status"))) {
                session.rulePreview = llmResult;
                result.put("rulePreview", llmResult);
            }
        } else {
            result.put("status", "ERROR");
            result.put("message", "生成表单失败，请重试");
        }

        return ResponseEntity.ok(ApiResponse.success(result));
    }

    private String buildClarifyPrompt(AiSession session, String userMessage) {
        StringBuilder sb = new StringBuilder();
        sb.append(session.systemPrompt).append("\n\n");
        sb.append("## 对话历史\n");
        for (var turn : session.history) {
            sb.append(turn.get("speaker")).append(": ").append(turn.get("content")).append("\n");
        }
        sb.append("\n## 用户最新输入\n");
        sb.append(userMessage).append("\n\n");
        sb.append("请根据以上信息，判断当前处于哪个阶段（CLARIFYING/CLARIFIED/READY），输出对应 JSON。");
        sb.append("如果信息不完整，输出一个澄清问题（含选项）。");
        return sb.toString();
    }

    private String buildFormGenPrompt(AiSession session, Map<String, Object> answers) {
        StringBuilder sb = new StringBuilder();
        sb.append(session.systemPrompt).append("\n\n");
        sb.append("## 澄清结果\n");
        for (var entry : answers.entrySet()) {
            sb.append("- ").append(entry.getKey()).append(": ").append(entry.getValue()).append("\n");
        }
        sb.append("\n请基于以上澄清结果，生成 CLARIFIED 状态的 JSON，包含动态 formSchema。");
        sb.append("formSchema 应根据澄清结果定制字段，只包含必要的字段。");
        return sb.toString();
    }

    private void safeEmit(org.springframework.web.servlet.mvc.method.annotation.SseEmitter emitter,
                          String event, String data) {
        try {
            emitter.send(org.springframework.web.servlet.mvc.method.annotation.SseEmitter
                    .event().name(event).data(data));
        } catch (Exception ignored) {}
    }

    /** 提交表单数据，生成最终规则 */
    @PostMapping("/submit-form")
    public ResponseEntity<ApiResponse<Map<String, Object>>> submitForm(@RequestBody Map<String, Object> body) {
        String pc = TenantContext.getRequired();
        String sessionId = (String) body.get("sessionId");
        @SuppressWarnings("unchecked")
        Map<String, Object> formData = (Map<String, Object>) body.get("formData");

        if (sessionId == null || formData == null) {
            return ResponseEntity.ok(ApiResponse.error("ERR_INVALID", "sessionId and formData required"));
        }

        AiSession session = sessions.get(sessionId);
        if (session == null) {
            return ResponseEntity.ok(ApiResponse.error("ERR_SESSION_NOT_FOUND", "会话已过期，请重新开始"));
        }

        // 构建表单提交的 prompt
        String formPrompt = buildFormSubmitPrompt(session, formData);
        Map<String, Object> llmResult = callLlm(formPrompt);

        if (llmResult == null || !"READY".equals(llmResult.get("status"))) {
            return ResponseEntity.ok(ApiResponse.error("ERR_GENERATE", "规则生成失败，请重试"));
        }

        session.rulePreview = llmResult;
        session.history.add(Map.of("speaker", "USER", "content", "已提交表单：" + formData.toString()));
        session.history.add(Map.of("speaker", "AI", "content", (String) llmResult.getOrDefault("message", "")));

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("status", "READY");
        result.put("rulePreview", llmResult);
        return ResponseEntity.ok(ApiResponse.success(result));
    }

    private String buildFormSubmitPrompt(AiSession session, Map<String, Object> formData) {
        StringBuilder sb = new StringBuilder();
        sb.append(session.systemPrompt).append("\n\n");
        sb.append("## 用户已通过表单提交了以下信息，请直接生成完整规则（status=READY）：\n");
        sb.append("```json\n");
        try {
            sb.append(mapper.writeValueAsString(formData));
        } catch (Exception e) {
            sb.append(formData.toString());
        }
        sb.append("\n```\n");
        sb.append("请基于以上信息生成完整的规则，输出 status=READY 的 JSON。");
        return sb.toString();
    }

    @PostMapping("/chat")
    public ResponseEntity<ApiResponse<Map<String, Object>>> chat(@RequestBody Map<String, Object> body) {
        String pc = TenantContext.getRequired();
        String sessionId = (String) body.get("sessionId");
        String message = (String) body.get("message");

        if (sessionId == null || message == null) {
            return ResponseEntity.ok(ApiResponse.error("ERR_INVALID", "sessionId and message required"));
        }

        AiSession session = sessions.get(sessionId);
        if (session == null) {
            return ResponseEntity.ok(ApiResponse.error("ERR_SESSION_NOT_FOUND", "会话已过期，请重新开始"));
        }

        // 记录用户消息
        session.history.add(Map.of("speaker", "USER", "content", message));

        // 调用 LLM
        String llmPrompt = buildFullPrompt(session, message);
        Map<String, Object> llmResult = callLlm(llmPrompt);

        String status = (String) llmResult.getOrDefault("status", "CLARIFYING");
        String aiMessage = (String) llmResult.getOrDefault("message", "收到，请继续描述您的需求");

        session.history.add(Map.of("speaker", "AI", "content", aiMessage));

        return buildChatResponse(status, aiMessage, llmResult, session);
    }

    /** 流式对话端点 — 返回 SSE 文本流，逐字推送到前端 */
    @PostMapping("/chat/stream")
    public org.springframework.web.servlet.mvc.method.annotation.SseEmitter chatStream(
            @RequestBody Map<String, Object> body) {
        String pc = TenantContext.getRequired();
        String sessionId = (String) body.get("sessionId");
        String message = (String) body.get("message");

        org.springframework.web.servlet.mvc.method.annotation.SseEmitter emitter =
                new org.springframework.web.servlet.mvc.method.annotation.SseEmitter(120_000L);

        if (sessionId == null || message == null) {
            try {
                emitter.send(org.springframework.web.servlet.mvc.method.annotation.SseEmitter
                        .event().name("error").data("sessionId and message required"));
                emitter.complete();
            } catch (Exception ignored) {}
            return emitter;
        }

        AiSession session = sessions.get(sessionId);
        if (session == null) {
            try {
                emitter.send(org.springframework.web.servlet.mvc.method.annotation.SseEmitter
                        .event().name("error").data("会话已过期，请重新开始"));
                emitter.complete();
            } catch (Exception ignored) {}
            return emitter;
        }

        // 记录用户消息
        session.history.add(Map.of("speaker", "USER", "content", message));

        String llmPrompt = buildFullPrompt(session, message);

        // 异步执行流式调用
        new Thread(() -> {
            try {
                String fullText = aiRuleGen.streamChat(pc, llmPrompt, chunk -> {
                    try {
                        emitter.send(org.springframework.web.servlet.mvc.method.annotation.SseEmitter
                                .event().name("chunk").data(chunk));
                    } catch (Exception ignored) {}
                });

                if (fullText == null || fullText.isEmpty()) {
                    // LLM 不可用，使用 mock 降级
                    Map<String, Object> mockResult = buildMockResult();
                    String mockMsg = (String) mockResult.get("message");
                    try {
                        // 模拟流式输出 mock 消息
                        for (int i = 0; i < mockMsg.length(); i++) {
                            emitter.send(org.springframework.web.servlet.mvc.method.annotation.SseEmitter
                                    .event().name("chunk").data(String.valueOf(mockMsg.charAt(i))));
                            Thread.sleep(15); // 模拟打字效果
                        }
                        fullText = mockMsg;
                        session.history.add(Map.of("speaker", "AI", "content", mockMsg));
                        emitter.send(org.springframework.web.servlet.mvc.method.annotation.SseEmitter
                                .event().name("done").data(mapper.writeValueAsString(mockResult)));
                    } catch (Exception e) {
                        log.warn("[AiRule] Mock 降级输出被中断: {}", e.getMessage());
                    }
                } else {
                    try {
                        // 保存 AI 消息到会话历史
                        session.history.add(Map.of("speaker", "AI", "content", fullText));

                        // 解析完整文本为 JSON
                        Map<String, Object> llmResult = parseJsonResponse(fullText);
                        if (llmResult == null) {
                            llmResult = buildMockResult();
                        }
                        updateSessionPreview(session, llmResult);
                        emitter.send(org.springframework.web.servlet.mvc.method.annotation.SseEmitter
                                .event().name("done").data(mapper.writeValueAsString(llmResult)));
                    } catch (Exception e) {
                        log.warn("[AiRule] done 事件发送失败: {}", e.getMessage());
                    }
                }
                emitter.complete();
            } catch (Exception e) {
                log.warn("[AiRule] 流式对话异常: {}", e.getMessage());
                try {
                    emitter.send(org.springframework.web.servlet.mvc.method.annotation.SseEmitter
                            .event().name("error").data(e.getMessage()));
                    emitter.complete();
                } catch (Exception ignored) {
                    // 客户端已断开或 emitter 已超时，忽略
                }
            }
        }).start();

        return emitter;
    }

    private Map<String, Object> parseJsonResponse(String text) {
        try {
            if (text != null && text.contains("{")) {
                int start = text.indexOf("{");
                int end = text.lastIndexOf("}") + 1;
                String json = text.substring(start, end);
                return mapper.readValue(json, Map.class);
            }
        } catch (Exception e) {
            log.warn("[AiRule] JSON 解析失败: {}", e.getMessage());
        }
        return null;
    }

    private void updateSessionPreview(AiSession session, Map<String, Object> llmResult) {
        String status = (String) llmResult.getOrDefault("status", "CLARIFYING");
        if ("READY".equals(status)) {
            session.rulePreview = llmResult;
        }
    }

    private Map<String, Object> buildMockResult() {
        return new LinkedHashMap<>(Map.of(
                "status", "CLARIFYING",
                "message", "收到您的需求。已了解：您想配置一条积分累积规则。\n\n您希望订单金额达到多少元以上才赠送积分？\n（例如：满100元开始赠送）",
                "context", Map.of("已理解内容", "配置一条积分累积规则", "已确认信息", "规则类型：积分累积规则"),
                "suggestions", List.of("满100元送2倍积分", "满200元送3倍积分", "不设门槛，消费即送"),
                "missingFields", List.of(
                        Map.of("field", "最低订单金额", "description", "订单金额达到多少元才开始赠送", "type", "number"),
                        Map.of("field", "会员等级", "description", "是否限制特定等级会员", "type", "select")
                )
        ));
    }

    private ResponseEntity<ApiResponse<Map<String, Object>>> buildChatResponse(
            String status, String aiMessage, Map<String, Object> llmResult, AiSession session) {
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("status", status);
        result.put("message", aiMessage);

        if (llmResult.containsKey("context")) {
            result.put("context", llmResult.get("context"));
        }
        if (llmResult.containsKey("suggestions")) {
            result.put("suggestions", llmResult.get("suggestions"));
        }

        if ("READY".equals(status)) {
            session.rulePreview = llmResult;
            result.put("rulePreview", llmResult);
        } else {
            result.put("missingFields", llmResult.getOrDefault("missingFields", List.of()));
        }

        return ResponseEntity.ok(ApiResponse.success(result));
    }

    @PostMapping("/save")
    public ResponseEntity<ApiResponse<Map<String, Object>>> save(@RequestBody Map<String, Object> body) {
        String pc = TenantContext.getRequired();
        String sessionId = (String) body.get("sessionId");
        boolean publish = Boolean.TRUE.equals(body.get("publish"));

        AiSession session = sessions.get(sessionId);
        if (session == null || session.rulePreview == null) {
            return ResponseEntity.ok(ApiResponse.error("ERR_NO_RULE", "没有可保存的规则，请先完成对话"));
        }

        @SuppressWarnings("unchecked")
        Map<String, Object> preview = session.rulePreview;

        RuleDefinition rule = RuleDefinition.builder()
                .programCode(pc)
                .ruleCode("AI_" + System.currentTimeMillis() % 100000)
                .ruleName((String) preview.getOrDefault("ruleName", "AI生成的规则"))
                .ruleType("DRL")
                .ruleCategory("base")
                .drlContent((String) preview.getOrDefault("drlContent", ""))
                .metadata(preview)
                .version(1)
                .status(publish ? "ACTIVE" : "DRAFT")
                .build();

        ruleRepo.save(rule);
        sessions.remove(sessionId);

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("ruleId", rule.getId());
        result.put("ruleCode", rule.getRuleCode());
        result.put("ruleName", rule.getRuleName());
        result.put("status", rule.getStatus());
        return ResponseEntity.ok(ApiResponse.success(result));
    }

    private String buildFullPrompt(AiSession session, String userMessage) {
        StringBuilder sb = new StringBuilder();
        sb.append(session.systemPrompt).append("\n\n");
        sb.append("## 对话历史\n");
        for (var turn : session.history) {
            sb.append(turn.get("speaker")).append(": ").append(turn.get("content")).append("\n");
        }
        sb.append("\n## 用户最新输入\n");
        sb.append(userMessage).append("\n\n");
        sb.append("请根据以上信息，输出 JSON 响应。");
        return sb.toString();
    }

    @SuppressWarnings("unchecked")
    private Map<String, Object> callLlm(String prompt) {
        try {
            String pc = TenantContext.getRequired();
            // 使用对话式 chat 接口（不包装 Drools 规则生成提示词）
            String llmResponse = aiRuleGen.chat(pc, prompt);

            if (llmResponse != null && llmResponse.contains("{")) {
                int start = llmResponse.indexOf("{");
                int end = llmResponse.lastIndexOf("}") + 1;
                String json = llmResponse.substring(start, end);
                return new com.fasterxml.jackson.databind.ObjectMapper().readValue(json, Map.class);
            }
        } catch (Exception e) {
            log.warn("[AiRule] LLM 解析失败，使用模拟响应: {}", e.getMessage());
        }

        // 如果 LLM 不可用或解析失败，使用模拟响应
        return new LinkedHashMap<>(Map.of(
                "status", "CLARIFYING",
                "message", """
                        收到您的需求。已了解：您想配置一条积分累积规则。

                        您希望订单金额达到多少元以上才赠送积分？
                        （例如：满100元开始赠送）""",
                "context", Map.of(
                        "已理解内容", "配置一条积分累积规则",
                        "已确认信息", "规则类型：积分累积规则"
                ),
                "suggestions", List.of("满100元送2倍积分", "满200元送3倍积分", "不设门槛，消费即送"),
                "missingFields", List.of(
                        Map.of("field", "最低订单金额", "description", "订单金额达到多少元才开始赠送", "type", "number"),
                        Map.of("field", "会员等级", "description", "是否限制特定等级会员", "type", "select")
                )
        ));
    }
}