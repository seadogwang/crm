import React, { useState, useMemo, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Card, Form, Input, InputNumber, Select, Button, message, Space, Modal, Tag,
  Typography, Alert, Descriptions, Divider, Steps, Collapse, Checkbox, Radio, Row, Col,
} from 'antd';
import {
  SaveOutlined, ThunderboltOutlined, SendOutlined, SettingOutlined,
  DollarOutlined, FilterOutlined, CalculatorOutlined, GiftOutlined,
  LeftOutlined, RightOutlined, CheckOutlined, CopyOutlined, EditOutlined, EyeOutlined,
} from '@ant-design/icons';
import PageWrapper from '../components/PageWrapper';
import api from '../api';

const { Title, Text } = Typography;
const { Panel } = Collapse;

// ==================== 类型 ====================

interface ExtCondition { key: string; field: string; type?: string; op: string; value: string; }
interface TierBonus { key: string; tier: string; bonus: number; }
interface CategoryWeight { key: string; cat: string; weight: number; }
interface QuantityTier { key: string; minQty: number; bonus: number; }
type Option = { label: string; value: string };
type SchemaField = Option & { type: string };

// ==================== 常量 ====================

const OPS = [
  { label: '>', value: '>' }, { label: '>=', value: '>=' },
  { label: '<', value: '<' }, { label: '<=', value: '<=' },
  { label: '=', value: '==' }, { label: '!=', value: '!=' },
  { label: '包含', value: 'contains' },
];

const ALL_CHANNELS = [
  { label: '天猫', value: 'TMALL' }, { label: '京东', value: 'JD' },
  { label: '抖音', value: 'DOUYIN' }, { label: '微信', value: 'WECHAT_MINI' },
];

const AGENDA_GROUPS = [
  { label: 'purchase (购买)', value: 'purchase' }, { label: 'behavior (行为)', value: 'behavior' },
  { label: 'campaign (活动)', value: 'campaign' }, { label: 'refund (退款)', value: 'refund' },
];

const TIME_CONDITIONS = [
  { label: '周末', value: 'WEEKEND' }, { label: '工作日', value: 'WEEKDAY' },
];

// ==================== DRL 生成 ====================

