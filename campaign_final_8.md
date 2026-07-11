## 第8章：Production‑grade Canvas + Flow Engine（生产级画布与流程引擎）详细设计
Production‑grade Canvas + Flow Engine 是 Campaign Tools 的**“可视化编排与分布式执行中枢”**。它将前端画布（React Flow）的高效编排体验与后端流程引擎（Zeebe）的生产级可靠性相结合，支撑大规模、高并发的营销活动执行。
***
## 8.0 模块概述
### 8.0.1 本质定义
本章涵盖两大核心子系统：
* **Canvas（画布）**：营销工作流的可视化编程环境（Visual Programming IDE），运营人员通过拖拽节点、连接边来编排 Campaign 流程。
* **Flow Engine（流程引擎）**：将 Canvas 定义的 DAG 转化为可执行工作流（Zeebe BPMN），并负责分布式调度、状态持久化、容错恢复。
### 8.0.2 与 Loyalty 的融合策略
| 组件             | Loyalty 已有能力           | Campaign Tools 处理方式                                                       |
| -------------- | ---------------------- | ------------------------------------------------------------------------- |
| **React Flow** | 已在规则编辑器中使用             | **完全复用**，扩展 Campaign 节点组件库                                                |
| **节点组件**       | 规则节点（条件、动作）            | **扩展**，新增 `AUDIENCE_FILTER`、`AI_SCORE`、`SEND_EMAIL` 等 10+ 种 Campaign 节点类型 |
| **画布渲染**       | 基础 React Flow          | **增强**，引入 WebWorker 布局计算、Canvas 虚拟化、大图懒加载                                 |
| **流程引擎**       | LiteFlow（Loyalty 事件处理） | **Zeebe 新增**，与 LiteFlow 独立共存                                              |
### 8.0.3 整体架构
```text
┌─────────────────────────────────────────────────────────────────────────────┐
│                     Frontend Canvas (React + React Flow)                    │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────────┐   │
│  │ Node        │  │ Canvas      │  │ Inspector   │  │ Validation      │   │
│  │ Palette     │  │ Renderer    │  │ Panel       │  │ Engine          │   │
│  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────────┘   │
│         │                │                │                  │              │
│         └────────────────┼────────────────┼──────────────────┘              │
│                          ▼                ▼                                  │
│              ┌──────────────────────────────────────┐                       │
│              │  Canvas Graph (JSON)                 │                       │
│              │  { nodes: [...], edges: [...] }     │                       │
│              └──────────────────────────────────────┘                       │
└───────────────────────────────────┬─────────────────────────────────────────┘
                                    │ HTTP (保存/加载/编译)
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                     Backend Flow Engine (Zeebe)                             │
│  ┌───────────────────────────────────────────────────────────────────────┐ │
│  │  Canvas → BPMN Compiler (第9章)                                      │ │
│  │  DAG → Zeebe BPMN XML                                               │ │
│  └───────────────────────────────────────────────────────────────────────┘ │
│                                    ▼                                        │
│  ┌───────────────────────────────────────────────────────────────────────┐ │
│  │  Zeebe Workflow Engine (8.5)                                         │ │
│  │  · Process Instance Management                                       │ │
│  │  · Job Queue & Worker Distribution                                   │ │
│  │  · State Persistence (事件溯源)                                      │ │
│  └───────────────────────────────────────────────────────────────────────┘ │
│                                    ▼                                        │
│  ┌───────────────────────────────────────────────────────────────────────┐ │
│  │  Worker Cluster (水平扩展)                                           │ │
│  └───────────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────────────┘
```
***
## 8.1 前端 Canvas 生产级架构
### 8.1.1 技术选型与版本
| 组件           | 版本    | 用途            |
| ------------ | ----- | ------------- |
| React        | 18.3  | UI 框架         |
| React Flow   | 11.11 | 画布核心引擎        |
| TypeScript   | 5.0   | 类型安全          |
| Zustand      | 4.4   | 状态管理          |
| WebWorker    | 原生    | 布局计算/拓扑排序     |
| Canvas/WebGL | 原生    | 大图渲染（>1000节点） |
| D3.js        | 7.8   | 自动布局（可选）      |
### 8.1.2 Canvas 核心数据模型（TypeScript）
```typescript
// types/canvas.d.ts
/**
 * Canvas 图结构
 */
export interface CanvasGraph {
  id: string;
  name: string;
  nodes: CanvasNode[];
  edges: CanvasEdge[];
  metadata: {
    version: number;
    createdBy: string;
    createdAt: string;
    updatedAt: string;
    layout?: 'dagre' | 'elk' | 'manual';
  };
}
/**
 * 节点定义
 */
export interface CanvasNode {
  id: string;
  type: NodeType;                    // 节点类型
  name: string;                      // 显示名称
  position: { x: number; y: number };
  size?: { width: number; height: number };
  config: NodeConfig;                // 节点配置（类型相关）
  inputs: Port[];
  outputs: Port[];
  status?: NodeStatus;               // 执行状态（运行时）
  metadata?: Record<string, any>;
}
/**
 * 端口定义
 */
export interface Port {
  id: string;
  label: string;
  type: 'input' | 'output';
  dataType?: 'string' | 'number' | 'boolean' | 'object' | 'array';
  required?: boolean;
}
/**
 * 边定义
 */
export interface CanvasEdge {
  id: string;
  source: string;                    // 源节点 ID
  sourcePort: string;                // 源端口 ID
  target: string;                    // 目标节点 ID
  targetPort: string;                // 目标端口 ID
  label?: string;
  condition?: string;                // 条件表达式（用于条件分支）
  animated?: boolean;
}
/**
 * 节点类型枚举
 */
export type NodeType =
  // 输入类
  | 'START'
  | 'AUDIENCE_FILTER'
  | 'EVENT_TRIGGER'
  // 逻辑类
  | 'CONDITION'
  | 'SPLIT'
  | 'MERGE'
  // AI 类
  | 'AI_SCORE'
  | 'AI_PLANNER'
  // 动作类
  | 'SEND_EMAIL'
  | 'SEND_SMS'
  | 'SEND_PUSH'
  | 'OFFER_POINTS'
  | 'OFFER_COUPON'
  | 'TIER_UPGRADE'
  | 'WEBHOOK'
  // 控制类
  | 'DELAY'
  | 'WAIT_EVENT'
  | 'APPROVAL'
  // 结束类
  | 'END';
/**
 * 节点配置（按类型）
 */
export type NodeConfig = 
  | AudienceFilterConfig
  | ConditionConfig
  | AIScoreConfig
  | SendEmailConfig
  | OfferPointsConfig
  | DelayConfig
  | ApprovalConfig
  | WebhookConfig;
export interface AudienceFilterConfig {
  segmentCode: string;
  filters: {
    field: string;
    operator: 'eq' | 'ne' | 'gt' | 'gte' | 'lt' | 'lte' | 'contains' | 'in';
    value: any;
  }[];
  limit?: number;
}
export interface ConditionConfig {
  field: string;
  operator: 'eq' | 'ne' | 'gt' | 'gte' | 'lt' | 'lte' | 'contains' | 'in';
  value: any;
  trueBranchNodeId?: string;
  falseBranchNodeId?: string;
}
export interface AIScoreConfig {
  modelType: 'churn' | 'uplift' | 'conversion' | 'custom';
  modelId?: string;
  threshold?: number;
  batchSize?: number;
}
export interface SendEmailConfig {
  assetId: string;
  variableMappingId?: string;
  requireApproval?: boolean;
  retryCount?: number;
  rateLimit?: number;
}
export interface OfferPointsConfig {
  pointType: string;
  amount: number;
  reason: string;
}
export interface DelayConfig {
  duration: number;                  // 毫秒
  unit: 'milliseconds' | 'seconds' | 'minutes' | 'hours' | 'days';
  type: 'fixed' | 'dynamic';
}
export interface ApprovalConfig {
  approverId?: string;
  approverGroup?: string;
  timeout?: number;                  // 超时（小时）
  autoReject?: boolean;
}
export interface WebhookConfig {
  url: string;
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  headers?: Record<string, string>;
  bodyTemplate?: string;
  retryCount?: number;
}
```
### 8.1.3 Canvas 前端架构分层
```text
┌─────────────────────────────────────────────────────────────────────────────┐
│                         Canvas UI Layer                                     │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  Toolbar  │  Zoom Controls  │  Undo/Redo  │  Export/Import         │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
├─────────────────────────────────────────────────────────────────────────────┤
│                         Canvas Editor (React Flow)                         │
│  ┌──────────────┐  ┌──────────────────────────────────┐  ┌──────────────┐ │
│  │ Node Palette │  │  Canvas Viewport                │  │ Inspector    │ │
│  │ (拖拽添加)   │  │  · Nodes (自定义渲染)            │  │ Panel        │ │
│  │              │  │  · Edges (带条件标签)            │  │ (节点配置)   │ │
│  │  · 输入类    │  │  · MiniMap                      │  │              │ │
│  │  · 逻辑类    │  │  · Controls                     │  │ · 基础信息   │ │
│  │  · AI类      │  │  · Selection                    │  │ · 配置表单   │ │
│  │  · 动作类    │  │  · Drag/Connect                 │  │ · 校验结果   │ │
│  │  · 控制类    │  │                                 │  │              │ │
│  └──────────────┘  └──────────────────────────────────┘  └──────────────┘ │
├─────────────────────────────────────────────────────────────────────────────┤
│                         Validation & Runtime Layer                         │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  DAG Validator  │  Cycle Detector  │  Type Checker  │  Simulator   │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
├─────────────────────────────────────────────────────────────────────────────┤
│                         State & Data Layer                                 │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  Canvas Store (Zustand)  │  Undo/Redo History  │  Local Cache     │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
├─────────────────────────────────────────────────────────────────────────────┤
│                         Performance Layer                                  │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  WebWorker (布局/拓扑排序)  │  Virtualization  │  Lazy Load       │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────┘
```
### 8.1.4 Canvas 状态管理（Zustand）
```typescript
// store/canvas.store.ts
import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import { CanvasGraph, CanvasNode, CanvasEdge } from '../types/canvas';
interface CanvasState {
  // 数据
  graph: CanvasGraph | null;
  selectedNodeId: string | null;
  selectedEdgeId: string | null;
  isDirty: boolean;
  
  // 运行时状态
  isRunning: boolean;
  executionStatus: Record<string, NodeStatus>;
  
  // UI 状态
  zoom: number;
  viewport: { x: number; y: number };
  showMiniMap: boolean;
  
  // Actions
  loadGraph: (graph: CanvasGraph) => void;
  saveGraph: () => Promise<void>;
  addNode: (type: NodeType, position: { x: number; y: number }) => void;
  updateNode: (nodeId: string, updates: Partial<CanvasNode>) => void;
  deleteNode: (nodeId: string) => void;
  addEdge: (source: string, target: string, sourcePort: string, targetPort: string) => void;
  deleteEdge: (edgeId: string) => void;
  validate: () => ValidationResult;
  simulate: () => Promise<SimulationResult>;
  selectNode: (nodeId: string | null) => void;
  selectEdge: (edgeId: string | null) => void;
  undo: () => void;
  redo: () => void;
}
export const useCanvasStore = create<CanvasState>()(
  devtools((set, get) => ({
    graph: null,
    selectedNodeId: null,
    selectedEdgeId: null,
    isDirty: false,
    isRunning: false,
    executionStatus: {},
    zoom: 1,
    viewport: { x: 0, y: 0 },
    showMiniMap: true,
    
    loadGraph: (graph) => set({ graph, isDirty: false }),
    
    saveGraph: async () => {
      const { graph } = get();
      if (!graph) return;
      // 调用 API 保存
      await api.saveCanvas(graph);
      set({ isDirty: false });
    },
    
    addNode: (type, position) => {
      const { graph } = get();
      if (!graph) return;
      
      const newNode: CanvasNode = {
        id: generateNodeId(),
        type,
        name: getDefaultNodeName(type),
        position,
        config: getDefaultConfig(type),
        inputs: getDefaultPorts(type, 'input'),
        outputs: getDefaultPorts(type, 'output'),
      };
      
      set({
        graph: {
          ...graph,
          nodes: [...graph.nodes, newNode]
        },
        isDirty: true
      });
    },
    
    updateNode: (nodeId, updates) => {
      const { graph } = get();
      if (!graph) return;
      
      set({
        graph: {
          ...graph,
          nodes: graph.nodes.map(n =>
            n.id === nodeId ? { ...n, ...updates } : n
          )
        },
        isDirty: true
      });
    },
    
    deleteNode: (nodeId) => {
      const { graph } = get();
      if (!graph) return;
      
      // 删除节点及其关联边
      set({
        graph: {
          ...graph,
          nodes: graph.nodes.filter(n => n.id !== nodeId),
          edges: graph.edges.filter(e => e.source !== nodeId && e.target !== nodeId)
        },
        isDirty: true
      });
    },
    
    addEdge: (source, target, sourcePort, targetPort) => {
      const { graph } = get();
      if (!graph) return;
      
      const newEdge: CanvasEdge = {
        id: generateEdgeId(),
        source,
        target,
        sourcePort,
        targetPort,
      };
      
      set({
        graph: {
          ...graph,
          edges: [...graph.edges, newEdge]
        },
        isDirty: true
      });
    },
    
    validate: () => {
      const { graph } = get();
      if (!graph) return { valid: false, errors: ['No graph loaded'] };
      return validateDAG(graph);
    },
    
    simulate: async () => {
      const { graph } = get();
      if (!graph) throw new Error('No graph to simulate');
      set({ isRunning: true });
      try {
        const result = await api.simulateCanvas(graph);
        return result;
      } finally {
        set({ isRunning: false });
      }
    },
    
    selectNode: (nodeId) => set({ selectedNodeId: nodeId }),
    selectEdge: (edgeId) => set({ selectedEdgeId: edgeId }),
    undo: () => { /* 历史回退 */ },
    redo: () => { /* 历史前进 */ },
  }))
);
```
***
## 8.2 节点类型体系（扩展 Loyalty）
### 8.2.1 节点分类与映射
| 分类     | 节点类型              | 组件名   | 调用 Loyalty 能力                     | 前端图标 |
| ------ | ----------------- | ----- | --------------------------------- | ---- |
| **输入** | `START`           | 开始节点  | -                                 | 🟢   |
|        | `AUDIENCE_FILTER` | 人群筛选  | `MemberService.filter()`          | 👥   |
|        | `EVENT_TRIGGER`   | 事件触发  | `EventBridge.listen()`            | ⚡    |
| **逻辑** | `CONDITION`       | 条件分支  | `RuleEngineService.evaluate()`    | 🔀   |
|        | `SPLIT`           | 并行分支  | -                                 | 📋   |
|        | `MERGE`           | 合并节点  | -                                 | 🔗   |
| **AI** | `AI_SCORE`        | AI 评分 | `AIService.score()`               | 🤖   |
|        | `AI_PLANNER`      | AI 规划 | `AIPlanner.plan()`                | 🧠   |
| **动作** | `SEND_EMAIL`      | 发送邮件  | `ChannelService.sendEmail()`      | ✉️   |
|        | `SEND_SMS`        | 发送短信  | `ChannelService.sendSMS()`        | 📱   |
|        | `SEND_PUSH`       | 发送推送  | `ChannelService.sendPush()`       | 🔔   |
|        | `OFFER_POINTS`    | 发放积分  | `PointGrantService.grantPoints()` | ⭐    |
|        | `OFFER_COUPON`    | 发放优惠券 | `CouponService.issueCoupon()`     | 🎫   |
|        | `TIER_UPGRADE`    | 等级直升  | `TierService.upgrade()`           | 🏆   |
|        | `WEBHOOK`         | 外部调用  | `WebhookService.call()`           | 🔗   |
| **控制** | `DELAY`           | 延迟等待  | 定时器                               | ⏰    |
|        | `WAIT_EVENT`      | 事件等待  | `EventBridge.wait()`              | 📡   |
|        | `APPROVAL`        | 人工审批  | Zeebe User Task                   | ✅    |
| **结束** | `END`             | 结束节点  | -                                 | 🔴   |
### 8.2.2 节点注册表（前端）
```typescript
// registry/node.registry.ts
import { NodeType, CanvasNode } from '../types/canvas';
interface NodeDefinition {
  type: NodeType;
  label: string;
  icon: string;
  category: 'input' | 'logic' | 'ai' | 'action' | 'control' | 'end';
  description: string;
  color: string;
  defaultConfig: () => Record<string, any>;
  renderComponent: React.ComponentType<NodeRenderProps>;
  configComponent: React.ComponentType<ConfigEditorProps>;
  inputPorts: Port[];
  outputPorts: Port[];
  minInputs?: number;
  maxInputs?: number;
  minOutputs?: number;
  maxOutputs?: number;
  validate?: (config: any) => ValidationError[];
}
export const NodeRegistry: Record<NodeType, NodeDefinition> = {
  'AUDIENCE_FILTER': {
    type: 'AUDIENCE_FILTER',
    label: '人群筛选',
    icon: '👥',
    category: 'input',
    description: '根据分群和条件筛选目标用户',
    color: '#3b82f6',
    defaultConfig: () => ({
      segmentCode: '',
      filters: [],
      limit: 10000
    }),
    renderComponent: AudienceFilterNode,
    configComponent: AudienceFilterConfigPanel,
    inputPorts: [{ id: 'in', label: '', type: 'input' }],
    outputPorts: [{ id: 'out', label: '', type: 'output', dataType: 'array' }],
  },
  'CONDITION': {
    type: 'CONDITION',
    label: '条件分支',
    icon: '🔀',
    category: 'logic',
    description: '基于条件判断分流',
    color: '#eab308',
    defaultConfig: () => ({
      field: '',
      operator: 'eq',
      value: ''
    }),
    renderComponent: ConditionNode,
    configComponent: ConditionConfigPanel,
    inputPorts: [{ id: 'in', label: '', type: 'input' }],
    outputPorts: [
      { id: 'true', label: 'True', type: 'output' },
      { id: 'false', label: 'False', type: 'output' }
    ],
  },
  'SEND_EMAIL': {
    type: 'SEND_EMAIL',
    label: '发送邮件',
    icon: '✉️',
    category: 'action',
    description: '通过邮件渠道触达用户',
    color: '#22c55e',
    defaultConfig: () => ({
      assetId: '',
      requireApproval: false,
      retryCount: 3,
      rateLimit: 1000
    }),
    renderComponent: SendEmailNode,
    configComponent: SendEmailConfigPanel,
    inputPorts: [{ id: 'in', label: '', type: 'input' }],
    outputPorts: [{ id: 'out', label: '', type: 'output' }],
  },
  // ... 其他节点类型
};
```
### 8.2.3 自定义节点渲染（React）
tsx
```
// components/canvas/nodes/AudienceFilterNode.tsx
import React from 'react';
import { Handle, Position, NodeProps } from 'reactflow';
export const AudienceFilterNode: React.FC<NodeProps> = ({ data }) => {
  const { name, config, status } = data;
  
  const getStatusColor = () => {
    switch (status) {
      case 'running': return '#eab308';
      case 'completed': return '#22c55e';
      case 'failed': return '#ef4444';
      default: return '#6b7280';
    }
  };
  return (
    <div className="campaign-node audience-filter-node">
      {/* 输入端口 */}
      <Handle
        type="target"
        position={Position.Left}
        id="in"
        className="node-handle"
      />
      
      {/* 节点主体 */}
      <div className="node-body" style={{ borderColor: getStatusColor() }}>
        <div className="node-header">
          <span className="node-icon">👥</span>
          <span className="node-name">{name}</span>
          {status && (
            <span className={`node-status node-status-${status}`}>
              {status === 'running' && '⏳'}
              {status === 'completed' && '✅'}
              {status === 'failed' && '❌'}
            </span>
          )}
        </div>
        <div className="node-config-summary">
          {config.segmentCode && (
            <span className="config-tag">分群: {config.segmentCode}</span>
          )}
          {config.limit && (
            <span className="config-tag">上限: {config.limit}</span>
          )}
        </div>
      </div>
      
      {/* 输出端口 */}
      <Handle
        type="source"
        position={Position.Right}
        id="out"
        className="node-handle"
      />
    </div>
  );
};
```
***
## 8.3 Flow Engine 生产级架构（后端）
### 8.3.1 Zeebe 与 LiteFlow 共存确认
| 引擎           | 服务范围           | 保持不变 | 说明                                   |
| ------------ | -------------- | ---- | ------------------------------------ |
| **LiteFlow** | Loyalty 核心事件处理 | ✅    | 幂等检查、数据标准化、One‑ID 匹配、规则引擎、动作执行       |
| **Zeebe**    | Campaign 流程执行  | ✅ 新增 | 所有 Campaign 流程（审批、长时等待、状态查询、Saga 补偿） |
两套引擎**完全独立**，通过不同配置隔离：
yaml
```
# application.yml
# LiteFlow 配置（Loyalty 已有）
liteflow:
  rule-source: classpath:liteflow/el/*.el.xml
  component-scan: com.loyalty.platform.flow.components
# Zeebe 配置（Campaign 新增）
zeebe:
  client:
    broker:
      gateway-address: localhost:26500
    security:
      plaintext: true
  embedded:
    enabled: true
```
### 8.3.2 Flow Engine 核心组件
```text
┌─────────────────────────────────────────────────────────────────────────────┐
│                         Flow Engine Components                              │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  Canvas → BPMN Compiler (第9章)                                    │   │
│  │  CanvasGraph → Zeebe BPMN XML                                      │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                    ▼                                        │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  Process Deployer                                                  │   │
│  │  · deployResource() → Zeebe                                       │   │
│  │  · 管理 Process ID / Version                                       │   │
│  │  · 存储部署历史                                                   │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                    ▼                                        │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  Process Orchestrator                                              │   │
│  │  · createInstance() → 启动流程                                    │   │
│  │  · setVariables() → 动态修改变量                                  │   │
│  │  · cancelInstance() → 取消                                        │   │
│  │  · modifyInstance() → 修改运行中流程                              │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                    ▼                                        │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  Worker Manager                                                    │   │
│  │  · Worker 注册与发现                                               │   │
│  │  · Job 分配与负载均衡                                               │   │
│  │  · 超时与重试管理                                                   │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                    ▼                                        │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  State Store                                                       │   │
│  │  · ZeebeInstance 表 (PostgreSQL)                                  │   │
│  │  · ZeebeTask 表 (PostgreSQL)                                      │   │
│  │  · Redis 实时缓存                                                  │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                    ▼                                        │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  Event Publisher                                                   │   │
│  │  · 发布节点执行事件 → Kafka                                        │   │
│  │  · 发布流程完成/失败事件                                            │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────┘
```
### 8.3.3 分片执行与多租户隔离
java
```
@Configuration
public class FlowExecutionConfig {
    
    /**
     * 分片策略：按 tenant + campaign 哈希分片
     */
    public String getShardKey(String tenantId, String campaignId) {
        return tenantId + ":" + campaignId;
    }
    
    /**
     * Kafka 分区策略
     */
    @Bean
    public ProducerFactory<String, Object> kafkaProducerFactory() {
        return new DefaultKafkaProducerFactory<>(Map.of(
            ProducerConfig.BOOTSTRAP_SERVERS_CONFIG, "kafka:9092",
            ProducerConfig.PARTITIONER_CLASS_CONFIG, 
                ShardAwarePartitioner.class.getName()
        ));
    }
}
```
### 8.3.4 流程状态持久化
java
```
package com.loyalty.platform.campaign.execution.service;
import com.loyalty.platform.campaign.execution.model.ZeebeInstance;
import com.loyalty.platform.campaign.execution.model.ZeebeTask;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.time.Instant;
import java.util.UUID;
@Slf4j
@Service
@RequiredArgsConstructor
public class FlowStateService {
    private final ZeebeInstanceRepository instanceRepository;
    private final ZeebeTaskRepository taskRepository;
    /**
     * 记录流程实例状态
     */
    @Transactional
    public void recordInstance(ZeebeInstance instance) {
        instance.setUpdatedAt(Instant.now());
        instanceRepository.save(instance);
        log.debug("Instance recorded: key={}, status={}", 
                 instance.getProcessInstanceKey(), instance.getStatus());
    }
    /**
     * 记录任务执行
     */
    @Transactional
    public void recordTask(ZeebeTask task) {
        task.setUpdatedAt(Instant.now());
        taskRepository.save(task);
        log.debug("Task recorded: jobKey={}, status={}", 
                 task.getJobKey(), task.getStatus());
    }
    /**
     * 更新流程状态（批量）
     */
    @Transactional
    public void updateInstanceStatus(long processInstanceKey, String status, String errorMessage) {
        instanceRepository.updateStatus(processInstanceKey, status, errorMessage);
    }
    /**
     * 获取流程最新状态（含缓存）
     */
    public ZeebeInstance getInstanceStatus(long processInstanceKey) {
        // 先查 Redis 缓存
        String cacheKey = "zeebe:instance:" + processInstanceKey;
        // ... 缓存逻辑
        return instanceRepository.findByProcessInstanceKey(processInstanceKey).orElse(null);
    }
}
```
***
## 8.4 大规模性能优化
### 8.4.1 Canvas 渲染优化策略
| 节点数量        | 策略                | 说明              |
| ----------- | ----------------- | --------------- |
| < 50        | 全量渲染              | React Flow 默认模式 |
| 50 \~ 500   | 虚拟化               | 只渲染视口内的节点       |
| 500 \~ 5000 | WebWorker + 虚拟化   | 布局计算在 Worker 线程 |
| > 5000      | Canvas 2D + WebGL | 使用自定义 Canvas 渲染 |
### 8.4.2 WebWorker 布局计算
```typescript
// workers/layout.worker.ts
import { DagreLayout } from '../layouts/dagre';
self.addEventListener('message', (event) => {
  const { nodes, edges, type, options } = event.data;
  
  try {
    let result;
    switch (type) {
      case 'dagre':
        result = new DagreLayout().layout(nodes, edges, options);
        break;
      case 'elk':
        result = new ElkLayout().layout(nodes, edges, options);
        break;
      default:
        result = { nodes, edges };
    }
    
    self.postMessage({ success: true, result });
  } catch (error) {
    self.postMessage({ success: false, error: error.message });
  }
});
// 主线程调用
// hooks/useLayout.ts
export const useLayout = () => {
  const workerRef = useRef<Worker>();
  
  useEffect(() => {
    workerRef.current = new Worker(
      new URL('../workers/layout.worker.ts', import.meta.url)
    );
    return () => workerRef.current?.terminate();
  }, []);
  
  const layout = useCallback((nodes, edges, type) => {
    return new Promise((resolve, reject) => {
      const worker = workerRef.current;
      if (!worker) return reject('Worker not ready');
      
      worker.onmessage = (e) => {
        if (e.data.success) resolve(e.data.result);
        else reject(e.data.error);
      };
      
      worker.postMessage({ nodes, edges, type, options: { rankDirection: 'TB' } });
    });
  }, []);
  
  return { layout };
};
```
### 8.4.3 大图虚拟化渲染
tsx
```
// components/canvas/VirtualizedCanvas.tsx
import React, { useMemo } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
export const VirtualizedCanvas: React.FC<{ nodes: CanvasNode[]; zoom: number }> = ({
  nodes,
  zoom
}) => {
  const containerRef = React.useRef<HTMLDivElement>(null);
  
  // 计算视口可见节点
  const visibleNodes = useMemo(() => {
    // 根据 zoom 和滚动位置计算可见区域
    const viewportHeight = containerRef.current?.clientHeight || 0;
    const viewportWidth = containerRef.current?.clientWidth || 0;
    
    // 使用虚拟化
    return nodes.filter(node => {
      const y = node.position.y * zoom;
      const x = node.position.x * zoom;
      return y < viewportHeight + 100 && y > -100 &&
             x < viewportWidth + 100 && x > -100;
    });
  }, [nodes, zoom]);
  
  return (
    <div ref={containerRef} className="canvas-container">
      {visibleNodes.map(node => (
        <NodeRenderer key={node.id} node={node} zoom={zoom} />
      ))}
    </div>
  );
};
```
### 8.4.4 Zeebe Worker 水平扩展配置
yaml
```
# Zeebe Worker HPA (Kubernetes)
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: campaign-worker-hpa
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: campaign-worker
  minReplicas: 3
  maxReplicas: 20
  metrics:
    - type: Pods
      pods:
        metric:
          name: zeebe_job_count
        target:
          type: AverageValue
          averageValue: "10"
    - type: Resource
      resource:
        name: cpu
        target:
          type: Utilization
          averageUtilization: 70
```
### 8.4.5 Redis 缓存策略
java
```
@Component
@Slf4j
public class CanvasCacheManager {
    
    @Autowired
    private RedisTemplate<String, Object> redisTemplate;
    
    private static final Duration CACHE_TTL = Duration.ofHours(2);
    private static final Duration EXECUTION_CACHE_TTL = Duration.ofMinutes(5);
    
    /**
     * 缓存 Canvas Graph
     */
    public void cacheGraph(String canvasId, CanvasGraph graph) {
        String key = "canvas:graph:" + canvasId;
        redisTemplate.opsForValue().set(key, graph, CACHE_TTL);
    }
    
    /**
     * 获取缓存的 Canvas Graph
     */
    public CanvasGraph getGraph(String canvasId) {
        String key = "canvas:graph:" + canvasId;
        return (CanvasGraph) redisTemplate.opsForValue().get(key);
    }
    
    /**
     * 缓存执行状态（实时）
     */
    public void cacheExecutionStatus(String planId, ExecutionStatus status) {
        String key = "execution:status:" + planId;
        redisTemplate.opsForValue().set(key, status, EXECUTION_CACHE_TTL);
    }
}
```
***
## 8.5 状态存储与多租户隔离
### 8.5.1 存储分层
| 层级     | 存储介质            | 数据                        | TTL        |
| ------ | --------------- | ------------------------- | ---------- |
| L1 (热) | Redis           | 执行状态、缓存 Canvas            | 5min \~ 2h |
| L2 (温) | PostgreSQL      | 持久化数据（Instance/Task/Plan） | 永久         |
| L3 (冷) | ClickHouse / S3 | 历史执行日志、事件                 | 按策略归档      |
### 8.5.2 多租户隔离方案
sql
```
-- Row-level 隔离（默认方案）
-- 所有表包含 program_code 或 workspace_id 字段
-- 查询自动附加 tenant 条件
-- 使用 Spring Data JPA + 多租户过滤器
@Component
public class TenantInterceptor implements StatementInspector {
    
    @Override
    public String inspect(String sql) {
        String tenantId = SecurityContext.getCurrentTenantId();
        if (tenantId == null) return sql;
        
        // 在 WHERE 条件中自动注入 tenant_id
        // 通过 Hibernate Filter 实现
        return sql;
    }
}
-- Schema-level 隔离（高安全场景）
-- 每个租户独立的 Schema
-- campaign_tenant_{tenantId}.campaign_plan
```
***
## 8.6 前端复杂逻辑伪代码
### 8.6.1 DAG 循环检测
```typescript
// utils/dag-validator.ts
/**
 * 检测 DAG 中是否存在环（DFS）
 */
export function detectCycle(nodes: CanvasNode[], edges: CanvasEdge[]): string[] {
  const graph = buildAdjacencyList(nodes, edges);
  const visited = new Set<string>();
  const recursionStack = new Set<string>();
  const cyclePath: string[] = [];
  
  function dfs(nodeId: string): boolean {
    visited.add(nodeId);
    recursionStack.add(nodeId);
    
    const neighbors = graph.get(nodeId) || [];
    for (const neighbor of neighbors) {
      if (!visited.has(neighbor)) {
        if (dfs(neighbor)) {
          cyclePath.push(nodeId);
          return true;
        }
      } else if (recursionStack.has(neighbor)) {
        cyclePath.push(nodeId, neighbor);
        return true;
      }
    }
    
    recursionStack.delete(nodeId);
    return false;
  }
  
  for (const node of nodes) {
    if (!visited.has(node.id)) {
      if (dfs(node.id)) {
        return cyclePath.reverse();
      }
    }
  }
  
  return [];
}
/**
 * 拓扑排序（Kahn 算法）
 */
export function topologicalSort(nodes: CanvasNode[], edges: CanvasEdge[]): string[] {
  const graph = buildAdjacencyList(nodes, edges);
  const inDegree = new Map<string, number>();
  
  // 初始化入度
  nodes.forEach(n => inDegree.set(n.id, 0));
  edges.forEach(e => {
    inDegree.set(e.target, (inDegree.get(e.target) || 0) + 1);
  });
  
  // 队列
  const queue: string[] = [];
  inDegree.forEach((degree, id) => {
    if (degree === 0) queue.push(id);
  });
  
  const result: string[] = [];
  while (queue.length > 0) {
    const nodeId = queue.shift()!;
    result.push(nodeId);
    
    const neighbors = graph.get(nodeId) || [];
    for (const neighbor of neighbors) {
      const newDegree = (inDegree.get(neighbor) || 0) - 1;
      inDegree.set(neighbor, newDegree);
      if (newDegree === 0) queue.push(neighbor);
    }
  }
  
  // 如果有节点未排序，说明有环
  if (result.length !== nodes.length) {
    throw new Error('DAG contains cycle');
  }
  
  return result;
}
```
### 8.6.2 画布自动布局
```typescript
// layouts/dagre.ts
import dagre from 'dagre';
export function applyDagreLayout(
  nodes: CanvasNode[],
  edges: CanvasEdge[],
  options: { rankDirection?: 'TB' | 'LR'; nodeSpacing?: number; rankSpacing?: number }
): CanvasNode[] {
  const g = new dagre.graphlib.Graph();
  g.setGraph({
    rankdir: options.rankDirection || 'TB',
    nodesep: options.nodeSpacing || 50,
    ranksep: options.rankSpacing || 80,
    marginx: 20,
    marginy: 20
  });
  
  // 添加节点
  nodes.forEach(node => {
    g.setNode(node.id, {
      width: node.size?.width || 200,
      height: node.size?.height || 80
    });
  });
  
  // 添加边
  edges.forEach(edge => {
    g.setEdge(edge.source, edge.target);
  });
  
  // 执行布局
  dagre.layout(g);
  
  // 提取位置
  return nodes.map(node => {
    const pos = g.node(node.id);
    return {
      ...node,
      position: {
        x: pos.x - (node.size?.width || 200) / 2,
        y: pos.y - (node.size?.height || 80) / 2
      }
    };
  });
}
```
***
## 8.7 前后端 JSON 交互
### 8.7.1 保存 Canvas
**Request:**
```json
POST /api/campaign/canvas/save
{
  "planId": "plan_001",
  "graph": {
    "nodes": [
      {
        "id": "N1",
        "type": "START",
        "name": "开始",
        "position": { "x": 100, "y": 50 }
      },
      {
        "id": "N2",
        "type": "AUDIENCE_FILTER",
        "name": "人群筛选",
        "position": { "x": 100, "y": 150 },
        "config": {
          "segmentCode": "HIGH_VALUE",
          "limit": 10000
        }
      },
      {
        "id": "N3",
        "type": "CONDITION",
        "name": "高价值判断",
        "position": { "x": 100, "y": 280 },
        "config": {
          "field": "score",
          "operator": "gt",
          "value": 0.7
        }
      },
      {
        "id": "N4",
        "type": "SEND_EMAIL",
        "name": "发送邮件",
        "position": { "x": 50, "y": 400 },
        "config": {
          "assetId": "asset_001",
          "requireApproval": true
        }
      },
      {
        "id": "N5",
        "type": "END",
        "name": "结束",
        "position": { "x": 100, "y": 520 }
      }
    ],
    "edges": [
      { "id": "E1", "source": "N1", "target": "N2" },
      { "id": "E2", "source": "N2", "target": "N3" },
      { "id": "E3", "source": "N3", "target": "N4", "condition": "score > 0.7" },
      { "id": "E4", "source": "N3", "target": "N5", "condition": "score <= 0.7" },
      { "id": "E5", "source": "N4", "target": "N5" }
    ]
  }
}
```
**Response:**
```json
{
  "code": 0,
  "data": {
    "canvasId": "canvas_001",
    "planId": "plan_001",
    "version": 3,
    "nodeCount": 5,
    "edgeCount": 5,
    "validation": {
      "valid": true,
      "errors": [],
      "warnings": []
    }
  }
}
```
***
## 8.8 与 Loyalty 集成点
| 集成点                | Loyalty 能力         | 使用方式                  |
| ------------------ | ------------------ | --------------------- |
| **React Flow 组件库** | 规则编辑器中的 React Flow | 复用 UI 组件，扩展节点类型       |
| **LiteFlow 引擎**    | 核心事件处理             | **保持不变**，Campaign 不使用 |
| **Zeebe**          | 新增                 | 独立部署，与 LiteFlow 共存    |
| **EventBridge**    | 事件发布               | Canvas 保存/部署/执行时发布事件  |
| **Drools**         | 规则引擎               | **不参与** Canvas 任何逻辑   |
***
## 8.9 开发实施检查清单
* 前端：升级 React Flow 到 11.x
* 前端：定义 `CanvasGraph`、`CanvasNode`、`CanvasEdge` 类型
* 前端：实现 `NodeRegistry`（10+ 节点类型）
* 前端：实现自定义节点渲染组件
* 前端：实现 `CanvasStore`（Zustand）
* 前端：实现 DAG 校验器（循环检测、拓扑排序）
* 前端：实现 WebWorker 布局计算
* 前端：实现大图虚拟化渲染
* 后端：实现 `CanvasService`（保存/加载）
* 后端：实现 `FlowStateService`（状态持久化）
* 后端：配置 Zeebe 客户端（开发嵌入式）
* 后端：实现 `CanvasCacheManager`（Redis 缓存）
* 后端：实现多租户隔离过滤器
* 集成测试：Canvas 保存 → 编译 → 部署 → 执行端到端
* 性能测试：500 节点画布渲染 < 1s
* 性能测试：1000 节点画布编译 < 3s
