# 设计文档更新：基于 LiteFlow 的事件处理流水线与 React Flow 可视化编排
> 以下内容将整合到主设计文档 v7.3，作为 **第七章 7.7 节（事件处理流水线实现）** 和 **第八章 8.15 节（流程编排可视化设计器）** 的详细设计。
***
## 一、概述
为满足忠诚度平台复杂事件处理（订单、行为、退款等）的灵活编排需求，并支持运营人员可视化调整处理流程，我们采用 **LiteFlow 流程编排引擎** 作为后端执行框架，配合 **React Flow** 自研前端可视化设计器，实现 **流程定义可配置、可热更新、可观测** 的智能流水线。
### 1.1 设计目标
* **后端**：LiteFlow 负责执行事件处理组件链，支持顺序、并行、条件分支，并支持配置中心热更新。
* **前端**：React Flow 提供拖拽式流程编排界面，运营人员可直观配置组件顺序、分支条件，并一键发布到后端。
* **集成**：前端生成的流程定义（EL 表达式）存储到数据库或配置中心，后端 LiteFlow 实时加载生效。
### 1.2 为何不采用 LiteFlow 官方可视化工具
LiteFlow 官方提供的可视化项目（LiteFlow Designer、LiteFlow 可视化编辑器）已停止更新，且技术栈与项目现有前端（React + Ant Design + React Flow）不匹配。因此决定自研基于 React Flow 的轻量级流程编排器，完全可控且风格统一。
***
## 二、后端：LiteFlow 事件处理流水线
### 2.1 核心组件结构
沿用之前设计的 7 个核心组件，每个组件实现 `NodeComponent` 接口：
| 组件名       | 类名                       | 职责                        |
| --------- | ------------------------ | ------------------------- |
| 幂等检查      | `IdempotentComponent`    | 检查并标记幂等键                  |
| 数据标准化     | `StandardizeComponent`   | GraalVM 脚本转换              |
| One-ID 匹配 | `OneIdComponent`         | 会员匹配/创建                   |
| 事实构建      | `FactBuilderComponent`   | 构建 MemberFact / EventFact |
| 规则引擎      | `RuleEngineComponent`    | 调用 Drools                 |
| 动作执行      | `ActionExecuteComponent` | 积分/等级变更                   |
| 完成处理      | `CompleteComponent`      | 清理、发布事件                   |
### 2.2 组件实现规范（基类）

```java
public abstract class BaseLiteflowComponent extends NodeComponent {
    protected abstract void doProcess(EventContext ctx) throws Exception;
    @Override
    public void process() throws Exception {
        EventContext ctx = this.getContextBean(EventContext.class);
        long start = System.currentTimeMillis();
        try {
            doProcess(ctx);
        } catch (Exception e) {
            ctx.setProcessingFailed(true);
            ctx.setErrorMessage(e.getMessage());
            throw e;
        } finally {
            long duration = System.currentTimeMillis() - start;
            log.info("Component {} cost {}ms", this.getClass().getSimpleName(), duration);
        }
    }
}
```
### 2.3 上下文对象（EventContext）

```java
@Data
public class EventContext implements Serializable {
    private String programCode;
    private String rawPayload;
    private String channel;
    private String idempotencyKey;
    private TransactionEvent transactionEvent;
    private MemberFact memberFact;
    private EventFact eventFact;
    private List<Action> actions;
    private boolean processingFailed;
    private String errorMessage;
    private Map<String, Object> attributes = new HashMap<>();
}
```
### 2.4 LiteFlow 配置
```yaml
liteflow:
  rule-source: nacos://localhost:8848?dataId=liteflow_el&group=DEFAULT_GROUP
  enable-spring-bean-inject: true
  component-scan: com.loyalty.platform.flow.components
  when-max-workers: 16
  monitor:
    enable-log: true
```
### 2.5 EL 流程定义存储
流程定义有两种存储方式：
1. **本地文件**（开发测试）：`src/main/resources/liteflow/el/*.el.xml`
2. **Nacos 配置中心**（生产推荐）：Data ID `liteflow_el`，内容为纯 EL 表达式。
示例 EL（订单事件完整链路）：

