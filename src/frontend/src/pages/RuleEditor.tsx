import React, { useState, useMemo, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Card, Form, Input, InputNumber, Select, Button, message, Space, Modal, Tag,
  Typography, Alert, Descriptions, Divider, Steps, Collapse, Checkbox, Radio, Row, Col,
  Tooltip, Popover,
} from 'antd';
import {
  SaveOutlined, ThunderboltOutlined, SendOutlined,
  DollarOutlined, FilterOutlined, GiftOutlined, EyeOutlined,
  LeftOutlined, RightOutlined, CheckOutlined, CopyOutlined, EditOutlined,
} from '@ant-design/icons';
import PageWrapper from '../components/PageWrapper';
import api from '../api';

const { Title, Text } = Typography;
const { Panel } = Collapse;

// ==================== 数据类型 ====================

interface ExtCondition {
  key: string;
  field: string;
  type?: string;
  op: string;
  value: string;
}

interface TierBonus {
  key: string;
  tier: string;
  bonus: number;
}

const OPS = [
  { label: '>', value: '>' },
  { label: '>=', value: '>=' },
  { label: '<', value: '<' },
  { label: '<=', value: '<=' },
  { label: '=', value: '==' },
  { label: '!=', value: '!=' },
  { label: '包含', value: 'contains' },
];

// 默认值（API 不可用时的降级）
const DEFAULT_eventTypeOptions = [
  { label: '订单支付', value: 'ORDER_PAID' },
  { label: '签到', value: 'CHECK_IN' },
  { label: '分享', value: 'SHARE' },
  { label: '退款', value: 'REFUND' },
  { label: '注册', value: 'REGISTER' },
];

const DEFAULT_channelOptions = [
  { label: '天猫', value: 'TMALL' },
  { label: '京东', value: 'JD' },
  { label: '抖音', value: 'DOUYIN' },
  { label: '微信', value: 'WECHAT_MINI' },
];

const DEFAULT_tierOptions = [
  { label: 'BASE', value: 'BASE' },
  { label: 'SILVER', value: 'SILVER' },
  { label: 'GOLD', value: 'GOLD' },
  { label: 'PLATINUM', value: 'PLATINUM' },
];

const DEFAULT_pointTypeOptions = [
  { label: '消费积分', value: 'REWARD_POINTS' },
  { label: '成长值', value: 'TIER_POINTS' },
  { label: '活动积分', value: 'CAMPAIGN_POINTS' },
];

type Option = { label: string; value: string };

const TIME_CONDITIONS = [
  { label: '周末', value: 'WEEKEND' },
  { label: '工作日', value: 'WEEKDAY' },
];

const AGENDA_GROUPS = [
  { label: 'purchase (购买)', value: 'purchase' },
  { label: 'behavior (行为)', value: 'behavior' },
  { label: 'campaign (活动)', value: 'campaign' },
  { label: 'refund (退款)', value: 'refund' },
];

// ==================== DRL 生成 ====================

