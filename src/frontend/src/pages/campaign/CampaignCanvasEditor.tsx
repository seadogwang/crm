import React, { useState, useCallback, useRef, useEffect } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import {
  Card, Button, Space, Typography, Tag, message, Modal, Input, Select, Form,
  Descriptions, Divider, Drawer, List, Alert, Badge, Tooltip, Spin, InputNumber,
  Row, Col, Switch,
} from 'antd';
import {
  SaveOutlined, CheckCircleOutlined, ThunderboltOutlined,
  CodeOutlined, EyeOutlined, PlusOutlined,
  ArrowLeftOutlined, RobotOutlined, BranchesOutlined,
  SettingOutlined, DeleteOutlined, MinusCircleOutlined,
} from '@ant-design/icons';
import {
  ReactFlow, Background, Controls, MiniMap,
  useNodesState, useEdgesState, addEdge,
  ReactFlowProvider, Handle, Position,
  type Node, type Edge, type Connection, type NodeProps,
  MarkerType,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import {
  createPlan, getPlan, saveDag, validateDag, compileToBpmn, aiGenerate, getNodeTypes,
  listWorkspaces,
  CampaignPlan, CanvasDag,
} from '../../api/campaign';
import { useAppStore } from '../../store';
import { STATIC_ATTR_FIELDS, DATA_SOURCES, AGGREGATION_FUNCS, CONDITION_OPERATORS, TIME_WINDOW_TYPES } from './components/fieldRegistry';

const { Text, Title } = Typography;
const { TextArea } = Input;
const { Option } = Select;

// ==================== Node Colors ====================

const typeColors: Record<string, string> = {
  input: '#3b82f6', logic: '#eab308', ai: '#a855f7',
  action: '#22c55e', control: '#6b7280', end: '#ef4444',
  flow: '#1890ff', channel: '#52c41a', governance: '#eb2f96', integration: '#13c2c2',
};

// ==================== SVG Node Icons ====================

const NODE_ICONS: Record<string, React.ReactNode> = {
  START: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><polygon points="10,8 16,12 10,16" fill="currentColor" stroke="none"/></svg>,
  AUDIENCE_FILTER: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>,
  EVENT_TRIGGER: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>,
  CONDITION: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="9 18 15 12 9 6"/></svg>,
  SPLIT: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>,
  MERGE: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/><line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/></svg>,
  AI_SCORE: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="M2 12h2"/><path d="M20 12h2"/></svg>,
  AI_PLANNER: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2a10 10 0 1 0 10 10"/><path d="M12 6v6l4 2"/></svg>,
  SEND_EMAIL: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>,
  SEND_SMS: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>,
  SEND_PUSH: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>,
  OFFER_POINTS: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>,
  OFFER_COUPON: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="4" width="20" height="16" rx="2"/><line x1="12" y1="4" x2="12" y2="20"/></svg>,
  TIER_UPGRADE: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="8" r="6"/><path d="M15.5 18.5L12 22l-3.5-3.5"/></svg>,
  WEBHOOK: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>,
  DELAY: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>,
  WAIT_EVENT: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>,
  APPROVAL: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>,
  END: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>,
};

// ==================== Custom Node ====================

const handleStyle: React.CSSProperties = {
  width: 10, height: 10, border: '2px solid #fff',
  background: '#555', borderRadius: '50%',
  opacity: 0, transition: 'opacity 0.15s',
};

const CampaignCanvasNode: React.FC<NodeProps> = ({ data, selected }) => {
  const d = data as any;
  const nodeType = String(d.type || '');
  const icon = NODE_ICONS[nodeType];
  const color = d.color || typeColors[d.category] || '#3b82f6';
  const isEnd = nodeType === 'END';
  const isStart = nodeType === 'START';
  const isCondition = nodeType === 'CONDITION';
  const isApproval = nodeType === 'APPROVAL';
  const hasMultiOutput = isCondition || isApproval;

  return (
    <div
      className="campaign-node"
      style={{
        width: 48, height: 48, borderRadius: 10,
        border: `1px solid ${selected ? '#1890ff' : '#d9d9d9'}`,
        background: '#fff',
        boxShadow: selected ? '0 0 0 2px rgba(24,144,255,0.3)' : '0 1px 3px rgba(0,0,0,0.08)',
        position: 'relative', display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center', gap: 2,
      }}
    >
      {!isStart && (
        <>
          <Handle type="target" position={Position.Left} id="in" style={handleStyle} />
          <Handle type="target" position={Position.Top} id="in-top" style={handleStyle} />
          <Handle type="target" position={Position.Bottom} id="in-bottom" style={handleStyle} />
        </>
      )}
      <span style={{ color: '#333', display: 'flex', alignItems: 'center', fontSize: 16 }}>{icon}</span>
      <span style={{ fontSize: 8, color: '#555', textAlign: 'center', lineHeight: 1.1, maxWidth: 42, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {String(d.label || nodeType)}
      </span>
      {!isEnd && !hasMultiOutput && (
        <>
          <Handle type="source" position={Position.Right} id="out" style={handleStyle} />
          <Handle type="source" position={Position.Top} id="out-top" style={handleStyle} />
          <Handle type="source" position={Position.Bottom} id="out-bottom" style={handleStyle} />
        </>
      )}
      {isCondition && (
        <>
          <Handle type="source" position={Position.Right} id="true"
            style={{ ...handleStyle, top: '30%', background: '#22c55e' }} />
          <Handle type="source" position={Position.Right} id="false"
            style={{ ...handleStyle, top: '70%', background: '#ef4444' }} />
        </>
      )}
      {isApproval && (
        <>
          <Handle type="source" position={Position.Right} id="approved"
            style={{ ...handleStyle, top: '30%', background: '#22c55e' }} />
          <Handle type="source" position={Position.Right} id="rejected"
            style={{ ...handleStyle, top: '70%', background: '#ef4444' }} />
        </>
      )}
    </div>
  );
};

const nodeTypes = { campaignNode: CampaignCanvasNode };

// ==================== Node Type Config Schemas ====================

interface ConfigField {
  key: string;
  label: string;
  type: 'string' | 'number' | 'select' | 'json' | 'array' | 'boolean';
  required?: boolean;
  options?: { label: string; value: any }[];
  placeholder?: string;
  itemSchema?: ConfigField[];
  defaultValue?: any;
}

const FILTER_FIELD_OPTIONS = [
  { label: '会员状态 (status)', value: 'status' },
  { label: '注册日期 (registerDate)', value: 'registerDate' },
  { label: '最近消费天数 (lastOrderDays)', value: 'lastOrderDays' },
  { label: '总消费金额 (totalOrderAmount)', value: 'totalOrderAmount' },
  { label: '平均客单价 (avgOrderAmount)', value: 'avgOrderAmount' },
  { label: '订单总数 (totalOrderCount)', value: 'totalOrderCount' },
  { label: '会员等级 (tierCode)', value: 'tierCode' },
  { label: '黑名单标识 (blacklistFlag)', value: 'blacklistFlag' },
  { label: '总登录天数 (totalLoginDays)', value: 'totalLoginDays' },
  { label: '连续登录天数 (continuousLoginDays)', value: 'continuousLoginDays' },
];

const FILTER_OPERATOR_OPTIONS = [
  { label: '等于 (=)', value: 'eq' },
  { label: '不等于 (!=)', value: 'ne' },
  { label: '大于 (>)', value: 'gt' },
  { label: '大于等于 (>=)', value: 'gte' },
  { label: '小于 (<)', value: 'lt' },
  { label: '小于等于 (<=)', value: 'lte' },
  { label: '包含 (contains)', value: 'contains' },
  { label: '属于 (in)', value: 'in' },
];

const NODE_CONFIG_SCHEMAS: Record<string, ConfigField[]> = {
  AUDIENCE_FILTER: [
    { key: 'logic', label: '逻辑', type: 'select', required: true,
      options: [
        { label: '全部满足 (AND)', value: 'AND' },
        { label: '任一满足 (OR)', value: 'OR' },
      ]},
    { key: 'conditions', label: '筛选条件', type: 'array', defaultValue: [],
      itemSchema: [
        { key: 'type', label: '条件类型', type: 'select', required: true,
          options: [
            { label: '动态统计 (DYNAMIC_STAT)', value: 'DYNAMIC_STAT' },
            { label: '静态属性 (STATIC_ATTR)', value: 'STATIC_ATTR' },
          ]},
        { key: 'name', label: '条件名称', type: 'string', placeholder: '如: 近30天订单数≥3' },
        { key: 'dataSource', label: '数据源', type: 'select',
          options: [{ label: '仅静态属性', value: '' }, ...DATA_SOURCES] },
        { key: 'aggFunc', label: '聚合函数', type: 'select',
          options: AGGREGATION_FUNCS },
        { key: 'aggField', label: '聚合字段', type: 'string', placeholder: '如: order_id, net_amount' },
        { key: 'timeWindowType', label: '时间范围', type: 'select',
          options: TIME_WINDOW_TYPES },
        { key: 'timeWindowDays', label: '天数', type: 'number', placeholder: 'LAST_N_DAYS 时填写' },
        { key: 'field', label: '静态属性字段 (STATIC_ATTR)', type: 'select',
          options: Object.values(STATIC_ATTR_FIELDS).map(f => ({ label: f.label, value: f.key })) },
        { key: 'operator', label: '操作符', type: 'select', required: true, options: CONDITION_OPERATORS },
        { key: 'value', label: '比较值', type: 'string', required: true, placeholder: '如: 3 或 GOLD,PLATINUM' },
      ]},
    { key: 'limit', label: '限制人数', type: 'number', placeholder: '默认 10000' },
    { key: 'excludeBlacklist', label: '排除黑名单', type: 'boolean', defaultValue: true },
  ],
  SEND_EMAIL: [
    { key: 'assetId', label: '素材ID', type: 'string', required: true, placeholder: '输入素材ID' },
    { key: 'subjectLine', label: '邮件标题', type: 'string', placeholder: '可在此覆盖标题' },
    { key: 'retryCount', label: '重试次数', type: 'number', placeholder: '默认 3' },
    { key: 'rateLimit', label: '发送限流(条/秒)', type: 'number', placeholder: '默认 1000' },
    { key: 'requireApproval', label: '需要审批', type: 'boolean', defaultValue: false },
  ],
  SEND_SMS: [
    { key: 'assetId', label: '素材ID', type: 'string', required: true, placeholder: '输入素材ID' },
    { key: 'templateId', label: '模板ID', type: 'string' },
    { key: 'retryCount', label: '重试次数', type: 'number', placeholder: '默认 2' },
  ],
  SEND_PUSH: [
    { key: 'assetId', label: '素材ID', type: 'string', required: true, placeholder: '输入素材ID' },
    { key: 'title', label: '推送标题', type: 'string', placeholder: '可在此覆盖标题' },
    { key: 'body', label: '推送内容', type: 'string', placeholder: '推送消息正文' },
  ],
  OFFER_POINTS: [
    { key: 'pointType', label: '积分类型', type: 'select', required: true,
      options: [
        { label: '奖励积分 (REWARD_POINTS)', value: 'REWARD_POINTS' },
        { label: '等级成长值 (TIER_POINTS)', value: 'TIER_POINTS' },
        { label: '活动奖励 (CAMPAIGN_BONUS)', value: 'CAMPAIGN_BONUS' },
      ]},
    { key: 'amount', label: '积分数量', type: 'number', required: true, placeholder: '例如: 500' },
    { key: 'reason', label: '发放原因', type: 'string', placeholder: '例如: 会员召回奖励' },
  ],
  OFFER_COUPON: [
    { key: 'couponId', label: '优惠券ID', type: 'string', required: true },
    { key: 'count', label: '发放数量', type: 'number', placeholder: '默认 1' },
    { key: 'reason', label: '发放原因', type: 'string', placeholder: '例如: 新会员福利' },
  ],
  TIER_UPGRADE: [
    { key: 'targetTier', label: '目标等级', type: 'select', required: true,
      options: [
        { label: '银卡 (SILVER)', value: 'SILVER' },
        { label: '金卡 (GOLD)', value: 'GOLD' },
        { label: '铂金 (PLATINUM)', value: 'PLATINUM' },
      ]},
    { key: 'reason', label: '升级原因', type: 'string', placeholder: '例如: 活动奖励升级' },
  ],
  CONDITION: [
    { key: 'field', label: '判断字段', type: 'select', required: true,
      options: [
        { label: '流失概率 (churnProbability)', value: 'churnProbability' },
        { label: '转化概率 (conversionProbability)', value: 'conversionProbability' },
        { label: '增量价值 (upliftScore)', value: 'upliftScore' },
        { label: 'RFM评分', value: 'rfmScore' },
        { label: '成员来源', value: 'memberSource' },
        { label: '会员状态', value: 'status' },
        { label: '会员等级', value: 'tierCode' },
      ]},
    { key: 'operator', label: '运算符', type: 'select', required: true,
      options: [
        { label: '>=', value: 'gte' },
        { label: '>', value: 'gt' },
        { label: '=', value: 'eq' },
        { label: '!=', value: 'ne' },
        { label: '<', value: 'lt' },
        { label: '<=', value: 'lte' },
        { label: '包含 (contains)', value: 'contains' },
        { label: '开头是 (startsWith)', value: 'startsWith' },
        { label: '结尾是 (endsWith)', value: 'endsWith' },
        { label: '属于 (in)', value: 'in' },
      ]},
    { key: 'value', label: '比较值', type: 'string', required: true, placeholder: '例如: 0.6 或 ACTIVE' },
  ],
  SPLIT: [
    { key: 'branchCount', label: '分支数量', type: 'number', required: true, placeholder: '默认 2' },
  ],
  MERGE: [
    { key: 'waitForAll', label: '等待全部', type: 'boolean', defaultValue: true },
  ],
  AI_SCORE: [
    { key: 'modelType', label: '模型类型', type: 'select', required: true,
      options: [
        { label: '流失预测 (churn)', value: 'churn' },
        { label: '增量价值 (uplift)', value: 'uplift' },
        { label: '转化预测 (conversion)', value: 'conversion' },
        { label: '自定义模型 (custom)', value: 'custom' },
      ]},
    { key: 'modelId', label: '自定义模型ID', type: 'string', placeholder: 'modelType=custom 时必填' },
    { key: 'threshold', label: '评分阈值 (0~1)', type: 'number', placeholder: '默认 0.5' },
    { key: 'batchSize', label: '批处理大小', type: 'number', placeholder: '默认 500' },
  ],
  DELAY: [
    { key: 'duration', label: '延迟时长', type: 'number', required: true, placeholder: '例如: 24' },
    { key: 'unit', label: '时间单位', type: 'select', required: true,
      options: [
        { label: '毫秒', value: 'milliseconds' },
        { label: '秒', value: 'seconds' },
        { label: '分钟', value: 'minutes' },
        { label: '小时', value: 'hours' },
        { label: '天', value: 'days' },
      ]},
    { key: 'type', label: '延迟类型', type: 'select',
      options: [
        { label: '固定时长', value: 'fixed' },
        { label: '动态时长', value: 'dynamic' },
      ]},
  ],
  WEBHOOK: [
    { key: 'url', label: 'Webhook URL', type: 'string', required: true },
    { key: 'method', label: 'HTTP方法', type: 'select',
      options: [
        { label: 'POST', value: 'POST' },
        { label: 'GET', value: 'GET' },
        { label: 'PUT', value: 'PUT' },
        { label: 'DELETE', value: 'DELETE' },
      ]},
    { key: 'retryCount', label: '重试次数', type: 'number', placeholder: '默认 3' },
  ],
  APPROVAL: [
    { key: 'approverId', label: '指定审批人ID', type: 'string', placeholder: '留空则使用审批组' },
    { key: 'approverGroup', label: '审批组', type: 'string', placeholder: '例如: marketing_managers' },
    { key: 'timeoutHours', label: '超时(小时)', type: 'number', placeholder: '默认 24' },
    { key: 'autoReject', label: '超时自动拒绝', type: 'boolean', defaultValue: true },
  ],
};

// ==================== Edge Config Form ====================

const EdgeConfigForm: React.FC<{
  edge: Edge | null;
  onSave: (edgeId: string, data: any) => void;
  onClose: () => void;
}> = ({ edge, onSave, onClose }) => {
  const [label, setLabel] = useState(edge?.data?.label || '');
  const [condition, setCondition] = useState(edge?.data?.condition || '');

  if (!edge) return null;

  return (
    <div>
      <Descriptions column={1} size="small">
        <Descriptions.Item label="连线">{edge.source} → {edge.target}</Descriptions.Item>
      </Descriptions>
      <div style={{ borderTop: '1px solid #f0f0f0', margin: '16px 0' }} />
      <Form layout="vertical">
        <Form.Item label="标签">
          <Input value={label as any} onChange={(e: any) => setLabel(e.target.value)} placeholder="例如: 高流失用户" />
        </Form.Item>
        <Form.Item label="条件表达式">
          <Input value={condition as any} onChange={(e: any) => setCondition(e.target.value)}
            placeholder="例如: churnProbability >= 0.6" />
          <Text type="secondary" style={{ fontSize: 12 }}>留空表示无条件执行</Text>
        </Form.Item>
      </Form>
      <Space>
        <Button type="primary" onClick={() => { onSave(edge.id, { label, condition }); onClose(); }}>保存</Button>
        <Button onClick={onClose}>取消</Button>
      </Space>
    </div>
  );
};

// ==================== Filters Editor Component ====================

const FiltersEditor: React.FC<{
  value?: any[];
  onChange?: (value: any[]) => void;
  itemSchema: ConfigField[];
}> = ({ value = [], onChange, itemSchema }) => {
  const handleAdd = () => {
    const newItem: Record<string, any> = {};
    itemSchema.forEach(f => { newItem[f.key] = f.defaultValue ?? (f.type === 'number' ? undefined : ''); });
    onChange?.([...value, newItem]);
  };

  const handleRemove = (index: number) => {
    onChange?.(value.filter((_, i) => i !== index));
  };

  const handleChange = (index: number, key: string, val: any) => {
    const updated = value.map((item, i) => i === index ? { ...item, [key]: val } : item);
    onChange?.(updated);
  };

  return (
    <div>
      {value.length > 0 && (
        <div style={{ marginBottom: 8 }}>
          {value.map((item, idx) => (
            <div key={idx} style={{
              display: 'flex', gap: 6, alignItems: 'flex-start',
              padding: '6px 8px', marginBottom: 6,
              background: '#fafafa', borderRadius: 4, border: '1px solid #f0f0f0',
            }}>
              {itemSchema.map(field => (
                <div key={field.key} style={{ flex: 1, minWidth: 0 }}>
                  <Text type="secondary" style={{ fontSize: 10, display: 'block', marginBottom: 2 }}>{field.label}</Text>
                  {field.type === 'select' ? (
                    <Select
                      size="small"
                      value={item[field.key]}
                      onChange={(v) => handleChange(idx, field.key, v)}
                      placeholder={field.placeholder}
                      style={{ width: '100%' }}
                      options={field.options}
                    />
                  ) : field.type === 'number' ? (
                    <InputNumber
                      size="small"
                      value={item[field.key]}
                      onChange={(v) => handleChange(idx, field.key, v)}
                      placeholder={field.placeholder}
                      style={{ width: '100%' }}
                    />
                  ) : (
                    <Input
                      size="small"
                      value={item[field.key]}
                      onChange={(e) => handleChange(idx, field.key, e.target.value)}
                      placeholder={field.placeholder}
                    />
                  )}
                </div>
              ))}
              <Button
                type="text" danger size="small"
                icon={<MinusCircleOutlined />}
                onClick={() => handleRemove(idx)}
                style={{ marginTop: 18, flexShrink: 0 }}
              />
            </div>
          ))}
        </div>
      )}
      <Button
        type="dashed" size="small" block
        icon={<PlusOutlined />}
        onClick={handleAdd}
      >
        添加筛选条件
      </Button>
    </div>
  );
};

const CampaignCanvasEditor: React.FC = () => {
  const { planId } = useParams<{ planId: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { currentProgramCode } = useAppStore();
  const [plan, setPlan] = useState<CampaignPlan | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  // React Flow state
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const [reactFlowInstance, setReactFlowInstance] = useState<any>(null);

  // UI state
  const [nodeTypesList, setNodeTypesList] = useState<any[]>([]);
  const [selectedNode, setSelectedNode] = useState<any>(null);
  const [selectedEdge, setSelectedEdge] = useState<any>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [edgeDrawerOpen, setEdgeDrawerOpen] = useState(false);
  const [aiModalOpen, setAiModalOpen] = useState(false);
  const [bpmnModalOpen, setBpmnModalOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(true);
  const [palettePos, setPalettePos] = useState({ x: 8, y: 48 });
  const paletteDragging = useRef(false);
  const paletteDragStart = useRef({ x: 0, y: 0 });
  const [bpmnXml, setBpmnXml] = useState('');
  const [validationResult, setValidationResult] = useState<any>(null);
  const [workspaces, setWorkspaces] = useState<any[]>([]);
  const [selectedWsId, setSelectedWsId] = useState<string>('');
  const [aiForm] = Form.useForm();

  // Load plan & node types & workspaces
  useEffect(() => {
    loadNodeTypes();
    loadWorkspaces();
    const iid = searchParams.get('initiativeId');
    const gid = searchParams.get('goalId');
    const wid = searchParams.get('workspaceId');

    if (planId && planId !== 'new') {
      loadPlan(planId);
    } else if (iid && wid) {
      // 从举措进入：自动创建关联计划
      setPlan({
        id: 'new', name: '活动流程', status: 'DRAFT',
        workspaceId: wid, goalId: gid || undefined, initiativeId: iid,
      } as CampaignPlan);
      setSelectedWsId(wid);
    } else {
      setPlan({
        id: 'new', name: '新活动计划', status: 'DRAFT', workspaceId: '',
      } as CampaignPlan);
    }
  }, [planId]);

  const loadNodeTypes = async () => {
    try {
      const types = await getNodeTypes();
      setNodeTypesList(types || []);
    } catch { /* ignore */ }
  };

  const loadWorkspaces = async () => {
    try {
      const ws = await listWorkspaces();
      const filtered = (ws || []).filter((w: any) => w.status === 'ACTIVE' && w.programCode === currentProgramCode);
      setWorkspaces(filtered);
      if (filtered.length > 0) {
        setSelectedWsId(filtered[0].id);
        // Auto-assign if plan is new
        if (!planId || planId === 'new') {
          setPlan((prev: any) => prev ? { ...prev, workspaceId: filtered[0].id } : prev);
        }
      }
    } catch { /* ignore */ }
  };

  const loadPlan = async (id: string) => {
    setLoading(true);
    try {
      const p = await getPlan(id);
      setPlan(p);
      if (p.workspaceId) setSelectedWsId(p.workspaceId);
      // Load DAG if stored (simplified: would need to parse graphJson)
    } catch (err: any) {
      message.error('加载计划失败');
    } finally {
      setLoading(false);
    }
  };

  // Node selection → open config drawer
  const onNodeClick = useCallback((_: any, node: Node) => {
    setSelectedNode(node);
    setSelectedEdge(null);
    setDrawerOpen(true);
  }, []);

  // Edge click → open condition drawer
  const onEdgeClick = useCallback((_: any, edge: Edge) => {
    setSelectedEdge(edge);
    setSelectedNode(null);
    setEdgeDrawerOpen(true);
  }, []);

  // Connect nodes
  const onConnect = useCallback(
    (params: Connection) => setEdges((eds) => addEdge({
      ...params,
      animated: true,
      style: { stroke: '#1890ff' },
      markerEnd: { type: MarkerType.ArrowClosed },
    }, eds)),
    [setEdges],
  );

  // Drag & drop from palette
  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  }, []);

  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();
      const type = event.dataTransfer.getData('application/reactflow');
      if (!type || !reactFlowInstance) return;

      const position = reactFlowInstance.screenToFlowPosition({
        x: event.clientX, y: event.clientY,
      });
      const nodeType = nodeTypesList.find((n: any) => n.type === type);
      const newId = `node_${Date.now()}`;

      const newNode: Node = {
        id: newId,
        type: 'campaignNode',
        position,
        data: {
          label: nodeType?.label || type,
          type: type,
          category: nodeType?.category,
          color: typeColors[nodeType?.category] || '#1890ff',
          config: {},
        },
      };
      setNodes((nds) => nds.concat(newNode));
    },
    [reactFlowInstance, nodeTypesList, setNodes],
  );

  // ==================== Node Config Update ====================

  const updateNodeConfig = (key: string, value: any) => {
    setNodes((nds) => nds.map((n) => {
      if (n.id === selectedNode?.id) {
        return {
          ...n,
          data: {
            ...n.data,
            config: { ...(n.data.config || {}), [key]: value },
          },
        };
      }
      return n;
    }));
    // Update selectedNode too
    setSelectedNode((prev: any) => prev ? {
      ...prev,
      data: { ...prev.data, config: { ...(prev.data.config || {}), [key]: value } },
    } : prev);
  };

  // ==================== Edge Config Update ====================

  const updateEdgeData = (edgeId: string, data: any) => {
    setEdges((eds) => eds.map((e) => {
      if (e.id === edgeId) {
        return { ...e, data: { ...(e.data || {}), ...data }, label: data.label || e.label };
      }
      return e;
    }));
  };

  // ==================== Save ====================

  const handleSave = async () => {
    if (!plan) return;
    if (!selectedWsId && plan.id === 'new') {
      message.warning('请选择一个工作区');
      return;
    }
    setSaving(true);
    try {
      const dag: CanvasDag = {
        nodes: nodes.map(n => ({
          id: n.id, type: String(n.data?.type || ''), label: String(n.data?.label || ''),
          config: (n.data?.config as any) || {}, x: n.position.x, y: n.position.y,
        })),
        edges: edges.map(e => ({
          id: e.id, source: e.source, target: e.target,
          condition: (e.data as any)?.condition, label: (e.data as any)?.label,
        })),
      };

      if (plan.id === 'new') {
        const created = await createPlan({
          workspaceId: selectedWsId,
          goalId: plan.goalId || undefined,
          initiativeId: plan.initiativeId || undefined,
          name: plan.name || '未命名计划',
          description: plan.description || '',
        });
        await saveDag(created.id, dag);
        navigate(`/campaign/canvas/${created.id}`, { replace: true });
      } else {
        await saveDag(plan.id, dag);
      }
      message.success('保存成功');
    } catch (err: any) {
      message.error('保存失败: ' + (err?.response?.data?.message || err.message));
    } finally {
      setSaving(false);
    }
  };

  // Validate DAG
  const handleValidate = async () => {
    if (nodes.length === 0) {
      message.warning('画布为空，请先拖入节点');
      return;
    }
    const dag: CanvasDag = {
      nodes: nodes.map(n => ({ id: n.id, type: String(n.data?.type || ''), label: String(n.data?.label || ''), config: (n.data?.config as any) || {} })),
      edges: edges.map(e => ({ id: e.id, source: e.source, target: e.target })),
    };
    try {
      const result = await validateDag(dag);
      setValidationResult(result);
      if (result.valid) {
        message.success('✅ DAG 校验通过');
      } else {
        message.error(`校验失败: ${result.errors?.join('; ')}`);
      }
    } catch (err: any) {
      message.error('校验失败');
    }
  };

  // Compile to BPMN
  const handleCompile = async () => {
    if (!plan || plan.id === 'new') {
      message.warning('请先保存计划');
      return;
    }
    try {
      const xml = await compileToBpmn(plan.id);
      setBpmnXml(xml);
      setBpmnModalOpen(true);
    } catch (err: any) {
      message.error('编译失败');
    }
  };

  // AI Generate
  const handleAiGenerate = async (values: any) => {
    try {
      const dag = await aiGenerate({
        goal: values.goal, description: values.description,
        budget: values.budget, audience: values.audience,
        channel: values.channel, additionalInstructions: values.instructions,
      });
      if (dag?.nodes) {
        const flowNodes: Node[] = dag.nodes.map((n: any, i: number) => ({
          id: n.id, type: 'campaignNode', position: { x: n.x || 100 + i * 200, y: n.y || 200 },
          data: { label: n.label || n.type, type: n.type, config: n.config || {}, color: typeColors[n.category] || '#1890ff' },
        }));
        const flowEdges: Edge[] = (dag.edges || []).map((e: any) => ({
          id: e.id, source: e.source, target: e.target, animated: true,
          style: { stroke: '#1890ff' },
          markerEnd: { type: MarkerType.ArrowClosed },
          data: { condition: e.condition, label: e.label },
        }));
        setNodes(flowNodes);
        setEdges(flowEdges);
        message.success('AI 生成 DAG 完成');
      }
      setAiModalOpen(false);
      aiForm.resetFields();
    } catch (err: any) {
      message.error('AI 生成失败');
    }
  };

  const onNodeDragStart = (_: any, nodeType: any) => (event: React.DragEvent) => {
    event.dataTransfer.setData('application/reactflow', nodeType.type);
    event.dataTransfer.effectAllowed = 'move';
  };

  // Delete selected node or edge
  const handleDeleteSelected = () => {
    if (selectedNode) {
      setNodes((nds) => nds.filter((n) => n.id !== selectedNode.id));
      setSelectedNode(null);
      setDrawerOpen(false);
      message.success('节点已删除');
    } else if (selectedEdge) {
      setEdges((eds) => eds.filter((e) => e.id !== selectedEdge.id));
      setSelectedEdge(null);
      setEdgeDrawerOpen(false);
    }
  };

  if (loading) return <div style={{ display: 'flex', justifyContent: 'center', padding: 100 }}><Spin size="large" /></div>;

  // Get schema for selected node
  const nodeSchema = selectedNode ? NODE_CONFIG_SCHEMAS[selectedNode.data?.type] : null;

  const backUrl = searchParams.get('workspaceId')
    ? `/campaign/workspace/${searchParams.get('workspaceId')}`
    : '/campaign/workspaces';

  return (
    <div style={{ height: 'calc(100vh - 100px)', display: 'flex', flexDirection: 'column' }}>
      {/* Handle hover visibility CSS */}
      <style>{`
        .campaign-node .react-flow__handle { opacity: 0 !important; transition: opacity 0.15s ease !important; }
        .campaign-node:hover .react-flow__handle { opacity: 1 !important; }
        .react-flow__handle-connecting { opacity: 1 !important; }
        .react-flow__handle-valid { opacity: 1 !important; }
      `}</style>
      {/* Toolbar */}
      <Card size="small" style={{ marginBottom: 8, flexShrink: 0 }} bodyStyle={{ padding: '8px 16px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Space>
            <Title level={5} style={{ margin: 0 }}>{plan?.name || '画布编辑器'}</Title>
            {plan?.status && <Tag color={plan.status === 'APPROVED' ? 'green' : plan.status === 'DRAFT' ? 'default' : 'blue'}>{plan.status}</Tag>}
          </Space>
          <Space>
            <Button icon={<RobotOutlined />} onClick={() => setAiModalOpen(true)}>AI 生成</Button>
            <Button icon={<CheckCircleOutlined />} onClick={handleValidate}>校验</Button>
            <Button icon={<CodeOutlined />} onClick={handleCompile}>编译 BPMN</Button>
            <Button type="primary" icon={<SaveOutlined />} loading={saving} onClick={handleSave}>保存</Button>
            <Button type="text" icon={<ArrowLeftOutlined />} onClick={() => navigate(backUrl)}>
              返回
            </Button>
          </Space>
        </div>
        {validationResult && (
          <div style={{ marginTop: 8 }}>
            {validationResult.errors?.map((e: string, i: number) => <Alert key={i} type="error" message={e} banner style={{ marginBottom: 4 }} />)}
            {validationResult.warnings?.map((w: string, i: number) => <Alert key={i} type="warning" message={w} banner style={{ marginBottom: 4 }} />)}
            {validationResult.valid && !validationResult.errors?.length && <Alert type="success" message="DAG 校验通过" banner />}
          </div>
        )}
      </Card>

      <div style={{ display: 'flex', flex: 1, gap: 8, overflow: 'hidden', position: 'relative' }}>
        {/* Center: Canvas */}
        <div style={{ flex: 1, position: 'relative' }} ref={reactFlowWrapper}
          onMouseMove={e => {
            if (paletteDragging.current) {
              setPalettePos({ x: e.clientX - paletteDragStart.current.x, y: e.clientY - paletteDragStart.current.y });
            }
          }}
          onMouseUp={() => { paletteDragging.current = false; }}
          onMouseLeave={() => { paletteDragging.current = false; }}>
          {/* Floating Node Palette */}
          {paletteOpen ? (
            <div style={{
              position: 'absolute', top: palettePos.y, left: palettePos.x, zIndex: 10,
              background: '#fff', borderRadius: 8,
              border: '1.5px solid #d9d9d9',
              boxShadow: '0 4px 16px rgba(0,0,0,0.10)',
              padding: '12px 0', maxHeight: 'calc(100% - 16px)', overflowY: 'auto',
              width: 180, fontSize: 12, cursor: 'default',
            }}>
              <div
                style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  padding: '0 12px 8px', cursor: 'grab', userSelect: 'none',
                }}
                onMouseDown={e => {
                  paletteDragging.current = true;
                  paletteDragStart.current = { x: e.clientX - palettePos.x, y: e.clientY - palettePos.y };
                }}
              >
                <Text strong style={{ fontSize: 12 }}>节点面板</Text>
                <Button type="text" size="small" onClick={() => setPaletteOpen(false)}
                  style={{ width: 20, height: 20, padding: 0, fontSize: 14, lineHeight: 1 }}>×</Button>
              </div>
              {['flow', 'channel', 'action', 'ai', 'governance', 'integration'].map((category, ci) => {
                const catNodes = nodeTypesList.filter((n: any) => n.category === category);
                if (catNodes.length === 0) return null;
                const catLabels: Record<string, string> = { flow: '流程', channel: '渠道', action: '动作', ai: 'AI', governance: '治理', integration: '集成' };
                return (
                  <div key={category}>
                    {ci > 0 && <div style={{ height: 1, background: '#f0f0f0', margin: '4px 12px' }} />}
                    <div style={{ padding: '2px 12px 4px', fontSize: 10, color: '#999', textTransform: 'uppercase' }}>
                      {catLabels[category] || category}
                    </div>
                    {catNodes.map((nt: any) => (
                      <div key={nt.type}
                        draggable
                        onDragStart={onNodeDragStart(null, nt)}
                        onClick={() => {
                          const newId = `node_${Date.now()}`;
                          const newNode: Node = {
                            id: newId, type: 'campaignNode',
                            position: { x: 100 + Math.random() * 200, y: 100 + Math.random() * 200 },
                            data: { label: nt.label, type: nt.type, category: nt.category, color: typeColors[nt.category] || '#1890ff', config: {} },
                          };
                          setNodes((nds: any) => nds.concat(newNode));
                        }}
                        style={{
                          padding: '5px 12px', cursor: 'grab', fontSize: 12,
                          display: 'flex', alignItems: 'center', gap: 8,
                          color: '#333', transition: 'background 0.15s',
                        }}
                        onMouseEnter={e => (e.currentTarget.style.background = '#f5f5f5')}
                        onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                      >
                        <span style={{ color: (typeColors as any)[category] || '#1890ff', display: 'flex', alignItems: 'center' }}>
                          {NODE_ICONS[nt.type]}
                        </span>
                        {String(nt.label)}
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>
          ) : (
            <Button
              type="default"
              icon={<BranchesOutlined />}
              onClick={() => setPaletteOpen(true)}
              style={{
                position: 'absolute', top: palettePos.y, left: palettePos.x, zIndex: 10,
                width: 36, height: 36, borderRadius: 8,
                border: '1.5px solid #d9d9d9', background: '#fff',
                boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
              }}
            />
          )}
          {!planId || planId === 'new' ? (
            <div style={{ position: 'absolute', top: 8, left: 8, zIndex: 10, background: '#fff', padding: '4px 12px', borderRadius: 4, boxShadow: '0 2px 6px rgba(0,0,0,0.1)' }}>
              <Space>
                <Text>所属工作区:</Text>
                <Select
                  value={selectedWsId || undefined}
                  onChange={(val) => { setSelectedWsId(val); setPlan((prev: any) => prev ? { ...prev, workspaceId: val } : prev); }}
                  placeholder="选择工作区"
                  style={{ width: 240 }}
                  options={workspaces.map((w: any) => ({ label: w.name, value: w.id }))}
                />
              </Space>
            </div>
          ) : null}
          <ReactFlowProvider>
            <ReactFlow
              nodes={nodes}
              edges={edges}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onConnect={onConnect}
              onInit={setReactFlowInstance}
              onDrop={onDrop}
              onDragOver={onDragOver}
              onNodeClick={onNodeClick}
              onEdgeClick={onEdgeClick}
              onPaneClick={() => { setSelectedNode(null); setSelectedEdge(null); setDrawerOpen(false); setEdgeDrawerOpen(false); }}
              nodeTypes={nodeTypes}
              deleteKeyCode={['Backspace', 'Delete']}
              defaultViewport={{ zoom: 1, x: 0, y: 0 }}
              minZoom={0.25}
              maxZoom={2}
              style={{ background: '#fafafa' }}
            >
              <Background />
              <Controls />
              <MiniMap nodeStrokeWidth={3} style={{ height: 120 }} />
            </ReactFlow>
          </ReactFlowProvider>
        </div>
      </div>

      {/* ==================== Node Properties Drawer ==================== */}
      <Drawer title={
        <Space>
          <SettingOutlined />
          <span>节点配置: {selectedNode?.data?.label || ''}</span>
          <Tag>{selectedNode?.data?.type}</Tag>
        </Space>
      }
        placement="right" width={560}
        open={drawerOpen && !!selectedNode}
        onClose={() => { setDrawerOpen(false); setSelectedNode(null); }}
        extra={
          <Button danger size="small" icon={<DeleteOutlined />} onClick={handleDeleteSelected}>删除节点</Button>
        }>
        {selectedNode && (
          <div>
            <Descriptions column={1} size="small">
              <Descriptions.Item label="节点ID"><Text code>{selectedNode.id}</Text></Descriptions.Item>
              <Descriptions.Item label="类型">
                <Tag color={selectedNode.data?.color}>{selectedNode.data?.type}</Tag>
              </Descriptions.Item>
            </Descriptions>
            <Divider />
            <Form layout="vertical">
              <Form.Item label="显示名称">
                <Input value={selectedNode.data?.label || ''}
                  onChange={e => {
                    const val = e.target.value;
                    setNodes((nds) => nds.map((n) =>
                      n.id === selectedNode.id ? { ...n, data: { ...n.data, label: val } } : n
                    ));
                    setSelectedNode((prev: any) => prev ? { ...prev, data: { ...prev.data, label: val } } : prev);
                  }}
                />
              </Form.Item>
            </Form>
            <Divider />
            {nodeSchema ? (
              <div>
                <Text strong style={{ fontSize: 16 }}>配置参数</Text>
                <div style={{ marginTop: 12 }}>
                  <Form layout="vertical">
                    {nodeSchema.map((field) => (
                      <Form.Item key={field.key} label={field.label}
                        required={field.required}
                        valuePropName={field.type === 'boolean' ? 'checked' : 'value'}>
                        {field.type === 'select' ? (
                          <Select
                            value={selectedNode.data?.config?.[field.key]}
                            onChange={(val) => updateNodeConfig(field.key, val)}
                            placeholder={field.placeholder || `选择${field.label}`}
                            allowClear
                            options={field.options}
                            getPopupContainer={trigger => trigger.parentElement || document.body}
                            style={{ width: '100%' }}
                          />
                        ) : field.type === 'number' ? (
                          <InputNumber
                            value={selectedNode.data?.config?.[field.key]}
                            onChange={(val) => updateNodeConfig(field.key, val)}
                            placeholder={field.placeholder}
                            style={{ width: '100%' }}
                          />
                        ) : field.type === 'boolean' ? (
                          <Switch
                            checked={selectedNode.data?.config?.[field.key] ?? field.defaultValue}
                            onChange={(val) => updateNodeConfig(field.key, val)}
                          />
                        ) : field.type === 'array' && field.itemSchema ? (
                          <FiltersEditor
                            value={selectedNode.data?.config?.[field.key] || []}
                            onChange={(val) => updateNodeConfig(field.key, val)}
                            itemSchema={field.itemSchema}
                          />
                        ) : (
                          <Input
                            value={selectedNode.data?.config?.[field.key]}
                            onChange={(e) => updateNodeConfig(field.key, e.target.value)}
                            placeholder={field.placeholder}
                          />
                        )}
                      </Form.Item>
                    ))}
                  </Form>
                </div>
              </div>
            ) : (
              <div>
                <Text type="secondary">该节点类型没有预定义配置项</Text>
                <div style={{ marginTop: 12 }}>
                  <Text strong>原始配置 (JSON)</Text>
                  <pre style={{ marginTop: 8, padding: 8, background: '#f5f5f5', borderRadius: 4, fontSize: 12 }}>
                    {JSON.stringify(selectedNode.data?.config || {}, null, 2)}
                  </pre>
                </div>
              </div>
            )}
          </div>
        )}
      </Drawer>

      {/* ==================== Edge Properties Drawer ==================== */}
      <Drawer title="连线配置"
        placement="right" width={360}
        open={edgeDrawerOpen && !!selectedEdge}
        onClose={() => { setEdgeDrawerOpen(false); setSelectedEdge(null); }}
        extra={
          <Button danger size="small" icon={<DeleteOutlined />} onClick={handleDeleteSelected}>删除连线</Button>
        }>
        <EdgeConfigForm
          edge={selectedEdge}
          onSave={updateEdgeData}
          onClose={() => { setEdgeDrawerOpen(false); setSelectedEdge(null); }}
        />
      </Drawer>

      {/* AI Generation Modal */}
      <Modal title={<><RobotOutlined /> AI 生成 DAG</>} open={aiModalOpen}
        onCancel={() => setAiModalOpen(false)} onOk={() => aiForm.submit()} okText="生成">
        <Form form={aiForm} layout="vertical" onFinish={handleAiGenerate}>
          <Form.Item name="goal" label="目标" rules={[{ required: true }]}>
            <Input placeholder="例如：提升 VIP 会员转化率" />
          </Form.Item>
          <Form.Item name="audience" label="受众">
            <Input placeholder="例如：30天未活跃用户" />
          </Form.Item>
          <Form.Item name="channel" label="渠道">
            <Select options={[
              { label: '邮件', value: 'email' }, { label: '短信', value: 'sms' },
              { label: '推送', value: 'push' }, { label: '邮件+短信', value: 'email+sms' },
            ]} />
          </Form.Item>
          <Form.Item name="budget" label="预算">
            <Input placeholder="例如：10000 USD" />
          </Form.Item>
          <Form.Item name="description" label="描述">
            <TextArea rows={2} placeholder="更多描述信息" />
          </Form.Item>
          <Form.Item name="instructions" label="额外指示">
            <TextArea rows={2} placeholder="例如：需要人工审批节点" />
          </Form.Item>
        </Form>
      </Modal>

      {/* BPMN Output Modal */}
      <Modal title={<><CodeOutlined /> BPMN XML</>} open={bpmnModalOpen}
        onCancel={() => setBpmnModalOpen(false)} width={800} footer={
          <Button onClick={() => { navigator.clipboard.writeText(bpmnXml); message.success('已复制') }}>复制 XML</Button>
        }>
        <pre style={{ maxHeight: 500, overflow: 'auto', background: '#1e1e1e', color: '#d4d4d4', padding: 16, borderRadius: 4, fontSize: 12 }}>
          {bpmnXml || '暂无 BPMN 输出'}
        </pre>
      </Modal>
    </div>
  );
};

export default CampaignCanvasEditor;