```el
ORDER_CHAIN = THEN(
    idempotentCmp,
    standardizeCmp,
    oneIdCmp,
    factBuilderCmp,
    ruleEngineCmp,
    actionExecuteCmp,
    completeCmp
);
```
### 2.6 动态流程选择与执行

```java
@RestController
public class EventController {
    @Autowired private FlowExecutor flowExecutor;
    @PostMapping("/api/events/{channel}/{programCode}")
    public ResponseEntity<ApiResponse> process(@PathVariable String channel,
                                               @PathVariable String programCode,
                                               @RequestBody String rawBody) {
        EventContext ctx = new EventContext();
        ctx.setProgramCode(programCode);
        ctx.setChannel(channel);
        ctx.setRawPayload(rawBody);
        // 根据 channel 和 rawBody 内容选择链名称
        String chainName = resolveChainName(channel, rawBody);
        
        // 将上下文放入 LiteFlow Slot
        DefaultSlot slot = (DefaultSlot) flowExecutor.getSlot();
        slot.setContextBean(EventContext.class, ctx);
        
        LiteflowResponse response = flowExecutor.execute2Resp(chainName);
        if (!response.isSuccess()) {
            return ResponseEntity.ok(ApiResponse.error(response.getMessage()));
        }
        return ResponseEntity.ok(ApiResponse.success());
    }
}
```
***
## 三、前端：React Flow 流程编排设计器
为满足运营人员可视化调整事件处理流程的需求，自研基于 React Flow 的轻量级流程设计器。
### 3.1 功能需求
* **拖拽添加组件**：从左侧组件库拖拽 7 个基础组件（幂等、标准化、One-ID 等）到画布。
* **节点连线**：定义组件执行顺序（支持顺序、并行、条件分支）。
* **属性配置**：点击节点可配置组件参数（如超时时间、重试次数等，后续扩展）。
* **生成 EL 表达式**：根据画布节点和连线，自动生成 LiteFlow 标准 EL 脚本。
* **预览与测试**：模拟执行流程，验证逻辑正确性。
* **保存与发布**：将 EL 脚本保存到后端，并触发 LiteFlow 热更新。
### 3.2 技术选型
| 组件     | 技术                    | 说明            |
| ------ | --------------------- | ------------- |
| 框架     | React 18 + TypeScript | 与主文档一致        |
| 画布     | React Flow 11.x       | 支持自定义节点、边、布局  |
| UI 组件  | Ant Design 5          | 属性面板、模态框等     |
| 状态管理   | Zustand               | 管理画布节点/边/选中状态 |
| API 通信 | axios                 | 保存/发布流程定义     |
### 3.3 页面布局
```text
┌─────────────────────────────────────────────────────────────────────┐
│ 流程设计器 - 订单事件处理流水线              [保存] [发布] [测试]     │
├──────────────┬──────────────────────────────────────────────────────┤
│ 组件库       │ 画布区域（React Flow）                               │
│ ┌──────────┐ │                                                      │
│ │ 幂等检查 │ │   [idempotentCmp] → [standardizeCmp] → [oneIdCmp]   │
│ ├──────────┤ │         ↓                                           │
│ │ 数据标准化│ │   [factBuilderCmp]                                 │
│ ├──────────┤ │         ↓                                           │
│ │ One-ID   │ │   [ruleEngineCmp] → [actionExecuteCmp] → [completeCmp]│
│ ├──────────┤ │                                                      │
│ │ 事实构建 │ │                                                      │
│ ├──────────┤ │                                                      │
│ │ 规则引擎 │ │                                                      │
│ └──────────┘ │                                                      │
│              │  ──────────────────────────────────────────────────  │
│              │  属性面板（点击节点时显示）                           │
│              │  组件名称: 幂等检查                                   │
│              │  超时(ms): [1000]                                    │
│              │  是否异步: [否]                                      │
└──────────────┴──────────────────────────────────────────────────────┘
```
### 3.4 核心实现
#### 3.4.1 自定义节点类型

