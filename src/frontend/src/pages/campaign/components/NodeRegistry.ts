import type { NodeType, Port } from '../../../types/canvas';

interface NodeDefinition {
  type: NodeType;
  label: string;
  icon: string;
  category: 'input' | 'logic' | 'ai' | 'action' | 'control' | 'end';
  description: string;
  color: string;
  defaultConfig: () => Record<string, any>;
  inputPorts: Port[];
  outputPorts: Port[];
  minInputs?: number;
  maxInputs?: number;
  minOutputs?: number;
  maxOutputs?: number;
}

export const NodeRegistry: Record<NodeType, NodeDefinition> = {
  START: {
    type: 'START', label: '开始', icon: '\u{1F7E2}', category: 'end',
    description: '流程入口节点', color: '#22c55e',
    defaultConfig: () => ({}),
    inputPorts: [],
    outputPorts: [{ id: 'out', label: '', type: 'output' }],
    minOutputs: 1, maxOutputs: 1,
  },
  AUDIENCE_FILTER: {
    type: 'AUDIENCE_FILTER', label: '人群筛选', icon: '\u{1F465}', category: 'input',
    description: '基于实时宽表的动态规则筛选（支持STAT/DETAIL/PERCENTILE条件）', color: '#3b82f6',
    defaultConfig: () => ({ logic: 'AND', conditions: [], limit: 10000, excludeBlacklist: true }),
    inputPorts: [{ id: 'in', label: '', type: 'input' }],
    outputPorts: [{ id: 'out', label: '', type: 'output', dataType: 'array' }],
  },
  EVENT_TRIGGER: {
    type: 'EVENT_TRIGGER', label: '事件触发', icon: '⚡', category: 'input',
    description: '监听外部事件启动流程', color: '#8b5cf6',
    defaultConfig: () => ({ eventType: '', filter: {} }),
    inputPorts: [],
    outputPorts: [{ id: 'out', label: '', type: 'output' }],
    minOutputs: 1,
  },
  CONDITION: {
    type: 'CONDITION', label: '条件分支', icon: '\u{1F500}', category: 'logic',
    description: '基于条件判断分流', color: '#eab308',
    defaultConfig: () => ({ field: '', operator: 'eq', value: '' }),
    inputPorts: [{ id: 'in', label: '', type: 'input' }],
    outputPorts: [
      { id: 'true', label: 'True', type: 'output' },
      { id: 'false', label: 'False', type: 'output' },
    ],
    minOutputs: 2, maxOutputs: 2,
  },
  SPLIT: {
    type: 'SPLIT', label: '并行分支', icon: '\u{1F4CB}', category: 'logic',
    description: '将流程拆分为多个并行分支', color: '#f97316',
    defaultConfig: () => ({ branchCount: 2 }),
    inputPorts: [{ id: 'in', label: '', type: 'input' }],
    outputPorts: [{ id: 'out1', label: 'Branch 1', type: 'output' }, { id: 'out2', label: 'Branch 2', type: 'output' }],
    minOutputs: 2, maxOutputs: 10,
  },
  MERGE: {
    type: 'MERGE', label: '合并节点', icon: '\u{1F517}', category: 'logic',
    description: '合并多个并行分支', color: '#06b6d4',
    defaultConfig: () => ({ waitForAll: true }),
    inputPorts: [{ id: 'in1', label: 'In 1', type: 'input' }, { id: 'in2', label: 'In 2', type: 'input' }],
    outputPorts: [{ id: 'out', label: '', type: 'output' }],
    minInputs: 2, maxOutputs: 1,
  },
  AI_SCORE: {
    type: 'AI_SCORE', label: 'AI 评分', icon: '\u{1F916}', category: 'ai',
    description: '使用 ML 模型预测用户行为', color: '#a855f7',
    defaultConfig: () => ({ modelType: 'churn', threshold: 0.5, batchSize: 1000 }),
    inputPorts: [{ id: 'in', label: '', type: 'input', dataType: 'array' }],
    outputPorts: [{ id: 'out', label: '', type: 'output', dataType: 'array' }],
  },
  AI_PLANNER: {
    type: 'AI_PLANNER', label: 'AI 规划', icon: '\u{1F9E0}', category: 'ai',
    description: 'AI 自动生成营销策略', color: '#c084fc',
    defaultConfig: () => ({ goalType: '', budget: 0 }),
    inputPorts: [{ id: 'in', label: '', type: 'input' }],
    outputPorts: [{ id: 'out', label: '', type: 'output' }],
  },
  SEND_EMAIL: {
    type: 'SEND_EMAIL', label: '发送邮件', icon: '✉️', category: 'action',
    description: '通过邮件渠道触达用户', color: '#22c55e',
    defaultConfig: () => ({ assetId: '', requireApproval: false, retryCount: 3, rateLimit: 1000 }),
    inputPorts: [{ id: 'in', label: '', type: 'input', dataType: 'array' }],
    outputPorts: [{ id: 'out', label: '', type: 'output' }],
  },
  SEND_SMS: {
    type: 'SEND_SMS', label: '发送短信', icon: '\u{1F4F1}', category: 'action',
    description: '通过短信渠道触达用户', color: '#16a34a',
    defaultConfig: () => ({ assetId: '', retryCount: 2 }),
    inputPorts: [{ id: 'in', label: '', type: 'input', dataType: 'array' }],
    outputPorts: [{ id: 'out', label: '', type: 'output' }],
  },
  SEND_PUSH: {
    type: 'SEND_PUSH', label: '发送推送', icon: '\u{1F514}', category: 'action',
    description: '通过 App Push 触达用户', color: '#15803d',
    defaultConfig: () => ({ assetId: '', title: '', body: '' }),
    inputPorts: [{ id: 'in', label: '', type: 'input', dataType: 'array' }],
    outputPorts: [{ id: 'out', label: '', type: 'output' }],
  },
  OFFER_POINTS: {
    type: 'OFFER_POINTS', label: '发放积分', icon: '⭐', category: 'action',
    description: '向用户发放忠诚度积分', color: '#eab308',
    defaultConfig: () => ({ pointType: 'BONUS', amount: 100, reason: 'Campaign reward' }),
    inputPorts: [{ id: 'in', label: '', type: 'input', dataType: 'array' }],
    outputPorts: [{ id: 'out', label: '', type: 'output' }],
  },
  OFFER_COUPON: {
    type: 'OFFER_COUPON', label: '发放优惠券', icon: '\u{1F3AB}', category: 'action',
    description: '向用户发放优惠券', color: '#ca8a04',
    defaultConfig: () => ({ couponTemplateId: '', quantity: 1 }),
    inputPorts: [{ id: 'in', label: '', type: 'input', dataType: 'array' }],
    outputPorts: [{ id: 'out', label: '', type: 'output' }],
  },
  TIER_UPGRADE: {
    type: 'TIER_UPGRADE', label: '等级直升', icon: '\u{1F3C6}', category: 'action',
    description: '升级用户的会员等级', color: '#dc2626',
    defaultConfig: () => ({ targetTier: '', reason: 'Campaign upgrade' }),
    inputPorts: [{ id: 'in', label: '', type: 'input', dataType: 'array' }],
    outputPorts: [{ id: 'out', label: '', type: 'output' }],
  },
  WEBHOOK: {
    type: 'WEBHOOK', label: '外部调用', icon: '\u{1F517}', category: 'action',
    description: '调用外部 HTTP API', color: '#64748b',
    defaultConfig: () => ({ url: '', method: 'POST', headers: {}, retryCount: 3 }),
    inputPorts: [{ id: 'in', label: '', type: 'input' }],
    outputPorts: [{ id: 'out', label: '', type: 'output' }],
  },
  DELAY: {
    type: 'DELAY', label: '延迟等待', icon: '⏰', category: 'control',
    description: '等待指定时长后继续', color: '#6b7280',
    defaultConfig: () => ({ duration: 3600000, unit: 'milliseconds', type: 'fixed' }),
    inputPorts: [{ id: 'in', label: '', type: 'input' }],
    outputPorts: [{ id: 'out', label: '', type: 'output' }],
  },
  WAIT_EVENT: {
    type: 'WAIT_EVENT', label: '事件等待', icon: '\u{1F4E1}', category: 'control',
    description: '等待指定事件触发', color: '#4b5563',
    defaultConfig: () => ({ eventType: '', timeout: 86400000 }),
    inputPorts: [{ id: 'in', label: '', type: 'input' }],
    outputPorts: [{ id: 'out', label: '', type: 'output' }],
  },
  APPROVAL: {
    type: 'APPROVAL', label: '人工审批', icon: '✅', category: 'control',
    description: '暂停流程等待人工审批', color: '#0891b2',
    defaultConfig: () => ({ approverGroup: '', timeout: 72, autoReject: false }),
    inputPorts: [{ id: 'in', label: '', type: 'input' }],
    outputPorts: [
      { id: 'approved', label: '通过', type: 'output' },
      { id: 'rejected', label: '驳回', type: 'output' },
    ],
    minOutputs: 2, maxOutputs: 2,
  },
  END: {
    type: 'END', label: '结束', icon: '\u{1F534}', category: 'end',
    description: '流程结束节点', color: '#ef4444',
    defaultConfig: () => ({}),
    inputPorts: [{ id: 'in', label: '', type: 'input' }],
    outputPorts: [],
    minInputs: 1,
  },
};

/** 按分类获取节点列表 */
export function getNodesByCategory(category: NodeDefinition['category']): NodeDefinition[] {
  return Object.values(NodeRegistry).filter(n => n.category === category);
}

/** 获取所有节点分类 */
export function getNodeCategories(): { key: string; label: string }[] {
  return [
    { key: 'input', label: '输入类' },
    { key: 'logic', label: '逻辑类' },
    { key: 'ai', label: 'AI 类' },
    { key: 'action', label: '动作类' },
    { key: 'control', label: '控制类' },
    { key: 'end', label: '结束类' },
  ];
}
