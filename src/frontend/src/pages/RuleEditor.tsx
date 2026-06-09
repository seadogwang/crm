import React, { useState, useMemo, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Card, Form, Input, InputNumber, Select, Button, message, Space, Modal, Tag,
  Typography, Alert, Descriptions, Divider, Steps, Collapse, Checkbox, Radio, Row, Col, DatePicker,
} from 'antd';
import {
  SaveOutlined, ThunderboltOutlined, SendOutlined, SettingOutlined,
  GiftOutlined, LeftOutlined, RightOutlined, CheckOutlined, CopyOutlined, EditOutlined, EyeOutlined,
} from '@ant-design/icons';
import PageWrapper from '../components/PageWrapper';
import api from '../api';
import dayjs from 'dayjs';

const { Title, Text } = Typography;
const { Panel } = Collapse;

type Option = { label: string; value: string };
type SchemaField = Option & { type: string; format?: string; enumValues?: string[] };
interface ExtCondition { key: string; field: string; type?: string; format?: string; op: string; value: string; valueEnd?: string; }
interface TierBonus { key: string; tier: string; bonus: number; }
interface CategoryWeight { key: string; cat: string; weight: number; }
interface QuantityTier { key: string; minQty: number; bonus: number; }

const OPS: Option[] = [
  { label: '>', value: '>' }, { label: '>=', value: '>=' },
  { label: '<', value: '<' }, { label: '<=', value: '<=' },
  { label: '=', value: '==' }, { label: '!=', value: '!=' },
];
const RANGE_OPS: Option[] = [
  { label: '区间(含边界)', value: 'BETWEEN_EQ' },
  { label: '区间(不含边界)', value: 'BETWEEN' },
];
const STRING_OPS: Option[] = [{ label: '包含文本', value: 'contains' }];

function getOpsForField(type?: string, format?: string): Option[] {
  if (type === 'number' || format === 'date-time' || format === 'date') return [...OPS, ...RANGE_OPS];
  if (type === 'string') return [...OPS, ...STRING_OPS];
  return OPS;
}

const AGENDA_GROUPS: Option[] = [
  { label: 'purchase (购买)', value: 'purchase' }, { label: 'behavior (行为)', value: 'behavior' },
  { label: 'campaign (活动)', value: 'campaign' }, { label: 'refund (退款)', value: 'refund' },
];

// ==================== DRL ====================