function generateDrl(data: Record<string, any>): string {
  const ruleName = data.ruleName || 'custom_rule';
  const safeName = ruleName.replace(/[^a-zA-Z0-9_]/g, '_');
  const agendaGroup = data.agendaGroup || 'purchase';
  const ruleCategory = data.ruleCategory || 'ORDER';
  const calcMode = data.calcMode || 'total';
  const pointType = data.pointType || 'REWARD_POINTS';
  const lines: string[] = [];

  lines.push('package com.loyalty.platform.rules;');
  lines.push('');
  lines.push('import com.loyalty.platform.rules.drl.MemberFact;');
  lines.push('import com.loyalty.platform.rules.drl.EventFact;');
  lines.push('import com.loyalty.platform.rules.action.ActionCollector;');
  lines.push('');

  // 频次注释
  if (ruleCategory === 'BEHAVIOR' && data.frequencyLimit && data.frequencyLimit !== 'unlimited') {
    lines.push(`// @frequency: ${data.frequencyLimit}`);
  }

  lines.push(`rule "${safeName}"`);
  lines.push(`  agenda-group "${agendaGroup}"`);
  lines.push('  when');

  // --- when ---
  const conds: string[] = [];
  conds.push('    $event: EventFact()');
  conds.push('    $member: MemberFact(memberId == $event.memberId)');

  // 渠道筛选
  const channels: string[] = data.channels || [];
  if (channels.length > 0) {
    const j = channels.map((c: string) => `"${c}"`).join(', ');
    conds.push(`    eval(Arrays.asList(${j}).contains($event.getChannel()))`);
  }

  // 交易状态
  if (data.tradeStatus && data.tradeStatus.length > 0) {
    const j = data.tradeStatus.map((s: string) => `"${s}"`).join(', ');
    conds.push(`    eval(Arrays.asList(${j}).contains($event.getPayloadString("trade_status")))`);
  }

  // 会员等级
  const tiers: string[] = data.memberTiers || [];
  if (tiers.length > 0) {
    const j = tiers.map((t: string) => `"${t}"`).join(', ');
    conds.push(`    eval(Arrays.asList(${j}).contains($member.getTierCode()))`);
  }

  // 金额门槛
  if (ruleCategory === 'ORDER' && data.minAmount > 0) {
    conds.push(`    eval($event.getPayloadNumber("order_amount") >= ${data.minAmount})`);
  }

  // 自定义字段条件
  const extConds: ExtCondition[] = data.extConditions || [];
  for (const c of extConds) {
    if (!c.field || !c.op) continue;
    const v = isNaN(Number(c.value)) ? `"${c.value}"` : c.value;
    const fn = c.type === 'number' ? 'getPayloadNumber' : 'getPayloadString';
    conds.push(`    eval($event.${fn}("${c.field}") ${c.op} ${v})`);
  }

  lines.push(conds.join(',\n'));
  lines.push('  then');

  // --- then ---
  const actions: string[] = [];

  if (ruleCategory === 'ORDER') {
    if (calcMode === 'total') {
      // 订单总额比例
      const ratio = (data.ratioPercent || 0) / 100;
      if (ratio > 0) {
        actions.push(`    java.math.BigDecimal _total = $event.getPayloadNumber("total_amount");`);
        actions.push(`    java.math.BigDecimal _pts = _total.multiply(new java.math.BigDecimal("${ratio}")).setScale(0, java.math.RoundingMode.DOWN);`);
      }
      const floor = data.floorPoints || 0;
      if (floor > 0) {
        actions.push(`    if (_pts.compareTo(new java.math.BigDecimal("${floor}")) < 0) _pts = new java.math.BigDecimal("${floor}");`);
      }
      const max = data.maxPoints || 0;
      if (max > 0) {
        actions.push(`    if (_pts.compareTo(new java.math.BigDecimal("${max}")) > 0) _pts = new java.math.BigDecimal("${max}");`);
      }
      if (ratio > 0 || floor > 0) {
        actions.push(`    collector.awardPoints($event.getProgramCode(), $event.getMemberId(), "${pointType}", _pts, "${safeName}", null);`);
      }
    } else {
      // 按订单明细
      const perItem = data.perItemPoints || 0;
      const catWeights: CategoryWeight[] = data.categoryWeights || [];
      if (perItem > 0 || catWeights.length > 0) {
        actions.push(`    int _cnt = Integer.parseInt($event.getPayloadString("item_count"));`);
        actions.push(`    java.math.BigDecimal _pts = new java.math.BigDecimal("${perItem}").multiply(new java.math.BigDecimal(_cnt));`);
      }
      // 品类加权
      for (const cw of catWeights) {
        if (!cw.cat || !cw.weight) continue;
        actions.push(`    if ("${cw.cat}".equals($event.getPayloadString("item_category"))) {`);
        actions.push(`      _pts = _pts.multiply(new java.math.BigDecimal("${cw.weight}"));`);
        actions.push('    }');
      }
      // 数量阶梯
      const qt: QuantityTier[] = data.quantityTiers || [];
      for (const q of qt) {
        if (!q.minQty || !q.bonus) continue;
        actions.push(`    if (_cnt >= ${q.minQty}) {`);
        actions.push(`      _pts = _pts.add(new java.math.BigDecimal("${q.bonus}"));`);
        actions.push('    }');
      }
      if (perItem > 0) {
        actions.push(`    collector.awardPoints($event.getProgramCode(), $event.getMemberId(), "${pointType}", _pts, "${safeName}", null);`);
      }
    }
  } else {
    // BEHAVIOR: 固定积分
    const pts = data.rewardPoints || 0;
    if (pts > 0) {
      actions.push(`    collector.awardPoints($event.getProgramCode(), $event.getMemberId(), "${pointType}", new java.math.BigDecimal("${pts}"), "${safeName}", null);`);
    }
  }

  // 等级加成
  const tierBonuses: TierBonus[] = data.tierBonuses || [];
  for (const tb of tierBonuses) {
    if (!tb.tier || !tb.bonus) continue;
    actions.push(`    if ("${tb.tier}".equals($member.getTierCode())) {`);
    actions.push(`      collector.awardPoints($event.getProgramCode(), $event.getMemberId(), "${pointType}", new java.math.BigDecimal("${tb.bonus}"), "${safeName}_TIER", null);`);
    actions.push('    }');
  }

  if (actions.length === 0) actions.push('    System.out.println("rule fired: " + $event.getEventId());');
  lines.push(actions.join('\n'));
  lines.push('end');

  if (data.aiGeneratedDrl?.trim()) {
    lines.push('');
    lines.push('// === AI-generated ===');
    lines.push(data.aiGeneratedDrl.trim());
  }
  return lines.join('\n');
}

// ==================== 组件 ====================

