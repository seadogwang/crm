import React from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';

/** 组件类型定义 */
export const NODE_TYPES = {
  IDEMPOTENT:    { type: 'idempotent',    label: '幂等检查',   componentName: 'idempotentCmp',    color: '#1677ff' },
  STANDARDIZE:   { type: 'standardize',   label: '数据标准化', componentName: 'standardizeCmp',   color: '#52c41a' },
  ONE_ID:        { type: 'oneId',         label: 'One-ID 匹配',componentName: 'oneIdCmp',         color: '#fa8c16' },
  FACT_BUILDER:  { type: 'factBuilder',   label: '事实构建',   componentName: 'factBuilderCmp',   color: '#722ed1' },
  RULE_ENGINE:   { type: 'ruleEngine',    label: '规则引擎',   componentName: 'ruleEngineCmp',    color: '#eb2f96' },
  ACTION_EXECUTE:{ type: 'actionExecute', label: '动作执行',   componentName: 'actionExecuteCmp', color: '#13c2c2' },
  COMPLETE:      { type: 'complete',      label: '完成处理',   componentName: 'completeCmp',      color: '#8c8c8c' },
  REFUND:        { type: 'refund',        label: '退款处理',   componentName: 'refundSpecificCmp', color: '#f5222d' },
  ERROR_HANDLER: { type: 'errorHandler',  label: '异常处理',   componentName: 'errorHandlerCmp',   color: '#d4380d' },
} as const;

export type NodeTypeKey = keyof typeof NODE_TYPES;

/** 节点数据 */
export interface FlowNodeData {
  label: string;
  componentName: string;
  color: string;
  config?: Record<string, unknown>;
  timeout?: number;
  retryCount?: number;
  async?: boolean;
}

/** 自定义节点渲染 */
const FlowDesignerNode: React.FC<NodeProps> = ({ data, selected }) => {
  const nodeData = data as unknown as FlowNodeData;
  return (
    <div
      style={{
        padding: '10px 20px',
        border: selected ? `2px solid ${nodeData.color}` : '1px solid #d9d9d9',
        borderRadius: 8,
        background: '#fff',
        boxShadow: selected ? `0 0 8px ${nodeData.color}40` : '0 2px 4px rgba(0,0,0,0.05)',
        minWidth: 120,
        textAlign: 'center',
        transition: 'box-shadow 0.2s',
      }}
    >
      <Handle type="target" position={Position.Top} style={{ background: nodeData.color }} />
      <div style={{ fontWeight: 600, fontSize: 13, color: '#1a1a1a' }}>{nodeData.label}</div>
      <div style={{ fontSize: 11, color: '#999', marginTop: 2 }}>{nodeData.componentName}</div>
      <Handle type="source" position={Position.Bottom} style={{ background: nodeData.color }} />
    </div>
  );
};

export default FlowDesignerNode;