# LiteFlow 流程编排引擎详细设计
> **关联主文档**：基于AI的下一代全渠道忠诚度管理SaaS平台 v7.3\
> **版本**：1.0\
> **依赖框架**：LiteFlow 2.12.x + React Flow 11.x
***
## 一、设计目标
### 1.1 业务背景
忠诚度平台的事件处理流程（幂等检查 → 数据标准化 → One-ID 匹配 → 规则引擎 → 动作执行 → 完成）需要支持灵活编排。运营人员需要能够**可视化调整**组件的执行顺序、添加条件分支、并行处理等，而不需要修改代码。
### 1.2 核心目标
* **可视化编排**：运营人员通过拖拽组件、连线的方式定义流程，无需编写代码。
* **多模式支持**：
  * **订单类流程**：幂等检查 → 标准化 → One-ID → 规则引擎 → 动作执行 → 完成
  * **行为类流程**：幂等检查 → 标准化 → One-ID → 事实构建 → 动作执行 → 完成
  * **退款类流程**：幂等检查 → 标准化 → One-ID → 逆向处理 → 完成
* **组件复用**：同一组件可在不同流程中复用（如幂等检查、One-ID 匹配等）。
* **热更新**：流程定义变更后，无需重启应用即可生效。
* **可扩展性**：未来可增加循环、条件分支、并行等复杂编排模式。
### 1.3 与 LiteFlow 的关系
本设计使用 LiteFlow 作为**后端执行引擎**，使用 React Flow 作为**前端可视化画布**，两者通过统一的 JSON 数据结构进行桥接，实现流程定义的存储、展示和执行。
| 层次   | 技术                 | 职责                    |
| ---- | ------------------ | --------------------- |
| 前端画布 | React Flow         | 提供拖拽式流程编排界面，生成流程 JSON |
| 存储层  | PostgreSQL + Nacos | 持久化流程定义               |
| 执行引擎 | LiteFlow           | 解析 EL 表达式，调度组件执行      |
| 业务组件 | NodeComponent 实现类  | 执行具体业务逻辑              |
***
## 二、LiteFlow 核心概念
LiteFlow 的设计灵感来源于“工作台模式”——将复杂业务逻辑拆分成独立的小组件，通过 EL 表达式定义执行顺序[-3](https://blog.csdn.net/weixin_41120248/article/details/160801962)[-4](https://www.e-com-net.com/article/1612245616446963712.htm)。
### 2.1 核心概念
| 概念                | 说明                                           | 类比      |
| ----------------- | -------------------------------------------- | ------- |
| **Component（组件）** | 最小的执行单元，继承 `NodeComponent`，重写 `process()` 方法 | 工人      |
| **Chain（流程链）**    | 通过 EL 表达式定义组件执行顺序                            | 工人的工位顺序 |
| **Context（上下文）**  | 流程执行的共享数据容器，所有组件从中存取数据                       | 工作台     |
> 组件之间通过 `Context` 传递数据，实现完全解耦。每个组件只关心自己的工作内容和上下文中的资源，无需与其他组件直接通信[-4](https://www.e-com-net.com/article/1612245616446963712.htm)。
### 2.2 EL 表达式示例
```text
# 串行编排
THEN(a, b, c, d)
# 并行编排（各组件异步执行）
THEN(a, WHEN(b, c, d), e)
# 条件编排（IF 语句）
IF(memberTierCmp, THEN(goldRewardCmp, sendGiftCmp), normalRewardCmp)
# 选择编排（SWITCH 语句）
SWITCH(memberTierSwitchCmp).to(
  goldRewardCmp,
  silverRewardCmp,
  bronzeRewardCmp
);
# 循环编排
FOR(3).DO(THEN(a, b));
```
> 注意：THEN、WHEN、IF 等关键字必须大写[-2](https://www.yuque.com/wangshijiang/gb1gwn/izct54vqhsbicgyb)。
***
## 三、业务组件定义
本平台预定义以下核心事件处理组件，所有组件均已实现 `NodeComponent` 接口。
### 3.1 组件清单
| 组件ID                | 组件名称      | 对应类名                      | 功能说明                                          |
| ------------------- | --------- | ------------------------- | --------------------------------------------- |
| `idempotentCmp`     | 幂等检查      | `IdempotentComponent`     | 检查并标记幂等键，防止重复处理                               |
| `standardizeCmp`    | 数据标准化     | `StandardizeComponent`    | 调用 GraalVM 映射脚本，将原始请求转换为标准 `TransactionEvent` |
| `oneIdCmp`          | One-ID 匹配 | `OneIdComponent`          | 根据渠道标识匹配或创建会员 ID                              |
| `factBuilderCmp`    | 事实构建      | `FactBuilderComponent`    | 构建 `MemberFact` 和 `EventFact`，供规则引擎使用         |
| `ruleEngineCmp`     | 规则引擎      | `RuleEngineComponent`     | 调用 Drools 规则引擎，收集动作（Action）                   |
| `actionExecuteCmp`  | 动作执行      | `ActionExecuteComponent`  | 执行积分发放、等级变更等动作                                |
| `completeCmp`       | 完成处理      | `CompleteComponent`       | 标记幂等完成，发布领域事件                                 |
| `refundSpecificCmp` | 退款处理      | `RefundSpecificComponent` | 处理退款订单的积分回滚（仅退款流程）                            |
| `errorHandlerCmp`   | 异常处理      | `ErrorHandlerComponent`   | 统一异常捕获与处理                                     |
### 3.2 组件实现规范
```java
package com.loyalty.platform.flow.components;
import com.loyalty.platform.flow.context.EventContext;
import com.yomahub.liteflow.core.NodeComponent;
import org.springframework.stereotype.Component;
@Component("standardizeCmp")
public class StandardizeComponent extends NodeComponent {
    @Override
    public void process() throws Exception {
        // 1. 获取共享上下文
        EventContext ctx = this.getContextBean(EventContext.class);
        // 2. 执行业务逻辑
        TransactionEvent event = standardize(ctx.getRawPayload(), ctx.getProgramCode());
        ctx.setTransactionEvent(event);
        // 3. 可选：设置组件参数
        // Object param = this.getCmpData(Object.class);
        // 4. 可选：获取请求参数
        // Object requestData = this.getRequestData();
    }
    @Override
    public void onSuccess() throws Exception {
        // 组件成功回调
    }
    @Override
    public void onError(Exception e) throws Exception {
        // 组件异常回调
    }
}
```
### 3.3 上下文对象
```java
package com.loyalty.platform.flow.context;
import lombok.Data;
import java.util.List;
@Data
public class EventContext {
    // 输入
    private String programCode;
    private String rawPayload;
    private String channel;
    private String idempotencyKey;
    
    // 中间结果
    private TransactionEvent transactionEvent;
    private MemberFact memberFact;
    private EventFact eventFact;
    private List<Action> actions;
    
    // 控制标志
    private boolean processingFailed;
    private String errorMessage;
    private String idempotentRecordId;
    
    // 扩展属性
    private Map<String, Object> attributes;
}
```
***
## 四、可视化设计器界面
### 4.1 页面整体布局
```text
┌─────────────────────────────────────────────────────────────────────────────┐
│ 流程编排器                                 [保存] [发布] [测试] [历史版本]  │
├─────────────────────────────────────────────────────────────────────────────┤
│ ┌──────────────┬─────────────────────────────────────────────────────────┐ │
│ │  组件库      │                    画布（React Flow）                    │ │
│ │ ┌──────────┐ │  ┌─────────┐    ┌─────────┐    ┌─────────┐             │ │
│ │ │幂等检查   │ │  │idempotent│───▶│standard│───▶│ oneId  │             │ │
│ │ ├──────────┤ │  │   Cmp   │    │  Cmp   │    │  Cmp   │             │ │
│ │ │数据标准化 │ │  └─────────┘    └─────────┘    └─────────┘             │ │
│ │ ├──────────┤ │        │                                             │ │
│ │ │One-ID匹配│ │        ▼                                             │ │
│ │ ├──────────┤ │  ┌─────────┐                                         │ │
│ │ │事实构建  │ │  │factBldr │                                         │ │
│ │ ├──────────┤ │  │  Cmp   │                                         │ │
│ │ │规则引擎  │ │  └─────────┘                                         │ │
│ │ ├──────────┤ │        │                                             │ │
│ │ │动作执行  │ │        ▼                                             │ │
│ │ ├──────────┤ │  ┌─────────┐    ┌─────────┐    ┌─────────┐          │ │
│ │ │完成处理  │ │  │ruleEng  │───▶│action   │───▶│complete │          │ │
│ │ ├──────────┤ │  │  Cmp   │    │  Cmp   │    │  Cmp   │          │ │
│ │ │退款处理  │ │  └─────────┘    └─────────┘    └─────────┘          │ │
│ │ ├──────────┤ │                                                     │ │
│ │ │异常处理  │ │                                                     │ │
│ │ └──────────┘ │                                                     │ │
│ └──────────────┴─────────────────────────────────────────────────────────┘ │
│                                                                             │
│ ┌─────────────────────────────────────────────────────────────────────────┐ │
│ │ 属性面板（点击节点时显示）                                               │ │
│ │ 组件ID:     [standardizeCmp        ]  (可编辑)                          │ │
│ │ 组件名称:   [数据标准化            ]                                    │ │
│ │ 超时时间:   [5000] ms                                                  │ │
│ │ 异步执行:   [ ]                                                         │ │
│ │ 重试次数:   [3]                                                         │ │
│ │ 组件参数(JSON): [{"mappingKey":"value"}]                                │ │
│ └─────────────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────────────┘
```
### 4.2 编排模式支持
设计器需支持以下编排模式，对应 LiteFlow 的 EL 关键字[-2](https://www.yuque.com/wangshijiang/gb1gwn/izct54vqhsbicgyb)：
| 编排模式     | LiteFlow 关键字    | 可视化表达                    |
| -------- | --------------- | ------------------------ |
| **串行编排** | `THEN`          | 节点 A → 节点 B → 节点 C（单一链路） |
| **并行编排** | `WHEN`          | 分支节点，多个分支同时执行            |
| **条件编排** | `IF`            | 菱形判断节点 + THEN/ELSE 分支    |
| **选择编排** | `SWITCH`        | 菱形节点 + 多个分支，根据返回值选择其一    |
| **循环编排** | `FOR` / `WHILE` | 特殊节点 + 循环体子流程            |
### 4.3 组件节点配置
每个节点支持配置组件参数（通过 `data` 关键字）[-5](https://liteflow.cc/pages/v2.12.X/6e4d15/)：
```json
{
  "componentId": "ruleEngineCmp",
  "componentName": "规则引擎",
  "cmpData": {
    "cacheTtl": 300,
    "enableLog": true
  },
  "timeout": 5000,
  "retryCount": 3,
  "async": false
}
```
### 4.4 连线配置
每条连线可配置条件表达式（用于 IF / SWITCH 分支）：
```json
{
  "sourceId": "memberTierCmp",
  "targetId": "goldRewardCmp",
  "condition": "== 'GOLD'"
}
```
***
## 五、数据存储设计
### 5.1 流程定义表 `flow_definition`
存储流程定义的元数据和画布 JSON。
```sql
CREATE TABLE flow_definition (
    id BIGSERIAL PRIMARY KEY,
    program_code VARCHAR(32) NOT NULL,
    chain_name VARCHAR(64) NOT NULL,        -- 流程链名称（唯一，如 ORDER_CHAIN）
    chain_type VARCHAR(20) NOT NULL,        -- ORDER / BEHAVIOR / REFUND
    description VARCHAR(256),
    el_expression TEXT NOT NULL,            -- LiteFlow EL 表达式
    flow_graph JSONB NOT NULL,              -- React Flow 画布 JSON（nodes + edges）
    status VARCHAR(20) DEFAULT 'DRAFT',     -- DRAFT / ACTIVE / INACTIVE
    version INT DEFAULT 1,                  -- 版本号（乐观锁）
    created_by VARCHAR(64),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_by VARCHAR(64),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(program_code, chain_name)
);
```
**字段说明**：
| 字段              | 类型          | 说明                                       |
| --------------- | ----------- | ---------------------------------------- |
| `chain_name`    | VARCHAR(64) | 流程链唯一标识，如 `ORDER_CHAIN`、`BEHAVIOR_CHAIN` |
| `chain_type`    | VARCHAR(20) | 流程类型，用于前端筛选和默认模板加载                       |
| `el_expression` | TEXT        | 从 `flow_graph` 生成的 LiteFlow EL 表达式       |
| `flow_graph`    | JSONB       | React Flow 画布的完整状态（nodes + edges）        |
### 5.2 `flow_graph` JSON 结构
```json
{
  "version": "1.0",
  "nodes": [
    {
      "id": "node_idempotent",
      "type": "sequence",
      "position": { "x": 100, "y": 200 },
      "data": {
        "componentId": "idempotentCmp",
        "componentName": "幂等检查",
        "cmpData": {},
        "timeout": 3000
      }
    },
    {
      "id": "node_standardize",
      "type": "sequence",
      "position": { "x": 350, "y": 200 },
      "data": {
        "componentId": "standardizeCmp",
        "componentName": "数据标准化",
        "cmpData": {}
      }
    }
  ],
  "edges": [
    {
      "id": "edge_1",
      "source": "node_idempotent",
      "target": "node_standardize",
      "type": "default"
    }
  ]
}
```
**节点类型（type）**：
| type 值      | 说明     | LiteFlow 关键字    |
| ----------- | ------ | --------------- |
| `start`     | 起始节点   | —               |
| `sequence`  | 普通执行节点 | —               |
| `parallel`  | 并行分支节点 | `WHEN`          |
| `condition` | 条件判断节点 | `IF`            |
| `switch`    | 选择分支节点 | `SWITCH`        |
| `loop`      | 循环节点   | `FOR` / `WHILE` |
| `end`       | 结束节点   | —               |
### 5.3 流程版本历史表（可选）
```sql
CREATE TABLE flow_definition_history (
    id BIGSERIAL PRIMARY KEY,
    flow_definition_id BIGINT NOT NULL,
    program_code VARCHAR(32) NOT NULL,
    chain_name VARCHAR(64) NOT NULL,
    el_expression TEXT NOT NULL,
    flow_graph JSONB NOT NULL,
    version INT NOT NULL,
    status VARCHAR(20),
    created_by VARCHAR(64),
    created_at TIMESTAMPTZ DEFAULT NOW()
);
```
### 5.4 发布配置表（可选）
```sql
CREATE TABLE flow_publish_config (
    id BIGSERIAL PRIMARY KEY,
    program_code VARCHAR(32) NOT NULL,
    config_type VARCHAR(20) NOT NULL,       -- NACOS / LOCAL_FILE / DATABASE
    config_location VARCHAR(256) NOT NULL,  -- Nacos dataId / 文件路径 / 表名
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(program_code, config_type)
);
```
### 5.5 执行日志表
```sql
CREATE TABLE flow_execution_log (
    id BIGSERIAL PRIMARY KEY,
    program_code VARCHAR(32) NOT NULL,
    chain_name VARCHAR(64) NOT NULL,
    request_id VARCHAR(64) NOT NULL,
    start_time TIMESTAMPTZ NOT NULL,
    end_time TIMESTAMPTZ,
    status VARCHAR(20) NOT NULL,            -- SUCCESS / FAILED / TIMEOUT
    node_traces JSONB,                      -- 节点执行轨迹
    error_message TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_fel_program_chain ON flow_execution_log(program_code, chain_name);
CREATE INDEX idx_fel_request_id ON flow_execution_log(request_id);
```
***
## 六、JSON 到 EL 表达式的转换
### 6.1 转换规则
| 节点类型      | 连线模式                | 生成的 EL 片段                                         |
| --------- | ------------------- | ------------------------------------------------- |
| 单一串行      | A → B → C           | `THEN(A, B, C)`                                   |
| 并行 + 串行   | A → (B,C,D 并行) → E  | `THEN(A, WHEN(B, C, D), E)`                       |
| IF 条件     | 判断节点 → THEN/ELSE 分支 | `IF(conditionCmp, THEN(...), ELSE(...))`          |
| SWITCH 选择 | 判断节点 → 多个分支         | `SWITCH(switchCmp).to(branch1, branch2, branch3)` |
| 循环        | 循环节点 → 循环体          | `FOR(N).DO(THEN(A, B))`                           |
### 6.2 转换算法（伪代码）
```java
@Component
public class ElGenerator {
    /**
     * 从 React Flow JSON 生成 LiteFlow EL 表达式
     * @param flowGraph 画布 JSON (包含 nodes 和 edges)
     * @return EL 表达式字符串
     */
    public static String generate(JSONObject flowGraph) {
        JSONArray nodes = flowGraph.getJSONArray("nodes");
        JSONArray edges = flowGraph.getJSONArray("edges");
        
        // 构建节点映射、邻接表、入度表
        Map<String, JSONObject> nodeMap = new HashMap<>();
        Map<String, List<String>> adjacency = new HashMap<>();
        Map<String, Integer> inDegree = new HashMap<>();
        
        for (int i = 0; i < nodes.size(); i++) {
            JSONObject node = nodes.getJSONObject(i);
            String id = node.getString("id");
            nodeMap.put(id, node);
            adjacency.put(id, new ArrayList<>());
            inDegree.put(id, 0);
        }
        for (int i = 0; i < edges.size(); i++) {
            JSONObject edge = edges.getJSONObject(i);
            String source = edge.getString("source");
            String target = edge.getString("target");
            adjacency.get(source).add(target);
            inDegree.merge(target, 1, Integer::sum);
        }
        
        // 找到起始节点（入度为0）
        String startNodeId = null;
        for (Map.Entry<String, Integer> entry : inDegree.entrySet()) {
            if (entry.getValue() == 0) {
                startNodeId = entry.getKey();
                break;
            }
        }
        if (startNodeId == null) {
            throw new IllegalStateException("未找到起始节点");
        }
        
        return traverse(startNodeId, nodeMap, adjacency);
    }

    private static String traverse(String nodeId, Map<String, JSONObject> nodeMap,
                                   Map<String, List<String>> adjacency) {
        JSONObject node = nodeMap.get(nodeId);
        String type = node.getString("type");
        List<String> nextNodes = adjacency.getOrDefault(nodeId, Collections.emptyList());
        String compId = node.getJSONObject("data").getString("componentId");
        
        switch (type) {
            case "start":
                if (nextNodes.size() == 1) {
                    return traverse(nextNodes.get(0), nodeMap, adjacency);
                }
                throw new IllegalStateException("起始节点只能有一个后继");
                
            case "condition":  // IF 语句
                if (nextNodes.size() != 2) {
                    throw new IllegalStateException("条件节点必须有两个分支");
                }
                String thenBranch = traverse(nextNodes.get(0), nodeMap, adjacency);
                String elseBranch = traverse(nextNodes.get(1), nodeMap, adjacency);
                return String.format("IF(%s, %s, %s)", compId, thenBranch, elseBranch);
                
            case "parallel":   // WHEN 并行
                List<String> parallelBodies = new ArrayList<>();
                for (String child : nextNodes) {
                    parallelBodies.add(traverse(child, nodeMap, adjacency));
                }
                return String.format("WHEN(%s)", String.join(", ", parallelBodies));
                
            case "switch":     // SWITCH 选择
                List<String> switchBodies = new ArrayList<>();
                for (String child : nextNodes) {
                    switchBodies.add(traverse(child, nodeMap, adjacency));
                }
                return String.format("SWITCH(%s).to(%s)", compId, String.join(", ", switchBodies));
                
            case "loop":       // FOR 循环
                if (nextNodes.size() != 1) {
                    throw new IllegalStateException("循环节点只能有一个后继");
                }
                int loopCount = node.getJSONObject("data").getIntValue("loopCount");
                String loopBody = traverse(nextNodes.get(0), nodeMap, adjacency);
                return String.format("FOR(%d).DO(%s)", loopCount, loopBody);
                
            case "sequence":
            default:
                if (nextNodes.isEmpty()) {
                    return compId;
                } else if (nextNodes.size() == 1) {
                    return String.format("THEN(%s, %s)", compId,
                            traverse(nextNodes.get(0), nodeMap, adjacency));
                } else {
                    // 多个后继转换为并行分支：THEN(A, WHEN(B, C, D))
                    List<String> parallel = new ArrayList<>();
                    for (String child : nextNodes) {
                        parallel.add(traverse(child, nodeMap, adjacency));
                    }
                    return String.format("THEN(%s, WHEN(%s))", compId, String.join(", ", parallel));
                }
        }
    }
}
```
***
## 七、后端实现
### 7.1 LiteFlow 配置文件

```yaml
liteflow:
  rule-source: nacos://localhost:8848?dataId=liteflow_el&group=DEFAULT_GROUP
  enable-spring-bean-inject: true
  component-scan: com.loyalty.platform.flow.components
  when-max-workers: 16
  monitor:
    enable-log: true
    period: 30000
```
### 7.2 流程发布服务
```java
@Service
public class FlowPublishService {
    @Autowired private FlowDefinitionRepository flowRepo;
    @Autowired private NacosConfigPublisher configPublisher;
    @Autowired private LiteFlowExecutor flowExecutor;
    @Transactional
    public void publishFlow(String chainName, String programCode) {
        FlowDefinition flow = flowRepo.findByChainNameAndProgramCode(chainName, programCode);
        if (flow == null) {
            throw new BusinessException("流程定义不存在");
        }
        
        // 1. 从 flow_graph 生成 EL 表达式
        String elExpression = ElGenerator.generate(flow.getFlowGraph());
        
        // 2. 更新数据库
        flow.setElExpression(elExpression);
        flow.setStatus("ACTIVE");
        flowRepo.save(flow);
        
        // 3. 推送到配置中心（Nacos）
        configPublisher.publish(programCode, chainName, elExpression);
        
        // 4. 热加载 LiteFlow 规则
        flowExecutor.reloadRule();
    }
}
```
### 7.3 流程执行入口
```java
@RestController
public class EventController {
    @Autowired private LiteFlowExecutor flowExecutor;
    @PostMapping("/api/events/{chainName}/{programCode}")
    public ResponseEntity<ApiResponse> processEvent(
            @PathVariable String chainName,
            @PathVariable String programCode,
            @RequestBody String rawBody) {
        
        // 1. 构建上下文
        EventContext ctx = new EventContext();
        ctx.setProgramCode(programCode);
        ctx.setRawPayload(rawBody);
        
        // 2. 将上下文放入 LiteFlow Slot
        DefaultSlot slot = (DefaultSlot) flowExecutor.getSlot();
        slot.setContextBean(EventContext.class, ctx);
        
        // 3. 执行流程
        LiteflowResponse response = flowExecutor.execute2Resp(chainName);
        
        if (!response.isSuccess()) {
            return ResponseEntity.ok(ApiResponse.error("FLOW_ERROR", response.getMessage()));
        }
        return ResponseEntity.ok(ApiResponse.success());
    }
}
```
### 7.4 DRL 生成器扩展
对于规则引擎组件（`ruleEngineCmp`），可在执行时动态传入规则代码参数：
```java
@Component("ruleEngineCmp")
public class RuleEngineComponent extends NodeComponent {
    @Override
    public void process() throws Exception {
        EventContext ctx = this.getContextBean(EventContext.class);
        // 从组件参数中获取规则代码
        String ruleCode = this.getCmpData(String.class);
        // 执行 Drools 规则引擎
        List<Action> actions = ruleEngineService.evaluate(ruleCode, ctx);
        ctx.setActions(actions);
    }
}
```
### 7.5 EL 生成器核心方法
```java
@Component
public class ElGenerator {
    public static String generate(JSONObject flowGraph) {
        JSONArray nodes = flowGraph.getJSONArray("nodes");
        JSONArray edges = flowGraph.getJSONArray("edges");
        // 构建节点映射、邻接表、入度表，找到起始节点
        Map<String, JSONObject> nodeMap = new HashMap<>();
        Map<String, List<String>> adjacency = new HashMap<>();
        Map<String, Integer> inDegree = new HashMap<>();
        
        for (int i = 0; i < nodes.size(); i++) {
            JSONObject node = nodes.getJSONObject(i);
            String id = node.getString("id");
            nodeMap.put(id, node);
            adjacency.put(id, new ArrayList<>());
            inDegree.put(id, 0);
        }
        for (int i = 0; i < edges.size(); i++) {
            JSONObject edge = edges.getJSONObject(i);
            String source = edge.getString("source");
            String target = edge.getString("target");
            adjacency.get(source).add(target);
            inDegree.merge(target, 1, Integer::sum);
        }
        // 找到起始节点
        String startNodeId = null;
        for (Map.Entry<String, Integer> entry : inDegree.entrySet()) {
            if (entry.getValue() == 0) {
                startNodeId = entry.getKey();
                break;
            }
        }
        if (startNodeId == null) {
            throw new IllegalStateException("未找到起始节点");
        }
        return traverse(startNodeId, nodeMap, adjacency);
    }
    private static String traverse(String nodeId, Map<String, JSONObject> nodeMap, 
                                    Map<String, List<String>> adjacency) {
        JSONObject node = nodeMap.get(nodeId);
        String type = node.getString("type");
        List<String> nextNodes = adjacency.getOrDefault(nodeId, Collections.emptyList());
        String compId = node.getJSONObject("data").getString("componentId");
        
        // 根据不同类型生成 EL 片段
        if ("start".equals(type) && nextNodes.size() == 1) {
            return traverse(nextNodes.get(0), nodeMap, adjacency);
        } else if ("condition".equals(type)) {
            if (nextNodes.size() != 2) throw new IllegalStateException("条件节点必须有两个分支");
            String thenBranch = traverse(nextNodes.get(0), nodeMap, adjacency);
            String elseBranch = traverse(nextNodes.get(1), nodeMap, adjacency);
            return String.format("IF(%s, %s, %s)", compId, thenBranch, elseBranch);
        } else if ("parallel".equals(type)) {
            List<String> parallelBodies = nextNodes.stream()
                .map(next -> traverse(next, nodeMap, adjacency))
                .collect(Collectors.toList());
            return String.format("WHEN(%s)", String.join(", ", parallelBodies));
        } else if ("switch".equals(type)) {
            List<String> switchBodies = nextNodes.stream()
                .map(next -> traverse(next, nodeMap, adjacency))
                .collect(Collectors.toList());
            return String.format("SWITCH(%s).to(%s)", compId, String.join(", ", switchBodies));
        } else if ("loop".equals(type)) {
            if (nextNodes.size() != 1) throw new IllegalStateException("循环节点只能有一个后继");
            int loopCount = node.getJSONObject("data").getIntValue("loopCount");
            String loopBody = traverse(nextNodes.get(0), nodeMap, adjacency);
            return String.format("FOR(%d).DO(%s)", loopCount, loopBody);
        } else if ("sequence".equals(type)) {
            if (nextNodes.isEmpty()) return compId;
            if (nextNodes.size() == 1) {
                return String.format("THEN(%s, %s)", compId, traverse(nextNodes.get(0), nodeMap, adjacency));
            } else {
                // 多个后继作为并行分支
                List<String> parallelBodies = nextNodes.stream()
                    .map(next -> traverse(next, nodeMap, adjacency))
                    .collect(Collectors.toList());
                return String.format("THEN(%s, WHEN(%s))", compId, String.join(", ", parallelBodies));
            }
        }
        return compId;
    }
}
```
***
## 八、数据库表结构汇总
### 8.1 流程定义表（核心）
```sql
CREATE TABLE flow_definition (
    id BIGSERIAL PRIMARY KEY,
    program_code VARCHAR(32) NOT NULL,
    chain_name VARCHAR(64) NOT NULL,
    chain_type VARCHAR(20) NOT NULL,
    description VARCHAR(256),
    el_expression TEXT NOT NULL,
    flow_graph JSONB NOT NULL,
    status VARCHAR(20) DEFAULT 'DRAFT',
    version INT DEFAULT 1,
    created_by VARCHAR(64),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_by VARCHAR(64),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(program_code, chain_name)
);
```
### 8.2 流程版本历史表
```sql
CREATE TABLE flow_definition_history (
    id BIGSERIAL PRIMARY KEY,
    flow_definition_id BIGINT NOT NULL,
    program_code VARCHAR(32) NOT NULL,
    chain_name VARCHAR(64) NOT NULL,
    el_expression TEXT NOT NULL,
    flow_graph JSONB NOT NULL,
    version INT NOT NULL,
    status VARCHAR(20),
    created_by VARCHAR(64),
    created_at TIMESTAMPTZ DEFAULT NOW()
);
```
### 8.3 流程发布配置表
```sql
CREATE TABLE flow_publish_config (
    id BIGSERIAL PRIMARY KEY,
    program_code VARCHAR(32) NOT NULL,
    config_type VARCHAR(20) NOT NULL,
    config_location VARCHAR(256) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(program_code, config_type)
);
```
### 8.4 流程执行日志表
```sql
CREATE TABLE flow_execution_log (
    id BIGSERIAL PRIMARY KEY,
    program_code VARCHAR(32) NOT NULL,
    chain_name VARCHAR(64) NOT NULL,
    request_id VARCHAR(64) NOT NULL,
    start_time TIMESTAMPTZ NOT NULL,
    end_time TIMESTAMPTZ,
    status VARCHAR(20) NOT NULL,
    node_traces JSONB,
    error_message TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
```
***
## 九、枚举值定义
| 枚举名           | 值           | 说明              |
| ------------- | ----------- | --------------- |
| `chain_type`  | `ORDER`     | 订单处理流程          |
|               | `BEHAVIOR`  | 行为事件处理流程        |
|               | `REFUND`    | 退款处理流程          |
| `flow_status` | `DRAFT`     | 草稿              |
|               | `ACTIVE`    | 已发布生效           |
|               | `INACTIVE`  | 已停用             |
| `node_type`   | `start`     | 起始节点            |
|               | `sequence`  | 顺序执行节点          |
|               | `parallel`  | 并行分支节点（WHEN）    |
|               | `condition` | 条件分支节点（IF）      |
|               | `switch`    | 选择分支节点（SWITCH）  |
|               | `loop`      | 循环节点（FOR/WHILE） |
|               | `end`       | 结束节点            |
***
## 十、与主设计文档的集成
1. **事件处理流程**：主文档 7.5.4 节“系统内部固定流程”中的串行处理链，可替换为本设计的 LiteFlow 编排。
2. **LiteFlow 配置文件**：需补充到 `application.yml` 中（`liteflow.rule-source` 指向 Nacos 或本地文件）。
3. **数据库**：增加 8.1\~8.4 节中的 4 张表。
4. **前端**：在管理界面增加“流程编排器”菜单，使用 React Flow 作为画布组件。
***
**文档结束** – 本文档完整定义了 LiteFlow 流程编排引擎的数据库设计、组件定义、可视化界面、JSON 结构、EL 转换算法及后端伪代码，可直接交付 AI 开发。
