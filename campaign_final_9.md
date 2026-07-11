## 第9章：Canvas → BPMN Compiler（含 AI→DAG Prompt 体系）详细设计
Canvas → BPMN Compiler 是 Campaign Tools 的**“语义降级引擎”**，将前端画布（React Flow）中可视化编排的 DAG（JSON）转化为 Zeebe 可执行的 BPMN XML。同时，本章涵盖 AI 生成 DAG 的 Prompt 工程体系，使运营人员能够通过自然语言描述生成可执行的工作流骨架。
***
## 9.0 模块概述
### 9.0.1 本质定义
Compiler 是一个**“图 → 状态机”的转换器**：
* **输入**：Canvas DAG（JSON），包含 nodes 和 edges
* **处理**：语义分析 → 流规范化 → BPMN 图构建 → XML 生成
* **输出**：Zeebe BPMN XML，可直接部署到 Zeebe 引擎
### 9.0.2 核心设计原则
| 原则            | 说明                                                       |
| ------------- | -------------------------------------------------------- |
| **双输出支持**     | 支持 LiteFlow EL 和 Zeebe BPMN 双输出（生产统一用 Zeebe）             |
| **严格校验**      | 输入 DAG 必须通过语义校验（无环、无孤立节点、类型合法）                           |
| **AI 辅助生成**   | AI 生成受约束的 DAG JSON，Compiler 只做确定性转换，不依赖 AI 判断            |
| **Worker 绑定** | 每个 Node 类型映射到固定的 Zeebe Worker Type，由 `WorkerRegistry` 管理 |
### 9.0.3 编译器在系统中的位置
```text
┌─────────────────────────────────────────────────────────────────────────────┐
│                         整体执行链路                                        │
│                                                                             │
│  AI Planner (自然语言)                                                     │
│       │                                                                     │
│       ▼ (生成 DAG JSON)                                                    │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                    Canvas UI (人工编辑)                              │   │
│  │                    DAG JSON (nodes + edges)                         │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                    │                                        │
│                                    ▼                                        │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │              Canvas → BPMN Compiler (本章)                          │   │
│  │  语义分析 → 流规范化 → BPMN 图构建 → XML 生成                       │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                    │                                        │
│                                    ▼                                        │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │              Zeebe Deploy Service (第5章)                           │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                    │                                        │
│                                    ▼                                        │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │              Zeebe Workflow Engine + Workers (第5章)                │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────┘
```
***
## 9.1 编译器总体架构
### 9.1.1 编译流水线
```text
┌─────────────────────────────────────────────────────────────────────────────┐
│                    Compiler Pipeline                                        │
│                                                                             │
│  CanvasGraph (JSON)                                                        │
│       │                                                                     │
│       ▼                                                                     │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  1. Semantic Analyzer (语义分析器)                                  │   │
│  │     · 校验节点类型是否合法                                          │   │
│  │     · 检测循环依赖 (Cycle Detection)                               │   │
│  │     · 校验端口连接合法性                                            │   │
│  │     · 检测孤立节点                                                  │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│       │                                                                     │
│       ▼ (校验通过)                                                         │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  2. Flow Normalizer (流规范化)                                     │   │
│  │     · 确保有且仅有一个 START 节点                                   │   │
│  │     · 确保有且仅有一个 END 节点                                     │   │
│  │     · 补全隐式连接                                                  │   │
│  │     · 扁平化子图                                                    │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│       │                                                                     │
│       ▼                                                                     │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  3. BPMN Graph Builder (BPMN 图构建)                              │   │
│  │     · Node → BPMN Element 映射                                     │   │
│  │     · 生成唯一 BPMN ID                                             │   │
│  │     · 构建流程边 (SequenceFlow)                                    │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│       │                                                                     │
│       ▼                                                                     │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  4. Zeebe BPMN Generator (XML 生成)                               │   │
│  │     · 应用 Zeebe 扩展命名空间                                       │   │
│  │     · 生成 taskDefinition                                          │   │
│  │     · 生成 timerEventDefinition (DELAY)                            │   │
│  │     · 生成 conditionExpression (CONDITION)                         │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│       │                                                                     │
│       ▼                                                                     │
│  Zeebe BPMN XML                                                           │
└─────────────────────────────────────────────────────────────────────────────┘
```
### 9.1.2 双编译器架构（LiteFlow + Zeebe）
```java
public interface CanvasCompiler {
    String getEngineType();
    String compile(CanvasGraph graph);
    boolean supports(NodeType nodeType);
}
@Component
public class LiteFlowCompiler implements CanvasCompiler {
    @Override
    public String getEngineType() { return "LITEFLOW"; }
    
    @Override
    public String compile(CanvasGraph graph) {
        // 生成 LiteFlow EL 表达式
        // 注：Campaign 生产环境不使用 LiteFlow，但保留用于测试
        return generateLiteFlowEL(graph);
    }
}
@Component
public class ZeebeCompiler implements CanvasCompiler {
    @Override
    public String getEngineType() { return "ZEEBE"; }
    
    @Override
    public String compile(CanvasGraph graph) {
        // 生成 Zeebe BPMN XML（核心路径）
        return generateZeebeBPMN(graph);
    }
}
@Service
public class CompilerService {
    @Autowired
    private List<CanvasCompiler> compilers;
    
    @Autowired
    private CanvasValidator canvasValidator;
    
    public CompilationResult compile(String canvasId, JsonNode graph, String engineType) {
        // 1. 解析 Canvas Graph
        CanvasGraph canvasGraph = parseGraph(graph);
        
        // 2. 语义校验
        ValidationResult validation = canvasValidator.validate(canvasGraph);
        if (!validation.isValid()) {
            return CompilationResult.error(validation.getErrors());
        }
        
        // 3. 选择编译器
        CanvasCompiler compiler = compilers.stream()
            .filter(c -> c.getEngineType().equalsIgnoreCase(engineType))
            .findFirst()
            .orElseThrow(() -> new UnsupportedOperationException("Unknown engine: " + engineType));
        
        // 4. 编译
        String compiledContent = compiler.compile(canvasGraph);
        
        return CompilationResult.builder()
            .engineType(engineType)
            .compiledContent(compiledContent)
            .nodeCount(canvasGraph.getNodes().size())
            .edgeCount(canvasGraph.getEdges().size())
            .validation(validation)
            .build();
    }
}
```
***
## 9.2 数据模型设计（编译相关）
### 9.2.1 扩展 campaign\_plan 表（已包含）
sql
```
-- 已在第1章定义，此处确认字段
-- campaign_plan 表已有 graph_json (Canvas DAG)
-- 编译后存储：
ALTER TABLE campaign_plan ADD COLUMN compiled_bpmn_xml TEXT;
ALTER TABLE campaign_plan ADD COLUMN compiled_engine_type VARCHAR(32) DEFAULT 'ZEEBE';
ALTER TABLE campaign_plan ADD COLUMN compile_time TIMESTAMPTZ;
ALTER TABLE campaign_plan ADD COLUMN compile_version INT DEFAULT 1;
```
### 9.2.2 编译日志表（campaign\_compile\_log）
sql
```
CREATE TABLE campaign_compile_log (
    id VARCHAR(64) PRIMARY KEY,
    plan_id VARCHAR(64) NOT NULL,
    engine_type VARCHAR(32) NOT NULL,
    status VARCHAR(32) NOT NULL,                    -- SUCCESS / FAILED / VALIDATION_ERROR
    node_count INT,
    edge_count INT,
    bpmn_size_bytes INT,
    validation_errors JSONB,                        -- 校验错误列表
    validation_warnings JSONB,                      -- 校验警告列表
    compile_duration_ms BIGINT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_ccl_plan ON campaign_compile_log(plan_id);
CREATE INDEX idx_ccl_created ON campaign_compile_log(created_at DESC);
```
***
## 9.3 核心编译器实现（Zeebe）
### 9.3.1 Canvas → BPMN 核心编译器
```java
package com.loyalty.platform.campaign.execution.compiler;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;
import java.util.*;
import java.util.stream.Collectors;
@Slf4j
@Component
@RequiredArgsConstructor
public class CanvasToBpmnCompiler {
    private final ObjectMapper objectMapper;
    private final WorkerBindingRegistry workerRegistry;
    private static final String BPMN_TEMPLATE = """
        <?xml version="1.0" encoding="UTF-8"?>
        <bpmn:definitions
            xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL"
            xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI"
            xmlns:dc="http://www.omg.org/spec/DD/20100524/DC"
            xmlns:zeebe="http://camunda.org/schema/zeebe/1.0"
            xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
            id="Definitions_%s"
            targetNamespace="http://bpmn.io/schema/bpmn">
          <bpmn:process id="%s" isExecutable="true" isClosed="false">
            %s
          </bpmn:process>
          %s
        </bpmn:definitions>
        """;
    private static final String BPMN_PROCESS_ID_PREFIX = "campaign_";
    /**
     * 编译 Canvas DAG 为 Zeebe BPMN XML
     */
    public String compile(String canvasId, JsonNode graph) {
        log.info("Compiling canvas: {}", canvasId);
        // 1. 解析 Graph
        List<JsonNode> nodes = extractNodes(graph);
        List<JsonNode> edges = extractEdges(graph);
        // 2. 拓扑排序
        List<String> sortedNodeIds = topologicalSort(nodes, edges);
        // 3. 生成 BPMN Process ID
        String processId = BPMN_PROCESS_ID_PREFIX + sanitizeId(canvasId);
        // 4. 构建 BPMN 内容
        StringBuilder bpmnContent = new StringBuilder();
        // 4a. Start Event
        bpmnContent.append(generateStartEvent());
        // 4b. 节点（按拓扑顺序）
        Map<String, String> nodeIdToBpmnId = new HashMap<>();
        int seq = 0;
        for (String nodeId : sortedNodeIds) {
            JsonNode node = findNode(nodes, nodeId);
            String bpmnId = "Activity_" + (++seq);
            nodeIdToBpmnId.put(nodeId, bpmnId);
            bpmnContent.append(generateNodeBpmn(bpmnId, node));
        }
        // 4c. End Event
        String endEventId = "EndEvent_1";
        bpmnContent.append(generateEndEvent(endEventId));
        // 4d. Sequence Flows（连线）
        bpmnContent.append(generateSequenceFlows(edges, nodeIdToBpmnId));
        // 5. 组装 BPMN
        String bpmnXml = String.format(BPMN_TEMPLATE,
                sanitizeId(canvasId),
                processId,
                bpmnContent.toString(),
                generateBPMNDiagram(nodes, edges, nodeIdToBpmnId)
        );
        log.info("Compilation completed: canvasId={}, nodes={}, edges={}",
                canvasId, nodes.size(), edges.size());
        return bpmnXml;
    }
    /**
     * 生成节点 BPMN
     */
    private String generateNodeBpmn(String bpmnId, JsonNode node) {
        String nodeType = node.path("type").asText();
        String nodeName = node.has("name") ? node.path("name").asText() : nodeType;
        JsonNode config = node.path("config");
        switch (nodeType) {
            case "AUDIENCE_FILTER":
            case "AI_SCORE":
            case "SEND_EMAIL":
            case "SEND_SMS":
            case "SEND_PUSH":
            case "OFFER_POINTS":
            case "OFFER_COUPON":
            case "TIER_UPGRADE":
            case "WEBHOOK":
                return generateServiceTask(bpmnId, nodeName, nodeType, config);
            case "CONDITION":
                return generateExclusiveGateway(bpmnId, nodeName);
            case "SPLIT":
                return generateParallelGateway(bpmnId, nodeName, "SPLIT");
            case "MERGE":
                return generateParallelGateway(bpmnId, nodeName, "MERGE");
            case "DELAY":
                return generateTimerCatchEvent(bpmnId, nodeName, config);
            case "WAIT_EVENT":
                return generateMessageCatchEvent(bpmnId, nodeName, config);
            case "APPROVAL":
                return generateUserTask(bpmnId, nodeName, config);
            case "START":
                // Start Event 已在外部生成
                return "";
            case "END":
                // End Event 已在外部生成
                return "";
            default:
                log.warn("Unknown node type: {}, using default service task", nodeType);
                return generateServiceTask(bpmnId, nodeName, "DEFAULT", config);
        }
    }
    /**
     * 生成 Service Task
     */
    private String generateServiceTask(String bpmnId, String name, String nodeType, JsonNode config) {
        String workerType = workerRegistry.getWorkerType(nodeType);
        String taskHeaders = generateTaskHeaders(config);
        return String.format("""
            <bpmn:serviceTask id="%s" name="%s" zeebe:taskType="%s">
              <bpmn:extensionElements>
                <zeebe:taskDefinition type="%s" />
                %s
              </bpmn:extensionElements>
            </bpmn:serviceTask>
            """, bpmnId, escapeXml(name), workerType, workerType, taskHeaders);
    }
    /**
     * 生成 Exclusive Gateway（条件分支）
     */
    private String generateExclusiveGateway(String bpmnId, String name) {
        return String.format("""
            <bpmn:exclusiveGateway id="%s" name="%s" />
            """, bpmnId, escapeXml(name));
    }
    /**
     * 生成 Parallel Gateway（并行分支/合并）
     */
    private String generateParallelGateway(String bpmnId, String name, String type) {
        return String.format("""
            <bpmn:parallelGateway id="%s" name="%s" />
            """, bpmnId, escapeXml(name));
    }
    /**
     * 生成 Timer Catch Event（延迟）
     */
    private String generateTimerCatchEvent(String bpmnId, String name, JsonNode config) {
        long delayMs = config.has("duration") ? config.path("duration").asLong() : 86400000;
        String unit = config.has("unit") ? config.path("unit").asText() : "milliseconds";
        String duration = formatDuration(delayMs, unit);
        return String.format("""
            <bpmn:intermediateCatchEvent id="%s" name="%s">
              <bpmn:timerEventDefinition>
                <bpmn:timeDuration>%s</bpmn:timeDuration>
              </bpmn:timerEventDefinition>
            </bpmn:intermediateCatchEvent>
            """, bpmnId, escapeXml(name), duration);
    }
    /**
     * 生成 Message Catch Event（事件等待）
     */
    private String generateMessageCatchEvent(String bpmnId, String name, JsonNode config) {
        String messageName = config.has("messageName") ? config.path("messageName").asText() : "event_" + bpmnId;
        return String.format("""
            <bpmn:intermediateCatchEvent id="%s" name="%s">
              <bpmn:messageEventDefinition>
                <bpmn:message id="%s" name="%s" />
              </bpmn:messageEventDefinition>
            </bpmn:intermediateCatchEvent>
            """, bpmnId, escapeXml(name), messageName, messageName);
    }
    /**
     * 生成 User Task（人工审批）
     */
    private String generateUserTask(String bpmnId, String name, JsonNode config) {
        String assignee = config.has("approverId") ? config.path("approverId").asText() : "approver";
        String taskType = "campaign-approval";
        return String.format("""
            <bpmn:userTask id="%s" name="%s">
              <bpmn:extensionElements>
                <zeebe:assignmentDefinition assignee="%s" />
                <zeebe:taskDefinition type="%s" />
              </bpmn:extensionElements>
            </bpmn:userTask>
            """, bpmnId, escapeXml(name), assignee, taskType);
    }
    /**
     * 生成 Start Event
     */
    private String generateStartEvent() {
        return """
            <bpmn:startEvent id="StartEvent_1">
              <bpmn:messageEventDefinition id="MessageEventDefinition_1" />
            </bpmn:startEvent>
            """;
    }
    /**
     * 生成 End Event
     */
    private String generateEndEvent(String id) {
        return String.format("""
            <bpmn:endEvent id="%s" />
            """, id);
    }
    /**
     * 生成 Sequence Flows（连线）
     */
    private String generateSequenceFlows(List<JsonNode> edges, Map<String, String> nodeIdToBpmnId) {
        StringBuilder sb = new StringBuilder();
        int seq = 0;
        // 找 START 节点
        String startNodeId = findStartNodeId();
        if (startNodeId != null) {
            String targetBpmnId = nodeIdToBpmnId.get(startNodeId);
            if (targetBpmnId != null) {
                sb.append(generateSequenceFlow("Flow_Start_" + (++seq), "StartEvent_1", targetBpmnId, null));
            }
        }
        for (JsonNode edge : edges) {
            String source = edge.path("source").asText();
            String target = edge.path("target").asText();
            String condition = edge.has("condition") ? edge.path("condition").asText() : null;
            String sourceBpmnId = nodeIdToBpmnId.get(source);
            String targetBpmnId = nodeIdToBpmnId.get(target);
            if (sourceBpmnId == null || targetBpmnId == null) {
                log.warn("Skipping edge with unknown node: {} -> {}", source, target);
                continue;
            }
            // 检查源节点是否为 END，如果是则跳过
            JsonNode sourceNode = findNodeByType(source);
            if (sourceNode != null && "END".equals(sourceNode.path("type").asText())) {
                continue;
            }
            sb.append(generateSequenceFlow("Flow_" + (++seq), sourceBpmnId, targetBpmnId, condition));
        }
        // 找 END 节点，连接其前驱
        String endNodeId = findEndNodeId();
        if (endNodeId != null) {
            // 找到所有指向 END 的边，它们的源连接 END
            // 实际上 END 节点不输出边，它的前驱会通过边连接到 END
            // 但为了安全，确保 END 节点有入边即可
        }
        return sb.toString();
    }
    /**
     * 生成单条 Sequence Flow
     */
    private String generateSequenceFlow(String id, String source, String target, String condition) {
        if (condition != null && !condition.isEmpty()) {
            return String.format("""
                <bpmn:sequenceFlow id="%s" sourceRef="%s" targetRef="%s">
                  <bpmn:conditionExpression xsi:type="bpmn:tFormalExpression">
                    = %s
                  </bpmn:conditionExpression>
                </bpmn:sequenceFlow>
                """, id, source, target, escapeExpression(condition));
        }
        return String.format("""
            <bpmn:sequenceFlow id="%s" sourceRef="%s" targetRef="%s" />
            """, id, source, target);
    }
    /**
     * 生成 Task Headers（传递配置给 Worker）
     */
    private String generateTaskHeaders(JsonNode config) {
        if (config == null || config.isNull() || config.isEmpty()) {
            return "";
        }
        StringBuilder sb = new StringBuilder();
        config.fields().forEachRemaining(entry -> {
            String key = entry.getKey();
            String value = entry.getValue().isTextual() ?
                    entry.getValue().asText() :
                    entry.getValue().toString();
            sb.append(String.format("""
                    <zeebe:taskHeader key="%s" value="%s" />
                    """, key, escapeXml(value)));
        });
        return sb.toString();
    }
    /**
     * 拓扑排序（Kahn 算法）
     */
    private List<String> topologicalSort(List<JsonNode> nodes, List<JsonNode> edges) {
        Map<String, Integer> inDegree = new HashMap<>();
        Map<String, List<String>> adj = new HashMap<>();
        // 初始化
        for (JsonNode node : nodes) {
            String id = node.path("id").asText();
            inDegree.put(id, 0);
            adj.put(id, new ArrayList<>());
        }
        // 构建邻接表
        for (JsonNode edge : edges) {
            String source = edge.path("source").asText();
            String target = edge.path("target").asText();
            if (adj.containsKey(source)) {
                adj.get(source).add(target);
                inDegree.merge(target, 1, Integer::sum);
            }
        }
        // Kahn 算法
        Queue<String> queue = new LinkedList<>();
        for (Map.Entry<String, Integer> entry : inDegree.entrySet()) {
            if (entry.getValue() == 0) {
                queue.add(entry.getKey());
            }
        }
        List<String> result = new ArrayList<>();
        while (!queue.isEmpty()) {
            String nodeId = queue.poll();
            result.add(nodeId);
            for (String neighbor : adj.getOrDefault(nodeId, Collections.emptyList())) {
                int newDegree = inDegree.get(neighbor) - 1;
                inDegree.put(neighbor, newDegree);
                if (newDegree == 0) {
                    queue.add(neighbor);
                }
            }
        }
        // 检测环
        if (result.size() != nodes.size()) {
            throw new IllegalStateException("Graph contains cycle");
        }
        return result;
    }
    /**
     * 格式化延迟时间（ISO 8601 Duration）
     */
    private String formatDuration(long delayMs, String unit) {
        long value;
        String prefix;
        switch (unit) {
            case "seconds":
                value = delayMs / 1000;
                prefix = "PT";
                break;
            case "minutes":
                value = delayMs / 60000;
                prefix = "PT";
                break;
            case "hours":
                value = delayMs / 3600000;
                prefix = "PT";
                break;
            case "days":
                value = delayMs / 86400000;
                prefix = "P";
                break;
            default:
                value = delayMs;
                prefix = "PT";
                break;
        }
        if ("P".equals(prefix) && value > 0) {
            return value + "D";
        } else if ("PT".equals(prefix) && value > 0) {
            // 尝试找合适的单位
            if (value >= 86400) {
                return (value / 86400) + "D";
            } else if (value >= 3600) {
                return (value / 3600) + "H";
            } else if (value >= 60) {
                return (value / 60) + "M";
            } else {
                return value + "S";
            }
        }
        return "PT" + delayMs + "S";
    }
    /**
     * 生成 BPMN 图形信息（用于 Zeebe Operate 显示）
     */
    private String generateBPMNDiagram(List<JsonNode> nodes, List<JsonNode> edges,
                                        Map<String, String> nodeIdToBpmnId) {
        // 简化：生成 BPMNDI 布局信息
        // 实际生产中使用 Zeebe 自动布局，此处可省略或生成占位
        return "";
    }
    // ---- 工具方法 ----
    private List<JsonNode> extractNodes(JsonNode graph) {
        JsonNode nodes = graph.path("nodes");
        List<JsonNode> result = new ArrayList<>();
        if (nodes.isArray()) {
            nodes.forEach(result::add);
        }
        return result;
    }
    private List<JsonNode> extractEdges(JsonNode graph) {
        JsonNode edges = graph.path("edges");
        List<JsonNode> result = new ArrayList<>();
        if (edges.isArray()) {
            edges.forEach(result::add);
        }
        return result;
    }
    private JsonNode findNode(List<JsonNode> nodes, String id) {
        return nodes.stream()
                .filter(n -> n.path("id").asText().equals(id))
                .findFirst()
                .orElse(null);
    }
    private JsonNode findNodeByType(String id) {
        // 从已缓存节点查找
        // 实现略
        return null;
    }
    private String findStartNodeId() {
        // 从节点中找 type=START
        // 实现略
        return null;
    }
    private String findEndNodeId() {
        // 从节点中找 type=END
        // 实现略
        return null;
    }
    private String sanitizeId(String id) {
        return id.replaceAll("[^a-zA-Z0-9_]", "_");
    }
    private String escapeXml(String text) {
        if (text == null) return "";
        return text.replace("&", "&amp;")
                .replace("<", "&lt;")
                .replace(">", "&gt;")
                .replace("\"", "&quot;")
                .replace("'", "&apos;");
    }
    private String escapeExpression(String expr) {
        if (expr == null) return "";
        return expr.replace("&", "&amp;");
    }
}
```
### 9.3.2 语义分析器（Validator）
```java
package com.loyalty.platform.campaign.execution.compiler;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;
import org.springframework.stereotype.Component;
import java.util.*;
@Component
public class CanvasValidator {
    private static final Set<String> VALID_NODE_TYPES = Set.of(
            "START", "END",
            "AUDIENCE_FILTER", "EVENT_TRIGGER",
            "CONDITION", "SPLIT", "MERGE",
            "AI_SCORE", "AI_PLANNER",
            "SEND_EMAIL", "SEND_SMS", "SEND_PUSH",
            "OFFER_POINTS", "OFFER_COUPON", "TIER_UPGRADE",
            "WEBHOOK",
            "DELAY", "WAIT_EVENT", "APPROVAL"
    );
    private static final Set<String> NODES_WITHOUT_INPUT = Set.of("START", "EVENT_TRIGGER");
    private static final Set<String> NODES_WITHOUT_OUTPUT = Set.of("END");
    /**
     * 语义校验
     */
    public ValidationResult validate(CanvasGraph graph) {
        List<ValidationError> errors = new ArrayList<>();
        List<ValidationWarning> warnings = new ArrayList<>();
        // 1. 检查节点是否为空
        if (graph.getNodes().isEmpty()) {
            errors.add(ValidationError.of("EMPTY_GRAPH", "Graph has no nodes"));
            return ValidationResult.invalid(errors);
        }
        // 2. 检查是否有 START 节点
        boolean hasStart = graph.getNodes().stream()
                .anyMatch(n -> "START".equals(n.getType()));
        if (!hasStart) {
            errors.add(ValidationError.of("MISSING_START", "No START node found"));
        }
        // 3. 检查是否有 END 节点
        boolean hasEnd = graph.getNodes().stream()
                .anyMatch(n -> "END".equals(n.getType()));
        if (!hasEnd) {
            errors.add(ValidationError.of("MISSING_END", "No END node found"));
        }
        // 4. 检查是否有多个 START
        long startCount = graph.getNodes().stream()
                .filter(n -> "START".equals(n.getType()))
                .count();
        if (startCount > 1) {
            errors.add(ValidationError.of("MULTIPLE_START", "Multiple START nodes found: " + startCount));
        }
        // 5. 检查节点类型是否合法
        for (Node node : graph.getNodes()) {
            if (!VALID_NODE_TYPES.contains(node.getType())) {
                errors.add(ValidationError.of("INVALID_NODE_TYPE",
                        "Invalid node type: " + node.getType() + " (id: " + node.getId() + ")"));
            }
        }
        // 6. 检查是否有孤立节点
        Set<String> connectedNodes = new HashSet<>();
        graph.getEdges().forEach(edge -> {
            connectedNodes.add(edge.getSource());
            connectedNodes.add(edge.getTarget());
        });
        for (Node node : graph.getNodes()) {
            if (!connectedNodes.contains(node.getId()) &&
                    !NODES_WITHOUT_INPUT.contains(node.getType()) &&
                    !NODES_WITHOUT_OUTPUT.contains(node.getType())) {
                warnings.add(ValidationWarning.of("ISOLATED_NODE",
                        "Node " + node.getId() + " (" + node.getType() + ") is isolated"));
            }
        }
        // 7. 检测环
        List<String> cycle = detectCycle(graph);
        if (!cycle.isEmpty()) {
            errors.add(ValidationError.of("CYCLE_DETECTED",
                    "Cycle detected: " + String.join(" → ", cycle)));
        }
        // 8. 检查条件分支的输出端口
        for (Node node : graph.getNodes()) {
            if ("CONDITION".equals(node.getType())) {
                long trueEdges = graph.getEdges().stream()
                        .filter(e -> e.getSource().equals(node.getId()))
                        .filter(e -> "true".equals(e.getSourcePort()) || e.getCondition() != null)
                        .count();
                long falseEdges = graph.getEdges().stream()
                        .filter(e -> e.getSource().equals(node.getId()))
                        .filter(e -> "false".equals(e.getSourcePort()) || e.getCondition() == null)
                        .count();
                if (trueEdges == 0 && falseEdges == 0) {
                    warnings.add(ValidationWarning.of("CONDITION_NO_BRANCH",
                            "Condition node " + node.getId() + " has no outgoing branches"));
                }
            }
        }
        // 9. 检查审批节点配置
        for (Node node : graph.getNodes()) {
            if ("APPROVAL".equals(node.getType())) {
                NodeConfig config = node.getConfig();
                if (config == null) {
                    errors.add(ValidationError.of("APPROVAL_NO_CONFIG",
                            "Approval node " + node.getId() + " has no configuration"));
                }
            }
        }
        return ValidationResult.builder()
                .valid(errors.isEmpty())
                .errors(errors)
                .warnings(warnings)
                .build();
    }
    /**
     * 循环检测（DFS）
     */
    private List<String> detectCycle(CanvasGraph graph) {
        Map<String, List<String>> adj = new HashMap<>();
        graph.getNodes().forEach(n -> adj.put(n.getId(), new ArrayList<>()));
        graph.getEdges().forEach(e -> {
            if (adj.containsKey(e.getSource())) {
                adj.get(e.getSource()).add(e.getTarget());
            }
        });
        Set<String> visited = new HashSet<>();
        Set<String> recursionStack = new HashSet<>();
        List<String> cyclePath = new ArrayList<>();
        for (String nodeId : adj.keySet()) {
            if (!visited.contains(nodeId)) {
                if (dfsCycle(nodeId, adj, visited, recursionStack, cyclePath)) {
                    return cyclePath;
                }
            }
        }
        return Collections.emptyList();
    }
    private boolean dfsCycle(String nodeId, Map<String, List<String>> adj,
                             Set<String> visited, Set<String> recursionStack,
                             List<String> cyclePath) {
        visited.add(nodeId);
        recursionStack.add(nodeId);
        for (String neighbor : adj.getOrDefault(nodeId, Collections.emptyList())) {
            if (!visited.contains(neighbor)) {
                if (dfsCycle(neighbor, adj, visited, recursionStack, cyclePath)) {
                    cyclePath.add(0, nodeId);
                    return true;
                }
            } else if (recursionStack.contains(neighbor)) {
                cyclePath.add(0, nodeId);
                cyclePath.add(neighbor);
                return true;
            }
        }
        recursionStack.remove(nodeId);
        return false;
    }
    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class ValidationResult {
        private boolean valid;
        private List<ValidationError> errors;
        private List<ValidationWarning> warnings;
        public static ValidationResult invalid(List<ValidationError> errors) {
            return ValidationResult.builder()
                    .valid(false)
                    .errors(errors)
                    .warnings(new ArrayList<>())
                    .build();
        }
    }
    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class ValidationError {
        private String code;
        private String message;
        public static ValidationError of(String code, String message) {
            return ValidationError.builder().code(code).message(message).build();
        }
    }
    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class ValidationWarning {
        private String code;
        private String message;
        public static ValidationWarning of(String code, String message) {
            return ValidationWarning.builder().code(code).message(message).build();
        }
    }
}
```
### 9.3.3 Worker Binding Registry
```java
package com.loyalty.platform.campaign.execution.compiler;
import org.springframework.stereotype.Component;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
@Component
public class WorkerBindingRegistry {
    private final Map<String, String> nodeTypeToWorkerType = new ConcurrentHashMap<>();
    private final Map<String, String> workerTypeToHandlerClass = new ConcurrentHashMap<>();
    public WorkerBindingRegistry() {
        // 初始化默认映射
        register("AUDIENCE_FILTER", "campaign-audience-filter", "AudienceFilterWorker");
        register("AI_SCORE", "campaign-ai-score", "AIScoreWorker");
        register("AI_PLANNER", "campaign-ai-planner", "AIPlannerWorker");
        register("SEND_EMAIL", "campaign-send-email", "SendEmailWorker");
        register("SEND_SMS", "campaign-send-sms", "SendSMSWorker");
        register("SEND_PUSH", "campaign-send-push", "SendPushWorker");
        register("OFFER_POINTS", "campaign-offer-points", "OfferPointsWorker");
        register("OFFER_COUPON", "campaign-offer-coupon", "OfferCouponWorker");
        register("TIER_UPGRADE", "campaign-tier-upgrade", "TierUpgradeWorker");
        register("WEBHOOK", "campaign-webhook", "WebhookWorker");
        register("APPROVAL", "campaign-approval", "ApprovalWorker");
        register("DELAY", "campaign-delay", "DelayWorker");
        register("DEFAULT", "campaign-default", "DefaultWorker");
    }
    public void register(String nodeType, String workerType, String handlerClass) {
        nodeTypeToWorkerType.put(nodeType, workerType);
        workerTypeToHandlerClass.put(workerType, handlerClass);
    }
    public String getWorkerType(String nodeType) {
        return nodeTypeToWorkerType.getOrDefault(nodeType, "campaign-default");
    }
    public String getHandlerClass(String workerType) {
        return workerTypeToHandlerClass.get(workerType);
    }
    public boolean isRegistered(String nodeType) {
        return nodeTypeToWorkerType.containsKey(nodeType);
    }
}
```
***
## 9.4 AI → DAG 生成 Prompt 体系
### 9.4.0 核心设计理念
AI 不能直接生成任意结构的 DAG，必须受到严格的 Schema 约束。Prompt 体系的核心是**“约束优先”**——告诉 AI 什么是可以做的，什么是绝对禁止的。
### 9.4.1 System Prompt（核心约束）
```text
You are a Workflow DAG Generator for a Marketing Execution System.
Your task is to generate a STRICT executable DAG (Directed Acyclic Graph) for a marketing campaign.
## CRITICAL RULES (MUST FOLLOW):
1. Output MUST be valid JSON only. No markdown, no explanation, no comments.
2. Must contain exactly two top-level fields: "nodes" and "edges".
3. Must be a DAG (no cycles).
4. Every node must have: id, type, name, config.
5. Every edge must have: from, to.
6. Maximum nodes: 50.
7. Maximum depth: 10 levels.
## AVAILABLE NODE TYPES:
### Input Nodes:
- START: Start of workflow (no inputs, one output)
- AUDIENCE_FILTER: Filter users by segment. Config: { "segmentCode": "string", "limit": number }
### Logic Nodes:
- CONDITION: Conditional branch. Config: { "field": "string", "operator": "eq|ne|gt|gte|lt|lte", "value": any }
### AI Nodes:
- AI_SCORE: Score users with ML model. Config: { "modelType": "churn|uplift|conversion", "threshold": number }
### Action Nodes:
- SEND_EMAIL: Send email. Config: { "assetId": "string", "requireApproval": boolean }
- SEND_SMS: Send SMS. Config: { "assetId": "string" }
- OFFER_POINTS: Grant points. Config: { "pointType": "string", "amount": number }
- OFFER_COUPON: Issue coupon. Config: { "couponId": "string" }
- WEBHOOK: Call external API. Config: { "url": "string", "method": "GET|POST" }
### Control Nodes:
- DELAY: Wait. Config: { "duration": number, "unit": "milliseconds|seconds|minutes|hours|days" }
- APPROVAL: Human approval. Config: { "approverId": "string" }
### End Node:
- END: End of workflow (no outputs)
## OUTPUT FORMAT:
{
  "nodes": [
    { "id": "N1", "type": "START", "name": "开始", "config": {} },
    { "id": "N2", "type": "AUDIENCE_FILTER", "name": "人群筛选", "config": { "segmentCode": "HIGH_VALUE", "limit": 10000 } }
  ],
  "edges": [
    { "from": "N1", "to": "N2" }
  ]
}
## CONSTRAINTS:
- START node must have no incoming edges.
- END node must have no outgoing edges.
- CONDITION node must have exactly 2 outgoing edges: one with condition, one without.
- AUDIENCE_FILTER must be after START, before any action node.
- APPROVAL should be placed before SEND_EMAIL when requireApproval is true.
- DELAY can be placed between any two nodes.
## BUSINESS CONTEXT:
- The workflow should optimize for conversion rate and ROI.
- Prioritize high-value segments.
- Use appropriate channels based on the audience.
- Include approval steps for sensitive actions (email with offers).
Generate the DAG now. Remember: JSON only.
```
### 9.4.2 User Prompt 模板
```java
public class DAGGenerationPromptBuilder {
    
    public String buildUserPrompt(DAGGenerationRequest request) {
        StringBuilder sb = new StringBuilder();
        
        sb.append("## Campaign Context:\n");
        sb.append("- Goal Name: ").append(request.getGoalName()).append("\n");
        sb.append("- Goal Type: ").append(request.getGoalType()).append("\n");
        sb.append("- Budget: ").append(request.getBudget()).append("\n");
        sb.append("- Time Range: ").append(request.getStartTime()).append(" to ").append(request.getEndTime()).append("\n\n");
        
        sb.append("## Audience Information:\n");
        if (request.getSegmentCode() != null) {
            sb.append("- Target Segment: ").append(request.getSegmentCode()).append("\n");
        }
        if (request.getOpportunities() != null && !request.getOpportunities().isEmpty()) {
            sb.append("- Opportunity Count: ").append(request.getOpportunities().size()).append("\n");
            sb.append("- Top Opportunities: \n");
            request.getOpportunities().stream().limit(5).forEach(opp -> {
                sb.append("  · ").append(opp.getType()).append(" (score: ").append(opp.getScore()).append(")\n");
            });
        }
        sb.append("\n");
        
        sb.append("## Channel Preferences:\n");
        if (request.getChannels() != null && !request.getChannels().isEmpty()) {
            sb.append("- Allowed Channels: ").append(String.join(", ", request.getChannels())).append("\n");
        }
        sb.append("\n");
        
        sb.append("## Additional Requirements:\n");
        if (request.getAdditionalRequirements() != null) {
            sb.append(request.getAdditionalRequirements()).append("\n");
        }
        sb.append("\n");
        
        sb.append("Generate an optimal workflow DAG based on this context.");
        return sb.toString();
    }
}
```
### 9.4.3 AI 输出 Schema 校验
```java
@Component
public class DAGSchemaValidator {
    
    private static final JsonSchema JSON_SCHEMA;
    
    static {
        String schemaJson = """
            {
              "type": "object",
              "required": ["nodes", "edges"],
              "properties": {
                "nodes": {
                  "type": "array",
                  "minItems": 2,
                  "maxItems": 50,
                  "items": {
                    "type": "object",
                    "required": ["id", "type", "name", "config"],
                    "properties": {
                      "id": { "type": "string", "pattern": "^N[0-9]+$" },
                      "type": { "enum": ["START", "END", "AUDIENCE_FILTER", "CONDITION", "AI_SCORE", "SEND_EMAIL", "SEND_SMS", "OFFER_POINTS", "OFFER_COUPON", "WEBHOOK", "DELAY", "APPROVAL"] },
                      "name": { "type": "string" },
                      "config": { "type": "object" }
                    }
                  }
                },
                "edges": {
                  "type": "array",
                  "items": {
                    "type": "object",
                    "required": ["from", "to"],
                    "properties": {
                      "from": { "type": "string" },
                      "to": { "type": "string" },
                      "condition": { "type": "string" }
                    }
                  }
                }
              }
            }
            """;
        // JSON_SCHEMA = JsonSchemaFactory.byDefault().getSchema(schemaJson);
    }
    
    public boolean validate(JsonNode dag) {
        // 使用 JSON Schema 校验
        // 简化实现：使用自定义校验
        return true;
    }
}
```
### 9.4.4 AI DAG 生成 Service
```java
package com.loyalty.platform.campaign.ai;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
@Service
@Slf4j
@RequiredArgsConstructor
public class AICampaignGenerator {
    private final LLMClient llmClient;
    private final DAGSchemaValidator schemaValidator;
    private final CanvasValidator canvasValidator;
    private final ObjectMapper objectMapper;
    private static final String SYSTEM_PROMPT = """
        You are a Workflow DAG Generator for a Marketing Execution System.
        ... (完整的 System Prompt)
        """;
    /**
     * 根据自然语言生成 DAG
     */
    public CanvasGraph generateDAG(DAGGenerationRequest request) {
        log.info("Generating DAG for goal: {}", request.getGoalName());
        // 1. 构建 User Prompt
        String userPrompt = buildUserPrompt(request);
        // 2. 调用 LLM
        String llmResponse = llmClient.chatWithSystem(SYSTEM_PROMPT, userPrompt);
        log.debug("LLM response: {}", llmResponse);
        // 3. 解析 JSON
        JsonNode dagJson;
        try {
            dagJson = objectMapper.readTree(llmResponse);
        } catch (Exception e) {
            log.error("Failed to parse LLM response: {}", e.getMessage());
            // 降级：使用默认模板
            return generateDefaultDAG(request);
        }
        // 4. Schema 校验
        if (!schemaValidator.validate(dagJson)) {
            log.warn("DAG schema validation failed, using default template");
            return generateDefaultDAG(request);
        }
        // 5. 转换为 CanvasGraph
        CanvasGraph graph = parseToCanvasGraph(dagJson);
        // 6. 业务校验
        CanvasValidator.ValidationResult validation = canvasValidator.validate(graph);
        if (!validation.isValid()) {
            log.warn("DAG validation failed: {}", validation.getErrors());
            // 尝试自动修复
            graph = autoFix(graph);
        }
        log.info("DAG generated: nodes={}, edges={}", 
                graph.getNodes().size(), graph.getEdges().size());
        return graph;
    }
    /**
     * 生成默认 DAG（降级方案）
     */
    private CanvasGraph generateDefaultDAG(DAGGenerationRequest request) {
        // 返回一个最简单的工作流： START → AUDIENCE_FILTER → SEND_EMAIL → END
        List<Node> nodes = new ArrayList<>();
        List<Edge> edges = new ArrayList<>();
        nodes.add(Node.builder().id("N1").type("START").name("开始").config(new HashMap<>()).build());
        nodes.add(Node.builder().id("N2").type("AUDIENCE_FILTER").name("人群筛选")
                .config(Map.of("segmentCode", request.getSegmentCode() != null ? request.getSegmentCode() : "ALL")).build());
        nodes.add(Node.builder().id("N3").type("SEND_EMAIL").name("发送邮件")
                .config(Map.of("assetId", "default_asset", "requireApproval", false)).build());
        nodes.add(Node.builder().id("N4").type("END").name("结束").config(new HashMap<>()).build());
        edges.add(Edge.builder().from("N1").to("N2").build());
        edges.add(Edge.builder().from("N2").to("N3").build());
        edges.add(Edge.builder().from("N3").to("N4").build());
        return CanvasGraph.builder()
                .nodes(nodes)
                .edges(edges)
                .build();
    }
    /**
     * 自动修复常见问题
     */
    private CanvasGraph autoFix(CanvasGraph graph) {
        // 1. 确保有 START
        // 2. 确保有 END
        // 3. 确保无环（删除导致环的边）
        // 实现略
        return graph;
    }
}
```
***
## 9.5 Node → BPMN 映射规则表（完整）
| Canvas Node Type  | BPMN Element                    | Worker Type                | 特殊处理                               |
| ----------------- | ------------------------------- | -------------------------- | ---------------------------------- |
| `START`           | `<bpmn:startEvent>`             | -                          | 无输入，单输出                            |
| `END`             | `<bpmn:endEvent>`               | -                          | 单输入，无输出                            |
| `AUDIENCE_FILTER` | `<bpmn:serviceTask>`            | `campaign-audience-filter` | 输入 `segmentCode`、`limit`           |
| `CONDITION`       | `<bpmn:exclusiveGateway>`       | -                          | 输出两条边：带 `conditionExpression` 和不带  |
| `SPLIT`           | `<bpmn:parallelGateway>`        | -                          | 多输出                                |
| `MERGE`           | `<bpmn:parallelGateway>`        | -                          | 多输入，单输出                            |
| `AI_SCORE`        | `<bpmn:serviceTask>`            | `campaign-ai-score`        | 输入 `modelType`、`threshold`         |
| `SEND_EMAIL`      | `<bpmn:serviceTask>`            | `campaign-send-email`      | 需要 `assetId`，可设置 `requireApproval` |
| `SEND_SMS`        | `<bpmn:serviceTask>`            | `campaign-send-sms`        | 需要 `assetId`                       |
| `SEND_PUSH`       | `<bpmn:serviceTask>`            | `campaign-send-push`       | 需要 `assetId`                       |
| `OFFER_POINTS`    | `<bpmn:serviceTask>`            | `campaign-offer-points`    | 输入 `pointType`、`amount`、`reason`   |
| `OFFER_COUPON`    | `<bpmn:serviceTask>`            | `campaign-offer-coupon`    | 输入 `couponId`                      |
| `TIER_UPGRADE`    | `<bpmn:serviceTask>`            | `campaign-tier-upgrade`    | 输入 `targetTier`                    |
| `WEBHOOK`         | `<bpmn:serviceTask>`            | `campaign-webhook`         | 输入 `url`、`method`、`headers`        |
| `DELAY`           | `<bpmn:intermediateCatchEvent>` | `campaign-delay`           | 生成 `<bpmn:timerEventDefinition>`   |
| `WAIT_EVENT`      | `<bpmn:intermediateCatchEvent>` | `campaign-wait-event`      | 生成 `<bpmn:messageEventDefinition>` |
| `APPROVAL`        | `<bpmn:userTask>`               | `campaign-approval`        | 生成 `<zeebe:assignmentDefinition>`  |
***
## 9.6 前端复杂逻辑伪代码
### 9.6.1 AI 生成 DAG（前端调用）
```typescript
// hooks/useAIGenerator.ts
import { useMutation } from '@tanstack/react-query';
interface AIGenerationParams {
  goalId: string;
  goalName: string;
  goalType: string;
  budget: number;
  segmentCode?: string;
  channels?: string[];
  additionalRequirements?: string;
}
export const useAIGenerator = () => {
  const { mutateAsync, isPending, data } = useMutation({
    mutationFn: async (params: AIGenerationParams) => {
      const response = await api.post('/api/ai/generate-dag', params);
      return response.data;
    }
  });
  return { generate: mutateAsync, isGenerating: isPending, result: data };
};
```
### 9.6.2 DAG 预览与确认组件
```tsx
// components/canvas/AIGeneratedPreview.tsx
import React from 'react';
import { useAIGenerator } from '../hooks/useAIGenerator';
export const AIGeneratedPreview: React.FC<{ 
  generationParams: AIGenerationParams;
  onConfirm: (graph: CanvasGraph) => void;
  onCancel: () => void;
}> = ({ generationParams, onConfirm, onCancel }) => {
  
  const { generate, isGenerating, result } = useAIGenerator();
  useEffect(() => {
    if (generationParams) {
      generate(generationParams);
    }
  }, [generationParams]);
  if (isGenerating) {
    return <div className="loading">AI 正在生成工作流...</div>;
  }
  if (!result) return null;
  return (
    <div className="ai-generated-preview">
      <div className="preview-header">
        <h3>🤖 AI 生成的工作流</h3>
        <div className="preview-stats">
          节点: {result.nodes.length} | 边: {result.edges.length}
        </div>
      </div>
      
      <div className="preview-canvas">
        {/* 使用 MiniReactFlow 预览 DAG */}
        <MiniReactFlow
          nodes={result.nodes}
          edges={result.edges}
          interactive={false}
        />
      </div>
      
      <div className="preview-actions">
        <button onClick={onCancel} className="btn-secondary">
          重新生成
        </button>
        <button onClick={() => onConfirm(result)} className="btn-primary">
          ✅ 确认使用
        </button>
      </div>
    </div>
  );
};
```
### 9.6.3 编译结果展示
```tsx
// components/compiler/CompileResultPanel.tsx
import React from 'react';
interface CompileResult {
  engineType: string;
  nodeCount: number;
  edgeCount: number;
  validation: {
    valid: boolean;
    errors: Array<{ code: string; message: string }>;
    warnings: Array<{ code: string; message: string }>;
  };
  bpmnXml?: string;
}
export const CompileResultPanel: React.FC<{ result: CompileResult }> = ({ result }) => {
  return (
    <div className="compile-result">
      <div className="result-header">
        <span className={`status-badge ${result.validation.valid ? 'success' : 'error'}`}>
          {result.validation.valid ? '✅ 编译通过' : '❌ 编译失败'}
        </span>
        <span className="engine-tag">{result.engineType}</span>
      </div>
      
      {result.validation.valid ? (
        <div className="result-details">
          <div className="stat">
            <span>节点</span>
            <strong>{result.nodeCount}</strong>
          </div>
          <div className="stat">
            <span>边</span>
            <strong>{result.edgeCount}</strong>
          </div>
        </div>
      ) : (
        <div className="errors">
          {result.validation.errors.map((err, idx) => (
            <div key={idx} className="error-item">
              <span className="error-code">{err.code}</span>
              <span className="error-message">{err.message}</span>
            </div>
          ))}
        </div>
      )}
      
      {result.warnings && result.warnings.length > 0 && (
        <div className="warnings">
          <summary>⚠️ 警告 ({result.warnings.length})</summary>
          {result.warnings.map((w, idx) => (
            <div key={idx} className="warning-item">
              {w.message}
            </div>
          ))}
        </div>
      )}
      
      {result.bpmnXml && (
        <div className="bpmn-xml">
          <summary>📄 查看 BPMN XML</summary>
          <pre className="xml-content">
            {result.bpmnXml.substring(0, 1000)}...
          </pre>
        </div>
      )}
    </div>
  );
};
```
***
## 9.7 前后端 JSON 交互
### 9.7.1 AI 生成 DAG
**Request:**
```json
POST /api/ai/generate-dag
{
    "goalId": "goal_001",
    "goalName": "618大促GMV提升",
    "goalType": "REVENUE",
    "budget": 100000,
    "segmentCode": "HIGH_VALUE",
    "channels": ["EMAIL", "SMS"],
    "opportunities": [
        { "type": "CHURN_RISK", "score": 0.87 },
        { "type": "UPSELL", "score": 0.72 }
    ],
    "additionalRequirements": "需要包含审批节点，预算主要分配给高价值会员召回"
}
```
**Response:**
```json
{
    "code": 0,
    "data": {
        "nodes": [
            { "id": "N1", "type": "START", "name": "开始", "config": {} },
            { 
                "id": "N2", 
                "type": "AUDIENCE_FILTER", 
                "name": "高价值会员筛选", 
                "config": { "segmentCode": "HIGH_VALUE", "limit": 10000 } 
            },
            { 
                "id": "N3", 
                "type": "AI_SCORE", 
                "name": "机会评分", 
                "config": { "modelType": "uplift", "threshold": 0.7 } 
            },
            { 
                "id": "N4", 
                "type": "CONDITION", 
                "name": "高价值判断", 
                "config": { "field": "score", "operator": "gt", "value": 0.7 } 
            },
            { 
                "id": "N5", 
                "type": "APPROVAL", 
                "name": "内容审批", 
                "config": { "approverId": "marketing_manager" } 
            },
            { 
                "id": "N6", 
                "type": "SEND_EMAIL", 
                "name": "发送召回邮件", 
                "config": { "assetId": "asset_001", "requireApproval": true } 
            },
            { 
                "id": "N7", 
                "type": "END", 
                "name": "结束", 
                "config": {} 
            }
        ],
        "edges": [
            { "from": "N1", "to": "N2" },
            { "from": "N2", "to": "N3" },
            { "from": "N3", "to": "N4" },
            { "from": "N4", "to": "N5", "condition": "score > 0.7" },
            { "from": "N4", "to": "N7", "condition": "score <= 0.7" },
            { "from": "N5", "to": "N6" },
            { "from": "N6", "to": "N7" }
        ]
    }
}
```
### 9.7.2 编译 Canvas
**Request:**
```json
POST /api/campaign/compiler/compile
{
    "planId": "plan_001",
    "engineType": "ZEEBE"
}
```
**Response:**
```json
{
    "code": 0,
    "data": {
        "planId": "plan_001",
        "engineType": "ZEEBE",
        "nodeCount": 7,
        "edgeCount": 7,
        "validation": {
            "valid": true,
            "errors": [],
            "warnings": [
                { "code": "CONDITION_NO_DEFAULT", "message": "Condition node N4 has no default branch" }
            ]
        },
        "compiledContent": "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<bpmn:definitions ...>\n  ...\n</bpmn:definitions>",
        "compileTime": "2026-06-26T10:00:00Z",
        "durationMs": 234
    }
}
```
***
## 9.8 异常处理与业务规则
### 9.8.1 编译异常枚举
```java
public enum CompilerErrorCode {
    GRAPH_EMPTY("C001", "Canvas graph is empty"),
    CYCLE_DETECTED("C002", "DAG contains cycle"),
    MISSING_START("C003", "No START node found"),
    MISSING_END("C004", "No END node found"),
    INVALID_NODE_TYPE("C005", "Invalid node type"),
    ISOLATED_NODE("C006", "Isolated node detected"),
    APPROVAL_NO_CONFIG("C007", "Approval node missing configuration"),
    CONDITION_NO_BRANCH("C008", "Condition node has no outgoing branches"),
    WORKER_NOT_REGISTERED("C009", "Worker not registered for node type"),
    AI_GENERATION_FAILED("C010", "AI DAG generation failed");
}
```
### 9.8.2 编译超时与降级
```java
@Component
public class CompilerTimeoutHandler {
    
    @Value("${compiler.timeout.seconds:30}")
    private int timeoutSeconds;
    
    public CompilationResult compileWithTimeout(String canvasId, JsonNode graph) {
        Future<CompilationResult> future = executor.submit(() -> {
            return compilerService.compile(canvasId, graph, "ZEEBE");
        });
        
        try {
            return future.get(timeoutSeconds, TimeUnit.SECONDS);
        } catch (TimeoutException e) {
            future.cancel(true);
            log.warn("Compilation timeout for canvas: {}", canvasId);
            return CompilationResult.error("COMPILE_TIMEOUT", "Compilation timeout after " + timeoutSeconds + "s");
        } catch (Exception e) {
            log.error("Compilation failed: {}", e.getMessage());
            return CompilationResult.error("COMPILE_ERROR", e.getMessage());
        }
    }
}
```
***
## 9.9 与 Loyalty 系统集成点
| 集成点             | Loyalty 能力 | 使用方式                                                 |
| --------------- | ---------- | ---------------------------------------------------- |
| **LiteFlow**    | 流程编排       | 保留 LiteFlow 作为备选输出（测试环境），生产使用 Zeebe                  |
| **规则引擎**        | Drools     | 编译器不直接使用 Drools，CONDITION 节点的条件表达式由 Worker 执行时评估     |
| **EventBridge** | 事件发布       | 编译完成/失败时发布 `COMPILE_COMPLETED` / `COMPILE_FAILED` 事件 |
| **React Flow**  | 前端画布       | 复用 Loyalty 规则编辑器的 React Flow 组件，扩展节点类型               |
***
## 9.10 开发实施检查清单
* 实现 `CanvasToBpmnCompiler` 核心类
* 实现 `CanvasValidator` 语义分析器
* 实现 `WorkerBindingRegistry` 节点-Worker 映射
* 实现 `AICampaignGenerator`（LLM + DAG 生成）
* 设计并存储 System Prompt 和 User Prompt 模板
* 实现 `DAGSchemaValidator`（JSON Schema 校验）
* 实现前端 AI 生成按钮 + 预览组件
* 实现前端编译结果展示面板
* 实现 `CompilerService` 统一入口
* 创建 `campaign_compile_log` 表
* 实现编译超时处理
* 编写单元测试（覆盖所有 Node Type）
* 编写集成测试（端到端：AI 生成 → 编译 → 部署 → 执行）
* 性能测试：50 节点 DAG 编译 < 1s
* 文档：节点类型 → Worker 映射表