```typescript
// 定义节点类型常量
export const NodeTypes = {
  IDEMPOTENT: 'idempotent',
  STANDARDIZE: 'standardize',
  ONE_ID: 'oneId',
  FACT_BUILDER: 'factBuilder',
  RULE_ENGINE: 'ruleEngine',
  ACTION_EXECUTE: 'actionExecute',
  COMPLETE: 'complete',
  PARALLEL: 'parallel',      // 并行分支节点（特殊）
  CONDITION: 'condition',    // 条件分支节点（特殊）
};
// 节点数据格式
interface FlowNodeData {
  label: string;           // 显示名称
  componentName: string;   // LiteFlow 组件名（如 idempotentCmp）
  config?: Record<string, any>; // 扩展配置
}
// 自定义节点渲染组件
const CustomNode = ({ data }: { data: FlowNodeData }) => {
  return (
    <div style={{
      padding: '10px 20px',
      border: '1px solid #1a1a1a',
      borderRadius: '8px',
      background: '#ffffff',
      boxShadow: '0 2px 4px rgba(0,0,0,0.05)'
    }}>
      <div style={{ fontWeight: 600 }}>{data.label}</div>
      <div style={{ fontSize: 12, color: '#666' }}>{data.componentName}</div>
    </div>
  );
};
```
#### 3.4.2 画布状态管理（Zustand）

```typescript
interface FlowStore {
  nodes: Node[];
  edges: Edge[];
  selectedNode: Node | null;
  addNode: (type: NodeTypes, position: XYPosition) => void;
  updateNodeConfig: (nodeId: string, config: Record<string, any>) => void;
  onConnect: (connection: Connection) => void;
  onNodesChange: (changes: NodeChange[]) => void;
  onEdgesChange: (changes: EdgeChange[]) => void;
  generateEL: () => string;   // 根据节点和边生成 EL
  saveFlow: () => Promise<void>;
  publishFlow: () => Promise<void>;
}
```
#### 3.4.3 EL 表达式生成算法
根据有向无环图（DAG）生成 LiteFlow EL。基本规则：
* 单一顺序链：`THEN(A, B, C)`
* 并行节点：将 `parallel` 类型节点的所有后继分组为 `WHEN(A, B, C)`
* 条件分支：将 `condition` 类型节点转换为 `IF(conditionCmp, THEN(...), ELSE(...))`
简化版生成器（伪代码）：

```typescript
function generateEL(nodes: Node[], edges: Edge[]): string {
  const adjacency = buildAdjacency(nodes, edges);
  const startNodes = nodes.filter(n => !edges.some(e => e.target === n.id));
  if (startNodes.length !== 1) throw new Error('需有唯一起始节点');
  
  function traverse(nodeId: string): string {
    const nextIds = adjacency[nodeId] || [];
    if (nextIds.length === 0) return nodeId;
    if (nextIds.length === 1) return `THEN(${nodeId}, ${traverse(nextIds[0])})`;
    // 多个后继 → 并行或条件（需节点类型辅助）
    const parallelNodes = nextIds.map(id => `WHEN(${id})`).join(', ');
    return `THEN(${nodeId}, ${parallelNodes})`;
  }
  return traverse(startNodes[0].id);
}
```
实际实现需根据节点类型（并行/条件）生成标准 LiteFlow EL。
#### 3.4.4 保存与发布
* **保存**：将画布的 `nodes`、`edges` 以及生成的 EL 表达式一并提交后端，存储到 `flow_definition` 表。
* **发布**：将 EL 表达式推送到 Nacos 配置中心（或写入 LiteFlow 配置文件），并调用 `FlowExecutor.reloadRule()` 热更新。
后端 API：

