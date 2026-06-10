import React, { useState, useMemo, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Card, Form, Input, InputNumber, Select, Button, message, Space, Modal, Tag,
  Typography, Alert, Descriptions, Divider, Steps, Collapse, Checkbox, Radio, Row, Col, DatePicker,
} from 'antd';
import {
  SaveOutlined, ThunderboltOutlined, SendOutlined, SettingOutlined,
  GiftOutlined, LeftOutlined, RightOutlined, CheckOutlined, CopyOutlined, EditOutlined, DeleteOutlined, EyeOutlined,
} from '@ant-design/icons';
import PageWrapper from '../components/PageWrapper';
import api from '../api';
import dayjs from 'dayjs';

const { Title, Text } = Typography;
const { Panel } = Collapse;

type Option = { label: string; value: string };
type SchemaField = Option & { type: string; format?: string; enumValues?: string[] };
interface ExtCondition { key: string; field: string; type?: string; format?: string; op: string; value: string; valueEnd?: string; entity?: string; }
interface TierBonus { key: string; tier: string; bonus: number; }
interface PointFormula { key: string; pointType: string; field: string; multiplier: number; }
interface TierFormula { key: string; tier: string; pointType: string; multiplier: number; }
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
  const defaultPointType = (data.pointFormulas?.[0]?.pointType) || 'REWARD';
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
  lines.push(`  salience ${data.salience || 100}`);
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
    const isMemberField = c.entity === 'MEMBER';
    const obj = isMemberField ? '$member' : '$event';
    const fn = isMemberField ? (c.type === 'number' ? 'getExtNumber' : 'getExtString') : (c.type === 'number' ? 'getPayloadNumber' : 'getPayloadString');
    if (c.op === 'BETWEEN' || c.op === 'BETWEEN_EQ') {
      const v1 = isNaN(Number(c.value)) ? `"${c.value}"` : c.value;
      const v2 = isNaN(Number(c.valueEnd)) ? `"${c.valueEnd}"` : c.valueEnd;
      const o = c.op === 'BETWEEN_EQ' ? '>=' : '>';
      const o2 = c.op === 'BETWEEN_EQ' ? '<=' : '<';
      conds.push(`    eval(${obj}.${fn}("${c.field}") ${o} ${v1} && ${obj}.${fn}("${c.field}") ${o2} ${v2})`);
    } else {
      const v = isNaN(Number(c.value)) ? `"${c.value}"` : c.value;
      conds.push(`    eval(${obj}.${fn}("${c.field}") ${c.op} ${v})`);
    }
  }

  lines.push(conds.join(',\n'));
  lines.push('  then');
  const actions: string[] = [];

  if (entity === 'ORDER') {
    if (calcMode === 'total') {
      // Multi point-type formulas
      const pfs: PointFormula[] = data.pointFormulas || [];
      if (pfs.length > 0) {
        // Declare base value once
        actions.push(`    java.math.BigDecimal _base = $event.getPayloadNumber("${pfs[0].field || 'total_amount'}");`);
        // Generate one awardPoints per formula (基础积分 — 无上限)
        for (const pf of pfs) {
          if (!pf.pointType || !pf.multiplier) continue;
          actions.push(`    collector.awardPoints($event.getProgramCode(), $event.getMemberId(), "${pf.pointType}", _base.multiply(new java.math.BigDecimal("${pf.multiplier}")).setScale(0, java.math.RoundingMode.DOWN), "${safeName}", null);`);
        }
      }
      // 积分活动额外奖励
      if (data.campaignReward > 0) {
        actions.push(`    // campaign extra reward`);
        actions.push(`    java.math.BigDecimal _campaign = new java.math.BigDecimal("${data.campaignReward}");`);
        if (data.maxPoints > 0) actions.push(`    if (_campaign.compareTo(new java.math.BigDecimal("${data.maxPoints}")) > 0) _campaign = new java.math.BigDecimal("${data.maxPoints}");`);
        actions.push(`    collector.awardPoints($event.getProgramCode(), $event.getMemberId(), "${data.campaignPointType || 'REWARD'}", _campaign, "${safeName}_CAMPAIGN", null);`);
      }
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
      if (perItem > 0) actions.push(`    collector.awardPoints($event.getProgramCode(), $event.getMemberId(), "${defaultPointType}", _pts, "${safeName}", null);`);
    }
  } else if (data.rewardPoints > 0) {
    actions.push(`    collector.awardPoints($event.getProgramCode(), $event.getMemberId(), "${defaultPointType}", new java.math.BigDecimal("${data.rewardPoints}"), "${safeName}", null);`);
  }

  // Tier formulas: extra multiplier on specific point types
  const tfs: TierFormula[] = data.tierFormulas || [];
  for (const tf of tfs) {
    if (!tf.tier || !tf.pointType || !tf.multiplier) continue;
    actions.push(`    if ("${tf.tier}".equals($member.getTierCode())) { collector.awardPoints($event.getProgramCode(), $event.getMemberId(), "${tf.pointType}", _base.multiply(new java.math.BigDecimal("${tf.multiplier}")).setScale(0, java.math.RoundingMode.DOWN), "${safeName}_TIER", null); }`);
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
  const [salience, setSalience] = useState(100);

  // ① 业务实体配置
  const [ruleMode, setRuleMode] = useState<'base' | 'campaign'>('base');
  const [selectedEntity, setSelectedEntity] = useState('ORDER');
  const [pointFormulas, setPointFormulas] = useState<PointFormula[]>([
    { key: '1', pointType: 'REWARD', field: 'order_amount', multiplier: 1 },
    { key: '2', pointType: 'TIER', field: 'order_amount', multiplier: 1 },
  ]);
  const [tierFormulas, setTierFormulas] = useState<TierFormula[]>([
    { key: '1', tier: 'GOLD', pointType: 'REWARD', multiplier: 0.2 },
    { key: '2', tier: 'PLATINUM', pointType: 'REWARD', multiplier: 0.3 },
  ]);
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
  const [campaignPointType, setCampaignPointType] = useState('REWARD');
  const [campaignReward, setCampaignReward] = useState(0);
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
    ruleName, agendaGroup, salience, selectedEntity, frequencyLimit,
    channels, memberTiers, minAmount, tradeStatus, extConditions,
    calcMode, pointFormulas, floorPoints, maxPoints, perItemPoints, categoryWeights, quantityTiers,
    rewardPoints, tierFormulas, campaignPointType, campaignReward, aiGeneratedDrl,
  }), [ruleName, agendaGroup, salience, selectedEntity, frequencyLimit,
    channels, memberTiers, minAmount, tradeStatus, extConditions,
    calcMode, pointFormulas, floorPoints, maxPoints, perItemPoints, categoryWeights, quantityTiers,
    rewardPoints, tierFormulas, campaignPointType, campaignReward, aiGeneratedDrl]);

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
            <Button size="small" type="link" style={{ padding: 0 }} icon={<EditOutlined style={{ fontSize: 13, color: '#595959' }} />} onClick={() => setEditingCondIdx(idx)} />
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
    { title: '基础规则配置', icon: <SettingOutlined /> },
    { title: 'AI 活动', icon: <ThunderboltOutlined /> },
  ];

  const stepContent = [
    // ① 业务实体配置
    <div key="s0">
      {selectedEntity === 'BEHAVIOR' && (
        <Row gutter={16} style={{ marginBottom: 16 }}>
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

      {/* 业务实体选择 — 全部展示，点击选中 */}
      <div style={{ marginBottom: 12 }}>
        <Text type="secondary" style={{ fontSize: 12, marginBottom: 4, display: 'block' }}>业务实体</Text>
        <Space wrap>
          {entityOptions.map(e => (
            <Button key={e.value}
              type={selectedEntity === e.value ? 'primary' : 'default'}
              size="small"
              onClick={() => { setSelectedEntity(e.value); }}
            >
              {e.label}
            </Button>
          ))}
        </Space>
      </div>

      {/* 第三行: 选中实体属性 — 平铺展示，点击添加到条件列表 */}
      <Card size="small" title={<Space><Tag color="blue">{selectedEntity}</Tag>可用属性</Space>}
        extra={<Text type="secondary" style={{ fontSize: 11 }}>点击属性添加为条件</Text>}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {schemaFields.filter(f => f.type !== 'array').map(f => {
            const added = extConditions.some(c => c.field === f.value && c.entity === selectedEntity);
            return (
              <Tag key={f.value}
                style={{ cursor: 'pointer', fontSize: 12, padding: '2px 10px', border: added ? `1px solid ${f.format === 'date-time' ? '#fa8c16' : f.type === 'number' ? '#1677ff' : '#52c41a'}` : '1px dashed #d9d9d9', background: added ? '#f0f5ff' : '#fff' }}
                color={added ? (f.type === 'number' ? 'blue' : f.type === 'string' ? 'green' : 'orange') : undefined}
                onClick={() => {
                  const exists = extConditions.findIndex(c => c.field === f.value);
                  if (exists >= 0) {
                    setEditingCondIdx(exists);
                  } else {
                    const newIdx = extConditions.length;
                    setExtConditions([...extConditions, { key: String(Date.now()), field: f.value, type: f.type, format: f.format, entity: selectedEntity, op: f.type === 'number' || f.format ? '>=' : '==', value: '' }]);
                    setEditingCondIdx(newIdx);
                  }
                }}
              >
                {added ? '✓ ' : '+ '}{f.label}
              </Tag>
            );
          })}
        </div>
      </Card>

      {/* 已添加的条件 — 按实体分组 */}
      {extConditions.filter(c => c.field).length > 0 && (
        <Card size="small" title={<Space><Tag color="green">{extConditions.filter(c => c.field).length}</Tag>已添加的条件</Space>} style={{ marginTop: 12 }}>
          {(() => {
            const grouped = new Map<string, ExtCondition[]>();
            extConditions.filter(c => c.field).forEach(c => {
              const ent = c.entity || 'OTHER';
              if (!grouped.has(ent)) grouped.set(ent, []);
              grouped.get(ent)!.push(c);
            });
            return Array.from(grouped.entries()).map(([entity, conds]) => (
              <div key={entity} style={{ marginBottom: 8 }}>
                <Tag color="blue" style={{ marginBottom: 4 }}>{entity}</Tag>
                {conds.map((c, i) => {
                  const globalIdx = extConditions.findIndex(x => x.key === c.key);
                  const fm = schemaFields.find(f => f.value === c.field) || { label: c.field, value: c.field, type: c.type || 'string' } as SchemaField;
                  const isEditing = editingCondIdx === globalIdx;
            return (
              <div key={c.key} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: isEditing ? '6px 8px' : '4px 0', background: isEditing ? '#fffbe6' : 'transparent', borderRadius: 4, flexWrap: 'wrap' }}>
                <Tag color={c.type === 'number' ? 'blue' : c.format === 'date-time' ? 'orange' : 'green'} style={{ margin: 0, flexShrink: 0 }}>{fm?.label || c.field}</Tag>
                {isEditing ? (
                  <>
                    <Select size="small" value={c.op} options={getOpsForField(c.type, c.format)} style={{ width: c.op?.startsWith('BETWEEN') ? 120 : 70 }}
                      onChange={v => { const n = [...extConditions]; n[i] = { ...n[i], op: v, value: '', valueEnd: '' }; setExtConditions(n); }} />
                    {c.op?.startsWith('BETWEEN') ? (
                      <Space size={4}>
                        {c.format === 'date-time' ? <DatePicker size="small" showTime format="YYYY-MM-DD HH:mm:ss" placeholder="起始" style={{ width: 150 }} value={c.value ? dayjs(c.value) : null} onChange={(d) => { const n = [...extConditions]; n[i] = { ...n[i], value: d ? d.format('YYYY-MM-DD HH:mm:ss') : '' }; setExtConditions(n); }} /> : <InputNumber size="small" placeholder="起始" style={{ width: 80 }} value={c.value ? Number(c.value) : undefined} onChange={v => { const n = [...extConditions]; n[i] = { ...n[i], value: String(v ?? '') }; setExtConditions(n); }} />}
                        <Text type="secondary">~</Text>
                        {c.format === 'date-time' ? <DatePicker size="small" showTime format="YYYY-MM-DD HH:mm:ss" placeholder="结束" style={{ width: 150 }} value={c.valueEnd ? dayjs(c.valueEnd) : null} onChange={(d) => { const n = [...extConditions]; n[i] = { ...n[i], valueEnd: d ? d.format('YYYY-MM-DD HH:mm:ss') : '' }; setExtConditions(n); }} /> : <InputNumber size="small" placeholder="结束" style={{ width: 80 }} value={c.valueEnd ? Number(c.valueEnd) : undefined} onChange={v => { const n = [...extConditions]; n[i] = { ...n[i], valueEnd: String(v ?? '') }; setExtConditions(n); }} />}
                      </Space>
                    ) : c.type === 'number' ? (
                      <InputNumber size="small" placeholder="数值" style={{ width: 100 }} value={c.value ? Number(c.value) : undefined} onChange={v => { const n = [...extConditions]; n[i] = { ...n[i], value: String(v ?? '') }; setExtConditions(n); }} onPressEnter={() => setEditingCondIdx(null)} />
                    ) : fm?.enumValues?.length ? (
                      <Select size="small" style={{ width: 140 }} value={c.value || undefined} options={fm.enumValues.map(e => ({ label: e, value: e }))} onChange={v => { const n = [...extConditions]; n[i] = { ...n[i], value: v }; setExtConditions(n); setEditingCondIdx(null); }} />
                    ) : c.format === 'date-time' ? (
                      <DatePicker size="small" showTime format="YYYY-MM-DD HH:mm:ss" style={{ width: 170 }} value={c.value ? dayjs(c.value) : null} onChange={(d) => { const n = [...extConditions]; n[i] = { ...n[i], value: d ? d.format('YYYY-MM-DD HH:mm:ss') : '' }; setExtConditions(n); setEditingCondIdx(null); }} />
                    ) : (
                      <Input size="small" placeholder="输入值" style={{ width: 120 }} value={c.value} onChange={e => { const n = [...extConditions]; n[i] = { ...n[i], value: e.target.value }; setExtConditions(n); }} onPressEnter={() => setEditingCondIdx(null)} />
                    )}
                    <Button size="small" type="link" onClick={() => setEditingCondIdx(null)}>确定</Button>
                    <Button size="small" type="link" danger onClick={() => { setExtConditions(extConditions.filter((_, j) => j !== i)); setEditingCondIdx(null); }}>×</Button>
                  </>
                ) : (
                  <>
                    <Text style={{ fontSize: 12 }}>{c.op?.startsWith('BETWEEN') ? `${c.op === 'BETWEEN_EQ' ? '区间[含]' : '区间'} ${c.value || '?'} ~ ${c.valueEnd || '?'}` : `${c.op} ${c.value || '(未设置)'}`}</Text>
                    <Button size="small" type="link" style={{ padding: 0 }} icon={<EditOutlined style={{ fontSize: 13, color: '#595959' }} />} onClick={() => setEditingCondIdx(globalIdx)}>编辑</Button>
                    <Button size="small" type="link" style={{ padding: 0 }} icon={<DeleteOutlined style={{ fontSize: 13, color: '#8c8c8c' }} />} onClick={() => setExtConditions(extConditions.filter((_, j) => j !== globalIdx))} />
                  </>
                )}
              </div>
            );})}
            </div>
          ));})()}
        </Card>
      )}

      <Divider style={{ margin: '12px 0' }} />

      {/* 俱乐部基础积分 — 稳定，不常变 */}
      <Card size="small" title={<Space><Tag color="blue">基础积分</Tag>俱乐部基础规则</Space>}
        extra={<Text type="secondary" style={{ fontSize: 11 }}>设置后不常变更</Text>}>
        {selectedEntity === 'ORDER' ? (
          <>
            {pointFormulas.map((pf, i) => (
              <Row gutter={6} key={pf.key} style={{ marginBottom: 4 }} align="middle">
                <Col span={8}>
                  <Select size="small" value={pf.pointType} options={pointTypeOptions} style={{ width: '100%' }}
                    onChange={v => { const n = [...pointFormulas]; n[i] = { ...n[i], pointType: v }; setPointFormulas(n); }} />
                </Col>
                <Col span={2}><Text type="secondary" style={{ fontSize: 12 }}>=</Text></Col>
                <Col span={6}>
                  <Select size="small" value={pf.field} options={schemaFields.filter(f => f.type === 'number').map(f => ({ label: f.value, value: f.value }))} style={{ width: '100%' }}
                    onChange={v => { const n = [...pointFormulas]; n[i] = { ...n[i], field: v }; setPointFormulas(n); }} />
                </Col>
                <Col span={2}><Text type="secondary" style={{ fontSize: 12 }}>×</Text></Col>
                <Col span={4}>
                  <InputNumber size="small" min={0.1} step={0.1} value={pf.multiplier} style={{ width: '100%' }}
                    onChange={v => { const n = [...pointFormulas]; n[i] = { ...n[i], multiplier: v || 0 }; setPointFormulas(n); }} />
                </Col>
                <Col span={2}>
                  {pointFormulas.length > 1 && (
                    <Button size="small" type="link" style={{ padding: 0 }} icon={<DeleteOutlined style={{ fontSize: 13, color: '#8c8c8c' }} />}
                      onClick={() => setPointFormulas(pointFormulas.filter((_, j) => j !== i))} />
                  )}
                </Col>
              </Row>
            ))}
            <Button size="small" type="dashed" onClick={() => setPointFormulas([...pointFormulas, { key: String(Date.now()), pointType: 'REWARD', field: 'order_amount', multiplier: 1 }])}>
              + 添加积分类型</Button>
          </>
        ) : (
          <Form.Item label="每次奖励积分" style={{ marginBottom: 0 }}>
            <InputNumber size="small" min={1} max={10000} value={rewardPoints} onChange={v => setRewardPoints(v || 0)} addonAfter="分/次" />
          </Form.Item>
        )}
      </Card>

      {/* 等级奖励 */}
      <Card size="small" title={<Space><Tag color="green">等级奖励</Tag>会员等级额外奖励</Space>} style={{ marginTop: 12 }}>
        {tierFormulas.map((tf, i) => (
          <Row gutter={6} key={tf.key} style={{ marginBottom: 4 }} align="middle">
            <Col span={5}>
              <Select size="small" value={tf.tier} options={tierOptions} style={{ width: '100%' }}
                onChange={v => { const n = [...tierFormulas]; n[i] = { ...n[i], tier: v }; setTierFormulas(n); }} />
            </Col>
            <Col span={2}><Text type="secondary" style={{ fontSize: 12 }}>→</Text></Col>
            <Col span={7}>
              <Select size="small" value={tf.pointType} options={pointTypeOptions} style={{ width: '100%' }}
                onChange={v => { const n = [...tierFormulas]; n[i] = { ...n[i], pointType: v }; setTierFormulas(n); }} />
            </Col>
            <Col span={2}><Text type="secondary" style={{ fontSize: 12 }}>×</Text></Col>
            <Col span={5}>
              <InputNumber size="small" min={0.1} step={0.1} value={tf.multiplier} style={{ width: '100%' }}
                onChange={v => { const n = [...tierFormulas]; n[i] = { ...n[i], multiplier: v || 0 }; setTierFormulas(n); }} />
            </Col>
            <Col span={3}>
              <Button size="small" type="link" style={{ padding: 0 }} icon={<DeleteOutlined style={{ fontSize: 13, color: '#8c8c8c' }} />}
                onClick={() => setTierFormulas(tierFormulas.filter((_, j) => j !== i))} />
            </Col>
          </Row>
        ))}
        <Button size="small" type="dashed" onClick={() => setTierFormulas([...tierFormulas, { key: String(Date.now()), tier: 'SILVER', pointType: pointFormulas[0]?.pointType || 'REWARD', multiplier: 0.1 }])}>
          + 添加等级奖励</Button>
      </Card>

      </div>,

    // ② AI 活动
    <div key="s1">
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
          <Col span={6}><Form.Item label="规则名称" style={{ marginBottom: 0 }}><Input placeholder="例如：618手机品类奖励" value={ruleName} onChange={e => setRuleName(e.target.value)} /></Form.Item></Col>
          <Col span={6}><Form.Item label="规则代码" style={{ marginBottom: 0 }}><Input placeholder="自动生成" value={ruleCode} onChange={e => setRuleCode(e.target.value)} /></Form.Item></Col>
          <Col span={6}><Form.Item label="规则组" style={{ marginBottom: 0 }}><Select value={agendaGroup} onChange={setAgendaGroup} options={AGENDA_GROUPS} style={{ width: '100%' }} /></Form.Item></Col>
          <Col span={6}><Form.Item label="优先级" style={{ marginBottom: 0 }}><InputNumber min={0} max={1000} value={salience} onChange={v => setSalience(v || 0)} style={{ width: '100%' }} /></Form.Item></Col>
        </Row>
      </Card>

      <div style={{ marginBottom: 16, textAlign: 'center' }}>
        <Radio.Group value={ruleMode} onChange={e => setRuleMode(e.target.value)} size="large" buttonStyle="solid">
          <Radio.Button value="base">俱乐部基础规则</Radio.Button>
          <Radio.Button value="campaign">积分活动</Radio.Button>
        </Radio.Group>
      </div>

      {ruleMode === 'base' ? (
        <Card size="small" style={{ marginBottom: 16 }}>
          {stepContent[0]}
        </Card>
      ) : (
        <Card size="small" title={<Space><ThunderboltOutlined />积分活动配置</Space>}
          extra={<Text type="secondary" style={{ fontSize: 11 }}>独立于基础规则</Text>} style={{ marginBottom: 16 }}>
          <Form.Item label="活动积分类型">
            <Select size="small" value={campaignPointType} onChange={setCampaignPointType} options={pointTypeOptions} style={{ width: 200 }} />
          </Form.Item>
          <Form.Item label="额外奖励积分" tooltip="满足活动条件时额外赠送的积分">
            <InputNumber size="small" min={1} max={999999} value={campaignReward} onChange={v => setCampaignReward(v || 0)} addonAfter="分/单" />
          </Form.Item>
          <Form.Item label="活动上限" tooltip="活动奖励部分的单笔积分上限">
            <InputNumber size="small" min={0} max={999999} value={maxPoints} onChange={v => setMaxPoints(v || 0)} addonAfter="分/单" />
          </Form.Item>
          <Divider />
          <Text type="secondary" style={{ fontSize: 12 }}>活动条件通过 AI 配置:</Text>
          {stepContent[1]}
        </Card>
      )}

      <Collapse activeKey={scriptExpanded ? ['s'] : []} onChange={ks => setScriptExpanded(ks.includes('s'))} style={{ background: '#fafafa' }}>
        <Panel header={<Space><EyeOutlined /><Text>查看脚本</Text><Tag color="blue">Drools DRL</Tag></Space>} key="s" extra={
          <Space onClick={e => e.stopPropagation()}>
            {manualEdit ? <Button size="small" onClick={() => { setManualEdit(false); message.info('已切换为自动生成'); }}>自动生成</Button> : <Button size="small" icon={<EditOutlined style={{ fontSize: 13, color: '#1a1a1a' }} />} onClick={handleManualEdit} />}
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