function generateDrl(data: Record<string, any>): string {
  const ruleName = data.ruleName || 'custom_rule';
  const safeName = ruleName.replace(/[^a-zA-Z0-9_]/g, '_');
  const agendaGroup = data.agendaGroup || 'purchase';
  const entity = data.selectedEntity || 'ORDER';
  const calcMode = data.calcMode || 'total';
  const pointType = data.pointType || 'REWARD_POINTS';
  const lines: string[] = [];

  lines.push('package com.loyalty.platform.rules;');
  lines.push('import com.loyalty.platform.rules.drl.MemberFact;');
  lines.push('import com.loyalty.platform.rules.drl.EventFact;');
  lines.push('import com.loyalty.platform.rules.action.ActionCollector;');
  lines.push('');
  if (entity === 'BEHAVIOR' && data.frequencyLimit && data.frequencyLimit !== 'unlimited') {
    lines.push(`// @frequency: ${data.frequencyLimit}`);
  }
  lines.push(`rule "${safeName}"`);
  lines.push(`  agenda-group "${agendaGroup}"`);
  lines.push('  when');

  const conds: string[] = ['    $event: EventFact()', '    $member: MemberFact(memberId == $event.memberId)'];

  const channels: string[] = data.channels || [];
  if (channels.length > 0) conds.push(`    eval(Arrays.asList(${channels.map((c: string) => `"${c}"`).join(', ')}).contains($event.getChannel()))`);
  if (data.tradeStatus?.length) conds.push(`    eval(Arrays.asList(${data.tradeStatus.map((s: string) => `"${s}"`).join(', ')}).contains($event.getPayloadString("trade_status")))`);

  const tiers: string[] = data.memberTiers || [];
  if (tiers.length > 0) conds.push(`    eval(Arrays.asList(${tiers.map((t: string) => `"${t}"`).join(', ')}).contains($member.getTierCode()))`);
  if (entity === 'ORDER' && data.minAmount > 0) conds.push(`    eval($event.getPayloadNumber("order_amount") >= ${data.minAmount})`);

  const extConds: ExtCondition[] = data.extConditions || [];
  for (const c of extConds) {
    if (!c.field || !c.op) continue;
    const fn = c.type === 'number' ? 'getPayloadNumber' : 'getPayloadString';
    if (c.op === 'BETWEEN' || c.op === 'BETWEEN_EQ') {
      const v1 = isNaN(Number(c.value)) ? `"${c.value}"` : c.value;
      const v2 = isNaN(Number(c.valueEnd)) ? `"${c.valueEnd}"` : c.valueEnd;
      const o = c.op === 'BETWEEN_EQ' ? '>=' : '>';
      const o2 = c.op === 'BETWEEN_EQ' ? '<=' : '<';
      conds.push(`    eval($event.${fn}("${c.field}") ${o} ${v1} && $event.${fn}("${c.field}") ${o2} ${v2})`);
    } else {
      const v = isNaN(Number(c.value)) ? `"${c.value}"` : c.value;
      conds.push(`    eval($event.${fn}("${c.field}") ${c.op} ${v})`);
    }
  }

  lines.push(conds.join(',\n'));
  lines.push('  then');
  const actions: string[] = [];

  if (entity === 'ORDER') {
    if (calcMode === 'total') {
      const ratio = (data.ratioPercent || 0) / 100;
      if (ratio > 0) {
        actions.push('    java.math.BigDecimal _total = $event.getPayloadNumber("total_amount");');
        actions.push(`    java.math.BigDecimal _pts = _total.multiply(new java.math.BigDecimal("${ratio}")).setScale(0, java.math.RoundingMode.DOWN);`);
      }
      if (data.floorPoints > 0) actions.push(`    if (_pts.compareTo(new java.math.BigDecimal("${data.floorPoints}")) < 0) _pts = new java.math.BigDecimal("${data.floorPoints}");`);
      if (data.maxPoints > 0) actions.push(`    if (_pts.compareTo(new java.math.BigDecimal("${data.maxPoints}")) > 0) _pts = new java.math.BigDecimal("${data.maxPoints}");`);
      if (ratio > 0 || data.floorPoints > 0) actions.push(`    collector.awardPoints($event.getProgramCode(), $event.getMemberId(), "${pointType}", _pts, "${safeName}", null);`);
    } else {
      const perItem = data.perItemPoints || 0;
      if (perItem > 0) {
        actions.push('    int _cnt = Integer.parseInt($event.getPayloadString("item_count"));');
        actions.push(`    java.math.BigDecimal _pts = new java.math.BigDecimal("${perItem}").multiply(new java.math.BigDecimal(_cnt));`);
      }
      const catWeights: CategoryWeight[] = data.categoryWeights || [];
      for (const cw of catWeights) {
        if (!cw.cat || !cw.weight) continue;
        actions.push(`    if ("${cw.cat}".equals($event.getPayloadString("item_category"))) { _pts = _pts.multiply(new java.math.BigDecimal("${cw.weight}")); }`);
      }
      const qt: QuantityTier[] = data.quantityTiers || [];
      for (const q of qt) {
        if (!q.minQty || !q.bonus) continue;
        actions.push(`    if (_cnt >= ${q.minQty}) { _pts = _pts.add(new java.math.BigDecimal("${q.bonus}")); }`);
      }
      if (perItem > 0) actions.push(`    collector.awardPoints($event.getProgramCode(), $event.getMemberId(), "${pointType}", _pts, "${safeName}", null);`);
    }
  } else if (data.rewardPoints > 0) {
    actions.push(`    collector.awardPoints($event.getProgramCode(), $event.getMemberId(), "${pointType}", new java.math.BigDecimal("${data.rewardPoints}"), "${safeName}", null);`);
  }

  const tierBonuses: TierBonus[] = data.tierBonuses || [];
  for (const tb of tierBonuses) {
    if (!tb.tier || !tb.bonus) continue;
    actions.push(`    if ("${tb.tier}".equals($member.getTierCode())) { collector.awardPoints($event.getProgramCode(), $event.getMemberId(), "${pointType}", new java.math.BigDecimal("${tb.bonus}"), "${safeName}_TIER", null); }`);
  }
  if (actions.length === 0) actions.push('    System.out.println("rule fired: " + $event.getEventId());');
  lines.push(actions.join('\n'));
  lines.push('end');
  if (data.aiGeneratedDrl?.trim()) { lines.push(''); lines.push('// === AI-generated ==='); lines.push(data.aiGeneratedDrl.trim()); }
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

  // ① 业务实体配置
  const [selectedEntity, setSelectedEntity] = useState('ORDER');
  const [pointType, setPointType] = useState('REWARD_POINTS');
  const [schemaFields, setSchemaFields] = useState<SchemaField[]>([]);
  const [editingCondIdx, setEditingCondIdx] = useState<number | null>(null);

  // 字段条件
  const [extConditions, setExtConditions] = useState<ExtCondition[]>([]);
  const [channels, setChannels] = useState<string[]>([]);
  const [memberTiers, setMemberTiers] = useState<string[]>(['GOLD']);
  const [minAmount, setMinAmount] = useState(0);
  const [tradeStatus, setTradeStatus] = useState<string[]>([]);
  const [frequencyLimit, setFrequencyLimit] = useState<'once' | 'once_per_day' | 'unlimited'>('unlimited');

  // 积分计算
  const [calcMode, setCalcMode] = useState<'total' | 'per_item'>('total');
  const [ratioPercent, setRatioPercent] = useState(1);
  const [floorPoints, setFloorPoints] = useState(0);
  const [maxPoints, setMaxPoints] = useState(0);
  const [perItemPoints, setPerItemPoints] = useState(5);
  const [categoryWeights, setCategoryWeights] = useState<CategoryWeight[]>([]);
  const [quantityTiers, setQuantityTiers] = useState<QuantityTier[]>([]);
  const [rewardPoints, setRewardPoints] = useState(10);

  // ② 等级加成
  const [tierBonuses, setTierBonuses] = useState<TierBonus[]>([
    { key: '1', tier: 'GOLD', bonus: 10 }, { key: '2', tier: 'PLATINUM', bonus: 20 },
  ]);

  // ③ AI
  const [aiPrompt, setAiPrompt] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [aiResult, setAiResult] = useState<any>(null);
  const [aiGeneratedDrl, setAiGeneratedDrl] = useState('');

  // 发布
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [publishModal, setPublishModal] = useState<{ open: boolean; level: string; report: any }>({ open: false, level: '', report: null });
  const [forceReason, setForceReason] = useState('');
  const [scriptExpanded, setScriptExpanded] = useState(false);
  const [manualEdit, setManualEdit] = useState(false);
  const [manualDrl, setManualDrl] = useState('');

  // 动态选项
  const [entityOptions, setEntityOptions] = useState<Option[]>([{ label: 'ORDER (订单事件)', value: 'ORDER' }, { label: 'BEHAVIOR (行为事件)', value: 'BEHAVIOR' }, { label: 'MEMBER (会员)', value: 'MEMBER' }]);
  const [pointTypeOptions, setPointTypeOptions] = useState<Option[]>([]);
  const [channelOptions, setChannelOptions] = useState<Option[]>([]);
  const [tierOptions, setTierOptions] = useState<Option[]>([]);
  const [tradeStatusOptions, setTradeStatusOptions] = useState<Option[]>([]);

  // 加载 Schema + 选项
  useEffect(() => {
    api.get(`/schemas/${selectedEntity}`).then(({ data }) => {
      const s = data?.data?.schema || data?.data;
      setSchemaFields(Object.entries(s?.properties || {}).map(([k, v]: any) => ({
        label: `${v.title || k} (${k})`, value: k, type: v.type || 'string', format: v.format, enumValues: v.enum,
      })));
      if (s?.properties?.trade_status?.enum) setTradeStatusOptions(s.properties.trade_status.enum.map((e: string) => ({ label: e, value: e })));
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
  }, [selectedEntity]);

  const formData = useMemo(() => ({
    ruleName, agendaGroup, selectedEntity, frequencyLimit, pointType,
    channels, memberTiers, minAmount, tradeStatus, extConditions,
    calcMode, ratioPercent, floorPoints, maxPoints, perItemPoints, categoryWeights, quantityTiers,
    rewardPoints, tierBonuses, aiGeneratedDrl,
  }), [ruleName, agendaGroup, selectedEntity, frequencyLimit, pointType,
    channels, memberTiers, minAmount, tradeStatus, extConditions,
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
    } catch (e: any) { message.error(e?.message || 'AI生成失败'); } finally { setAiLoading(false); }
  };
  const handleSave = async () => {
    setSaving(true);
    try {
      const payload = { rule_code: ruleCode || `RULE_${Date.now()}`, rule_name: ruleName || '未命名规则', agenda_group: agendaGroup, rule_type: 'DRL', drl_content: drlCode, status: 'DRAFT' };
      if (isEdit) await api.put(`/admin/rules/${id}`, payload); else await api.post('/admin/rules', payload);
      message.success('已保存草稿');
    } catch (e: any) { message.error(e?.message || '保存失败'); } finally { setSaving(false); }
  };
  const handlePublish = async () => {
    setPublishing(true);
    try {
      let ruleId = id ? Number(id) : null;
      const payload = { rule_code: ruleCode || `RULE_${Date.now()}`, rule_name: ruleName || '未命名规则', agenda_group: agendaGroup, rule_type: 'DRL', drl_content: drlCode };
      if (isEdit) await api.put(`/admin/rules/${id}`, payload); else { const { data } = await api.post('/admin/rules', payload); ruleId = data?.data?.id; }
      try {
        const { data: td } = await api.post(`/admin/rules/${ruleId}/validate`); const r = td?.data;
        if (!r || r.level === 'PASS' || r.level === 'GREEN') { await api.post(`/admin/rules/${ruleId}/publish`); message.success('已发布'); navigate('/rules'); }
        else if (r.level === 'WARNING' || r.level === 'YELLOW') setPublishModal({ open: true, level: 'YELLOW', report: r });
        else setPublishModal({ open: true, level: 'RED', report: r });
      } catch { await api.post(`/admin/rules/${ruleId || id}/publish`); message.success('已发布'); navigate('/rules'); }
    } catch (e: any) { message.error(e?.message || '发布失败'); } finally { setPublishing(false); }
  };
  const handleForcePublish = async () => {
    if (!forceReason.trim()) { message.warning('请输入强制放行理由'); return; }
    try { await api.post(`/admin/rules/${id || '0'}/publish`, { forceOverride: true, reason: forceReason }); message.success('已强制发布'); setPublishModal({ open: false, level: '', report: null }); navigate('/rules'); } catch (e: any) { message.error(e?.message || '发布失败'); }
  };

  // 渲染字段条件行
  const renderFieldRow = (f: SchemaField) => {
    const idx = extConditions.findIndex(c => c.field === f.value);
    const c = idx >= 0 ? extConditions[idx] : null;
    const isEditing = editingCondIdx === idx;
    if (c && isEditing) {
      return (
        <div key={f.value} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0', background: '#fffbe6', borderRadius: 4 }}>
          <Tag color={f.type === 'number' ? 'blue' : f.type === 'string' ? 'green' : f.format ? 'orange' : 'default'} style={{ fontSize: 11, margin: 0, width: 50, textAlign: 'center' }}>{f.format === 'date-time' ? 'date' : f.type}</Tag>
          <Text style={{ fontSize: 12, width: 130, flexShrink: 0 }}>{f.label}</Text>
          <Select size="small" value={c.op} options={getOpsForField(f.type, f.format)} style={{ width: c.op?.startsWith('BETWEEN') ? 120 : 70 }}
            onChange={v => { const n = [...extConditions]; n[idx] = { ...n[idx], op: v, value: '', valueEnd: '' }; setExtConditions(n); }} />
          {c.op?.startsWith('BETWEEN') ? (
            <Space size={4}>
              {f.format === 'date-time' ? <DatePicker size="small" showTime format="YYYY-MM-DD HH:mm:ss" placeholder="起始" style={{ width: 150 }} value={c.value ? dayjs(c.value) : null} onChange={(d) => { const n = [...extConditions]; n[idx] = { ...n[idx], value: d ? d.format('YYYY-MM-DD HH:mm:ss') : '' }; setExtConditions(n); }} /> : <InputNumber size="small" placeholder="起始" style={{ width: 80 }} value={c.value ? Number(c.value) : undefined} onChange={v => { const n = [...extConditions]; n[idx] = { ...n[idx], value: String(v ?? '') }; setExtConditions(n); }} />}
              <Text type="secondary">~</Text>
              {f.format === 'date-time' ? <DatePicker size="small" showTime format="YYYY-MM-DD HH:mm:ss" placeholder="结束" style={{ width: 150 }} value={c.valueEnd ? dayjs(c.valueEnd) : null} onChange={(d) => { const n = [...extConditions]; n[idx] = { ...n[idx], valueEnd: d ? d.format('YYYY-MM-DD HH:mm:ss') : '' }; setExtConditions(n); }} /> : <InputNumber size="small" placeholder="结束" style={{ width: 80 }} value={c.valueEnd ? Number(c.valueEnd) : undefined} onChange={v => { const n = [...extConditions]; n[idx] = { ...n[idx], valueEnd: String(v ?? '') }; setExtConditions(n); }} />}
            </Space>
          ) : f.type === 'number' ? (
            <InputNumber size="small" placeholder="数值" style={{ width: 100 }} value={c.value ? Number(c.value) : undefined} onChange={v => { const n = [...extConditions]; n[idx] = { ...n[idx], value: String(v ?? '') }; setExtConditions(n); }} onPressEnter={() => setEditingCondIdx(null)} />
          ) : f.enumValues?.length ? (
            <Select size="small" placeholder="选择" style={{ width: 140 }} value={c.value || undefined} options={f.enumValues.map(e => ({ label: e, value: e }))} onChange={v => { const n = [...extConditions]; n[idx] = { ...n[idx], value: v }; setExtConditions(n); setEditingCondIdx(null); }} />
          ) : f.format === 'date-time' ? (
            <DatePicker size="small" showTime format="YYYY-MM-DD HH:mm:ss" placeholder="选择" style={{ width: 170 }} value={c.value ? dayjs(c.value) : null} onChange={(d) => { const n = [...extConditions]; n[idx] = { ...n[idx], value: d ? d.format('YYYY-MM-DD HH:mm:ss') : '' }; setExtConditions(n); setEditingCondIdx(null); }} />
          ) : (
            <Input size="small" placeholder="输入值" style={{ width: 120 }} value={c.value} onChange={e => { const n = [...extConditions]; n[idx] = { ...n[idx], value: e.target.value }; setExtConditions(n); }} onPressEnter={() => setEditingCondIdx(null)} />
          )}
          <Button size="small" type="link" style={{ padding: 0 }} onClick={() => setEditingCondIdx(null)}>确定</Button>
          <Button size="small" type="link" danger style={{ padding: 0 }} onClick={() => { setExtConditions(extConditions.filter((_, i) => i !== idx)); setEditingCondIdx(null); }}>×</Button>
        </div>
      );
    }
    return (
      <div key={f.value} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '2px 0' }}>
        <Tag color={f.type === 'number' ? 'blue' : f.type === 'string' ? 'green' : f.format ? 'orange' : 'default'} style={{ fontSize: 11, margin: 0, width: 50, textAlign: 'center' }}>{f.format === 'date-time' ? 'date' : f.type}</Tag>
        <Text style={{ fontSize: 12, width: 130, flexShrink: 0 }}>{f.label}</Text>
        {c ? (
          <>
            <Tag style={{ fontSize: 11, margin: 0 }}>{c.op?.startsWith('BETWEEN') ? `${c.op === 'BETWEEN_EQ' ? '区间[含]' : '区间'} ${c.value || '?'}~${c.valueEnd || '?'}` : `${c.op} ${c.value}`}</Tag>
            <Button size="small" type="link" style={{ padding: 0, fontSize: 11 }} onClick={() => setEditingCondIdx(idx)}>编辑</Button>
            <Button size="small" type="link" danger style={{ padding: 0, fontSize: 11 }} onClick={() => setExtConditions(extConditions.filter((_, i) => i !== idx))}>×</Button>
          </>
        ) : f.type === 'array' ? (
          <Text type="secondary" style={{ fontSize: 11 }}>(嵌套对象)</Text>
        ) : (
          <Button size="small" type="dashed" style={{ fontSize: 11, padding: '0 8px' }}
            onClick={() => {
              const newIdx = extConditions.length;
              setExtConditions([...extConditions, { key: String(Date.now()), field: f.value, type: f.type, format: f.format, op: f.type === 'number' || f.format ? '>=' : '==', value: '' }]);
              setEditingCondIdx(newIdx);
            }}>+ 添加</Button>
        )}
      </div>
    );
  };

  const steps = [
    { title: '实体配置', icon: <SettingOutlined /> },
    { title: '等级加成', icon: <GiftOutlined /> },
    { title: 'AI 活动', icon: <ThunderboltOutlined /> },
  ];

  const stepContent = [
    // ① 业务实体配置
    <div key="s0">
      <Row gutter={16} style={{ marginBottom: 12 }}>
        <Col span={8}>
          <Form.Item label="业务实体" tooltip="选择此规则对应的业务实体类型" style={{ marginBottom: 0 }}>
            <Select value={selectedEntity} onChange={v => { setSelectedEntity(v); setExtConditions([]); }} options={entityOptions} style={{ width: '100%' }} />
          </Form.Item>
        </Col>
        <Col span={8}>
          <Form.Item label="积分类型" tooltip="选择此规则发放的积分种类" style={{ marginBottom: 0 }}>
            <Select value={pointType} onChange={setPointType} options={pointTypeOptions} style={{ width: '100%' }} />
          </Form.Item>
        </Col>
        <Col span={8}>
          <Form.Item label="议程组" tooltip="决定规则在哪个阶段执行" style={{ marginBottom: 0 }}>
            <Select value={agendaGroup} onChange={setAgendaGroup} options={AGENDA_GROUPS} style={{ width: '100%' }} />
          </Form.Item>
        </Col>
      </Row>

      {selectedEntity === 'BEHAVIOR' && (
        <Row gutter={16} style={{ marginBottom: 12 }}>
          <Col span={8}>
            <Form.Item label="频次限制" style={{ marginBottom: 0 }}>
              <Radio.Group value={frequencyLimit} onChange={e => setFrequencyLimit(e.target.value)} size="small">
                <Radio.Button value="once">仅首次</Radio.Button>
                <Radio.Button value="once_per_day">每天一次</Radio.Button>
                <Radio.Button value="unlimited">每次均可</Radio.Button>
              </Radio.Group>
            </Form.Item>
          </Col>
        </Row>
      )}

      <Card size="small" title={<Space><Tag color="blue">{selectedEntity}</Tag>可用字段 ({schemaFields.length})</Space>} style={{ marginBottom: 12 }}>
        <div style={{ maxHeight: 320, overflow: 'auto' }}>
          {schemaFields.map(f => renderFieldRow(f))}
        </div>
      </Card>

      {/* 积分计算 */}
      <Card size="small" title="积分计算" style={{ marginBottom: 12 }}>
        {selectedEntity === 'ORDER' ? (
          <>
            <Form.Item label="计算方式" style={{ marginBottom: 8 }}>
              <Radio.Group value={calcMode} onChange={e => setCalcMode(e.target.value)} size="small">
                <Radio.Button value="total">按订单总额</Radio.Button>
                <Radio.Button value="per_item">按订单明细</Radio.Button>
              </Radio.Group>
            </Form.Item>
            {calcMode === 'total' ? (
              <Row gutter={16}>
                <Col span={8}><Form.Item label="比例" style={{ marginBottom: 0 }}><InputNumber size="small" min={0.1} max={100} step={0.1} value={ratioPercent} onChange={v => setRatioPercent(v || 0)} addonAfter="%" style={{ width: '100%' }} /></Form.Item></Col>
                <Col span={8}><Form.Item label="保底" style={{ marginBottom: 0 }}><InputNumber size="small" min={0} max={99999} value={floorPoints} onChange={v => setFloorPoints(v || 0)} addonAfter="分" style={{ width: '100%' }} /></Form.Item></Col>
                <Col span={8}><Form.Item label="上限(0=不限)" style={{ marginBottom: 0 }}><InputNumber size="small" min={0} max={999999} value={maxPoints} onChange={v => setMaxPoints(v || 0)} addonAfter="分" style={{ width: '100%' }} /></Form.Item></Col>
              </Row>
            ) : (
              <>
                <Form.Item label="每件基础分" style={{ marginBottom: 8 }}><InputNumber size="small" min={0} max={9999} value={perItemPoints} onChange={v => setPerItemPoints(v || 0)} addonAfter="分/件" /></Form.Item>
                <Text type="secondary" style={{ fontSize: 11 }}>品类加权:</Text>
                {categoryWeights.map((cw, i) => (
                  <Row gutter={4} key={cw.key} style={{ marginTop: 4 }}>
                    <Col span={10}><Input size="small" placeholder="品类" value={cw.cat} onChange={e => { const n = [...categoryWeights]; n[i] = { ...n[i], cat: e.target.value }; setCategoryWeights(n); }} /></Col>
                    <Col span={9}><InputNumber size="small" placeholder="倍率" value={cw.weight} min={0.1} step={0.1} style={{ width: '100%' }} onChange={v => { const n = [...categoryWeights]; n[i] = { ...n[i], weight: v || 0 }; setCategoryWeights(n); }} addonAfter="×" /></Col>
                    <Col span={5}>{i === categoryWeights.length - 1 ? <Button size="small" type="dashed" block onClick={() => setCategoryWeights([...categoryWeights, { key: String(Date.now()), cat: '', weight: 1 }])}>+</Button> : <Button size="small" type="link" danger onClick={() => setCategoryWeights(categoryWeights.filter((_, j) => j !== i))}>×</Button>}</Col>
                  </Row>
                ))}
                {categoryWeights.length === 0 && <Button size="small" type="dashed" onClick={() => setCategoryWeights([{ key: String(Date.now()), cat: '', weight: 1 }])} style={{ marginTop: 4 }}>+ 添加品类加权</Button>}
                <Divider style={{ margin: '8px 0' }} />
                <Text type="secondary" style={{ fontSize: 11 }}>数量阶梯:</Text>
                {quantityTiers.map((qt, i) => (
                  <Row gutter={4} key={qt.key} style={{ marginTop: 4 }}>
                    <Col span={10}><InputNumber size="small" placeholder="满N件" value={qt.minQty} min={1} style={{ width: '100%' }} onChange={v => { const n = [...quantityTiers]; n[i] = { ...n[i], minQty: v || 0 }; setQuantityTiers(n); }} addonBefore="≥" /></Col>
                    <Col span={9}><InputNumber size="small" placeholder="额外加分" value={qt.bonus} min={1} style={{ width: '100%' }} onChange={v => { const n = [...quantityTiers]; n[i] = { ...n[i], bonus: v || 0 }; setQuantityTiers(n); }} addonAfter="分" /></Col>
                    <Col span={5}>{i === quantityTiers.length - 1 ? <Button size="small" type="dashed" block onClick={() => setQuantityTiers([...quantityTiers, { key: String(Date.now()), minQty: 3, bonus: 50 }])}>+</Button> : <Button size="small" type="link" danger onClick={() => setQuantityTiers(quantityTiers.filter((_, j) => j !== i))}>×</Button>}</Col>
                  </Row>
                ))}
                {quantityTiers.length === 0 && <Button size="small" type="dashed" onClick={() => setQuantityTiers([{ key: String(Date.now()), minQty: 3, bonus: 50 }])} style={{ marginTop: 4 }}>+ 添加数量阶梯</Button>}
              </>
            )}
          </>
        ) : (
          <Form.Item label="每次奖励积分" style={{ marginBottom: 0 }}>
            <InputNumber size="small" min={1} max={10000} value={rewardPoints} onChange={v => setRewardPoints(v || 0)} addonAfter="分/次" />
          </Form.Item>
        )}
      </Card>

      {/* 会员条件 */}
      <Card size="small" title="会员条件" extra={<Text type="secondary" style={{ fontSize: 11 }}>可选</Text>}>
        <Form.Item label="等级" style={{ marginBottom: 4 }}>
          <Checkbox.Group options={tierOptions} value={memberTiers} onChange={v => setMemberTiers(v as string[])} />
        </Form.Item>
        {selectedEntity === 'ORDER' && (
          <Form.Item label="金额门槛" style={{ marginBottom: 4 }}>
            <InputNumber size="small" min={0} max={999999} value={minAmount} onChange={v => setMinAmount(v || 0)} addonAfter="元" />
          </Form.Item>
        )}
        {tradeStatusOptions.length > 0 && (
          <Form.Item label="交易状态" style={{ marginBottom: 0 }}>
            <Checkbox.Group options={tradeStatusOptions} value={tradeStatus} onChange={v => setTradeStatus(v as string[])} />
          </Form.Item>
        )}
      </Card>
    </div>,

    // ② 等级加成
    <div key="s1">
      {tierBonuses.map((tb, i) => (
        <Row gutter={8} key={tb.key} style={{ marginBottom: 8 }}>
          <Col span={10}><Select value={tb.tier} options={tierOptions} style={{ width: '100%' }} onChange={v => { const n = [...tierBonuses]; n[i] = { ...n[i], tier: v }; setTierBonuses(n); }} /></Col>
          <Col span={9}><InputNumber value={tb.bonus} min={1} style={{ width: '100%' }} onChange={v => { const n = [...tierBonuses]; n[i] = { ...n[i], bonus: v || 0 }; setTierBonuses(n); }} addonAfter="分" /></Col>
          <Col span={5}>{i === tierBonuses.length - 1 ? <Button size="small" type="dashed" block onClick={() => setTierBonuses([...tierBonuses, { key: String(Date.now()), tier: 'SILVER', bonus: 0 }])}>+</Button> : <Button size="small" type="link" danger onClick={() => setTierBonuses(tierBonuses.filter((_, j) => j !== i))}>×</Button>}</Col>
        </Row>
      ))}
    </div>,

    // ③ AI
    <div key="s2">
      <Alert type="info" message="🤖 AI 活动规则助手" description="用自然语言描述营销活动，AI 生成 DRL 脚本附加到规则末尾。" style={{ marginBottom: 16 }} />
      <Input.TextArea value={aiPrompt} onChange={e => setAiPrompt(e.target.value)} placeholder="如: 618大促期间，手机品类满3件额外赠200积分" rows={3} />
      <Button icon={<ThunderboltOutlined />} onClick={handleAiGenerate} loading={aiLoading} type="primary" style={{ marginTop: 8 }}>生成</Button>
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
          {currentStep < 2 ? <Button type="primary" icon={<RightOutlined />} onClick={() => setCurrentStep(currentStep + 1)}>下一步</Button> : <Button type="primary" icon={<CheckOutlined />} onClick={handleSave}>完成配置</Button>}
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
          <Alert type={publishModal.level === 'YELLOW' ? 'warning' : 'error'} message={publishModal.level === 'YELLOW' ? '部分用例与基线不一致' : '多个用例与基线严重不一致'} style={{ marginBottom: 16 }} />
          <Descriptions bordered size="small" column={2}><Descriptions.Item label="总用例数">{publishModal.report.totalCases}</Descriptions.Item><Descriptions.Item label="差异数"><Tag color={publishModal.level === 'YELLOW' ? 'orange' : 'red'}>{publishModal.report.diffCount}</Tag></Descriptions.Item></Descriptions>
          {publishModal.level === 'RED' && (<div style={{ marginTop: 16 }}><Text strong>强制放行理由：</Text><Input.TextArea value={forceReason} onChange={e => setForceReason(e.target.value)} rows={2} placeholder="请说明..." style={{ marginTop: 8 }} /></div>)}
          <Divider /><Space style={{ justifyContent: 'flex-end', width: '100%' }}>
            <Button onClick={() => setPublishModal({ open: false, level: '', report: null })}>{publishModal.level === 'YELLOW' ? '返回修改' : '取消'}</Button>
            <Button type="primary" danger={publishModal.level === 'RED'} onClick={publishModal.level === 'YELLOW' ? async () => { try { await api.post(`/admin/rules/${id || '0'}/publish`); message.success('已发布'); setPublishModal({ open: false, level: '', report: null }); navigate('/rules'); } catch (e: any) { message.error(e?.message || '发布失败'); } } : handleForcePublish}>{publishModal.level === 'YELLOW' ? '仍要发布' : '强制发布'}</Button>
          </Space>
        </>)}
      </Modal>
    </PageWrapper>
  );
};

export default RuleEditor;