```java
@PostMapping("/api/flow/definition")
public ApiResponse saveFlow(@RequestBody FlowDefinitionDto dto) {
    // 保存 nodes/edges JSON 到 flow_definition 表
    flowDefRepo.save(dto);
    return ApiResponse.success();
}
@PostMapping("/api/flow/publish/{chainName}")
public ApiResponse publishFlow(@PathVariable String chainName, @RequestBody String el) {
    // 将 EL 写入 Nacos 或本地文件
    configCenter.publish("liteflow_el", chainName + " = " + el);
    // 可选：触发 LiteFlow 热更新
    flowExecutor.reloadRule();
    return ApiResponse.success();
}
```
### 3.5 流程定义存储表

```sql
CREATE TABLE flow_definition (
    id BIGSERIAL PRIMARY KEY,
    program_code VARCHAR(32) NOT NULL,
    chain_name VARCHAR(64) NOT NULL,          -- ORDER_CHAIN, BEHAVIOR_CHAIN...
    chain_type VARCHAR(32) NOT NULL,          -- ORDER / BEHAVIOR / REFUND
    flow_graph JSONB NOT NULL,                -- { nodes: [], edges: [] } 完整画布状态
    el_expression TEXT NOT NULL,              -- 生成的 EL 表达式
    status VARCHAR(20) DEFAULT 'DRAFT',       -- DRAFT / PUBLISHED
    version INT DEFAULT 1,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ,
    UNIQUE(program_code, chain_name)
);
```
### 3.6 与后端 LiteFlow 同步机制
1. 运营人员在设计器完成流程编排，点击「发布」。
2. 前端调用 `/api/flow/publish`，传递 `chainName` 和 `elExpression`。
3. 后端将 EL 写入 Nacos 或数据库（根据 `liteflow.rule-source` 配置决定）。
4. 后端调用 `FlowExecutor.reloadRule()`，LiteFlow 立即重新加载规则。
5. 新的请求立即生效，无需重启。
***
## 四、集成测试与验证
### 4.1 后端单元测试

```java
@SpringBootTest
public class LiteflowChainTest {
    @Autowired private FlowExecutor flowExecutor;
    
    @Test
    public void testOrderChain() {
        EventContext ctx = mockOrderContext();
        DefaultSlot slot = (DefaultSlot) flowExecutor.getSlot();
        slot.setContextBean(EventContext.class, ctx);
        LiteflowResponse response = flowExecutor.execute2Resp("ORDER_CHAIN");
        assertTrue(response.isSuccess());
    }
}
```
### 4.2 前端 E2E 测试（Cypress/Playwright）
* 拖拽组件到画布，验证节点可添加。
* 连线后点击「生成EL」，验证输出符合 LiteFlow 语法。
* 发布流程后，调用后端 API 验证流程已生效。
***
## 五、对原设计文档的修改
| 原章节                             | 修改内容                                |
| ------------------------------- | ----------------------------------- |
| **2.3 核心技术栈选型**                 | 增加 LiteFlow 2.12.4、React Flow 11.x  |
| **第七章 7.5.4 系统内部固定流程**          | 增加“基于 LiteFlow 的事件处理流水线”说明，引用 7.7 节 |
| **新增 7.7 事件处理流水线（LiteFlow 实现）** | 包含本节后端设计                            |
| **第八章 8.15 流程编排可视化设计器**         | 包含本节前端设计                            |
| **第十一章 数据库物理模型**                | 增加 `flow_definition` 表              |
***
## 六、总结
通过集成 **LiteFlow** 作为事件处理流水线的执行引擎，并自研 **React Flow** 可视化设计器，我们实现了：
* ✅ **解耦**：业务逻辑（组件）与执行顺序（EL）完全分离。
* ✅ **热更新**：流程变更通过配置中心实时生效，无需重启。
* ✅ **可视化**：运营人员可拖拽编排流程，降低开发介入成本。
* ✅ **可扩展**：未来可轻松增加并行、条件分支、循环等复杂编排。
* ✅ **技术统一**：前端与主设计文档完全一致（React + Ant Design + React Flow），无额外依赖。
此方案是当前最适合忠诚度管理平台的轻量级、可控、可维护的流程编排解决方案。
