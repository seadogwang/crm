import React, { useState, useMemo, useEffect } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import {
  Card, Form, Input, InputNumber, Select, Button, message, Space, Modal, Tag,
  Typography, Alert, Descriptions, Divider, Steps, Collapse, Checkbox, Radio, Row, Col, DatePicker,
} from 'antd';
import {
  SaveOutlined, ThunderboltOutlined, SendOutlined, SettingOutlined,
  GiftOutlined, LeftOutlined, RightOutlined, CheckOutlined, CopyOutlined, EditOutlined, EyeOutlined, PlusOutlined,
} from '@ant-design/icons';
import api from '../api';
import dayjs from 'dayjs';
import PageWrapper from '../components/PageWrapper';
import { useCampaignStyles, TitleWithDesc } from './campaign/styles/campaign-ui-standard';

const { Title, Text } = Typography;
const { Panel } = Collapse;

type Option = { label: string; value: string; pointCategory?: string };
type SchemaField = Option & { type: string; format?: string; enumValues?: string[] };
interface ExtCondition { key: string; field: string; type?: string; format?: string; op: string; value: string; valueEnd?: string; entity?: string; }
interface TierBonus { key: string; tier: string; bonus: number; }
interface PointFormula { key: string; pointType: string; field: string; multiplier: number; }
interface TierFormula { key: string; tier: string; pointType: string; multiplier: number; }
interface CategoryWeight { key: string; cat: string; weight: number; }
interface QuantityTier { key: string; minQty: number; bonus: number; }
interface CounterItem { key: string; name: string; operator: '+' | '-'; startValue: number; step: number; }

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

const ENTITY_OPTIONS: Option[] = [
  { label: 'Order (订单)', value: 'ORDER' },
  { label: 'BEHAVIOR (行为)', value: 'BEHAVIOR' },
  { label: 'MEMBER (会员)', value: 'MEMBER' },
];

const RULE_CATEGORIES: Option[] = [
  { label: 'base (基础规则)', value: 'base' },
  { label: 'promo (促销活动)', value: 'promo' },
];

// ==================== DRL ====================

function generateDrl(data: Record<string, any>): string {
  const ruleName = data.ruleName || 'custom_rule';
  const safeName = ruleName.replace(/[^a-zA-Z0-9_]/g, '_');
  const ruleCategory = data.ruleCategory || 'purchase';
  const entity = (data.extConditions?.[0]?.entity) || 'ORDER';
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
  lines.push(`  agenda-group "${ruleCategory}"`);
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
      const pfs: PointFormula[] = data.pointFormulas || [];
      if (pfs.length > 0) {
        actions.push(`    java.math.BigDecimal _base = $event.getPayloadNumber("${pfs[0].field || 'total_amount'}");`);
        for (const pf of pfs) {
          if (!pf.pointType || !pf.multiplier) continue;
          actions.push(`    collector.awardPoints($event.getProgramCode(), $event.getMemberId(), "${pf.pointType}", _base.multiply(new java.math.BigDecimal("${pf.multiplier}")).setScale(0, java.math.RoundingMode.DOWN), "${safeName}", null);`);
        }
      }
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

  const tfs: TierFormula[] = data.tierFormulas || [];
  for (const tf of tfs) {
    if (!tf.tier || !tf.pointType || !tf.multiplier) continue;
    actions.push(`    if ("${tf.tier}".equals($member.getTierCode())) { collector.awardPoints($event.getProgramCode(), $event.getMemberId(), "${tf.pointType}", _base.multiply(new java.math.BigDecimal("${tf.multiplier}")).setScale(0, java.math.RoundingMode.DOWN), "${safeName}_TIER", null); }`);
  }
  if (actions.length === 0) actions.push('    System.out.println("rule fired: " + $event.getEventId());');

  // Counters: generate collector.incrementCounter() calls
  const counterList: CounterItem[] = data.counters || [];
  for (const ct of counterList) {
    if (!ct.name) continue;
    const step = ct.step || 1;
    actions.push(`    // counter: ${ct.name} ${ct.operator} ${step}`);
    actions.push(`    collector.incrementCounter($event.getProgramCode(), $event.getMemberId(), "${ct.name}", "${ct.operator}", ${step}, ${ct.startValue || 0}, "${safeName}", null);`);
  }

  lines.push(actions.join('\n'));
  lines.push('end');
  if (data.aiGeneratedDrl?.trim()) { lines.push(''); lines.push('// === AI-generated ==='); lines.push(data.aiGeneratedDrl.trim()); }
  return lines.join('\n');
}

