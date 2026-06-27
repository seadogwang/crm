/**
 * Canvas 核心数据模型 — Campaign 可视化编排的类型定义。
 *
 * 18种节点类型覆盖：输入/逻辑/AI/动作/控制/结束
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

export interface CanvasNode {
  id: string;
  type: NodeType;
  name: string;
  position: { x: number; y: number };
  size?: { width: number; height: number };
  config: NodeConfig;
  inputs: Port[];
  outputs: Port[];
  status?: NodeStatus;
  metadata?: Record<string, any>;
}

export interface Port {
  id: string;
  label: string;
  type: 'input' | 'output';
  dataType?: 'string' | 'number' | 'boolean' | 'object' | 'array';
  required?: boolean;
}

export interface CanvasEdge {
  id: string;
  source: string;
  sourcePort: string;
  target: string;
  targetPort: string;
  label?: string;
  condition?: string;
  animated?: boolean;
}

export type NodeStatus = 'pending' | 'running' | 'completed' | 'failed' | 'skipped';

export type NodeType =
  | 'START' | 'AUDIENCE_FILTER' | 'EVENT_TRIGGER'
  | 'CONDITION' | 'SPLIT' | 'MERGE'
  | 'AI_SCORE' | 'AI_PLANNER'
  | 'SEND_EMAIL' | 'SEND_SMS' | 'SEND_PUSH'
  | 'OFFER_POINTS' | 'OFFER_COUPON' | 'TIER_UPGRADE' | 'WEBHOOK'
  | 'DELAY' | 'WAIT_EVENT' | 'APPROVAL' | 'END';

export type NodeConfig =
  | AudienceFilterConfig | ConditionConfig | AIScoreConfig
  | SendEmailConfig | OfferPointsConfig | DelayConfig
  | ApprovalConfig | WebhookConfig | Record<string, any>;

export interface AudienceFilterConfig {
  logic: 'AND' | 'OR';
  conditions: AudienceCondition[];
  limit: number;
  excludeBlacklist: boolean;
}
type AudienceCondition = DynamicStatCondition | StaticAttrCondition;
interface DynamicStatCondition {
  type: 'DYNAMIC_STAT';
  name: string;
  dataSource: 'order_fact' | 'points_transaction' | 'tier_change_log';
  aggFunc: string;
  aggField: string;
  timeWindowType?: string;
  timeWindowDays?: number;
  operator: string;
  value: string | number;
}
interface StaticAttrCondition {
  type: 'STATIC_ATTR';
  field: string;
  operator: string;
  value: string | number;
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
  modelId?: string; threshold?: number; batchSize?: number;
}

export interface SendEmailConfig {
  assetId: string; variableMappingId?: string;
  requireApproval?: boolean; retryCount?: number; rateLimit?: number;
}

export interface OfferPointsConfig {
  pointType: string; amount: number; reason: string;
}

export interface DelayConfig {
  duration: number;
  unit: 'milliseconds' | 'seconds' | 'minutes' | 'hours' | 'days';
  type: 'fixed' | 'dynamic';
}

export interface ApprovalConfig {
  approverId?: string; approverGroup?: string;
  timeout?: number; autoReject?: boolean;
}

export interface WebhookConfig {
  url: string; method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  headers?: Record<string, string>; bodyTemplate?: string; retryCount?: number;
}
