## 第10章：Node Config Schema System（节点配置与执行体系）详细设计
Node Config Schema System 是 Campaign Tools 的**“可插拔执行算子（Execution Operator）体系”**，为每种节点类型定义标准化的配置 Schema，实现**前端动态表单渲染**与**后端配置校验**的统一，确保运营人员配置的节点在编译和执行时“契约正确”。
***
## 10.0 模块概述
### 10.0.1 本质定义
Node System 的本质是**“配置驱动”的执行框架**：
* **Schema**：定义每个节点类型的输入、输出、配置参数的类型与约束（JSON Schema）
* **Handler**：实现节点具体的业务逻辑（Worker 或本地执行）
* **Registry**：管理所有节点类型，提供 Schema 查询、配置校验、Handler 路由
### 10.0.2 核心设计原则
| 原则                      | 说明                                              |
| ----------------------- | ----------------------------------------------- |
| **Schema 驱动前端**         | 前端配置面板根据 Schema 动态生成表单，无需为每个节点单独开发配置 UI         |
| **校验前置**                | 前端 + 后端双重校验，保证配置在编译和执行前就是合法的                    |
| **与 Zeebe Worker 一一对应** | 每个 Action/AI 节点的 Schema 对应一个 Zeebe Worker 的输入契约 |
| **可扩展**                 | 新增节点只需定义 Schema + 实现 Handler + 注册即可，无需修改框架代码    |
### 10.0.3 节点系统的三层结构
```text
┌─────────────────────────────────────────────────────────────────────────────┐
│                     Layer 1: Schema Definition (定义层)                     │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  NodeType    │  Input Schema    │  Config Schema   │  Output Schema │   │
│  │  AUDIENCE_   │  { users: [] }   │  { segment:      │  { memberIds:  │   │
│  │  FILTER      │                  │    "string",      │    [] }       │   │
│  │              │                  │    limit: 10000 } │               │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                     Layer 2: Execution Logic (执行层)                       │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  BaseNode (抽象) → 具体 Node Handler (AudienceFilterNodeHandler)   │   │
│  │  execute(NodeContext ctx): 读取 config → 执行业务 → 输出结果        │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                     Layer 3: Runtime Integration (运行时集成层)             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  Zeebe Worker 读取 config → 调用 Node Handler → 返回结果           │   │
│  │  (Worker 的输入变量就是 Node 的 Config + Input)                    │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────┘
```
***
## 10.1 数据模型设计
### 10.1.1 节点类型定义表（campaign\_node\_definition）
存储所有支持的节点类型的 Schema 定义。
sql
```
CREATE TABLE campaign_node_definition (
    id VARCHAR(64) PRIMARY KEY,
    node_type VARCHAR(64) NOT NULL UNIQUE,          -- AUDIENCE_FILTER / SEND_EMAIL / ...
    category VARCHAR(32) NOT NULL,                  -- INPUT / LOGIC / AI / ACTION / CONTROL / END
    name VARCHAR(255) NOT NULL,                     -- 显示名称
    description TEXT,                               -- 描述
    icon VARCHAR(32),                               -- 图标标识
    color VARCHAR(16),                              -- 主题色
    -- Schema 定义（JSON Schema）
    config_schema JSONB NOT NULL,                   -- 配置参数的 JSON Schema
    input_schema JSONB,                             -- 输入数据的 JSON Schema
    output_schema JSONB,                            -- 输出数据的 JSON Schema
    -- 元信息
    zeebe_worker_type VARCHAR(64),                  -- 对应的 Zeebe Worker 类型
    version INT DEFAULT 1,
    status VARCHAR(32) DEFAULT 'ACTIVE',            -- ACTIVE / DEPRECATED
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_cnd_type ON campaign_node_definition(node_type);
CREATE INDEX idx_cnd_category ON campaign_node_definition(category);
CREATE INDEX idx_cnd_status ON campaign_node_definition(status);
```
### 10.1.2 节点执行记录表（campaign\_node\_execution\_history）
记录每个节点实例的每次执行历史，用于审计和调试。
sql
```
CREATE TABLE campaign_node_execution_history (
    id VARCHAR(64) PRIMARY KEY,
    plan_id VARCHAR(64) NOT NULL,
    node_id VARCHAR(64) NOT NULL,                   -- Canvas 节点 ID
    node_type VARCHAR(64) NOT NULL,
    -- 执行上下文
    execution_id VARCHAR(64),                       -- 关联的 Zeebe 执行实例
    job_key BIGINT,                                 -- Zeebe Job Key
    -- 输入/输出
    input_snapshot JSONB,                           -- 执行时的输入（含 config）
    output_snapshot JSONB,                          -- 执行输出
    -- 状态
    status VARCHAR(32) NOT NULL,                    -- CREATED / RUNNING / COMPLETED / FAILED / RETRY
    error_message TEXT,
    retry_count INT DEFAULT 0,
    -- 耗时
    start_time TIMESTAMPTZ,
    end_time TIMESTAMPTZ,
    duration_ms BIGINT,
    -- 元数据
    worker_host VARCHAR(255),                       -- 执行该节点的 Worker 主机
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_cneh_plan ON campaign_node_execution_history(plan_id);
CREATE INDEX idx_cneh_node ON campaign_node_execution_history(node_id);
CREATE INDEX idx_cneh_status ON campaign_node_execution_history(status);
CREATE INDEX idx_cneh_start ON campaign_node_execution_history(start_time DESC);
```
***
## 10.2 后端 Service 详细设计
### 10.2.1 核心接口：BaseNode
```java
package com.loyalty.platform.campaign.execution.node;
import com.fasterxml.jackson.databind.JsonNode;
import lombok.Builder;
import lombok.Data;
import java.util.Map;
/**
 * 节点执行上下文
 */
@Data
@Builder
public class NodeExecutionContext {
    private String planId;
    private String nodeId;
    private String nodeType;
    private JsonNode config;                // 节点配置
    private Map<String, Object> inputs;     // 上游传入的变量
    private Map<String, Object> sharedState; // 全局共享状态
    private String executionId;             // Zeebe 执行实例 ID
    private long processInstanceKey;        // Zeebe Process Instance Key
}
/**
 * 节点执行结果
 */
@Data
@Builder
public class NodeExecutionResult {
    private String nodeId;
    private String status;                  // SUCCESS / FAILED / SKIPPED
    private Map<String, Object> outputs;    // 输出变量（会传递给下游）
    private String errorMessage;
    private long durationMs;
}
/**
 * 节点处理器接口
 */
public interface NodeHandler {
    /**
     * 获取支持的节点类型
     */
    String getNodeType();
    
    /**
     * 校验配置（可选，Schema 校验之后）
     */
    default void validateConfig(JsonNode config) throws NodeConfigValidationException {
        // 默认无额外校验
    }
    
    /**
     * 执行核心逻辑
     */
    NodeExecutionResult execute(NodeExecutionContext context) throws NodeExecutionException;
}
```
### 10.2.2 基础抽象类：BaseNodeHandler
```java
package com.loyalty.platform.campaign.execution.node;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.extern.slf4j.Slf4j;
import java.time.Instant;
import java.util.HashMap;
import java.util.Map;
import java.util.UUID;
@Slf4j
public abstract class BaseNodeHandler implements NodeHandler {
    protected final ObjectMapper objectMapper = new ObjectMapper();
    /**
     * 执行模板方法：记录执行历史 + 异常处理
     */
    @Override
    public NodeExecutionResult execute(NodeExecutionContext context) {
        String nodeId = context.getNodeId();
        String nodeType = context.getNodeType();
        long startTime = System.currentTimeMillis();
        log.info("Node execution started: nodeId={}, type={}, planId={}",
                nodeId, nodeType, context.getPlanId());
        try {
            // 1. 前置校验
            validateConfig(context.getConfig());
            // 2. 执行业务逻辑（子类实现）
            Map<String, Object> outputs = doExecute(context);
            // 3. 构建成功结果
            long durationMs = System.currentTimeMillis() - startTime;
            log.info("Node execution completed: nodeId={}, duration={}ms", nodeId, durationMs);
            return NodeExecutionResult.builder()
                    .nodeId(nodeId)
                    .status("SUCCESS")
                    .outputs(outputs)
                    .durationMs(durationMs)
                    .build();
        } catch (NodeConfigValidationException e) {
            log.warn("Node config validation failed: nodeId={}, error={}", nodeId, e.getMessage());
            return NodeExecutionResult.builder()
                    .nodeId(nodeId)
                    .status("FAILED")
                    .errorMessage("Config validation failed: " + e.getMessage())
                    .durationMs(System.currentTimeMillis() - startTime)
                    .build();
        } catch (NodeExecutionException e) {
            log.error("Node execution failed: nodeId={}, error={}", nodeId, e.getMessage(), e);
            return NodeExecutionResult.builder()
                    .nodeId(nodeId)
                    .status("FAILED")
                    .errorMessage(e.getMessage())
                    .durationMs(System.currentTimeMillis() - startTime)
                    .build();
        } catch (Exception e) {
            log.error("Unexpected node error: nodeId={}, error={}", nodeId, e.getMessage(), e);
            return NodeExecutionResult.builder()
                    .nodeId(nodeId)
                    .status("FAILED")
                    .errorMessage("Unexpected error: " + e.getMessage())
                    .durationMs(System.currentTimeMillis() - startTime)
                    .build();
        }
    }
    /**
     * 子类实现具体业务逻辑
     */
    protected abstract Map<String, Object> doExecute(NodeExecutionContext context)
            throws NodeExecutionException;
    /**
     * 工具方法：从配置中获取值
     */
    protected String getConfigString(JsonNode config, String key) {
        return config.has(key) ? config.path(key).asText() : null;
    }
    protected Integer getConfigInt(JsonNode config, String key) {
        return config.has(key) ? config.path(key).asInt() : null;
    }
    protected Long getConfigLong(JsonNode config, String key) {
        return config.has(key) ? config.path(key).asLong() : null;
    }
    protected Boolean getConfigBoolean(JsonNode config, String key) {
        return config.has(key) ? config.path(key).asBoolean() : null;
    }
    protected JsonNode getConfigObject(JsonNode config, String key) {
        return config.has(key) ? config.path(key) : null;
    }
    /**
     * 从输入中获取值
     */
    @SuppressWarnings("unchecked")
    protected <T> T getInput(Map<String, Object> inputs, String key, Class<T> type) {
        Object value = inputs.get(key);
        if (value == null) return null;
        if (type.isInstance(value)) return type.cast(value);
        return null;
    }
    protected List<String> getInputStringList(Map<String, Object> inputs, String key) {
        Object value = inputs.get(key);
        if (value == null) return Collections.emptyList();
        if (value instanceof List) {
            return ((List<?>) value).stream()
                    .map(String::valueOf)
                    .collect(Collectors.toList());
        }
        return Collections.emptyList();
    }
}
```
### 10.2.3 节点注册表（NodeRegistry）
```java
package com.loyalty.platform.campaign.execution.node;
import com.fasterxml.jackson.databind.JsonNode;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;
import javax.annotation.PostConstruct;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
@Slf4j
@Component
@RequiredArgsConstructor
public class NodeRegistry {
    private final Map<String, NodeHandler> nodeHandlers = new ConcurrentHashMap<>();
    private final Map<String, NodeDefinition> nodeDefinitions = new ConcurrentHashMap<>();
    private final NodeDefinitionRepository definitionRepository;
    /**
     * 初始化：从数据库加载所有节点定义
     */
    @PostConstruct
    public void init() {
        List<NodeDefinition> definitions = definitionRepository.findAllActive();
        for (NodeDefinition def : definitions) {
            nodeDefinitions.put(def.getNodeType(), def);
            log.info("Loaded node definition: type={}, category={}", 
                    def.getNodeType(), def.getCategory());
        }
    }
    /**
     * 注册节点处理器
     */
    public void registerHandler(NodeHandler handler) {
        nodeHandlers.put(handler.getNodeType(), handler);
        log.info("Registered node handler: type={}", handler.getNodeType());
    }
    /**
     * 获取节点处理器
     */
    public NodeHandler getHandler(String nodeType) {
        NodeHandler handler = nodeHandlers.get(nodeType);
        if (handler == null) {
            throw new NodeNotFoundException("No handler registered for node type: " + nodeType);
        }
        return handler;
    }
    /**
     * 获取节点定义（Schema）
     */
    public NodeDefinition getDefinition(String nodeType) {
        NodeDefinition def = nodeDefinitions.get(nodeType);
        if (def == null) {
            throw new NodeNotFoundException("Node definition not found: " + nodeType);
        }
        return def;
    }
    /**
     * 校验节点配置（基于 Schema）
     */
    public NodeConfigValidationResult validateConfig(String nodeType, JsonNode config) {
        NodeDefinition def = getDefinition(nodeType);
        JsonNode configSchema = def.getConfigSchema();
        // 使用 JSON Schema 校验
        // 实现略（使用 everit-json-schema 或 networknt JSON Schema）
        // 返回校验结果
        // 如果有 Handler，额外校验
        NodeHandler handler = nodeHandlers.get(nodeType);
        if (handler != null) {
            try {
                handler.validateConfig(config);
            } catch (NodeConfigValidationException e) {
                return NodeConfigValidationResult.error(e.getMessage());
            }
        }
        return NodeConfigValidationResult.success();
    }
    /**
     * 获取所有节点类型（供前端使用）
     */
    public List<NodeDefinition> getAllDefinitions() {
        return new ArrayList<>(nodeDefinitions.values());
    }
    /**
     * 按分类获取节点类型
     */
    public List<NodeDefinition> getDefinitionsByCategory(String category) {
        return nodeDefinitions.values().stream()
                .filter(d -> d.getCategory().equals(category))
                .collect(Collectors.toList());
    }
}
```
### 10.2.4 具体节点 Handler 实现示例
#### AudienceFilterNodeHandler（人群筛选）
```java
package com.loyalty.platform.campaign.execution.node.handler;
import com.fasterxml.jackson.databind.JsonNode;
import com.loyalty.platform.campaign.execution.node.BaseNodeHandler;
import com.loyalty.platform.campaign.execution.node.NodeExecutionContext;
import com.loyalty.platform.campaign.execution.node.NodeExecutionException;
import com.loyalty.platform.campaign.planning.repository.CampaignMemberDimRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
@Slf4j
@Component
@RequiredArgsConstructor
public class AudienceFilterNodeHandler extends BaseNodeHandler {
    private final CampaignMemberDimRepository memberDimRepository;
    @Override
    public String getNodeType() {
        return "AUDIENCE_FILTER";
    }
    @Override
    protected Map<String, Object> doExecute(NodeExecutionContext context)
            throws NodeExecutionException {
        JsonNode config = context.getConfig();
        String segmentCode = getConfigString(config, "segmentCode");
        Integer limit = getConfigInt(config, "limit");
        if (limit == null) limit = 10000;
        if (segmentCode == null || segmentCode.isEmpty()) {
            throw new NodeExecutionException("segmentCode is required for AUDIENCE_FILTER");
        }
        log.info("AudienceFilterNode: segmentCode={}, limit={}, planId={}",
                segmentCode, limit, context.getPlanId());
        // 从 Campaign 宽表查询会员
        List<String> memberIds = memberDimRepository.findMemberIdsBySegment(segmentCode, limit);
        // 构建输出
        Map<String, Object> outputs = new HashMap<>();
        outputs.put("memberIds", memberIds);
        outputs.put("count", memberIds.size());
        outputs.put("segmentCode", segmentCode);
        outputs.put("filteredAt", Instant.now().toString());
        return outputs;
    }
    @Override
    public void validateConfig(JsonNode config) throws NodeConfigValidationException {
        String segmentCode = getConfigString(config, "segmentCode");
        if (segmentCode == null || segmentCode.isEmpty()) {
            throw new NodeConfigValidationException("segmentCode is required");
        }
        Integer limit = getConfigInt(config, "limit");
        if (limit != null && limit > 100000) {
            throw new NodeConfigValidationException("limit cannot exceed 100000");
        }
    }
}
```
#### SendEmailNodeHandler（发送邮件）—— 调用 Loyalty ChannelService
```java
package com.loyalty.platform.campaign.execution.node.handler;
import com.fasterxml.jackson.databind.JsonNode;
import com.loyalty.platform.campaign.execution.node.BaseNodeHandler;
import com.loyalty.platform.campaign.execution.node.NodeExecutionContext;
import com.loyalty.platform.campaign.execution.node.NodeExecutionException;
import com.loyalty.platform.campaign.content.ContentService;
import com.loyalty.platform.loyalty.channel.ChannelService;
import com.loyalty.platform.loyalty.member.MemberService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.atomic.AtomicInteger;
@Slf4j
@Component
@RequiredArgsConstructor
public class SendEmailNodeHandler extends BaseNodeHandler {
    private final ChannelService channelService;      // Loyalty 服务
    private final MemberService memberService;        // Loyalty 服务
    private final ContentService contentService;
    @Override
    public String getNodeType() {
        return "SEND_EMAIL";
    }
    @Override
    protected Map<String, Object> doExecute(NodeExecutionContext context)
            throws NodeExecutionException {
        // 1. 从输入获取 memberIds（来自上游节点）
        List<String> memberIds = getInputStringList(context.getInputs(), "memberIds");
        if (memberIds == null || memberIds.isEmpty()) {
            throw new NodeExecutionException("No memberIds provided in input");
        }
        // 2. 从配置获取参数
        JsonNode config = context.getConfig();
        String assetId = getConfigString(config, "assetId");
        Integer retryCount = getConfigInt(config, "retryCount");
        if (retryCount == null) retryCount = 3;
        Integer rateLimit = getConfigInt(config, "rateLimit");
        if (rateLimit == null) rateLimit = 1000;
        if (assetId == null || assetId.isEmpty()) {
            throw new NodeExecutionException("assetId is required for SEND_EMAIL");
        }
        log.info("SendEmailNode: sending {} emails, assetId={}, planId={}",
                memberIds.size(), assetId, context.getPlanId());
        // 3. 执行发送
        AtomicInteger successCount = new AtomicInteger(0);
        AtomicInteger failCount = new AtomicInteger(0);
        // 批量发送（带限流和重试）
        memberIds.parallelStream().forEach(memberId -> {
            boolean success = false;
            int attempts = 0;
            while (!success && attempts < retryCount) {
                try {
                    // 3a. 获取会员信息（Loyalty）
                    Member member = memberService.findByMemberId(memberId);
                    if (member == null || member.getEmail() == null) {
                        failCount.incrementAndGet();
                        break;
                    }
                    // 3b. 幂等检查（使用 IdempotencyManager）
                    String idempotencyKey = buildIdempotencyKey(
                            context.getPlanId(), context.getNodeId(), memberId);
                    if (!idempotencyManager.checkAndMark(idempotencyKey)) {
                        // 已发送，跳过
                        success = true;
                        break;
                    }
                    // 3c. 渲染内容（Loyalty ContentService）
                    String content = contentService.renderContent(assetId, member);
                    // 3d. 发送邮件（Loyalty ChannelService）
                    channelService.sendEmail(member.getEmail(), content);
                    success = true;
                    successCount.incrementAndGet();
                } catch (Exception e) {
                    attempts++;
                    log.warn("Email send failed (attempt {}/{}): memberId={}, error={}",
                            attempts, retryCount, memberId, e.getMessage());
                    if (attempts >= retryCount) {
                        failCount.incrementAndGet();
                    }
                    try {
                        Thread.sleep(1000 * attempts); // 指数退避
                    } catch (InterruptedException ignored) {}
                }
            }
        });
        // 4. 构建输出
        Map<String, Object> outputs = new HashMap<>();
        outputs.put("successCount", successCount.get());
        outputs.put("failCount", failCount.get());
        outputs.put("totalCount", memberIds.size());
        outputs.put("assetId", assetId);
        outputs.put("sentAt", Instant.now().toString());
        log.info("SendEmailNode completed: success={}, fail={}, total={}",
                successCount.get(), failCount.get(), memberIds.size());
        return outputs;
    }
    @Override
    public void validateConfig(JsonNode config) throws NodeConfigValidationException {
        String assetId = getConfigString(config, "assetId");
        if (assetId == null || assetId.isEmpty()) {
            throw new NodeConfigValidationException("assetId is required");
        }
        Boolean requireApproval = getConfigBoolean(config, "requireApproval");
        if (Boolean.TRUE.equals(requireApproval)) {
            // 如果要求审批，需要检查 asset 是否已审批（由调用方检查）
        }
    }
    private String buildIdempotencyKey(String planId, String nodeId, String userId) {
        return planId + ":" + nodeId + ":" + userId;
    }
}
```
### 10.2.5 节点配置校验器（统一入口）
```java
package com.loyalty.platform.campaign.execution.node;
import com.fasterxml.jackson.databind.JsonNode;
import com.networknt.schema.JsonSchema;
import com.networknt.schema.JsonSchemaFactory;
import com.networknt.schema.SpecVersion;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import java.util.Set;
@Slf4j
@Service
@RequiredArgsConstructor
public class NodeConfigValidator {
    private final NodeRegistry nodeRegistry;
    /**
     * 统一配置校验入口
     */
    public ValidationResult validate(String nodeType, JsonNode config) {
        NodeDefinition def = nodeRegistry.getDefinition(nodeType);
        JsonNode configSchema = def.getConfigSchema();
        // 1. JSON Schema 校验
        if (configSchema != null && !configSchema.isNull()) {
            JsonSchemaFactory factory = JsonSchemaFactory.getInstance(SpecVersion.VersionFlag.V7);
            JsonSchema schema = factory.getSchema(configSchema.toString());
            Set<ValidationMessage> errors = schema.validate(config);
            if (!errors.isEmpty()) {
                return ValidationResult.failed(errors);
            }
        }
        // 2. Handler 自定义校验
        NodeHandler handler = nodeRegistry.getHandler(nodeType);
        try {
            handler.validateConfig(config);
        } catch (NodeConfigValidationException e) {
            return ValidationResult.failed(e.getMessage());
        }
        return ValidationResult.success();
    }
    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class ValidationResult {
        private boolean valid;
        private List<String> errors;
        public static ValidationResult success() {
            return ValidationResult.builder().valid(true).errors(Collections.emptyList()).build();
        }
        public static ValidationResult failed(String error) {
            return ValidationResult.builder().valid(false).errors(List.of(error)).build();
        }
        public static ValidationResult failed(Set<ValidationMessage> messages) {
            List<String> errors = messages.stream()
                    .map(ValidationMessage::getMessage)
                    .collect(Collectors.toList());
            return ValidationResult.builder().valid(false).errors(errors).build();
        }
    }
}
```
***
## 10.3 Node Type Config Schema 完整清单
以下为各节点类型的 Schema 定义，供后端数据库初始化使用。
### 10.3.1 AUDIENCE\_FILTER
```json
{
  "type": "object",
  "required": ["segmentCode"],
  "properties": {
    "segmentCode": {
      "type": "string",
      "description": "目标分群标识",
      "minLength": 1
    },
    "limit": {
      "type": "integer",
      "description": "最大筛选人数",
      "minimum": 1,
      "maximum": 100000,
      "default": 10000
    },
    "filters": {
      "type": "array",
      "description": "额外筛选条件",
      "items": {
        "type": "object",
        "properties": {
          "field": { "type": "string" },
          "operator": { "enum": ["eq", "ne", "gt", "gte", "lt", "lte", "contains", "in"] },
          "value": { "type": ["string", "number", "boolean", "array"] }
        },
        "required": ["field", "operator", "value"]
      }
    }
  }
}
```
### 10.3.2 CONDITION
```json
{
  "type": "object",
  "required": ["field", "operator", "value"],
  "properties": {
    "field": {
      "type": "string",
      "description": "判断字段（来自上游变量）"
    },
    "operator": {
      "type": "string",
      "enum": ["eq", "ne", "gt", "gte", "lt", "lte", "contains", "startsWith", "endsWith", "in"],
      "description": "比较操作符"
    },
    "value": {
      "description": "比较值",
      "oneOf": [
        { "type": "string" },
        { "type": "number" },
        { "type": "boolean" },
        { "type": "array" }
      ]
    }
  }
}
```
### 10.3.3 SEND\_EMAIL
```json
{
  "type": "object",
  "required": ["assetId"],
  "properties": {
    "assetId": {
      "type": "string",
      "description": "内容素材 ID",
      "minLength": 1
    },
    "requireApproval": {
      "type": "boolean",
      "description": "是否需要审批",
      "default": false
    },
    "retryCount": {
      "type": "integer",
      "description": "失败重试次数",
      "minimum": 0,
      "maximum": 5,
      "default": 3
    },
    "rateLimit": {
      "type": "integer",
      "description": "每秒最大发送量",
      "minimum": 1,
      "maximum": 10000,
      "default": 1000
    }
  }
}
```
### 10.3.4 OFFER\_POINTS
```json
{
  "type": "object",
  "required": ["pointType", "amount"],
  "properties": {
    "pointType": {
      "type": "string",
      "description": "积分类型（TIER_POINTS / REWARD_POINTS）",
      "enum": ["TIER_POINTS", "REWARD_POINTS", "CAMPAIGN_BONUS"]
    },
    "amount": {
      "type": "number",
      "description": "积分数量",
      "minimum": 0.01
    },
    "reason": {
      "type": "string",
      "description": "发放原因",
      "maxLength": 255
    }
  }
}
```
### 10.3.5 DELAY
```json
{
  "type": "object",
  "required": ["duration", "unit"],
  "properties": {
    "duration": {
      "type": "integer",
      "description": "延迟时长",
      "minimum": 1
    },
    "unit": {
      "type": "string",
      "enum": ["milliseconds", "seconds", "minutes", "hours", "days"],
      "description": "时间单位",
      "default": "minutes"
    }
  }
}
```
### 10.3.6 APPROVAL
```json
{
  "type": "object",
  "properties": {
    "approverId": {
      "type": "string",
      "description": "指定审批人 ID"
    },
    "approverGroup": {
      "type": "string",
      "description": "审批人组（角色）"
    },
    "timeoutHours": {
      "type": "integer",
      "description": "审批超时（小时）",
      "minimum": 1,
      "maximum": 168,
      "default": 24
    },
    "autoReject": {
      "type": "boolean",
      "description": "超时是否自动拒绝",
      "default": true
    }
  }
}
```
### 10.3.7 AI\_SCORE
```json
{
  "type": "object",
  "required": ["modelType"],
  "properties": {
    "modelType": {
      "type": "string",
      "enum": ["churn", "uplift", "conversion", "custom"],
      "description": "模型类型"
    },
    "modelId": {
      "type": "string",
      "description": "自定义模型 ID（当 modelType 为 custom 时必填）"
    },
    "threshold": {
      "type": "number",
      "description": "评分阈值",
      "minimum": 0,
      "maximum": 1,
      "default": 0.7
    },
    "batchSize": {
      "type": "integer",
      "description": "批处理大小",
      "minimum": 1,
      "maximum": 1000,
      "default": 500
    }
  }
}
```
***
## 10.4 前端设计（动态表单）
### 10.4.1 配置面板架构
```text
┌─────────────────────────────────────────────────────────────────────────────┐
│                    Inspector Panel (动态配置面板)                           │
│                                                                             │
│  节点类型: AUDIENCE_FILTER  节点名称: [人群筛选_1]                          │
├─────────────────────────────────────────────────────────────────────────────┤
│  ┌─ 基础配置 ────────────────────────────────────────────────────────────┐ │
│  │  分群标识: [HIGH_VALUE           ▼]    (下拉选择)                    │ │
│  │  最大人数: [  10000  ]  (数字输入框)                                 │ │
│  └───────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
│  ┌─ 高级配置 ────────────────────────────────────────────────────────────┐ │
│  │  [+ 添加筛选条件]                                                     │ │
│  │  字段          │ 操作符    │ 值                 │ 操作               │ │
│  │  lastOrderDays │  >        │ 30                 │ [×]               │ │
│  │  totalAmount   │  >        │ 5000               │ [×]               │ │
│  └───────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
│  [✅ 保存] [🔄 重置] [📋 查看JSON]                                         │
└─────────────────────────────────────────────────────────────────────────────┘
```
### 10.4.2 动态表单渲染核心
```typescript
// components/canvas/ConfigPanel.tsx
import React, { useEffect, useState } from 'react';
import { useNodeRegistry } from '../hooks/useNodeRegistry';
import { DynamicForm } from '../components/DynamicForm';
interface ConfigPanelProps {
  nodeId: string;
  nodeType: string;
  initialConfig: Record<string, any>;
  onSave: (config: Record<string, any>) => void;
}
export const ConfigPanel: React.FC<ConfigPanelProps> = ({
  nodeId,
  nodeType,
  initialConfig,
  onSave
}) => {
  const { getDefinition, validateConfig } = useNodeRegistry();
  const [config, setConfig] = useState(initialConfig);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const definition = getDefinition(nodeType);
  const configSchema = definition?.configSchema;
  // 根据 Schema 动态生成表单字段
  const fields = useMemo(() => {
    if (!configSchema) return [];
    return generateFieldsFromSchema(configSchema);
  }, [configSchema]);
  const handleFieldChange = (field: string, value: any) => {
    setConfig(prev => ({ ...prev, [field]: value }));
  };
  const handleSave = async () => {
    // 后端校验
    const result = await validateConfig(nodeType, config);
    if (!result.valid) {
      setValidationErrors(result.errors);
      return;
    }
    setValidationErrors([]);
    onSave(config);
  };
  return (
    <div className="config-panel">
      <div className="panel-header">
        <h3>{definition?.name || nodeType}</h3>
        <span className="node-type-badge">{nodeType}</span>
      </div>
      
      <div className="panel-body">
        <DynamicForm
          fields={fields}
          values={config}
          onChange={handleFieldChange}
        />
        
        {validationErrors.length > 0 && (
          <div className="validation-errors">
            {validationErrors.map((err, idx) => (
              <div key={idx} className="error-item">❌ {err}</div>
            ))}
          </div>
        )}
      </div>
      
      <div className="panel-footer">
        <button onClick={handleSave} className="btn-primary">
          💾 保存配置
        </button>
      </div>
    </div>
  );
};
```
### 10.4.3 动态表单字段生成器
```typescript
// utils/form-generator.ts
import { JSONSchema7 } from 'json-schema';
interface FormField {
  key: string;
  label: string;
  type: 'text' | 'number' | 'select' | 'boolean' | 'array' | 'object';
  required: boolean;
  description?: string;
  options?: Array<{ label: string; value: any }>;
  defaultValue?: any;
  min?: number;
  max?: number;
  children?: FormField[];
}
export function generateFieldsFromSchema(
  schema: JSONSchema7,
  parentKey: string = ''
): FormField[] {
  const fields: FormField[] = [];
  if (!schema || !schema.properties) return fields;
  for (const [key, prop] of Object.entries(schema.properties)) {
    const propSchema = prop as JSONSchema7;
    const isRequired = schema.required?.includes(key) || false;
    const field: FormField = {
      key: parentKey ? `${parentKey}.${key}` : key,
      label: key,
      required: isRequired,
      description: propSchema.description,
      defaultValue: propSchema.default
    };
    // 根据类型映射
    switch (propSchema.type) {
      case 'string':
        if (propSchema.enum) {
          field.type = 'select';
          field.options = propSchema.enum.map((v: any) => ({
            label: String(v),
            value: v
          }));
        } else {
          field.type = 'text';
        }
        break;
      case 'number':
      case 'integer':
        field.type = 'number';
        field.min = propSchema.minimum;
        field.max = propSchema.maximum;
        break;
      case 'boolean':
        field.type = 'boolean';
        break;
      case 'array':
        field.type = 'array';
        if (propSchema.items && typeof propSchema.items === 'object') {
          field.children = generateFieldsFromSchema(
            propSchema.items as JSONSchema7,
            key
          );
        }
        break;
      case 'object':
        field.type = 'object';
        field.children = generateFieldsFromSchema(propSchema, key);
        break;
      default:
        field.type = 'text';
    }
    fields.push(field);
  }
  return fields;
}
```
***
## 10.5 前后端 JSON 交互
### 10.5.1 获取节点定义（供前端渲染）
**Request:**
```json
GET /api/campaign/nodes/definitions
```
**Response:**
```json
{
  "code": 0,
  "data": [
    {
      "nodeType": "AUDIENCE_FILTER",
      "category": "INPUT",
      "name": "人群筛选",
      "description": "根据分群和条件筛选目标用户",
      "icon": "👥",
      "color": "#3b82f6",
      "configSchema": {
        "type": "object",
        "required": ["segmentCode"],
        "properties": {
          "segmentCode": { "type": "string", "description": "目标分群标识" },
          "limit": { "type": "integer", "description": "最大筛选人数", "default": 10000 }
        }
      },
      "zeebeWorkerType": "campaign-audience-filter"
    },
    // ... 更多节点定义
  ]
}
```
### 10.5.2 校验节点配置
**Request:**
```json
POST /api/campaign/nodes/validate
{
  "nodeType": "AUDIENCE_FILTER",
  "config": {
    "segmentCode": "HIGH_VALUE",
    "limit": 10000
  }
}
```
**Response:**
```json
{
  "code": 0,
  "data": {
    "valid": true,
    "errors": []
  }
}
```
### 10.5.3 节点执行（通过 Worker）
节点执行由 Zeebe Worker 完成，Worker 读取 Job 的 variables（即 Node 的 Config + 上游 Input），调用 NodeHandler，返回结果。
```java
// 在 Zeebe Worker 中调用 NodeHandler
@JobWorker(type = "campaign-audience-filter")
public void handle(JobClient client, ActivatedJob job) {
    Map<String, Object> variables = job.getVariablesAsMap();
    
    // 构建 NodeExecutionContext
    NodeExecutionContext context = NodeExecutionContext.builder()
            .planId((String) variables.get("planId"))
            .nodeId((String) variables.get("nodeId"))
            .nodeType("AUDIENCE_FILTER")
            .config(JsonUtil.toJsonNode(variables.get("config")))
            .inputs(variables)
            .processInstanceKey(job.getProcessInstanceKey())
            .build();
    
    // 执行
    NodeHandler handler = nodeRegistry.getHandler("AUDIENCE_FILTER");
    NodeExecutionResult result = handler.execute(context);
    
    // 完成 Job
    client.newCompleteCommand(job.getKey())
            .variables(result.getOutputs())
            .send()
            .join();
}
```
***
## 10.6 异常处理与业务规则
### 10.6.1 节点异常枚举
```java
public enum NodeErrorCode {
    NODE_TYPE_NOT_FOUND("N001", "Node type not found"),
    NODE_HANDLER_NOT_FOUND("N002", "Node handler not found"),
    NODE_CONFIG_INVALID("N003", "Node configuration is invalid"),
    NODE_CONFIG_MISSING_REQUIRED("N004", "Required config field missing: {field}"),
    NODE_EXECUTION_FAILED("N005", "Node execution failed"),
    NODE_TIMEOUT("N006", "Node execution timeout"),
    NODE_RETRY_EXHAUSTED("N007", "Node retry exhausted");
}
```
### 10.6.2 节点超时控制
```java
@Component
public class NodeTimeoutHandler {
    
    @Value("${node.execution.timeout.seconds:60}")
    private int defaultTimeout;
    
    public NodeExecutionResult executeWithTimeout(NodeExecutionContext context,
                                                   NodeHandler handler) {
        // 根据节点类型获取超时配置
        int timeout = getTimeoutForNodeType(context.getNodeType());
        
        Future<NodeExecutionResult> future = executor.submit(() -> {
            return handler.execute(context);
        });
        
        try {
            return future.get(timeout, TimeUnit.SECONDS);
        } catch (TimeoutException e) {
            future.cancel(true);
            log.error("Node execution timeout: nodeId={}, timeout={}s",
                    context.getNodeId(), timeout);
            return NodeExecutionResult.builder()
                    .nodeId(context.getNodeId())
                    .status("FAILED")
                    .errorMessage("Execution timeout after " + timeout + "s")
                    .build();
        } catch (Exception e) {
            log.error("Node execution error: {}", e.getMessage());
            return NodeExecutionResult.builder()
                    .nodeId(context.getNodeId())
                    .status("FAILED")
                    .errorMessage(e.getMessage())
                    .build();
        }
    }
}
```
***
## 10.7 与 Loyalty 系统的集成点
| 集成点             | Loyalty 能力                            | 使用方式                           |
| --------------- | ------------------------------------- | ------------------------------ |
| **会员查询**        | `MemberService.findByMemberId()`      | AudienceFilter、SendEmail 等节点调用 |
| **积分发放**        | `PointGrantService.grantPoints()`     | OfferPointsNodeHandler 调用      |
| **优惠券发放**       | `CouponService.issueCoupon()`         | OfferCouponNodeHandler 调用      |
| **消息发送**        | `ChannelService.sendEmail/SMS/Push()` | SendEmail/SMS/Push 节点调用        |
| **等级变更**        | `TierService.upgrade()`               | TierUpgradeNodeHandler 调用      |
| **规则引擎**        | `RuleEngineService.evaluate()`        | ConditionNodeHandler 调用（可选）    |
| **EventBridge** | 事件发布                                  | 节点执行完成后发布 `NODE_EXECUTED` 事件   |
***
## 10.8 开发实施检查清单
* 创建 `campaign_node_definition` 表
* 创建 `campaign_node_execution_history` 表
* 实现 `NodeHandler` 接口和 `BaseNodeHandler` 抽象类
* 实现所有节点 Handler（12+ 种）
  * AudienceFilterNodeHandler
  * AIScoreNodeHandler
  * ConditionNodeHandler
  * SendEmailNodeHandler
  * SendSMSNodeHandler
  * SendPushNodeHandler
  * OfferPointsNodeHandler
  * OfferCouponNodeHandler
  * TierUpgradeNodeHandler
  * WebhookNodeHandler
  * DelayNodeHandler
  * ApprovalNodeHandler
* 实现 `NodeRegistry`（加载 + 注册）
* 实现 `NodeConfigValidator`（JSON Schema 校验）
* 初始化节点 Schema 数据（12+ 条）
* 前端实现 `DynamicForm` 组件
* 前端实现 `ConfigPanel`（动态配置面板）
* 前端实现节点定义获取 API 调用
* 实现节点执行历史记录
* 编写单元测试（每个 Handler 的测试覆盖率 > 80%）
* 编写集成测试（端到端：配置 → 校验 → 执行）