// ==================== 内联编辑组件 ====================

const HoverInput: React.FC<{ value: string; onChange: (v: string) => void; w?: string; placeholder?: string }> = ({ value, onChange, w, placeholder }) => {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  if (editing) return <Input size="small" value={draft} autoFocus style={{ width: w || '100%' }} placeholder={placeholder} onChange={e => setDraft(e.target.value)} onBlur={() => { onChange(draft); setEditing(false); }} onPressEnter={() => { onChange(draft); setEditing(false); }} />;
  return <span style={{ cursor: 'pointer', padding: '4px 8px', borderRadius: 4, display: 'inline-block', width: w || '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', border: '1px solid transparent' }} onMouseEnter={e => { e.currentTarget.style.background = '#f5f5f5'; e.currentTarget.style.borderColor = '#d9d9d9'; }} onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.borderColor = 'transparent'; }} onClick={() => { setDraft(value); setEditing(true); }}>{value || <span style={{ color: '#ccc' }}>{placeholder || '点击编辑'}</span>}</span>;
};

const HoverNumber: React.FC<{ value: number; onChange: (v: number) => void; w?: number | string }> = ({ value, onChange, w }) => {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  if (editing) return <InputNumber size="small" value={draft} autoFocus style={{ width: typeof w === 'number' ? w : (w || '100%') }} onChange={v => setDraft(v ?? 0)} onBlur={() => { onChange(draft); setEditing(false); }} onPressEnter={() => { onChange(draft); setEditing(false); }} />;
  return <span style={{ cursor: 'pointer', padding: '4px 8px', borderRadius: 4, display: 'inline-block', width: typeof w === 'number' ? w : (w || '100%'), border: '1px solid transparent' }} onMouseEnter={e => { e.currentTarget.style.background = '#f5f5f5'; e.currentTarget.style.borderColor = '#d9d9d9'; }} onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.borderColor = 'transparent'; }} onClick={() => { setDraft(value); setEditing(true); }}>{value}</span>;
};

const HoverSelect: React.FC<{ value: string; onChange: (v: string) => void; options: Option[]; w?: number }> = ({ value, onChange, options, w }) => {
  const [editing, setEditing] = useState(false);
  const label = options.find(o => o.value === value)?.label || value;
  if (editing) return <Select size="small" value={value} autoFocus style={{ width: w || 60 }} options={options} onChange={v => { onChange(v); setEditing(false); }} onBlur={() => setEditing(false)} />;
  return <span style={{ cursor: 'pointer', padding: '4px 8px', borderRadius: 4, display: 'inline-block', textAlign: 'center', border: '1px solid transparent', fontWeight: 'bold', fontSize: 14 }} onMouseEnter={e => { e.currentTarget.style.background = '#f5f5f5'; e.currentTarget.style.borderColor = '#d9d9d9'; }} onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.borderColor = 'transparent'; }} onClick={() => setEditing(true)}>{label}</span>;
};

// ==================== 组件 ====================

