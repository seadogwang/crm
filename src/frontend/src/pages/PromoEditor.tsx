import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import {
  Card, Form, Input, InputNumber, Select, Button, message, Space, Tag,
  Typography, Divider, Table, Checkbox, Radio, Row, Col, DatePicker, Collapse, Tabs,
} from 'antd';
import {
  SaveOutlined, SendOutlined, PlusOutlined, DeleteOutlined,
  PlayCircleOutlined, EditOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import api from '../api';
import PageWrapper from '../components/PageWrapper';
import { useCampaignStyles, TitleWithDesc } from './campaign/styles/campaign-ui-standard';

const { Title, Text } = Typography;

type Option = { label: string; value: string };
type SchemaField = Option & { type: string; format?: string; enumValues?: string[] };

interface ExtCondition {
  key: string; entity: string; field: string; type?: string; format?: string;
  op: string; value: string; valueEnd?: string;
}

interface RewardStep {
  key: string; lower: number; upper?: number; multiplier: number; isCycleThreshold: boolean;
  lowerInclusive: boolean; upperInclusive: boolean;
  rewardType: 'multiplier' | 'fixed';
}

interface ItemRule {
  key: string; sku: string; type: 'MULTIPLIER' | 'FIXED_POINTS'; value: number;
}

const ENTITY_OPTIONS: Option[] = [
  { label: 'Order (订单)', value: 'ORDER' },
  { label: 'BEHAVIOR (行为)', value: 'BEHAVIOR' },
  { label: 'MEMBER (会员)', value: 'MEMBER' },
];

// Order 明细属性（Order 的子对象，不作为独立实体）
const ORDER_ITEM_FIELDS: SchemaField[] = [
  { label: 'SKU (sku)', value: 'sku', type: 'string' },
  { label: '类目 (category_id)', value: 'category_id', type: 'string' },
  { label: '单价 (price)', value: 'price', type: 'number' },
  { label: '数量 (quantity)', value: 'quantity', type: 'number' },
  { label: '商品名 (product_name)', value: 'product_name', type: 'string' },
];

const OPS: Option[] = [
  { label: '>', value: '>' }, { label: '>=', value: '>=' },
  { label: '<', value: '<' }, { label: '<=', value: '<=' },
  { label: '=', value: '==' }, { label: '!=', value: '!=' },
];
const RANGE_OPS: Option[] = [{ label: '区间(含边界)', value: 'BETWEEN_EQ' }, { label: '区间(不含边界)', value: 'BETWEEN' }];
const STRING_OPS: Option[] = [{ label: '包含文本', value: 'contains' }];

function getOpsForField(type?: string, format?: string): Option[] {
  if (type === 'number' || format === 'date-time' || format === 'date') return [...OPS, ...RANGE_OPS];
  if (type === 'string') return [...OPS, ...STRING_OPS];
  return OPS;
}

const EXCESS_STRATEGIES: Option[] = [
  { label: '停止赠送', value: 'STOP' },
  { label: '按比例缩放', value: 'RATIO' },
  { label: '截断并降级', value: 'TRUNCATE_AND_DOWNGRADE' },
];

// ==================== 组件 ====================

const PromoEditor: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const isEdit = !!id;

  // 基础信息
  const [ruleCode, setRuleCode] = useState('');
  const [ruleName, setRuleName] = useState('');
  const [ruleGroup, setRuleGroup] = useState('');
  const [priority, setPriority] = useState(10);
  const [effectiveStart, setEffectiveStart] = useState<string>('');
  const [effectiveEnd, setEffectiveEnd] = useState<string>('');
  const [isPermanent, setIsPermanent] = useState(true);

  // 触发条件 — 每行独立实体
  const [selectedEntity, setSelectedEntity] = useState('ORDER');
  const [schemaFields, setSchemaFields] = useState<SchemaField[]>([]);
  const [schemasByEntity, setSchemasByEntity] = useState<Record<string, SchemaField[]>>({});
  const [extConditions, setExtConditions] = useState<ExtCondition[]>([]);
  const [editingCondIdx, setEditingCondIdx] = useState<number | null>(null);

  // 奖励配置 Tab
  const [rewardTab, setRewardTab] = useState<string>('simple');

  // 奖励规则 — 简单模式
  const [calcMode, setCalcMode] = useState<string>('LINE');
  const [simpleType, setSimpleType] = useState<string>('MULTIPLIER');
  const [simpleMultiplier, setSimpleMultiplier] = useState(2.0);
  const [simpleFixedPoints, setSimpleFixedPoints] = useState(100);

  // 奖励规则 — 阶梯模式
  const [steps, setSteps] = useState<RewardStep[]>([
    { key: '1', lower: 0, upper: undefined, multiplier: 1.0, isCycleThreshold: false, lowerInclusive: true, upperInclusive: false, rewardType: 'multiplier' },
  ]);
  const [cycleMode, setCycleMode] = useState<string>('SINGLE_MATCH');
  const [remainderMode, setRemainderMode] = useState<string>('USE_STEP_MULTIPLIER');
  const [remainderFixedMult, setRemainderFixedMult] = useState(1.0);
  const [perOrderLimit, setPerOrderLimit] = useState<number | undefined>(undefined);
  const [accumulativeLimit, setAccumulativeLimit] = useState<number | undefined>(undefined);
  const [excessStrategy, setExcessStrategy] = useState('STOP');
  const [downgradeMultiplier, setDowngradeMultiplier] = useState(1.0);
  const [downgradeContinueCycle, setDowngradeContinueCycle] = useState(false);

  // 商品级奖励设置
  const [itemRulesEnabled, setItemRulesEnabled] = useState(false);
  const [itemRules, setItemRules] = useState<ItemRule[]>([]);
  const [unmatchedAction, setUnmatchedAction] = useState<string>('USE_GLOBAL');

  // 预览
  const [previewAmount, setPreviewAmount] = useState(1000);
  const [previewAlready, setPreviewAlready] = useState(0);
  const [previewResult, setPreviewResult] = useState<any>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  // 保存
  const [saving, setSaving] = useState(false);

  // 加载全部实体 Schema
  useEffect(() => {
    const loadSchemas = async () => {
      const map: Record<string, SchemaField[]> = {};
      for (const ent of ['ORDER', 'BEHAVIOR', 'MEMBER']) {
        try {
          const { data } = await api.get(`/schemas/${ent}`);
          const s = data?.data?.schema || data?.data;
          const fields: SchemaField[] = Object.entries(s?.properties || {}).map(([k, v]: any) => ({
            label: `${v.title || k} (${k})`, value: k, type: v.type || 'string', format: v.format, enumValues: v.enum,
          }));
          // Order 实体合并明细属性
          if (ent === 'ORDER') {
            map[ent] = [...fields, ...ORDER_ITEM_FIELDS];
          } else {
            map[ent] = fields;
          }
        } catch { map[ent] = []; }
      }
      setSchemasByEntity(map);
      setSchemaFields(map['ORDER'] || []);
    };
    loadSchemas();
  }, []);

  // 编辑模式加载
  useEffect(() => {
    if (!id) return;
    api.get(`/admin/rules/${id}`).then(({ data }) => {
      const r = data?.data; if (!r) return;
      setRuleCode(r.rule_code || '');
      setRuleName(r.rule_name || '');
      setRuleGroup(r.rule_group || '');
      setPriority(r.priority || 10);
      if (r.effective_start) { setEffectiveStart(r.effective_start); setIsPermanent(false); }
      if (r.effective_end) setEffectiveEnd(r.effective_end);

      try {
        const meta = r.metadata ? (typeof r.metadata === 'string' ? JSON.parse(r.metadata) : r.metadata) : null;
        if (meta) {
          if (meta.selectedEntity) setSelectedEntity(meta.selectedEntity);
          if (meta.extConditions) setExtConditions(meta.extConditions);
          if (meta.entity_conditions) {
            setExtConditions(meta.entity_conditions.map((c: any) => ({
              key: c.key || String(Date.now()),
              entity: c.entity || 'ORDER',
              field: c.attribute || c.field || '',
              type: c.type || 'string',
              format: c.format,
              op: c.operator || c.op || '==',
              value: Array.isArray(c.value) ? c.value.join(',') : (typeof c.value === 'string' ? c.value : JSON.stringify(c.value)),
              valueEnd: c.valueEnd || '',
            })));
          }
          if (meta.reward) {
            const rw = meta.reward;
            if (rw.steps) setSteps(rw.steps.map((s: any) => ({ ...s, key: s.key || String(Date.now()), lowerInclusive: s.lowerInclusive ?? true, upperInclusive: s.upperInclusive ?? false })));
            if (rw.cycleMode) setCycleMode(rw.cycleMode);
            if (rw.perOrderLimit) setPerOrderLimit(rw.perOrderLimit);
            if (rw.accumulativeLimit) setAccumulativeLimit(rw.accumulativeLimit);
            if (rw.excessStrategy) setExcessStrategy(rw.excessStrategy);
            if (rw.remainderMode) setRemainderMode(rw.remainderMode);
            if (rw.item_rules_enabled !== undefined) setItemRulesEnabled(rw.item_rules_enabled);
            if (rw.item_rules) setItemRules(rw.item_rules.map((r: any) => ({ ...r, key: r.key || String(Date.now()) })));
            if (rw.unmatched_action) setUnmatchedAction(rw.unmatched_action);
          }
        }
      } catch (e) {}
    }).catch(() => {});
  }, [id]);

  
  const addStep = () => {
    const lastStep = steps[steps.length - 1];
    setSteps([...steps, { key: String(Date.now()), lower: lastStep.upper || 0, upper: undefined, multiplier: 1.0, isCycleThreshold: false, lowerInclusive: true, upperInclusive: false, rewardType: 'multiplier' }]);
  };

  const removeStep = (key: string) => {
    if (steps.length <= 1) { message.warning('至少保留一个阶梯区间'); return; }
    setSteps(steps.filter(s => s.key !== key));
  };

  const cycleThresholds = steps.filter(s => s.isCycleThreshold).map(s => s.lower).sort((a, b) => b - a);

  const buildMetadata = () => ({
    selectedEntity,
    extConditions,
    entity_conditions: extConditions.filter(c => c.field).map(c => ({
      entity: c.entity, attribute: c.field, operator: c.op, type: c.type,
      value: c.field === 'combination_sku_set'
        ? (c.value ? c.value.split(',').filter(Boolean) : [])
        : c.op?.startsWith('BETWEEN') ? { min: Number(c.value), max: Number(c.valueEnd) } : c.value,
    })),
    effective_time_range: { start: effectiveStart || null, end: isPermanent ? null : (effectiveEnd || null) },
    reward: rewardTab === 'simple' ? {
      calc_mode: calcMode,
      type: 'SIMPLE',
      simple_type: simpleType,
      simple_multiplier: simpleType === 'MULTIPLIER' ? simpleMultiplier : undefined,
      simple_fixed_points: simpleType === 'FIXED_POINTS' ? simpleFixedPoints : undefined,
      item_rules_enabled: itemRulesEnabled,
      item_rules: itemRulesEnabled ? itemRules.map(r => ({ sku: r.sku, type: r.type, value: r.value })) : [],
      unmatched_action: unmatchedAction,
      perOrderLimit, accumulativeLimit,
    } : {
      calc_mode: calcMode,
      type: 'STEP_CYCLE',
      steps: steps.map(s => ({ lower: s.lower, upper: s.upper, multiplier: s.multiplier, isCycleThreshold: s.isCycleThreshold, lowerInclusive: s.lowerInclusive, upperInclusive: s.upperInclusive })),
      cycleMode, cycleThresholdOrder: cycleThresholds, remainderMode, remainderFixedMultiplier: remainderFixedMult,
      perOrderLimit, accumulativeLimit, excessStrategy, downgradeMultiplier, downgradeContinueCycle,
    },
  });

  const handlePreview = async () => {
    setPreviewLoading(true);
    try {
      const { data } = await api.post('/admin/rules/preview', {
        orderAmount: previewAmount,
        alreadyRewarded: previewAlready,
        reward: buildMetadata().reward,
      });
      setPreviewResult(data?.data);
    } catch (e: any) { message.error('预览失败'); }
    finally { setPreviewLoading(false); }
  };

  const handleSave = async () => {
    if (!ruleCode.trim()) { message.warning('请输入规则代码'); return; }
    setSaving(true);
    try {
      const meta = buildMetadata();
      const payload = {
        rule_code: ruleCode,
        rule_name: ruleName || ruleCode,
        rule_type: 'ACTIVITY_PROMO',
        rule_category: 'promo',
        rule_group: ruleGroup,
        priority,
        effective_start: effectiveStart || null,
        effective_end: isPermanent ? null : (effectiveEnd || null),
        drl_content: '',
        metadata: meta,
        status: 'DRAFT',
      };
      if (isEdit) await api.put(`/admin/rules/${id}`, payload);
      else await api.post('/admin/rules', payload);
      message.success('已保存草稿');
    } catch (e: any) { message.error(e?.message || '保存失败'); }
    finally { setSaving(false); }
  };

  const handlePublish = async () => {
    if (!ruleCode.trim()) { message.warning('请输入规则代码'); return; }
    try {
      await handleSave();
      await api.post(`/admin/rules/${id || ''}/publish`);
      message.success('已发布');
      navigate('/rules');
    } catch (e: any) { message.error(e?.message || '发布失败'); }
  };

  const stepColumns = [
    { title: '区间范围', dataIndex: 'lower', width: 240, render: (_: number, _2: any, i: number) => {
      const s = steps[i];
      return (
        <Space size={2}>
          <Tag color={s.lowerInclusive ? 'green' : 'orange'} style={{ fontSize: 10, margin: 0, cursor: 'pointer', padding: '0 4px' }}
            onClick={() => { const n = [...steps]; n[i] = { ...n[i], lowerInclusive: !s.lowerInclusive }; setSteps(n); }}>
            {s.lowerInclusive ? '[' : '('}
          </Tag>
          <InputNumber size="small" min={0} value={s.lower} style={{ width: 80 }} onChange={val => { const n = [...steps]; n[i] = { ...n[i], lower: val || 0 }; setSteps(n); }} />
          <Text type="secondary">~</Text>
          <InputNumber size="small" min={0} value={s.upper} placeholder="不限" style={{ width: 80 }} onChange={val => { const n = [...steps]; n[i] = { ...n[i], upper: val || undefined }; setSteps(n); }} />
          <Tag color={s.upperInclusive ? 'green' : 'orange'} style={{ fontSize: 10, margin: 0, cursor: 'pointer', padding: '0 4px' }}
            onClick={() => { const n = [...steps]; n[i] = { ...n[i], upperInclusive: !s.upperInclusive }; setSteps(n); }}>
            {s.upperInclusive ? ']' : ')'}
          </Tag>
        </Space>
      );
    }},
    { title: '倍数', dataIndex: 'multiplier', width: 80, render: (v: number, _: any, i: number) => <InputNumber size="small" min={0.1} step={0.1} value={v} style={{ width: 70 }} onChange={val => { const n = [...steps]; n[i] = { ...n[i], multiplier: val || 0.1 }; setSteps(n); }} /> },
    { title: '循环点', dataIndex: 'isCycleThreshold', width: 60, render: (v: boolean, _: any, i: number) => <Checkbox checked={v} onChange={e => { const n = [...steps]; n[i] = { ...n[i], isCycleThreshold: e.target.checked }; setSteps(n); setCycleMode(e.target.checked || n.some(s => s.isCycleThreshold) ? 'THRESHOLD_LOOP' : 'SINGLE_MATCH'); }} /> },
    { title: '操作', key: 'act', width: 80, render: (_: any, __: any, i: number) => (
    <Space size={8}>
      <Button size="small" icon={<DeleteOutlined />} onClick={() => removeStep(steps[i].key)} />
      {i === steps.length - 1 && <Button size="small" type="dashed" icon={<PlusOutlined />} onClick={addStep} />}
    </Space>
  ) },
  ];

  return (
    <PageWrapper>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
        <Title level={4} style={{ margin: 0 }}>{isEdit ? `编辑活动 #${id}` : '新建积分活动'}</Title>
        <Space>
          <Button onClick={() => navigate('/rules')}>取消</Button>
          <Button icon={<SaveOutlined />} onClick={handleSave} loading={saving}>保存草稿</Button>
          <Button type="primary" icon={<SendOutlined />} onClick={handlePublish}>发布</Button>
        </Space>
      </div>

      {/* 基础信息 */}
      <Card size="small" style={{ marginBottom: 16 }}>
        <Row gutter={12}>
          <Col span={4}><Form.Item label="规则代码" style={{ marginBottom: 0 }}><Input size="small" value={ruleCode} onChange={e => setRuleCode(e.target.value)} placeholder="PROMO_001" /></Form.Item></Col>
          <Col span={4}><Form.Item label="规则名称" style={{ marginBottom: 0 }}><Input size="small" value={ruleName} onChange={e => setRuleName(e.target.value)} placeholder="618大促" /></Form.Item></Col>
          <Col span={3}><Form.Item label="规则组" style={{ marginBottom: 0 }}><Input size="small" value={ruleGroup} onChange={e => setRuleGroup(e.target.value)} placeholder="promo_grp" /></Form.Item></Col>
          <Col span={2}><Form.Item label="优先级" style={{ marginBottom: 0 }}><InputNumber size="small" min={0} max={999} value={priority} onChange={v => setPriority(v || 0)} style={{ width: '100%' }} /></Form.Item></Col>
          <Col span={5}><Form.Item label="生效周期" style={{ marginBottom: 0 }}><DatePicker.RangePicker size="small" showTime format="YYYY-MM-DD HH:mm" placeholder={['开始', '结束(留空=永久)']} value={[effectiveStart ? dayjs(effectiveStart) : null, effectiveEnd && !isPermanent ? dayjs(effectiveEnd) : null] as any} onChange={(d) => { setEffectiveStart(d?.[0]?.format('YYYY-MM-DD HH:mm:ss') || ''); if (d?.[1]) { setEffectiveEnd(d[1].format('YYYY-MM-DD HH:mm:ss')); setIsPermanent(false); } else { setIsPermanent(true); } }} style={{ width: '100%' }} /></Form.Item></Col>
          <Col span={2}><Form.Item label="永久" style={{ marginBottom: 0 }}><Checkbox checked={isPermanent} onChange={e => setIsPermanent(e.target.checked)} /></Form.Item></Col>
        </Row>
      </Card>

      {/* 积分活动配置 — 统一卡片 */}
      <Card size="small" style={{ marginBottom: 16, border: '1px solid #d9d9d9' }}>

        {/* === 触发条件 === */}
        <div style={{ background: '#fafafa', borderRadius: 6, padding: '10px 14px', marginBottom: 12, border: '1px solid #f0f0f0' }}>
          <Text strong style={{ fontSize: 14, color: '#262626', marginBottom: 6, display: 'block' }}>触发条件</Text>
          {/* 条件行列表 — 每行：实体 + 属性 + 运算符 + 值 */}
        <div style={{ marginBottom: 8 }}>
          {extConditions.map((c, i) => {
            const condSchemas = schemasByEntity[c.entity] || [];
            const isComboSku = c.field === 'combination_sku_set';
            const skuValues = isComboSku ? (c.value ? c.value.split(',').filter(Boolean) : []) : [];
            const fm = condSchemas.find(f => f.value === c.field) ||
              (isComboSku ? { label: '组合商品', value: 'combination_sku_set', type: 'sku_set' } as SchemaField : undefined);
            // Build attribute options: schema fields + combo sku
            const attrOpts: Option[] = condSchemas.filter(f => f.type !== 'array').map(f => ({ label: f.label, value: f.value }));
            if (c.entity === 'ORDER') {
              attrOpts.push({ label: '组合商品 (combination_sku_set)', value: 'combination_sku_set' });
            }
            return (
              <div key={c.key} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0', flexWrap: 'wrap' }}>
                {/* 实体 */}
                <Select size="small" value={c.entity} style={{ width: 130 }} showSearch
                  options={ENTITY_OPTIONS}
                  onChange={v => {
                    const n = [...extConditions];
                    n[i] = { key: c.key, entity: v, field: '', type: 'string', op: '==', value: '' };
                    setExtConditions(n);
                  }} />
                {/* 属性 */}
                <Select size="small" value={c.field || undefined} style={{ width: 160 }}
                  placeholder="选择属性" showSearch optionFilterProp="label"
                  options={attrOpts}
                  onChange={v => {
                    const n = [...extConditions];
                    const sf = condSchemas.find(f => f.value === v);
                    const isCsku = v === 'combination_sku_set';
                    n[i] = {
                      ...n[i], field: v,
                      type: isCsku ? 'sku_set' : (sf?.type || 'string'),
                      format: isCsku ? undefined : sf?.format,
                      op: isCsku ? 'CONTAINS_ALL' : (sf?.type === 'number' || sf?.format ? '>=' : '=='),
                      value: '',
                    };
                    setExtConditions(n);
                  }} />
                {/* 组合商品特殊UI */}
                {isComboSku ? (
                  <>
                    <Text type="secondary" style={{ fontSize: 12 }}>必须同时包含：</Text>
                    <Select mode="tags" size="small" style={{ minWidth: 220 }} placeholder="输入 SKU 编码，回车添加"
                      value={skuValues}
                      onChange={vals => { const n = [...extConditions]; n[i] = { ...n[i], value: (vals as string[]).join(',') }; setExtConditions(n); }} />
                  </>
                ) : c.field ? (
                  <>
                    {/* 运算符 */}
                    <Select size="small" value={c.op} style={{ width: c.op?.startsWith('BETWEEN') ? 110 : 70 }} showSearch
                      options={getOpsForField(c.type, c.format)}
                      onChange={v => { const n = [...extConditions]; n[i] = { ...n[i], op: v, value: '', valueEnd: '' }; setExtConditions(n); }} />
                    {/* 值 */}
                    {c.op?.startsWith('BETWEEN') ? (
                      <Space size={4}>
                        <InputNumber size="small" placeholder="起始" style={{ width: 80 }} value={c.value ? Number(c.value) : undefined}
                          onChange={v => { const n = [...extConditions]; n[i] = { ...n[i], value: String(v ?? '') }; setExtConditions(n); }} />
                        <Text type="secondary">~</Text>
                        <InputNumber size="small" placeholder="结束" style={{ width: 80 }} value={c.valueEnd ? Number(c.valueEnd) : undefined}
                          onChange={v => { const n = [...extConditions]; n[i] = { ...n[i], valueEnd: String(v ?? '') }; setExtConditions(n); }} />
                      </Space>
                    ) : c.type === 'number' ? (
                      <InputNumber size="small" placeholder="数值" style={{ width: 100 }} value={c.value ? Number(c.value) : undefined}
                        onChange={v => { const n = [...extConditions]; n[i] = { ...n[i], value: String(v ?? '') }; setExtConditions(n); }} />
                    ) : fm?.enumValues?.length ? (
                      <Select size="small" style={{ width: 140 }} value={c.value || undefined}
                        options={fm.enumValues.map(e => ({ label: e, value: e }))}
                        onChange={v => { const n = [...extConditions]; n[i] = { ...n[i], value: v }; setExtConditions(n); }} />
                    ) : c.format === 'date-time' ? (
                      <DatePicker size="small" showTime format="YYYY-MM-DD HH:mm:ss" style={{ width: 170 }}
                        value={c.value ? dayjs(c.value) : null}
                        onChange={(d: any) => { const n = [...extConditions]; n[i] = { ...n[i], value: d ? d.format('YYYY-MM-DD HH:mm:ss') : '' }; setExtConditions(n); }} />
                    ) : (
                      <Input size="small" placeholder="输入值" style={{ width: 120 }} value={c.value}
                        onChange={e => { const n = [...extConditions]; n[i] = { ...n[i], value: e.target.value }; setExtConditions(n); }} />
                    )}
                  </>
                ) : null}
                {/* 删除 */}
                <Button size="small" type="text" danger icon={<DeleteOutlined />}
                  onClick={() => setExtConditions(extConditions.filter((_, j) => j !== i))} />
              </div>
            );
          })}
        </div>
        {/* [+ 添加条件] */}
        <Button size="small" type="dashed" icon={<PlusOutlined />} style={{ marginBottom: 8 }}
          onClick={() => setExtConditions([...extConditions, { key: String(Date.now()), entity: 'ORDER', field: '', type: 'string', op: '==', value: '' }])}>
          添加条件</Button>
        </div>

        {/* === 奖励配置 === */}
        <div style={{ background: '#fafafa', borderRadius: 6, padding: '10px 14px', marginBottom: 12, border: '1px solid #f0f0f0' }}>
          <Tabs size="small" activeKey={rewardTab} onChange={k => setRewardTab(k)}
            items={[
              { key: 'simple', label: '奖励配置', children: (
            <div>

              {/* 全局奖励 */}
              <div style={{ background: '#fff', border: '1px solid #e8e8e8', borderRadius: 6, padding: '8px 12px', marginBottom: 12 }}>
                <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 8 }}>全局奖励（适用于所有商品）</Text>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                  <Text style={{ fontSize: 14, flexShrink: 0 }}>奖励方式</Text>
                  <Radio.Group value={simpleType} onChange={e => setSimpleType(e.target.value)} size="small"
                    optionType="button" buttonStyle="solid">
                    <Radio.Button value="MULTIPLIER" style={{ fontSize: 12 }}>按比例倍数</Radio.Button>
                    <Radio.Button value="FIXED_POINTS" style={{ fontSize: 12 }}>固定积分值</Radio.Button>
                  </Radio.Group>
                  <Text style={{ fontSize: 14, flexShrink: 0, marginLeft: 8 }}>{simpleType === 'MULTIPLIER' ? '全局倍数' : '全局积分'}</Text>
                  {simpleType === 'MULTIPLIER' ? (
                    <InputNumber size="small" min={0.1} step={0.1} value={simpleMultiplier} onChange={v => setSimpleMultiplier(v || 0.1)} addonAfter="倍" style={{ width: 80 }} />
                  ) : (
                    <InputNumber size="small" min={1} value={simpleFixedPoints} onChange={v => setSimpleFixedPoints(v || 0)} style={{ width: 80 }} />
                  )}
                </div>
              </div>

              {/* 商品级奖励 — 单独维度：为指定商品设置不同的倍率 */}
              <div style={{ background: '#fff', border: '1px solid #e8e8e8', borderRadius: 6, padding: '8px 12px' }}>
                <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 4 }}>商品级奖励（为指定商品单独设置）</Text>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: itemRulesEnabled ? 8 : 0 }}>
                  <Text style={{ fontSize: 14 }}>启用商品级奖励</Text>
                  <Checkbox checked={itemRulesEnabled} onChange={e => setItemRulesEnabled(e.target.checked)} />
                </div>
                {itemRulesEnabled && (
                  <div>
                    <Table size="small" pagination={false} rowKey="key"
                      dataSource={itemRules}
                      columns={[
                        { title: '商品/SKU', dataIndex: 'sku', width: 140,
                          render: (v: string, _: any, i: number) => (
                            <Input size="small" placeholder="SKU 编码" value={v}
                              onChange={e => { const n = [...itemRules]; n[i] = { ...n[i], sku: e.target.value }; setItemRules(n); }} />
                          )},
                        { title: '奖励类型', dataIndex: 'type', width: 90,
                          render: (v: string, _: any, i: number) => (
                            <Select size="small" value={v} style={{ width: 80 }}
                              options={[{ label: '倍数', value: 'MULTIPLIER' }, { label: '固定值', value: 'FIXED_POINTS' }]}
                              onChange={val => { const n = [...itemRules]; n[i] = { ...n[i], type: val as 'MULTIPLIER' | 'FIXED_POINTS' }; setItemRules(n); }} />
                          )},
                        { title: '倍数/固定值', dataIndex: 'value', width: 100,
                          render: (v: number, _: any, i: number) => (
                            <InputNumber size="small" min={0.1} step={0.1} value={v}
                              onChange={val => { const n = [...itemRules]; n[i] = { ...n[i], value: val || 0.1 }; setItemRules(n); }} />
                          )},
                        { title: '操作', key: 'act', width: 60,
                          render: (_: any, __: any, i: number) => (
                            <Button size="small" danger icon={<DeleteOutlined />}
                              onClick={() => setItemRules(itemRules.filter((_, j) => j !== i))} />
                          )},
                      ]}
                      title={() => (
                        <Button size="small" type="dashed" icon={<PlusOutlined />}
                          onClick={() => setItemRules([...itemRules, { key: String(Date.now()), sku: '', type: 'MULTIPLIER', value: 1.0 }])}>
                          添加商品</Button>
                      )} />
                    <Form.Item label="未匹配的商品" style={{ marginTop: 8, marginBottom: 0 }}>
                      <Radio.Group value={unmatchedAction} onChange={e => setUnmatchedAction(e.target.value)} size="small">
                        <Radio value="USE_GLOBAL">使用全局倍数</Radio>
                        <Radio value="NO_REWARD">不奖励</Radio>
                      </Radio.Group>
                    </Form.Item>
                  </div>
                )}
              </div>
            </div>
          ) },
          { key: 'step', label: '阶梯奖励配置', children: (
            <div>
              <Divider style={{ margin: '8px 0' }} />
              <Table dataSource={steps} columns={stepColumns} rowKey="key" size="small" pagination={false} />
              {cycleThresholds.length > 0 && (
                <div style={{ background: '#fff', border: '1px solid #e8e8e8', borderRadius: 6, padding: '8px 12px', marginTop: 8 }}>
                  <Form.Item label="循环分段点（从高到低）" style={{ marginBottom: 8 }}>
                    {cycleThresholds.map((t, i) => <Tag key={i} color="blue" style={{ marginRight: 4 }}>{t}</Tag>)}
                  </Form.Item>
                  <Form.Item label="剩余金额处理" style={{ marginBottom: 0 }}>
                    <Radio.Group value={remainderMode} onChange={e => setRemainderMode(e.target.value)} size="small">
                      <Radio value="USE_STEP_MULTIPLIER">按阶梯倍数</Radio>
                      <Radio value="FIXED_MULTIPLIER">固定倍数</Radio>
                    </Radio.Group>
                    {remainderMode === 'FIXED_MULTIPLIER' && <InputNumber size="small" min={0.1} step={0.1} value={remainderFixedMult} onChange={v => setRemainderFixedMult(v || 0.1)} style={{ marginLeft: 8 }} />}
                  </Form.Item>
                </div>
              )}
            </div>
          ) },
        ]} />
        </div>

        {/* === 上限控制 === */}
        <div style={{ background: '#fafafa', borderRadius: 6, padding: '10px 14px', marginBottom: 12, border: '1px solid #f0f0f0' }}>
          <Text strong style={{ fontSize: 14, color: '#262626', marginBottom: 6, display: 'block' }}>上限控制</Text>
          <Row gutter={16} style={{ marginBottom: 8 }}>
            <Col span={8}><Form.Item label="单笔上限" style={{ marginBottom: 0 }}><InputNumber size="small" min={0} value={perOrderLimit} onChange={v => setPerOrderLimit(v || undefined)} addonAfter="分" style={{ width: '100%' }} placeholder="不限" /></Form.Item></Col>
            <Col span={8}><Form.Item label="累计上限" style={{ marginBottom: 0 }}><InputNumber size="small" min={0} value={accumulativeLimit} onChange={v => setAccumulativeLimit(v || undefined)} addonAfter="分" style={{ width: '100%' }} placeholder="不限" /></Form.Item></Col>
          </Row>
          {(accumulativeLimit || 0) > 0 && (
            <>
              <Form.Item label="超限策略" style={{ marginBottom: 0 }}>
                <Select size="small" value={excessStrategy} options={EXCESS_STRATEGIES} style={{ width: 200 }} onChange={v => setExcessStrategy(v)} />
              </Form.Item>
              {excessStrategy === 'TRUNCATE_AND_DOWNGRADE' && (
                <div style={{ marginTop: 8 }}>
                  <Form.Item label="降级倍数" style={{ marginBottom: 4 }}><InputNumber size="small" min={0} step={0.1} value={downgradeMultiplier} onChange={v => setDowngradeMultiplier(v || 0)} /></Form.Item>
                  <Checkbox checked={downgradeContinueCycle} onChange={e => setDowngradeContinueCycle(e.target.checked)}>降级后继续循环</Checkbox>
                </div>
              )}
            </>
          )}
        </div>

        {/* === 测试与预览 === */}
        <div style={{ background: '#fafafa', borderRadius: 6, padding: '10px 14px', border: '1px solid #f0f0f0' }}>
          <Text strong style={{ fontSize: 14, color: '#262626', marginBottom: 6, display: 'block' }}>测试与预览</Text>
          <Row gutter={16} align="middle" style={{ marginBottom: 8 }}>
            <Col>订单金额: <InputNumber size="small" min={0} value={previewAmount} onChange={v => setPreviewAmount(v || 0)} style={{ width: 100 }} addonAfter="元" /></Col>
            <Col>已累计: <InputNumber size="small" min={0} value={previewAlready} onChange={v => setPreviewAlready(v || 0)} style={{ width: 100 }} addonAfter="分" /></Col>
            <Col><Button icon={<PlayCircleOutlined />} onClick={handlePreview} loading={previewLoading}>运行预览</Button></Col>
          </Row>
          {previewResult && (
            <Card size="small" style={{ background: '#f6ffed' }}>
              <Row gutter={24}>
                <Col span={6}><Text strong>理论积分</Text><br /><Text style={{ fontSize: 18, color: '#1677ff' }}>{previewResult.theoreticalTotal}</Text></Col>
                <Col span={6}><Text strong>最终积分</Text><br /><Text style={{ fontSize: 18, color: '#52c41a' }}>{previewResult.finalPoints}</Text></Col>
                <Col span={6}><Text strong>剩余容量</Text><br /><Text>{previewResult.remainingCap != null ? previewResult.remainingCap : '不限'}</Text></Col>
                <Col span={6}><Text strong>新累计</Text><br /><Text>{previewResult.newTotal}</Text></Col>
              </Row>
              {previewResult.segments?.length > 0 && (
                <>
                  <Divider style={{ margin: '8px 0' }} />
                  <Text type="secondary" style={{ fontSize: 11 }}>计算明细：</Text>
                  {previewResult.segments.map((seg: any, i: number) => (
                    <Tag key={i} style={{ margin: 2, fontSize: 11 }}>{seg.amount} × {seg.multiplier} = {seg.points}</Tag>
                  ))}
                </>
              )}
            </Card>
          )}
        </div>
      </Card>
    </PageWrapper>
  );
};

export default PromoEditor;