const RuleEditor: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const isEdit = !!id;
  const [currentStep, setCurrentStep] = useState(0);

  // 基本信息
  const [ruleName, setRuleName] = useState('');
  const [ruleCode, setRuleCode] = useState('');
  const [agendaGroup, setAgendaGroup] = useState('purchase');

  // ① 规则类型
  const [ruleCategory, setRuleCategory] = useState<'ORDER' | 'BEHAVIOR'>('ORDER');
  const [pointType, setPointType] = useState('REWARD_POINTS');
  const [schemaFields, setSchemaFields] = useState<SchemaField[]>([]);
  const [orderSchemaFields, setOrderSchemaFields] = useState<SchemaField[]>([]);
  const [behaviorSchemaFields, setBehaviorSchemaFields] = useState<SchemaField[]>([]);
  const [schemaTitle, setSchemaTitle] = useState('');

  // ② 筛选条件
  const [channels, setChannels] = useState<string[]>([]);
  const [memberTiers, setMemberTiers] = useState<string[]>(['GOLD']);
  const [minAmount, setMinAmount] = useState(0);
  const [tradeStatus, setTradeStatus] = useState<string[]>([]);
  const [timeConditions, setTimeConditions] = useState<string[]>([]);
  const [extConditions, setExtConditions] = useState<ExtCondition[]>([]);
  const [editingCondIdx, setEditingCondIdx] = useState<number | null>(null);

  // ③ 积分计算
  const [calcMode, setCalcMode] = useState<'total' | 'per_item'>('total');
  const [ratioPercent, setRatioPercent] = useState(1);
  const [floorPoints, setFloorPoints] = useState(0);
  const [maxPoints, setMaxPoints] = useState(0);
  const [perItemPoints, setPerItemPoints] = useState(5);
  const [categoryWeights, setCategoryWeights] = useState<CategoryWeight[]>([]);
  const [quantityTiers, setQuantityTiers] = useState<QuantityTier[]>([]);
  // BEHAVIOR
  const [rewardPoints, setRewardPoints] = useState(10);
  const [frequencyLimit, setFrequencyLimit] = useState<'once' | 'once_per_day' | 'unlimited'>('unlimited');

  // ④ 等级加成
  const [tierBonuses, setTierBonuses] = useState<TierBonus[]>([
    { key: '1', tier: 'GOLD', bonus: 10 }, { key: '2', tier: 'PLATINUM', bonus: 20 },
  ]);

  // ⑤ AI
  const [aiPrompt, setAiPrompt] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [aiResult, setAiResult] = useState<any>(null);
  const [aiGeneratedDrl, setAiGeneratedDrl] = useState('');

  // 发布
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [publishModal, setPublishModal] = useState<{ open: boolean; level: string; report: any }>({ open: false, level: '', report: null });
  const [forceReason, setForceReason] = useState('');

  // 脚本
  const [scriptExpanded, setScriptExpanded] = useState(false);
  const [manualEdit, setManualEdit] = useState(false);
  const [manualDrl, setManualDrl] = useState('');

  // 动态选项
  const [pointTypeOptions, setPointTypeOptions] = useState<Option[]>([]);
  const [channelOptions, setChannelOptions] = useState<Option[]>(ALL_CHANNELS);
  const [tierOptions, setTierOptions] = useState<Option[]>([]);
  const [tradeStatusOptions, setTradeStatusOptions] = useState<Option[]>([]);

  // 加载 Schema + 选项
  useEffect(() => {
    api.get('/schemas/ORDER').then(({ data }) => {
      const s = data?.data?.schema || data?.data;
      const fields = Object.entries(s?.properties || {}).map(([k, v]: any) => ({ label: `${v.title || k} (${k})`, value: k, type: v.type || 'string' }));
      setOrderSchemaFields(fields);
      if (s?.properties?.trade_status?.enum) setTradeStatusOptions(s.properties.trade_status.enum.map((e: string) => ({ label: e, value: e })));
      if (ruleCategory === 'ORDER') { setSchemaTitle(s?.title || ''); setSchemaFields(fields); }
    }).catch(() => {});
    api.get('/schemas/BEHAVIOR').then(({ data }) => {
      const s = data?.data?.schema || data?.data;
      const fields = Object.entries(s?.properties || {}).map(([k, v]: any) => ({ label: `${v.title || k} (${k})`, value: k, type: v.type || 'string' }));
      setBehaviorSchemaFields(fields);
      if (ruleCategory === 'BEHAVIOR') { setSchemaTitle(s?.title || ''); setSchemaFields(fields); }
    }).catch(() => {});

    api.get('/admin/tiers').then(({ data }) => {
      const d = data?.data;
      if (d?.pointTypes?.length) setPointTypeOptions(d.pointTypes.map((p: any) => ({ label: p.name || p.typeCode, value: p.typeCode })));
      if (d?.tiers?.length) setTierOptions(d.tiers.map((t: any) => ({ label: `${t.tierCode} (${t.tierName || ''})`, value: t.tierCode })));
    }).catch(() => {});

    api.get('/admin/cache/enums').then(({ data }) => {
      const enums = data?.data?.enums;
      if (enums?.channel?.length) setChannelOptions(enums.channel.map((c: any) => ({ label: c.enum_name || c.enum_code, value: c.enum_code })));
    }).catch(() => {});
  }, []);

  // 表单数据
  const formData = useMemo(() => ({
    ruleName, agendaGroup, ruleCategory, frequencyLimit, pointType,
    channels, memberTiers, minAmount, tradeStatus, timeConditions, extConditions,
    calcMode, ratioPercent, floorPoints, maxPoints, perItemPoints, categoryWeights, quantityTiers,
    rewardPoints, tierBonuses, aiGeneratedDrl,
  }), [ruleName, agendaGroup, ruleCategory, frequencyLimit, pointType,
    channels, memberTiers, minAmount, tradeStatus, timeConditions, extConditions,
    calcMode, ratioPercent, floorPoints, maxPoints, perItemPoints, categoryWeights, quantityTiers,
    rewardPoints, tierBonuses, aiGeneratedDrl]);

  const drlCode = useMemo(() => manualEdit ? manualDrl : generateDrl(formData), [formData, manualEdit, manualDrl]);

  const handleCopy = () => { navigator.clipboard.writeText(drlCode).then(() => message.success('已复制')); };
  const handleManualEdit = () => { setManualDrl(drlCode); setManualEdit(true); setScriptExpanded(true); };

  const handleAiGenerate = async () => {
    if (!aiPrompt.trim()) { message.warning('请输入活动规则描述'); return; }
    setAiLoading(true);
    try {
      const { data } = await api.post('/admin/rules/generate', { prompt: aiPrompt });
      setAiResult(data?.data);
      if (data?.data?.drl_code) setAiGeneratedDrl(data.data.drl_code);
    } catch (e: any) { message.error(e?.message || 'AI生成失败'); }
    finally { setAiLoading(false); }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const payload = { rule_code: ruleCode || `RULE_${Date.now()}`, rule_name: ruleName || '未命名规则', agenda_group: agendaGroup, rule_type: 'DRL', drl_content: drlCode, status: 'DRAFT' };
      if (isEdit) await api.put(`/admin/rules/${id}`, payload);
      else await api.post('/admin/rules', payload);
      message.success('已保存草稿');
    } catch (e: any) { message.error(e?.message || '保存失败'); }
    finally { setSaving(false); }
  };

  const handlePublish = async () => {
    setPublishing(true);
    try {
      let ruleId = id ? Number(id) : null;
      const payload = { rule_code: ruleCode || `RULE_${Date.now()}`, rule_name: ruleName || '未命名规则', agenda_group: agendaGroup, rule_type: 'DRL', drl_content: drlCode };
      if (isEdit) await api.put(`/admin/rules/${id}`, payload);
      else { const { data } = await api.post('/admin/rules', payload); ruleId = data?.data?.id; }
      try {
        const { data: td } = await api.post(`/admin/rules/${ruleId}/validate`);
        const r = td?.data;
        if (!r || r.level === 'PASS' || r.level === 'GREEN') { await api.post(`/admin/rules/${ruleId}/publish`); message.success('已发布'); navigate('/rules'); }
        else if (r.level === 'WARNING' || r.level === 'YELLOW') setPublishModal({ open: true, level: 'YELLOW', report: r });
        else setPublishModal({ open: true, level: 'RED', report: r });
      } catch { await api.post(`/admin/rules/${ruleId || id}/publish`); message.success('已发布'); navigate('/rules'); }
    } catch (e: any) { message.error(e?.message || '发布失败'); }
    finally { setPublishing(false); }
  };

  const handleForcePublish = async () => {
    if (!forceReason.trim()) { message.warning('请输入强制放行理由'); return; }
    try {
      await api.post(`/admin/rules/${id || '0'}/publish`, { forceOverride: true, reason: forceReason });
      message.success('已强制发布'); setPublishModal({ open: false, level: '', report: null }); navigate('/rules');
    } catch (e: any) { message.error(e?.message || '发布失败'); }
  };

  // ==================== 步骤渲染 ====================

  const steps = [
    { title: '规则类型', icon: <SettingOutlined /> },
    { title: '筛选条件', icon: <FilterOutlined /> },
    { title: '积分计算', icon: <CalculatorOutlined /> },
    { title: '等级加成', icon: <GiftOutlined /> },
    { title: 'AI', icon: <ThunderboltOutlined /> },
  ];

  const stepContent = [
    // ① 规则类型 + 快速配置
    <div key="s0">
      {/* 规则分类卡片 */}
      <Row gutter={24}>
        <Col span={12}>
          <Card size="small" hoverable onClick={() => setRuleCategory('ORDER')}
            style={{ cursor: 'pointer', border: ruleCategory === 'ORDER' ? '2px solid #1677ff' : '1px solid #d9d9d9', background: ruleCategory === 'ORDER' ? '#f0f5ff' : '#fff' }}>
            <Text strong style={{ fontSize: 15 }}>📦 订单类</Text>
            <br /><Text type="secondary" style={{ fontSize: 12 }}>按订单金额比例或商品明细计算积分</Text>
          </Card>
        </Col>
        <Col span={12}>
          <Card size="small" hoverable onClick={() => setRuleCategory('BEHAVIOR')}
            style={{ cursor: 'pointer', border: ruleCategory === 'BEHAVIOR' ? '2px solid #1677ff' : '1px solid #d9d9d9', background: ruleCategory === 'BEHAVIOR' ? '#f0f5ff' : '#fff' }}>
            <Text strong style={{ fontSize: 15 }}>🏃 行为类</Text>
            <br /><Text type="secondary" style={{ fontSize: 12 }}>按行为次数奖励固定积分，支持频次控制</Text>
          </Card>
        </Col>
      </Row>

      <Divider style={{ margin: '16px 0' }} />

      {/* 核心配置: 积分类型 + 议程组 + 频次 */}
      <Row gutter={16}>
        <Col span={6}>
          <Form.Item label="积分类型" tooltip="选择此规则发放的积分种类">
            <Select value={pointType} onChange={setPointType} options={pointTypeOptions} style={{ width: '100%' }} />
          </Form.Item>
        </Col>
        <Col span={6}>
          <Form.Item label="议程组" tooltip="决定规则在哪个阶段执行">
            <Select value={agendaGroup} onChange={setAgendaGroup} options={AGENDA_GROUPS} style={{ width: '100%' }} />
          </Form.Item>
        </Col>
        {ruleCategory === 'BEHAVIOR' && (
          <Col span={12}>
            <Form.Item label="频次限制">
              <Radio.Group value={frequencyLimit} onChange={e => setFrequencyLimit(e.target.value)} size="small">
                <Radio.Button value="once">仅首次</Radio.Button>
                <Radio.Button value="once_per_day">每天一次</Radio.Button>
                <Radio.Button value="unlimited">每次均可</Radio.Button>
              </Radio.Group>
            </Form.Item>
          </Col>
        )}
      </Row>

      {/* 快速配置: 直接从 Schema 字段构建规则骨架 */}
      <Card size="small" title="快速配置" style={{ marginTop: 12 }}
        extra={<Text type="secondary" style={{ fontSize: 11 }}>基于 {ruleCategory} Schema ({schemaFields.length} 字段)</Text>}>
        {ruleCategory === 'ORDER' ? (
          <div>
            <Row gutter={16} align="middle">
              <Col><Text>当订单</Text></Col>
              <Col>
                <Select size="small" placeholder="选计算字段" style={{ width: 160 }}
                  value={calcMode === 'total' ? 'total_amount' : 'per_item'}
                  onChange={v => { setCalcMode(v === 'total_amount' ? 'total' : 'per_item'); }}
                  options={orderSchemaFields.filter(f => f.type === 'number').map(f => ({ label: f.label, value: f.value }))} />
              </Col>
              <Col><Text>满足时，按</Text></Col>
              <Col>
                {calcMode === 'total' ? (
                  <Space size={4}>
                    <InputNumber size="small" min={0.1} max={100} step={0.1} value={ratioPercent} onChange={v => setRatioPercent(v || 0)} style={{ width: 70 }} />
                    <Text>% 比例发放</Text>
                    {pointTypeOptions.find(p => p.value === pointType)?.label || pointType}
                  </Space>
                ) : (
                  <Space size={4}>
                    <Text>每件商品</Text>
                    <InputNumber size="small" min={0} max={9999} value={perItemPoints} onChange={v => setPerItemPoints(v || 0)} style={{ width: 70 }} />
                    <Text>分</Text>
                  </Space>
                )}
              </Col>
            </Row>
            <Divider style={{ margin: '8px 0' }} />
            <Row gutter={8}>
              <Col><Text type="secondary" style={{ fontSize: 12 }}>筛选:</Text></Col>
              {orderSchemaFields.filter(f => !['items', 'eventType', 'member_id', 'total_amount', 'order_amount'].includes(f.value)).map(f => (
                <Col key={f.value}>
                  <Button size="small" type="dashed" style={{ fontSize: 11, padding: '0 8px' }}
                    onClick={() => {
                      const idx = extConditions.length;
                      setExtConditions([...extConditions, { key: String(Date.now()), field: f.value, type: f.type, op: f.type === 'number' ? '>=' : '==', value: '' }]);
                      setEditingCondIdx(idx);
                    }}>
                    + {f.label}
                  </Button>
                </Col>
              ))}
            </Row>
          </div>
        ) : (
          <div>
            <Row gutter={16} align="middle">
              <Col><Text>当用户完成</Text></Col>
              <Col>
                <Select size="small" style={{ width: 140 }}
                  value={extConditions.find(c => c.field === 'behavior_code')?.value || undefined}
                  onChange={v => {
                    const existing = extConditions.findIndex(c => c.field === 'behavior_code');
                    if (existing >= 0) { const n = [...extConditions]; n[existing] = { ...n[existing], value: v }; setExtConditions(n); }
                    else setExtConditions([...extConditions, { key: String(Date.now()), field: 'behavior_code', type: 'string', op: '==', value: v }]);
                  }}
                  options={behaviorSchemaFields.filter(f => f.value === 'eventType' || f.value === 'behavior_code').map(f => ({ label: f.value, value: f.value }))}
                  placeholder="选择行为" />
              </Col>
              <Col><Text>时，奖励</Text></Col>
              <Col>
                <InputNumber size="small" min={1} max={10000} value={rewardPoints} onChange={v => setRewardPoints(v || 0)} style={{ width: 70 }} />
              </Col>
              <Col><Text>分</Text></Col>
            </Row>
          </div>
        )}
      </Card>

      {/* 已添加的筛选条件 — 可内联编辑 */}
      {extConditions.length > 0 && (
        <div style={{ marginTop: 12 }}>
          <Text type="secondary" style={{ fontSize: 11 }}>筛选条件 ({extConditions.length}):</Text>
          {extConditions.filter(c => c.field).map((c, i) => {
            const fieldMeta = schemaFields.find(f => f.value === c.field);
            const isEditing = editingCondIdx === i;
            return (
              <div key={c.key} style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4, padding: '4px 8px', background: isEditing ? '#fffbe6' : '#fafafa', borderRadius: 4, border: '1px solid #f0f0f0' }}>
                <Tag color="blue" style={{ fontSize: 11, margin: 0, flexShrink: 0 }}>{fieldMeta?.label || c.field}</Tag>
                {isEditing ? (
                  <>
                    <Select size="small" value={c.op} options={OPS} style={{ width: 80 }} onChange={v => { const n = [...extConditions]; n[i] = { ...n[i], op: v }; setExtConditions(n); }} />
                    <Input size="small" placeholder="输入值" value={c.value} autoFocus style={{ width: 120 }} onChange={e => { const n = [...extConditions]; n[i] = { ...n[i], value: e.target.value }; setExtConditions(n); }} onPressEnter={() => setEditingCondIdx(null)} onBlur={() => c.value ? setEditingCondIdx(null) : null} />
                    <Button size="small" type="link" onClick={() => setEditingCondIdx(null)} style={{ padding: 0 }}>确定</Button>
                  </>
                ) : (
                  <>
                    <Tag style={{ fontSize: 11, margin: 0 }}>{c.op} {c.value || <Text type="secondary">点击编辑</Text>}</Tag>
                    <Button size="small" type="link" style={{ padding: 0, fontSize: 11 }} onClick={() => setEditingCondIdx(i)}>编辑</Button>
                    <Button size="small" type="link" danger style={{ padding: 0, fontSize: 11 }} onClick={() => setExtConditions(extConditions.filter((_, j) => j !== i))}>删除</Button>
                  </>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>,

    // ② 筛选条件 (all optional)
    <div key="s1">
      <Form.Item label="渠道限制">
        <Checkbox.Group options={channelOptions} value={channels} onChange={v => setChannels(v as string[])} />
        <Text type="secondary" style={{ fontSize: 11 }}>不选=所有渠道</Text>
      </Form.Item>
      {ruleCategory === 'ORDER' && tradeStatusOptions.length > 0 && (
        <Form.Item label="交易状态">
          <Checkbox.Group options={tradeStatusOptions} value={tradeStatus} onChange={v => setTradeStatus(v as string[])} />
          <Text type="secondary" style={{ fontSize: 11 }}>不选=所有状态</Text>
        </Form.Item>
      )}
      <Form.Item label="会员等级">
        <Checkbox.Group options={tierOptions} value={memberTiers} onChange={v => setMemberTiers(v as string[])} />
        <Text type="secondary" style={{ fontSize: 11 }}>不选=所有等级</Text>
      </Form.Item>
      {ruleCategory === 'ORDER' && (
        <Form.Item label="金额门槛" tooltip="订单金额下限，0=不限">
          <InputNumber min={0} max={999999} value={minAmount} onChange={v => setMinAmount(v || 0)} addonAfter="元" />
        </Form.Item>
      )}
      <Form.Item label="时间条件">
        <Checkbox.Group options={TIME_CONDITIONS} value={timeConditions} onChange={v => setTimeConditions(v as string[])} />
      </Form.Item>
      <Divider orientation="left" plain style={{ fontSize: 12 }}>Schema 字段筛选</Divider>
      {extConditions.map((c, i) => (
        <Row gutter={8} key={c.key} style={{ marginBottom: 8 }}>
          <Col span={8}><Select showSearch placeholder="选字段" value={c.field || undefined} options={schemaFields} style={{ width: '100%' }} onChange={v => { const n = [...extConditions]; const sf = schemaFields.find(f => f.value === v); n[i] = { ...n[i], field: v, type: sf?.type || 'string' }; setExtConditions(n); }} /></Col>
          <Col span={5}><Select value={c.op} options={OPS} style={{ width: '100%' }} onChange={v => { const n = [...extConditions]; n[i] = { ...n[i], op: v }; setExtConditions(n); }} /></Col>
          <Col span={6}><Input placeholder="值" value={c.value} onChange={e => { const n = [...extConditions]; n[i] = { ...n[i], value: e.target.value }; setExtConditions(n); }} /></Col>
          <Col span={5}>{i === extConditions.length - 1 ? <Button type="dashed" size="small" block onClick={() => setExtConditions([...extConditions, { key: String(Date.now()), field: '', op: '>', value: '' }])}>+</Button> : <Button type="text" size="small" danger onClick={() => setExtConditions(extConditions.filter((_, j) => j !== i))}>×</Button>}</Col>
        </Row>
      ))}
      {extConditions.length === 0 && <Button type="dashed" size="small" onClick={() => setExtConditions([{ key: String(Date.now()), field: '', op: '>', value: '' }])}>+ 添加</Button>}
    </div>,

    // ③ 积分计算
    <div key="s2">
      {ruleCategory === 'ORDER' ? (
        <>
          <Form.Item label="计算方式">
            <Radio.Group value={calcMode} onChange={e => setCalcMode(e.target.value)}>
              <Radio.Button value="total">按订单总额</Radio.Button>
              <Radio.Button value="per_item">按订单明细</Radio.Button>
            </Radio.Group>
          </Form.Item>
          {calcMode === 'total' ? (
            <>
              <Form.Item label="积分比例" tooltip="订单总额 × 比例 = 积分">
                <InputNumber min={0.1} max={100} step={0.1} value={ratioPercent} onChange={v => setRatioPercent(v || 0)} addonAfter="%" style={{ width: 200 }} />
              </Form.Item>
              <Form.Item label="保底积分" tooltip="最低保障积分，0=不设保底">
                <InputNumber min={0} max={99999} value={floorPoints} onChange={v => setFloorPoints(v || 0)} addonAfter="分/单" />
              </Form.Item>
              <Form.Item label="积分上限" tooltip="单笔订单最高积分，0=不限">
                <InputNumber min={0} max={999999} value={maxPoints} onChange={v => setMaxPoints(v || 0)} addonAfter="分/单" />
              </Form.Item>
            </>
          ) : (
            <>
              <Form.Item label="每件商品基础分" tooltip="每个商品(item)给予的基础积分">
                <InputNumber min={0} max={9999} value={perItemPoints} onChange={v => setPerItemPoints(v || 0)} addonAfter="分/件" />
              </Form.Item>
              <Divider orientation="left" plain style={{ fontSize: 12 }}>品类加权 (item_category)</Divider>
              {categoryWeights.map((cw, i) => (
                <Row gutter={8} key={cw.key} style={{ marginBottom: 8 }}>
                  <Col span={10}><Input placeholder="品类 (如: phone)" value={cw.cat} onChange={e => { const n = [...categoryWeights]; n[i] = { ...n[i], cat: e.target.value }; setCategoryWeights(n); }} /></Col>
                  <Col span={9}><InputNumber placeholder="倍率" value={cw.weight} min={0.1} step={0.1} style={{ width: '100%' }} onChange={v => { const n = [...categoryWeights]; n[i] = { ...n[i], weight: v || 0 }; setCategoryWeights(n); }} addonAfter="×" /></Col>
                  <Col span={5}>{i === categoryWeights.length - 1 ? <Button type="dashed" size="small" block onClick={() => setCategoryWeights([...categoryWeights, { key: String(Date.now()), cat: '', weight: 1 }])}>+</Button> : <Button type="text" size="small" danger onClick={() => setCategoryWeights(categoryWeights.filter((_, j) => j !== i))}>×</Button>}</Col>
                </Row>
              ))}
              {categoryWeights.length === 0 && <Button type="dashed" size="small" onClick={() => setCategoryWeights([{ key: String(Date.now()), cat: '', weight: 1 }])}>+ 添加品类加权</Button>}
              <Divider orientation="left" plain style={{ fontSize: 12, marginTop: 16 }}>数量阶梯 (同SKU件数)</Divider>
              {quantityTiers.map((qt, i) => (
                <Row gutter={8} key={qt.key} style={{ marginBottom: 8 }}>
                  <Col span={10}><InputNumber placeholder="满N件" value={qt.minQty} min={1} style={{ width: '100%' }} onChange={v => { const n = [...quantityTiers]; n[i] = { ...n[i], minQty: v || 0 }; setQuantityTiers(n); }} addonBefore="≥" /></Col>
                  <Col span={9}><InputNumber placeholder="额外加分" value={qt.bonus} min={1} style={{ width: '100%' }} onChange={v => { const n = [...quantityTiers]; n[i] = { ...n[i], bonus: v || 0 }; setQuantityTiers(n); }} addonAfter="分" /></Col>
                  <Col span={5}>{i === quantityTiers.length - 1 ? <Button type="dashed" size="small" block onClick={() => setQuantityTiers([...quantityTiers, { key: String(Date.now()), minQty: 3, bonus: 50 }])}>+</Button> : <Button type="text" size="small" danger onClick={() => setQuantityTiers(quantityTiers.filter((_, j) => j !== i))}>×</Button>}</Col>
                </Row>
              ))}
              {quantityTiers.length === 0 && <Button type="dashed" size="small" onClick={() => setQuantityTiers([{ key: String(Date.now()), minQty: 3, bonus: 50 }])}>+ 添加数量阶梯</Button>}
            </>
          )}
        </>
      ) : (
        <Form.Item label="每次行为积分">
          <InputNumber min={1} max={10000} value={rewardPoints} onChange={v => setRewardPoints(v || 0)} addonAfter="分/次" />
        </Form.Item>
      )}
    </div>,

    // ④ 等级加成
    <div key="s3">
      {tierBonuses.map((tb, i) => (
        <Row gutter={8} key={tb.key} style={{ marginBottom: 8 }}>
          <Col span={10}><Select value={tb.tier} options={tierOptions} style={{ width: '100%' }} onChange={v => { const n = [...tierBonuses]; n[i] = { ...n[i], tier: v }; setTierBonuses(n); }} /></Col>
          <Col span={9}><InputNumber value={tb.bonus} min={1} style={{ width: '100%' }} onChange={v => { const n = [...tierBonuses]; n[i] = { ...n[i], bonus: v || 0 }; setTierBonuses(n); }} addonAfter="分" /></Col>
          <Col span={5}>{i === tierBonuses.length - 1 ? <Button type="dashed" size="small" block onClick={() => setTierBonuses([...tierBonuses, { key: String(Date.now()), tier: 'SILVER', bonus: 0 }])}>+</Button> : <Button type="text" size="small" danger onClick={() => setTierBonuses(tierBonuses.filter((_, j) => j !== i))}>×</Button>}</Col>
        </Row>
      ))}
    </div>,

    // ⑤ AI
    <div key="s4">
      <Alert type="info" message="🤖 AI 活动规则助手" description="用自然语言描述营销活动，AI 生成 DRL 脚本附加到规则末尾。" style={{ marginBottom: 16 }} />
      <Input.TextArea value={aiPrompt} onChange={e => setAiPrompt(e.target.value)} placeholder="如: 618大促期间，手机品类满3件额外赠200积分" rows={3} style={{ marginBottom: 8 }} />
      <Button icon={<ThunderboltOutlined />} onClick={handleAiGenerate} loading={aiLoading} type="primary">生成</Button>
      {aiResult && (
        <Card size="small" style={{ marginTop: 12, background: '#f6ffed' }}>
          <Text style={{ fontSize: 12 }}>{aiResult.analysis}</Text>
          <pre style={{ background: '#1e1e1e', color: '#d4d4d4', padding: 8, borderRadius: 4, fontSize: 11, maxHeight: 100, overflow: 'auto', marginTop: 8 }}>{aiResult.drl_code?.substring(0, 400)}</pre>
          {aiGeneratedDrl && <Tag color="green" style={{ marginTop: 8 }}>已附加</Tag>}
        </Card>
      )}
    </div>,
  ];

  return (
    <PageWrapper>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
        <Title level={4} style={{ margin: 0 }}>{isEdit ? `编辑规则 #${id}` : '新建规则'}</Title>
        <Space>
          <Button onClick={() => navigate('/rules')}>取消</Button>
          <Button icon={<SaveOutlined />} onClick={handleSave} loading={saving}>保存草稿</Button>
          <Button type="primary" icon={<SendOutlined />} loading={publishing} onClick={handlePublish}>发布</Button>
        </Space>
      </div>

      <Card size="small" style={{ marginBottom: 16 }}>
        <Row gutter={16}>
          <Col span={12}><Form.Item label="规则名称" style={{ marginBottom: 0 }}><Input placeholder="例如：618手机品类奖励" value={ruleName} onChange={e => setRuleName(e.target.value)} /></Form.Item></Col>
          <Col span={8}><Form.Item label="规则代码" style={{ marginBottom: 0 }}><Input placeholder="自动生成" value={ruleCode} onChange={e => setRuleCode(e.target.value)} /></Form.Item></Col>
        </Row>
      </Card>

      <Card size="small" style={{ marginBottom: 16 }}>
        <Steps current={currentStep} size="small" labelPlacement="vertical">
          {steps.map((s, i) => (<Steps.Step key={i} title={s.title} icon={s.icon} />))}
        </Steps>
      </Card>

      <Card title={<Space>{steps[currentStep].icon}{steps[currentStep].title}</Space>} style={{ marginBottom: 16, minHeight: 260 }}
        extra={<Space>
          {currentStep > 0 && <Button icon={<LeftOutlined />} onClick={() => setCurrentStep(currentStep - 1)}>上一步</Button>}
          {currentStep < 4 ? <Button type="primary" icon={<RightOutlined />} onClick={() => setCurrentStep(currentStep + 1)}>下一步</Button> : <Button type="primary" icon={<CheckOutlined />} onClick={handleSave}>完成配置</Button>}
        </Space>}>
        {stepContent[currentStep]}
      </Card>

      <Collapse activeKey={scriptExpanded ? ['s'] : []} onChange={ks => setScriptExpanded(ks.includes('s'))} style={{ background: '#fafafa' }}>
        <Panel header={<Space><EyeOutlined /><Text>查看脚本</Text><Tag color="blue">Drools DRL</Tag></Space>} key="s" extra={
          <Space onClick={e => e.stopPropagation()}>
            {manualEdit ? <Button size="small" onClick={() => { setManualEdit(false); message.info('已切换为自动生成'); }}>自动生成</Button> : <Button size="small" icon={<EditOutlined />} onClick={handleManualEdit}>手动编辑</Button>}
            <Button size="small" icon={<CopyOutlined />} onClick={handleCopy}>复制</Button>
          </Space>
        }>
          {manualEdit ? <Input.TextArea value={manualDrl} onChange={e => setManualDrl(e.target.value)} rows={16} style={{ fontFamily: 'monospace', fontSize: 12, background: '#1e1e1e', color: '#d4d4d4' }} /> : <pre style={{ background: '#1e1e1e', color: '#d4d4d4', padding: 12, borderRadius: 4, fontSize: 12, maxHeight: 300, overflow: 'auto', margin: 0 }}>{drlCode}</pre>}
        </Panel>
      </Collapse>

      <Modal title={publishModal.level === 'YELLOW' ? '⚠️ 沙箱测试警告' : '🚨 沙箱测试严重警告'} open={publishModal.open} onCancel={() => setPublishModal({ open: false, level: '', report: null })} footer={null} width={600}>
        {publishModal.report && (<>
          <Alert type={publishModal.level === 'YELLOW' ? 'warning' : 'error'} message={publishModal.level === 'YELLOW' ? '部分用例与基线不一致，建议检查后发布' : '多个用例与基线严重不一致，不建议直接发布'} style={{ marginBottom: 16 }} />
          <Descriptions bordered size="small" column={2}>
            <Descriptions.Item label="总用例数">{publishModal.report.totalCases}</Descriptions.Item>
            <Descriptions.Item label="差异数"><Tag color={publishModal.level === 'YELLOW' ? 'orange' : 'red'}>{publishModal.report.diffCount}</Tag></Descriptions.Item>
          </Descriptions>
          {publishModal.level === 'RED' && (<div style={{ marginTop: 16 }}><Text strong>强制放行理由（必填）：</Text><Input.TextArea value={forceReason} onChange={e => setForceReason(e.target.value)} rows={2} placeholder="请说明为什么需要强制发布..." style={{ marginTop: 8 }} /></div>)}
          <Divider />
          <Space style={{ justifyContent: 'flex-end', width: '100%' }}>
            <Button onClick={() => setPublishModal({ open: false, level: '', report: null })}>{publishModal.level === 'YELLOW' ? '返回修改' : '取消'}</Button>
            <Button type="primary" danger={publishModal.level === 'RED'} onClick={publishModal.level === 'YELLOW' ? async () => { try { await api.post(`/admin/rules/${id || '0'}/publish`); message.success('已发布'); setPublishModal({ open: false, level: '', report: null }); navigate('/rules'); } catch (e: any) { message.error(e?.message || '发布失败'); } } : handleForcePublish}>{publishModal.level === 'YELLOW' ? '仍要发布' : '强制发布'}</Button>
          </Space>
        </>)}
      </Modal>
    </PageWrapper>
  );
};

export default RuleEditor;