const RuleEditor: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const isEdit = !!id;
  const [currentStep, setCurrentStep] = useState(0);

  const ruleType = searchParams.get('type') || 'base';
  const defaultCategory = ruleType === 'campaign' ? 'promo' : 'base';

  // 基本信息
  const [ruleName, setRuleName] = useState('');
  const [ruleCode, setRuleCode] = useState('');
  const [ruleCategory, setRuleCategory] = useState(defaultCategory);
  const [salience, setSalience] = useState(100);
  const [effectiveFrom, setEffectiveFrom] = useState<string>('');
  const [effectiveTo, setEffectiveTo] = useState<string>('');

  // 触发条件
  const [schemasByEntity, setSchemasByEntity] = useState<Record<string, SchemaField[]>>({});
  const [pointFormulas, setPointFormulas] = useState<PointFormula[]>([
    { key: '1', pointType: ruleType === 'tier' ? 'TIER' : 'REWARD', field: 'order_amount', multiplier: 1 },
  ]);
  const [counters, setCounters] = useState<CounterItem[]>([]);
  const [tierFormulas, setTierFormulas] = useState<TierFormula[]>([
    { key: '1', tier: 'GOLD', pointType: 'REWARD', multiplier: 0.2 },
    { key: '2', tier: 'PLATINUM', pointType: 'REWARD', multiplier: 0.3 },
  ]);

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

  // 等级加成
  const [tierBonuses, setTierBonuses] = useState<TierBonus[]>([
    { key: '1', tier: 'GOLD', bonus: 10 }, { key: '2', tier: 'PLATINUM', bonus: 20 },
  ]);

  // AI
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
  const [pointTypeOptions, setPointTypeOptions] = useState<Option[]>([]);
  const [channelOptions, setChannelOptions] = useState<Option[]>([]);
  const [tierOptions, setTierOptions] = useState<Option[]>([]);
  const [tradeStatusOptions, setTradeStatusOptions] = useState<Option[]>([]);

  // 编辑模式
  useEffect(() => {
    if (!id) return;
    api.get(`/admin/rules/${id}`).then(({ data }) => {
      const r = data?.data;
      if (!r) return;
      setRuleName(r.rule_name || '');
      setRuleCode(r.rule_code || '');
      setRuleCategory(r.rule_category || 'base');
      try {
        const meta = r.metadata ? (typeof r.metadata === 'string' ? JSON.parse(r.metadata) : r.metadata) : null;
        if (meta) {
          if (meta.pointFormulas) setPointFormulas(meta.pointFormulas);
          if (meta.tierFormulas) setTierFormulas(meta.tierFormulas);
          if (meta.extConditions) setExtConditions(meta.extConditions);
          if (meta.counters) setCounters(meta.counters);
          if (meta.salience) setSalience(meta.salience);
          if (meta.effectiveFrom) setEffectiveFrom(meta.effectiveFrom);
          if (meta.effectiveTo) setEffectiveTo(meta.effectiveTo);
        }
      } catch (e) {}
      if (r.drl_content) {
        setManualDrl(r.drl_content);
        setManualEdit(true);
        setScriptExpanded(true);
      }
    }).catch(() => {});
  }, [id]);

  // 加载全部实体 Schema
  useEffect(() => {
    const loadSchemas = async () => {
      const map: Record<string, SchemaField[]> = {};
      for (const ent of ['ORDER', 'BEHAVIOR', 'MEMBER']) {
        try {
          const { data } = await api.get(`/schemas/${ent}`);
          const s = data?.data?.schema || data?.data;
          map[ent] = Object.entries(s?.properties || {}).map(([k, v]: any) => ({
            label: `${v.title || k} (${k})`, value: k, type: v.type || 'string', format: v.format, enumValues: v.enum,
          }));
        } catch { map[ent] = []; }
      }
      setSchemasByEntity(map);
    };
    loadSchemas();

    api.get('/admin/tiers').then(({ data }) => {
      const d = data?.data;
      if (d?.pointTypes?.length) setPointTypeOptions(d.pointTypes.filter((p: any) => ruleType === 'tier' ? p.tierRelevant : !p.tierRelevant).map((p: any) => ({ label: p.name || p.typeCode, value: p.typeCode, pointCategory: p.pointCategory })));
      if (d?.tiers?.length) setTierOptions(d.tiers.map((t: any) => ({ label: `${t.tierCode} (${t.tierName || ''})`, value: t.tierCode })));
    }).catch(() => {});
    api.get('/admin/cache/enums').then(({ data }) => {
      const enums = data?.data?.enums;
      if (enums?.channel?.length) setChannelOptions(enums.channel.map((c: any) => ({ label: c.enum_name || c.enum_code, value: c.enum_code })));
    }).catch(() => {});
  }, []);

  const formData = useMemo(() => ({
    ruleName, ruleCategory, salience, effectiveFrom, effectiveTo, frequencyLimit,
    channels, memberTiers, minAmount, tradeStatus, extConditions,
    calcMode, pointFormulas, floorPoints, maxPoints, perItemPoints, categoryWeights, quantityTiers,
    rewardPoints, tierFormulas, campaignPointType, campaignReward, aiGeneratedDrl, counters,
  }), [ruleName, ruleCategory, salience, effectiveFrom, effectiveTo, frequencyLimit,
    channels, memberTiers, minAmount, tradeStatus, extConditions,
    calcMode, pointFormulas, floorPoints, maxPoints, perItemPoints, categoryWeights, quantityTiers,
    rewardPoints, tierFormulas, campaignPointType, campaignReward, aiGeneratedDrl, counters]);

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
      const meta = { pointFormulas, tierFormulas, extConditions, counters, salience, effectiveFrom, effectiveTo };
      const payload = { rule_code: ruleCode || `RULE_${Date.now()}`, rule_name: ruleName || '未命名规则', rule_category: ruleCategory, rule_type: 'DRL', drl_content: drlCode, status: 'DRAFT', metadata: meta };
      if (isEdit) await api.put(`/admin/rules/${id}`, payload); else await api.post('/admin/rules', payload);
      message.success('已保存草稿');
    } catch (e: any) { message.error(e?.message || '保存失败'); } finally { setSaving(false); }
  };
  const handlePublish = async () => {
    setPublishing(true);
    try {
      let ruleId = id ? Number(id) : null;
      const meta = { pointFormulas, tierFormulas, extConditions, counters, salience, effectiveFrom, effectiveTo };
      const payload = { rule_code: ruleCode || `RULE_${Date.now()}`, rule_name: ruleName || '未命名规则', rule_category: ruleCategory, rule_type: 'DRL', drl_content: drlCode, metadata: meta };
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

  const steps = [
    { title: '基础规则配置', icon: <SettingOutlined /> },
    { title: 'AI 活动', icon: <ThunderboltOutlined /> },
  ];

  const stepContent = [
    // 触发条件
    <div key="s0">
      <div style={{ background: '#fafafa', borderRadius: 6, padding: '10px 14px', marginBottom: 12, border: '1px solid #f0f0f0' }}>
        <Text strong style={{ fontSize: 14, color: '#262626', marginBottom: 6, display: 'block' }}>触发条件</Text>
        <div style={{ marginBottom: 8 }}>
          {extConditions.map((c, i) => {
            const condSchemas = schemasByEntity[c.entity || 'ORDER'] || [];
            const fm = condSchemas.find((f: SchemaField) => f.value === c.field);
            const attrOpts: Option[] = condSchemas.filter((f: SchemaField) => f.type !== 'array').map(f => ({ label: f.label, value: f.value }));
            return (
              <div key={c.key} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0', flexWrap: 'wrap' }}>
                <Select size="small" value={c.entity || 'ORDER'} style={{ width: 130 }} showSearch
                  options={ENTITY_OPTIONS}
                  onChange={v => {
                    const n = [...extConditions];
                    n[i] = { key: c.key, entity: v, field: '', type: 'string', op: '==', value: '' };
                    setExtConditions(n);
                  }} />
                <Select size="small" value={c.field || undefined} style={{ width: 160 }}
                  placeholder="选择属性" showSearch optionFilterProp="label"
                  options={attrOpts}
                  onChange={v => {
                    const n = [...extConditions];
                    const sf = condSchemas.find((f: SchemaField) => f.value === v);
                    n[i] = { ...n[i], field: v, type: sf?.type || 'string', format: sf?.format,
                      op: sf?.type === 'number' || sf?.format ? '>=' : '==', value: '' };
                    setExtConditions(n);
                  }} />
                {c.field ? (
                  <>
                    <Select size="small" value={c.op} style={{ width: c.op?.startsWith('BETWEEN') ? 110 : 70 }} showSearch
                      options={getOpsForField(c.type, c.format)}
                      onChange={v => { const n = [...extConditions]; n[i] = { ...n[i], op: v, value: '', valueEnd: '' }; setExtConditions(n); }} />
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
                        options={fm.enumValues.map((e: string) => ({ label: e, value: e }))}
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
                <Button size="small" type="text" style={{ padding: 0 }} icon={<span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 18, height: 18, borderRadius: '50%', border: '1px solid #262626' }}><svg width="8" height="8" viewBox="0 0 10 10" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M1 1L9 9M9 1L1 9" stroke="#262626" strokeWidth="1.5" strokeLinecap="round"/></svg></span>}
                  onClick={() => setExtConditions(extConditions.filter((_, j) => j !== i))} />
              </div>
            );
          })}
        </div>
        <Button size="small" type="dashed" icon={<PlusOutlined />}
          onClick={() => setExtConditions([...extConditions, { key: String(Date.now()), entity: 'ORDER', field: '', type: 'string', op: '==', value: '' }])}>
          添加条件</Button>
      </div>

      <Divider style={{ margin: '12px 0' }} />

      {/* 基础积分 */}
      <Card size="small" title={<Space><Tag color="blue">基础积分</Tag></Space>}
        extra={<Text type="secondary" style={{ fontSize: 11 }}>设置后不常变更</Text>}>
        {pointFormulas.map((pf, i) => {
              const isRecord = pointTypeOptions.find(o => o.value === pf.pointType)?.pointCategory === 'RECORD';
              return (
              <Row gutter={6} key={pf.key} style={{ marginBottom: 4 }} align="middle">
                <Col span={8}>
                  <Select size="small" value={pf.pointType} options={pointTypeOptions} style={{ width: '100%' }}
                    onChange={v => { const n = [...pointFormulas]; n[i] = { ...n[i], pointType: v }; setPointFormulas(n); }} />
                </Col>
                {isRecord ? (
                  <>
                    <Col span={2}><Text style={{ fontSize: 16, textAlign: 'center', display: 'block', color: '#262626' }}>=</Text></Col>
                    <Col span={6}>
                      <InputNumber size="small" min={0} value={pf.multiplier} style={{ width: '100%' }}
                        onChange={v => { const n = [...pointFormulas]; n[i] = { ...n[i], multiplier: v || 0 }; setPointFormulas(n); }} />
                    </Col>
                    <Col span={2} />
                    <Col span={4} />
                  </>
                ) : (
                  <>
                    <Col span={2}><Text style={{ fontSize: 16, textAlign: 'center', display: 'block', color: '#262626' }}>=</Text></Col>
                    <Col span={6}>
                      <Select size="small" value={pf.field} options={(schemasByEntity['ORDER'] || []).filter((f: SchemaField) => f.type === 'number').map((f: SchemaField) => ({ label: f.value, value: f.value }))} style={{ width: '100%' }}
                        onChange={v => { const n = [...pointFormulas]; n[i] = { ...n[i], field: v }; setPointFormulas(n); }} />
                    </Col>
                    <Col span={2}><Text style={{ fontSize: 16, textAlign: 'center', display: 'block', color: '#262626' }}>×</Text></Col>
                    <Col span={4}>
                      <InputNumber size="small" min={0.1} step={0.1} value={pf.multiplier} style={{ width: '100%' }}
                        onChange={v => { const n = [...pointFormulas]; n[i] = { ...n[i], multiplier: v || 0 }; setPointFormulas(n); }} />
                    </Col>
                  </>
                )}
                <Col span={2} style={{ textAlign: 'center' }}>
                  {pointFormulas.length > 1 && (
                    <Button size="small" type="link" style={{ padding: 0 }} icon={<span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 18, height: 18, borderRadius: '50%', border: '1px solid #262626' }}><svg width="8" height="8" viewBox="0 0 10 10" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M1 1L9 9M9 1L1 9" stroke="#262626" strokeWidth="1.5" strokeLinecap="round"/></svg></span>}
                      onClick={() => setPointFormulas(pointFormulas.filter((_, j) => j !== i))} />
                  )}
                </Col>
              </Row>
            );})}
        {/* 计数器 */}
        {counters.map((ct, i) => (
          <Row gutter={6} key={ct.key} style={{ marginBottom: 4 }} align="middle">
            <Col span={8}>
              <Input size="small" value={ct.name} style={{ width: '100%' }} placeholder="变量名(英文)"
                onChange={e => { const n = [...counters]; n[i] = { ...n[i], name: e.target.value.replace(/[^a-zA-Z0-9_]/g, '') }; setCounters(n); }} />
            </Col>
            <Col span={2} style={{ textAlign: 'center' }}>
              <HoverSelect value={ct.operator}
                onChange={v => { const n = [...counters]; n[i] = { ...n[i], operator: v as '+' | '-' }; setCounters(n); }}
                options={[{ label: '+', value: '+' }, { label: '-', value: '-' }]} w={48} />
            </Col>
            <Col span={6}>
              <InputNumber size="small" addonBefore="起始值" value={ct.startValue} style={{ width: '100%' }}
                onChange={v => { const n = [...counters]; n[i] = { ...n[i], startValue: v ?? 0 }; setCounters(n); }} />
            </Col>
            <Col span={2} />
            <Col span={4}>
              <InputNumber size="small" addonBefore="跨度" value={ct.step} min={1} style={{ width: '100%' }}
                onChange={v => { const n = [...counters]; n[i] = { ...n[i], step: v || 1 }; setCounters(n); }} />
            </Col>
            <Col span={2} style={{ textAlign: 'center' }}>
              <Button size="small" type="link" style={{ padding: 0 }} icon={<span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 18, height: 18, borderRadius: '50%', border: '1px solid #262626' }}><svg width="8" height="8" viewBox="0 0 10 10" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M1 1L9 9M9 1L1 9" stroke="#262626" strokeWidth="1.5" strokeLinecap="round"/></svg></span>}
                onClick={() => setCounters(counters.filter((_, j) => j !== i))} />
            </Col>
          </Row>
        ))}
        <Space style={{ marginTop: 4 }}>
          <Button size="small" type="dashed" onClick={() => setPointFormulas([...pointFormulas, { key: String(Date.now()), pointType: 'REWARD', field: 'order_amount', multiplier: 1 }])}>
            + 添加积分类型</Button>
          <Button size="small" type="dashed" onClick={() => setCounters([...counters, { key: String(Date.now()), name: 'counter_1', operator: '+', startValue: 0, step: 1 }])}>
            + 添加计数器</Button>
        </Space>
      </Card>

      {ruleType !== 'tier' && (<>
      {/* 等级奖励 */}
      <Card size="small" title={<Space><Tag color="green">等级奖励</Tag></Space>} style={{ marginTop: 12 }}>
        {tierFormulas.map((tf, i) => (
          <Row gutter={6} key={tf.key} style={{ marginBottom: 4 }} align="middle">
            <Col span={5}>
              <Select size="small" value={tf.tier} options={tierOptions} style={{ width: '100%' }}
                onChange={v => { const n = [...tierFormulas]; n[i] = { ...n[i], tier: v }; setTierFormulas(n); }} />
            </Col>
            <Col span={2}><Text style={{ fontSize: 16, textAlign: 'center', display: 'block', color: '#262626' }}>→</Text></Col>
            <Col span={7}>
              <Select size="small" value={tf.pointType} options={pointTypeOptions} style={{ width: '100%' }}
                onChange={v => { const n = [...tierFormulas]; n[i] = { ...n[i], pointType: v }; setTierFormulas(n); }} />
            </Col>
            <Col span={2}><Text style={{ fontSize: 16, textAlign: 'center', display: 'block', color: '#262626' }}>×</Text></Col>
            <Col span={5}>
              <InputNumber size="small" min={0.1} step={0.1} value={tf.multiplier} style={{ width: '100%' }}
                onChange={v => { const n = [...tierFormulas]; n[i] = { ...n[i], multiplier: v || 0 }; setTierFormulas(n); }} />
            </Col>
            <Col span={3} style={{ textAlign: 'center' }}>
              <Button size="small" type="link" style={{ padding: 0 }} icon={<span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 18, height: 18, borderRadius: '50%', border: '1px solid #262626' }}><svg width="8" height="8" viewBox="0 0 10 10" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M1 1L9 9M9 1L1 9" stroke="#262626" strokeWidth="1.5" strokeLinecap="round"/></svg></span>}
                onClick={() => setTierFormulas(tierFormulas.filter((_, j) => j !== i))} />
            </Col>
          </Row>
        ))}
        <Button size="small" type="dashed" onClick={() => setTierFormulas([...tierFormulas, { key: String(Date.now()), tier: 'SILVER', pointType: pointFormulas[0]?.pointType || 'REWARD', multiplier: 0.1 }])}>
          + 添加等级奖励</Button>
      </Card>
      </>)}

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
        <Title level={4} style={{ margin: 0 }}>{isEdit ? `编辑规则 #${id}` : (ruleType === 'tier' ? '新建等级积分规则' : '新建积分规则')}</Title>
        <Space>
          <Button onClick={() => navigate(ruleType === 'tier' ? '/rules/tier' : '/rules')}>取消</Button>
          <Button icon={<SaveOutlined />} onClick={handleSave} loading={saving}>保存草稿</Button>
          <Button type="primary" icon={<SendOutlined />} loading={publishing} onClick={handlePublish}>发布</Button>
        </Space>
      </div>

      <Card size="small" style={{ marginBottom: 16 }}>
        <Row gutter={8}>
          <Col span={4}><Form.Item label="规则名称" style={{ marginBottom: 0 }}><Input size="small" placeholder="例如：618手机品类奖励" value={ruleName} onChange={e => setRuleName(e.target.value)} /></Form.Item></Col>
          <Col span={4}><Form.Item label="规则代码" style={{ marginBottom: 0 }}><Input size="small" placeholder="自动生成" value={ruleCode} onChange={e => setRuleCode(e.target.value)} /></Form.Item></Col>
          <Col span={4}><Form.Item label="规则组" style={{ marginBottom: 0 }}><Select size="small" value={ruleCategory} onChange={setRuleCategory} options={RULE_CATEGORIES} style={{ width: '100%' }} /></Form.Item></Col>
          <Col span={2}><Form.Item label="优先级" style={{ marginBottom: 0 }}><InputNumber size="small" min={0} max={1000} value={salience} onChange={v => setSalience(v || 0)} style={{ width: '100%' }} /></Form.Item></Col>
          <Col span={6}><Form.Item label="生效周期" style={{ marginBottom: 0 }}>
            <DatePicker.RangePicker size="small" showTime format="YYYY-MM-DD HH:mm:ss"
              placeholder={['开始时间', '结束时间(留空=永久)']}
              value={[effectiveFrom ? dayjs(effectiveFrom) : null, effectiveTo ? dayjs(effectiveTo) : null] as any}
              onChange={(dates) => { setEffectiveFrom(dates?.[0] ? dates[0].format('YYYY-MM-DD HH:mm:ss') : ''); setEffectiveTo(dates?.[1] ? dates[1].format('YYYY-MM-DD HH:mm:ss') : ''); }}
              style={{ width: '100%' }} />
          </Form.Item></Col>
        </Row>
      </Card>

      <Card size="small" style={{ marginBottom: 16 }}>
        {stepContent[0]}
      </Card>

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