function generateDrl(data: Record<string, any>): string {
  const ruleName = data.ruleName || data.rule_code || 'custom_rule';
  const safeName = ruleName.replace(/[^a-zA-Z0-9_一-龥]/g, '_');
  const agendaGroup = data.agenda_group || 'purchase';
  const ruleCategory = data.ruleCategory || 'ORDER';
  const frequencyLimit = data.frequencyLimit || 'unlimited';
  const lines: string[] = [];

  lines.push('package com.loyalty.platform.rules;');
  lines.push('');
  lines.push('import com.loyalty.platform.rules.drl.MemberFact;');
  lines.push('import com.loyalty.platform.rules.drl.EventFact;');
  lines.push('import com.loyalty.platform.rules.action.ActionCollector;');
  lines.push('');

  // 频率限制注释
  if (frequencyLimit !== 'unlimited') {
    lines.push(`// @frequency: ${frequencyLimit}`);
  }
  lines.push(`rule "${safeName}"`);
  lines.push(`  agenda-group "${agendaGroup}"`);
  lines.push('  when');

  // --- when 条件 ---
  const conditions: string[] = [];

  // 事件类型
  const eventTypes: string[] = data.eventTypes || [];
  if (eventTypes.length > 0) {
    const joined = eventTypes.map((t: string) => `"${t}"`).join(', ');
    conditions.push(`    $event: EventFact(eventType in (${joined}))`);
  } else {
    conditions.push('    $event: EventFact()');
  }

  // 会员等级
  const memberTiers: string[] = data.memberTiers || [];
  if (memberTiers.length > 0) {
    const joined = memberTiers.map((t: string) => `"${t}"`).join(', ');
    conditions.push(`    $member: MemberFact(memberId == $event.memberId, tierCode in (${joined}))`);
  } else {
    conditions.push('    $member: MemberFact(memberId == $event.memberId)');
  }

  // ORDER 类型: 金额条件
  if (ruleCategory === 'ORDER' && data.minAmount && data.minAmount > 0) {
    conditions.push(`    eval($event.getPayloadNumber("order_amount") >= ${data.minAmount})`);
  }

  // 渠道限制
  const channels: string[] = data.channels || [];
  if (channels.length > 0) {
    const joined = channels.map((c: string) => `"${c}"`).join(', ');
    conditions.push(`    eval(Arrays.asList(${joined}).contains($event.getChannel()))`);
  }

  // 扩展属性条件
  const extConditions: ExtCondition[] = data.extConditions || [];
  for (const cond of extConditions) {
    if (!cond.field || !cond.op || cond.value === undefined) continue;
    const v = isNaN(Number(cond.value)) ? `"${cond.value}"` : cond.value;
    conditions.push(`    eval($member.getExtNumber("${cond.field}") ${cond.op} ${v})`);
  }

  lines.push(conditions.join(',\n'));

  // --- then 动作 ---
  lines.push('  then');

  const actions: string[] = [];
  const basePoints = data.basePoints || 0;
  const rewardType = data.rewardType || 'fixed';
  const rewardPoints = data.rewardPoints || 0;
  const pointType = data.pointType || 'REWARD_POINTS';

  if (ruleCategory === 'ORDER') {
    // ORDER 类型: 按订单实付金额比例计算积分
    if (data.ratioPercent && data.ratioPercent > 0) {
      actions.push(`    java.math.BigDecimal _amount = $event.getPayloadNumber("order_amount");`);
      actions.push(`    java.math.BigDecimal _points = _amount.multiply(new java.math.BigDecimal("${data.ratioPercent / 100}")).setScale(0, java.math.RoundingMode.DOWN);`);
      actions.push(`    collector.awardPoints($event.getProgramCode(), $event.getMemberId(), "${pointType}", _points, "${safeName}", null);`);
    }
    // 最低保底积分
    if (rewardPoints > 0) {
      actions.push(`    collector.awardPoints($event.getProgramCode(), $event.getMemberId(), "${pointType}", new java.math.BigDecimal(${rewardPoints}), "${safeName}_BASE", null);`);
    }
  } else {
    // BEHAVIOR 类型: 按行为次数奖励固定积分
    if (rewardPoints > 0) {
      actions.push(`    // 行为奖励: ${frequencyLimit}`);
      actions.push(`    collector.awardPoints($event.getProgramCode(), $event.getMemberId(), "${pointType}", new java.math.BigDecimal(${rewardPoints}), "${safeName}", null);`);
    }
  }

  // 等级额外奖励（ORDER 和 BEHAVIOR 通用）
  const tierBonuses: TierBonus[] = data.tierBonuses || [];
  for (const tb of tierBonuses) {
    if (!tb.tier || !tb.bonus) continue;
    actions.push(`    // ${tb.tier} 额外奖励`);
    actions.push(`    if ("${tb.tier}".equals($member.getTierCode())) {`);
    actions.push(`      collector.awardPoints($event.getProgramCode(), $event.getMemberId(), "${pointType}", new java.math.BigDecimal(${tb.bonus}), "${safeName}_TIER", null);`);
    actions.push('    }');
  }

  if (actions.length === 0) {
    actions.push(`    System.out.println("规则触发: " + $event.getEventId());`);
  }

  lines.push(actions.join('\n'));
  lines.push('end');

  // AI 生成的额外规则
  if (data.aiGeneratedDrl && data.aiGeneratedDrl.trim()) {
    lines.push('');
    lines.push('// === AI 生成的活动规则 ===');
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
  const [form] = Form.useForm();

  // 动态选项（从后端 API 加载，降级到 DEFAULT）
  const [eventTypeOptions, setEventTypeOptions] = useState<Option[]>(DEFAULT_eventTypeOptions);
  const [channelOptions, setChannelOptions] = useState<Option[]>(DEFAULT_channelOptions);
  const [tierOptions, setTierOptions] = useState<Option[]>(DEFAULT_tierOptions);
  const [pointTypeOptions, setPointTypeOptions] = useState<Option[]>(DEFAULT_pointTypeOptions);
  const [transactionSchemaFields, setTransactionSchemaFields] = useState<Array<Option & { type: string }>>([]);
  const [orderSchemaFields, setOrderSchemaFields] = useState<Array<Option & { type: string }>>([]);
  const [behaviorSchemaFields, setBehaviorSchemaFields] = useState<Array<Option & { type: string }>>([]);
  const [memberSchemaFields, setMemberSchemaFields] = useState<Array<Option & { type: string }>>([]);

  useEffect(() => {
    // 从 /admin/tiers 获取积分类型和等级
    api.get('/admin/tiers').then(({ data }) => {
      const d = data?.data;
      if (d?.pointTypes?.length) {
        setPointTypeOptions(d.pointTypes.map((p: any) => ({
          label: p.name || p.typeCode, value: p.typeCode,
        })));
      }
      if (d?.tiers?.length) {
        setTierOptions(d.tiers.map((t: any) => ({
          label: `${t.tierCode} (${t.tierName || ''})`, value: t.tierCode,
        })));
      }
    }).catch(() => {});

    // 从 /admin/cache/enums 获取事件类型
    api.get('/admin/cache/enums').then(({ data }) => {
      const enums = data?.data?.enums;
      if (enums?.event_type?.length) {
        setEventTypeOptions(enums.event_type.map((e: any) => ({
          label: e.enum_name || e.enum_code, value: e.enum_code,
        })));
      }
      if (enums?.channel?.length) {
        setChannelOptions(enums.channel.map((c: any) => ({
          label: c.enum_name || c.enum_code, value: c.enum_code,
        })));
      }
    }).catch(() => {});

    // 从 Schema 获取业务实体字段定义
    api.get('/schemas/ORDER').then(({ data }) => {
      const schema = data?.data?.schema || data?.data;
      if (schema?.properties) {
        setOrderSchemaFields(Object.entries(schema.properties).map(([key, val]: any) => ({
          label: `${val.title || key} (${key})`, value: key, type: val.type || 'string',
        })));
      }
    }).catch(() => {});
    api.get('/schemas/BEHAVIOR').then(({ data }) => {
      const schema = data?.data?.schema || data?.data;
      if (schema?.properties) {
        setBehaviorSchemaFields(Object.entries(schema.properties).map(([key, val]: any) => ({
          label: `${val.title || key} (${key})`, value: key, type: val.type || 'string',
        })));
      }
    }).catch(() => {});
    api.get('/schemas/MEMBER').then(({ data }) => {
      const schema = data?.data?.schema || data?.data;
      if (schema?.properties) {
        setMemberSchemaFields(Object.entries(schema.properties).map(([key, val]: any) => ({
          label: `${val.title || key} (${key})`, value: key, type: val.type || 'string',
        })));
      }
    }).catch(() => {});
  }, []);

  // 表单数据
  const [ruleCode, setRuleCode] = useState('');
  const [ruleName, setRuleName] = useState('');
  const [agendaGroup, setAgendaGroup] = useState('purchase');
  const [ruleCategory, setRuleCategory] = useState<'ORDER' | 'BEHAVIOR'>('ORDER');
  const [frequencyLimit, setFrequencyLimit] = useState<'once' | 'once_per_day' | 'unlimited'>('unlimited');

  // ① 基础积分
  const [pointType, setPointType] = useState('REWARD_POINTS');
  const [basePoints, setBasePoints] = useState(10);
  const [eventTypes, setEventTypes] = useState<string[]>(['ORDER_PAID']);
  const [channels, setChannels] = useState<string[]>([]);

  // ② 触发条件
  const [memberTiers, setMemberTiers] = useState<string[]>(['GOLD']);
  const [minAmount, setMinAmount] = useState<number>(0);
  const [timeConditions, setTimeConditions] = useState<string[]>([]);
  const [extConditions, setExtConditions] = useState<ExtCondition[]>([
    { key: '1', field: '', op: '>', value: '' },
  ]);

  // ③ 奖励积分
  const [rewardType, setRewardType] = useState<'fixed' | 'ratio' | 'tiered'>('fixed');
  const [rewardPoints, setRewardPoints] = useState(20);
  const [ratioPercent, setRatioPercent] = useState(1);
  const [tierBonuses, setTierBonuses] = useState<TierBonus[]>([
    { key: '1', tier: 'GOLD', bonus: 5 },
    { key: '2', tier: 'PLATINUM', bonus: 10 },
  ]);

  // ④ 活动奖励
  const [aiPrompt, setAiPrompt] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [aiResult, setAiResult] = useState<any>(null);
  const [aiGeneratedDrl, setAiGeneratedDrl] = useState('');

  // 保存/发布
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [publishModal, setPublishModal] = useState<{ open: boolean; level: string; report: any }>({
    open: false, level: '', report: null,
  });
  const [forceReason, setForceReason] = useState('');

  // 脚本面板
  const [scriptExpanded, setScriptExpanded] = useState(false);
  const [manualEdit, setManualEdit] = useState(false);
  const [manualDrl, setManualDrl] = useState('');

  // 收集所有表单数据
  const formData = useMemo(() => ({
    rule_code: ruleCode,
    ruleName,
    agenda_group: agendaGroup,
    agendaGroup,
    ruleCategory,
    frequencyLimit,
    pointType,
    basePoints,
    eventTypes,
    channels,
    memberTiers,
    minAmount,
    timeConditions,
    extConditions,
    rewardType,
    rewardPoints,
    ratioPercent,
    tierBonuses,
    aiGeneratedDrl,
  }), [ruleCode, ruleName, agendaGroup, pointType, basePoints, eventTypes, channels,
    memberTiers, minAmount, timeConditions, extConditions, rewardType, rewardPoints,
    ratioPercent, tierBonuses, aiGeneratedDrl]);

  // 生成的 DRL
  const drlCode = useMemo(() => manualEdit ? manualDrl : generateDrl(formData),
    [formData, manualEdit, manualDrl]);

  // 复制到剪贴板
  const handleCopy = () => {
    navigator.clipboard.writeText(drlCode).then(() => message.success('已复制'));
  };

  // 开启手动编辑
  const handleManualEdit = () => {
    setManualDrl(drlCode);
    setManualEdit(true);
    setScriptExpanded(true);
  };

  // AI 生成规则
  const handleAiGenerate = async () => {
    if (!aiPrompt.trim()) { message.warning('请输入活动规则描述'); return; }
    setAiLoading(true);
    try {
      const { data } = await api.post('/admin/rules/generate', { prompt: aiPrompt });
      setAiResult(data?.data);
      if (data?.data?.drl_code) {
        setAiGeneratedDrl(data.data.drl_code);
      }
      message.success('AI 规则生成完成');
    } catch (e: any) {
      message.error(e.response?.data?.message || 'AI 生成失败');
    } finally {
      setAiLoading(false);
    }
  };

  // 保存草稿
  const handleSave = async () => {
    setSaving(true);
    try {
      const payload = {
        rule_code: ruleCode || `RULE_${Date.now()}`,
        rule_name: ruleName || '未命名规则',
        agenda_group: agendaGroup,
        rule_type: 'DRL',
        drl_content: drlCode,
        status: 'DRAFT',
      };
      if (isEdit) {
        await api.put(`/admin/rules/${id}`, payload);
      } else {
        await api.post('/admin/rules', payload);
      }
      message.success('规则已保存为草稿');
    } catch (e: any) {
      message.error(e.response?.data?.message || '保存失败');
    } finally {
      setSaving(false);
    }
  };

  // 发布流程
  const handlePublish = async () => {
    try {
      setPublishing(true);
      let ruleId = id ? Number(id) : null;
      const payload = {
        rule_code: ruleCode || `RULE_${Date.now()}`,
        rule_name: ruleName || '未命名规则',
        agenda_group: agendaGroup,
        rule_type: 'DRL',
        drl_content: drlCode,
      };

      if (isEdit) {
        await api.put(`/admin/rules/${id}`, payload);
      } else {
        const { data } = await api.post('/admin/rules', payload);
        ruleId = data?.data?.id;
      }

      try {
        const { data: testData } = await api.post(`/admin/rules/${ruleId}/validate`);
        const report = testData?.data;

        if (!report || report.level === 'PASS' || report.level === 'GREEN') {
          await api.post(`/admin/rules/${ruleId}/publish`);
          message.success('规则已发布！');
          navigate('/rules');
        } else if (report.level === 'WARNING' || report.level === 'YELLOW') {
          setPublishModal({ open: true, level: 'YELLOW', report });
        } else {
          setPublishModal({ open: true, level: 'RED', report });
        }
      } catch {
        await api.post(`/admin/rules/${ruleId || id}/publish`);
        message.success('规则已发布！');
        navigate('/rules');
      }
    } catch (e: any) {
      message.error(e.response?.data?.message || '发布失败');
    } finally {
      setPublishing(false);
    }
  };

  const handleForcePublish = async () => {
    if (!forceReason.trim()) { message.warning('请输入强制放行理由'); return; }
    try {
      const ruleId = id ? Number(id) : null;
      await api.post(`/admin/rules/${ruleId}/publish`, { forceOverride: true, reason: forceReason });
      message.success('规则已强制发布');
      setPublishModal({ open: false, level: '', report: null });
      navigate('/rules');
    } catch (e: any) { message.error(e.response?.data?.message || '发布失败'); }
  };

  // 步骤配置
  const steps = [
    { title: '基础积分', icon: <DollarOutlined /> },
    { title: '触发条件', icon: <FilterOutlined /> },
    { title: '奖励积分', icon: <GiftOutlined /> },
    { title: '活动奖励', icon: <ThunderboltOutlined /> },
  ];

  const renderStep0 = () => (
    <>
      <Form.Item label="规则类型" tooltip="订单类按金额比例计算积分，行为类按次数奖励">
        <Radio.Group value={ruleCategory} onChange={e => setRuleCategory(e.target.value)}>
          <Radio.Button value="ORDER">订单类 (按金额)</Radio.Button>
          <Radio.Button value="BEHAVIOR">行为类 (按次数)</Radio.Button>
        </Radio.Group>
      </Form.Item>

      <Form.Item label="积分类型" tooltip="选择此规则发放的积分类型">
        <Select value={pointType} onChange={setPointType} options={pointTypeOptions} style={{ width: 200 }} />
      </Form.Item>
      <Form.Item label="事件类型" tooltip="选择哪些事件触发此规则">
        <Checkbox.Group options={eventTypeOptions} value={eventTypes} onChange={v => setEventTypes(v as string[])} />
      </Form.Item>
      <Form.Item label="渠道限制" tooltip="留空表示所有渠道">
        <Checkbox.Group options={channelOptions} value={channels} onChange={v => setChannels(v as string[])} />
      </Form.Item>

      {ruleCategory === 'BEHAVIOR' && (
        <Form.Item label="频次限制" tooltip="控制该行为可重复奖励的次数">
          <Radio.Group value={frequencyLimit} onChange={e => setFrequencyLimit(e.target.value)}>
            <Radio.Button value="once">仅首次</Radio.Button>
            <Radio.Button value="once_per_day">每天一次</Radio.Button>
            <Radio.Button value="unlimited">每次均可</Radio.Button>
          </Radio.Group>
        </Form.Item>
      )}

      {ruleCategory === 'ORDER' ? (
        <Form.Item label="积分比例" tooltip="按订单实付金额的百分比计算积分">
          <InputNumber min={0.1} max={100} step={0.1} value={ratioPercent}
            onChange={v => setRatioPercent(v || 0)} addonAfter="%" style={{ width: 200 }} />
        </Form.Item>
      ) : (
        <Form.Item label="每次奖励积分" tooltip="每次行为触发时奖励的积分">
          <InputNumber min={1} max={10000} value={rewardPoints}
            onChange={v => setRewardPoints(v || 0)} addonAfter="分" />
        </Form.Item>
      )}
    </>
  );

  const renderStep1 = () => (
    <>
      <Form.Item label="会员等级" tooltip="留空表示所有等级">
        <Checkbox.Group options={tierOptions} value={memberTiers} onChange={v => setMemberTiers(v as string[])} />
      </Form.Item>

      {ruleCategory === 'ORDER' && (
        <Form.Item label="金额条件" tooltip="订单实付金额门槛，0 表示不限制">
          <InputNumber min={0} max={999999} value={minAmount} onChange={v => setMinAmount(v || 0)}
            addonAfter="元" style={{ width: 200 }} prefix="≥" />
      </Form.Item>
      )}
      <Form.Item label="时间条件" tooltip="限定特定时间段生效">
        <Checkbox.Group options={TIME_CONDITIONS} value={timeConditions} onChange={v => setTimeConditions(v as string[])} />
      </Form.Item>
      <Divider orientation="left" plain style={{ fontSize: 12 }}>
        触发字段条件 (来自 {ruleCategory === 'ORDER' ? 'ORDER' : 'BEHAVIOR'} Schema)
      </Divider>
      {extConditions.map((cond, idx) => {
        const schemaFields = ruleCategory === 'ORDER' ? orderSchemaFields : behaviorSchemaFields;
        return (
        <Row gutter={8} key={cond.key} style={{ marginBottom: 8 }}>
          <Col span={8}>
            <Select
              showSearch
              placeholder="选择字段"
              value={cond.field || undefined}
              options={schemaFields}
              style={{ width: '100%' }}
              onChange={v => {
                const next = [...extConditions];
                const sf = schemaFields.find(f => f.value === v);
                next[idx] = { ...next[idx], field: v, type: sf?.type || 'string' };
                setExtConditions(next);
              }}
            />
          </Col>
          <Col span={5}>
            <Select value={cond.op} options={OPS} style={{ width: '100%' }}
              onChange={v => {
                const next = [...extConditions];
                next[idx] = { ...next[idx], op: v };
                setExtConditions(next);
              }} />
          </Col>
          <Col span={6}>
            <Input placeholder="值" value={cond.value}
              onChange={e => {
                const next = [...extConditions];
                next[idx] = { ...next[idx], value: e.target.value };
                setExtConditions(next);
              }} />
          </Col>
          <Col span={5}>
            {idx === extConditions.length - 1 ? (
              <Button type="dashed" size="small" block onClick={() => setExtConditions([
                ...extConditions, { key: String(Date.now()), field: '', op: '>', value: '' },
              ])}>+</Button>
            ) : (
              <Button type="text" size="small" danger onClick={() =>
                setExtConditions(extConditions.filter((_, i) => i !== idx))
              }>×</Button>
            )}
          </Col>
        </Row>
        );
      })}
      {extConditions.length === 0 && (
        <Button type="dashed" size="small" onClick={() => setExtConditions([
          { key: String(Date.now()), field: '', op: '>', value: '' },
        ])}>+ 添加条件</Button>
      )}
    </>
  );

  const renderStep2 = () => (
    <>
      {ruleCategory === 'ORDER' && (
        <Form.Item label="保底积分" tooltip="订单满足条件时至少奖励的积分（选填）">
          <InputNumber min={0} max={100000} value={rewardPoints} onChange={v => setRewardPoints(v || 0)}
            addonAfter="分" />
        </Form.Item>
      )}

      <Divider orientation="left" plain style={{ fontSize: 12 }}>等级额外奖励</Divider>
      {tierBonuses.map((tb, idx) => (
        <Row gutter={8} key={tb.key} style={{ marginBottom: 8 }}>
          <Col span={10}>
            <Select value={tb.tier} options={tierOptions} style={{ width: '100%' }}
              onChange={v => {
                const next = [...tierBonuses];
                next[idx] = { ...next[idx], tier: v };
                setTierBonuses(next);
              }} />
          </Col>
          <Col span={9}>
            <InputNumber placeholder="额外加分" value={tb.bonus} min={1} style={{ width: '100%' }}
              onChange={v => {
                const next = [...tierBonuses];
                next[idx] = { ...next[idx], bonus: v || 0 };
                setTierBonuses(next);
              }} addonAfter="分" />
          </Col>
          <Col span={5}>
            {idx === tierBonuses.length - 1 ? (
              <Button type="dashed" size="small" block onClick={() => setTierBonuses([
                ...tierBonuses, { key: String(Date.now()), tier: 'SILVER', bonus: 0 },
              ])}>+</Button>
            ) : (
              <Button type="text" size="small" danger onClick={() =>
                setTierBonuses(tierBonuses.filter((_, i) => i !== idx))
              }>×</Button>
            )}
          </Col>
        </Row>
      ))}
    </>
  );

  const renderStep3 = () => (
    <>
      <Alert
        type="info"
        message="🤖 AI 活动规则助手"
        description="用自然语言描述营销活动规则，AI 将自动生成对应的 DRL 脚本并附加到规则中。"
        style={{ marginBottom: 16 }}
      />
      <Form.Item label="活动描述">
        <Input.TextArea
          value={aiPrompt}
          onChange={e => setAiPrompt(e.target.value)}
          placeholder="例如：618大促期间，购买手机品类满5000元，额外赠送200消费积分"
          rows={3}
          style={{ marginBottom: 8 }}
        />
      </Form.Item>
      <Button icon={<ThunderboltOutlined />} onClick={handleAiGenerate} loading={aiLoading} type="primary">
        生成活动规则
      </Button>

      {aiResult && (
        <Card size="small" style={{ marginTop: 12, background: '#f6ffed' }}>
          <Text strong>AI 分析：</Text>
          <Text style={{ fontSize: 12 }}>{aiResult.analysis}</Text>
          <pre style={{
            background: '#1e1e1e', color: '#d4d4d4', padding: 8, borderRadius: 4,
            fontSize: 11, maxHeight: 120, overflow: 'auto', marginTop: 8,
          }}>
            {aiResult.drl_code?.substring(0, 400)}
          </pre>
          {aiGeneratedDrl && <Tag color="green" style={{ marginTop: 8 }}>已附加到规则</Tag>}
        </Card>
      )}
    </>
  );

  const stepContent = [renderStep0, renderStep1, renderStep2, renderStep3];

  return (
    <PageWrapper>
      {/* 顶部标题栏 */}
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
        <Title level={4} style={{ margin: 0 }}>
          {isEdit ? `编辑规则 #${id}` : '新建规则'}
        </Title>
        <Space>
          <Button onClick={() => navigate('/rules')}>取消</Button>
          <Button icon={<SaveOutlined />} onClick={handleSave} loading={saving}>保存草稿</Button>
          <Button type="primary" icon={<SendOutlined />} loading={publishing} onClick={handlePublish}>
            发布
          </Button>
        </Space>
      </div>

      {/* 基本信息 */}
      <Card size="small" style={{ marginBottom: 16 }}>
        <Row gutter={16}>
          <Col span={8}>
            <Form.Item label="规则名称" style={{ marginBottom: 0 }}>
              <Input placeholder="例如：订单满100送10" value={ruleName}
                onChange={e => setRuleName(e.target.value)} />
            </Form.Item>
          </Col>
          <Col span={6}>
            <Form.Item label="规则代码" style={{ marginBottom: 0 }}>
              <Input placeholder="自动生成" value={ruleCode}
                onChange={e => setRuleCode(e.target.value)} />
            </Form.Item>
          </Col>
          <Col span={5}>
            <Form.Item label="议程组" style={{ marginBottom: 0 }}>
              <Select value={agendaGroup} onChange={setAgendaGroup} options={AGENDA_GROUPS} style={{ width: '100%' }} />
            </Form.Item>
          </Col>
        </Row>
      </Card>

      {/* 步骤导航 */}
      <Card size="small" style={{ marginBottom: 16 }}>
        <Steps current={currentStep} size="small" labelPlacement="vertical">
          {steps.map((s, i) => (
            <Steps.Step key={i} title={s.title} icon={s.icon} />
          ))}
        </Steps>
      </Card>

      {/* 当前步骤内容 */}
      <Card
        title={<Space>{steps[currentStep].icon}{steps[currentStep].title}</Space>}
        style={{ marginBottom: 16, minHeight: 220 }}
        extra={
          <Space>
            {currentStep > 0 && (
              <Button icon={<LeftOutlined />} onClick={() => setCurrentStep(currentStep - 1)}>上一步</Button>
            )}
            {currentStep < 3 ? (
              <Button type="primary" icon={<RightOutlined />} onClick={() => setCurrentStep(currentStep + 1)}>
                下一步
              </Button>
            ) : (
              <Button type="primary" icon={<CheckOutlined />} onClick={handleSave}>
                完成配置
              </Button>
            )}
          </Space>
        }
      >
        {stepContent[currentStep]()}
      </Card>

      {/* 脚本查看区（默认折叠） */}
      <Collapse
        activeKey={scriptExpanded ? ['script'] : []}
        onChange={keys => setScriptExpanded(keys.includes('script'))}
        style={{ background: '#fafafa' }}
      >
        <Panel
          header={
            <Space>
              <EyeOutlined />
              <Text>查看脚本</Text>
              <Tag color="blue">Drools DRL</Tag>
              <Text type="secondary" style={{ fontSize: 11 }}>（技术人员）</Text>
            </Space>
          }
          key="script"
          extra={
            <Space onClick={e => e.stopPropagation()}>
              {manualEdit ? (
                <Button size="small" onClick={() => { setManualEdit(false); message.info('已切换为自动生成模式'); }}>
                  自动生成
                </Button>
              ) : (
                <Button size="small" icon={<EditOutlined />} onClick={handleManualEdit}>
                  手动编辑
                </Button>
              )}
              <Button size="small" icon={<CopyOutlined />} onClick={handleCopy}>复制</Button>
            </Space>
          }
        >
          {manualEdit ? (
            <Input.TextArea
              value={manualDrl}
              onChange={e => setManualDrl(e.target.value)}
              rows={16}
              style={{ fontFamily: 'monospace', fontSize: 12, background: '#1e1e1e', color: '#d4d4d4' }}
            />
          ) : (
            <pre style={{
              background: '#1e1e1e', color: '#d4d4d4', padding: 12, borderRadius: 4,
              fontSize: 12, maxHeight: 300, overflow: 'auto', margin: 0,
              whiteSpace: 'pre-wrap', wordBreak: 'break-all',
            }}>
              {drlCode}
            </pre>
          )}
        </Panel>
      </Collapse>

      {/* 发布沙箱测试 Modal */}
      <Modal
        title={publishModal.level === 'YELLOW' ? '⚠️ 沙箱测试警告' : '🚨 沙箱测试严重警告'}
        open={publishModal.open}
        onCancel={() => setPublishModal({ open: false, level: '', report: null })}
        footer={null}
        width={600}
      >
        {publishModal.report && (
          <>
            <Alert
              type={publishModal.level === 'YELLOW' ? 'warning' : 'error'}
              message={publishModal.level === 'YELLOW'
                ? '部分测试用例结果与基线不一致，建议检查后发布'
                : '多个测试用例与基线严重不一致，不建议直接发布'}
              style={{ marginBottom: 16 }}
            />
            <Descriptions bordered size="small" column={2}>
              <Descriptions.Item label="总用例数">{publishModal.report.totalCases}</Descriptions.Item>
              <Descriptions.Item label="差异数">
                <Tag color={publishModal.level === 'YELLOW' ? 'orange' : 'red'}>
                  {publishModal.report.diffCount}
                </Tag>
              </Descriptions.Item>
            </Descriptions>

            {publishModal.level === 'RED' && (
              <div style={{ marginTop: 16 }}>
                <Text strong>强制放行理由（必填）：</Text>
                <Input.TextArea
                  value={forceReason}
                  onChange={e => setForceReason(e.target.value)}
                  rows={2}
                  placeholder="请说明为什么需要强制发布此规则..."
                  style={{ marginTop: 8 }}
                />
              </div>
            )}

            <Divider />
            <Space style={{ justifyContent: 'flex-end', width: '100%' }}>
              <Button onClick={() => setPublishModal({ open: false, level: '', report: null })}>
                {publishModal.level === 'YELLOW' ? '返回修改' : '取消'}
              </Button>
              <Button
                type="primary"
                danger={publishModal.level === 'RED'}
                onClick={publishModal.level === 'YELLOW'
                  ? async () => {
                    try {
                      const ruleId = id ? Number(id) : null;
                      await api.post(`/admin/rules/${ruleId}/publish`);
                      message.success('规则已发布');
                      setPublishModal({ open: false, level: '', report: null });
                      navigate('/rules');
                    } catch (e: any) { message.error(e.response?.data?.message || '发布失败'); }
                  }
                  : handleForcePublish
                }
              >
                {publishModal.level === 'YELLOW' ? '仍要发布' : '强制发布'}
              </Button>
            </Space>
          </>
        )}
      </Modal>
    </PageWrapper>
  );
};

export default RuleEditor;