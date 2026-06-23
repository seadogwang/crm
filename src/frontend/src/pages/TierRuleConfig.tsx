import React, { useState, useEffect } from 'react';
import { Card, Tabs, Table, Input, InputNumber, Button, Select, Space, Tag, message, Spin, Empty, Popconfirm, Switch, Descriptions, Tooltip } from 'antd';
import { PlusOutlined, DeleteOutlined, SaveOutlined, CrownOutlined, ArrowUpOutlined, ArrowDownOutlined, InfoCircleOutlined } from '@ant-design/icons';
import { useAppStore } from '../store';
import api from '../api';

// ==================== 类型定义 ====================

interface TierItem {
  tierCode: string;
  tierName: string;
  minPoints: number;
  maxPoints: number;
  sequence: number;
  validityMode: string;
  validityValue: number;
  upgradeCriteria?: Record<string, any>;
  downgradeCriteria?: Record<string, any>;
}

interface UpgradeRule {
  dimension: string;
  operator: string;
  requiredValue: number;
  timeWindowDays?: number;
}

interface ConditionItem {
  dimension: string;
  operator: string;
  value: number;
}

// ==================== 常量 ====================

const DIMENSION_OPTIONS = [
  { label: '等级积分（成长值）', value: 'TIER_POINTS' },
  { label: '购买次数', value: 'ORDER_COUNT' },
  { label: '近90天购买次数', value: 'ORDER_COUNT_DAYS' },
  { label: '累计消费金额', value: 'TOTAL_AMOUNT' },
  { label: '连续活跃天数', value: 'CONTINUOUS_DAYS' },
  { label: '最近消费间隔天数', value: 'LAST_ORDER_DAYS' },
];

const OPERATOR_OPTIONS = [
  { label: '≥ 大于等于', value: '>=' },
  { label: '> 大于', value: '>' },
  { label: '= 等于', value: '==' },
  { label: '< 小于', value: '<' },
  { label: '≤ 小于等于', value: '<=' },
];

const VALIDITY_MODE_LABELS: Record<string, string> = {
  FIXED_DAYS: '固定天数',
  CALENDAR_MONTHS: '自然月',
  CALENDAR_YEARS: '自然年',
};

const defaultTiers: TierItem[] = [
  { tierCode: 'BASE', tierName: '普通会员', minPoints: 0, maxPoints: 1000, sequence: 1, validityMode: 'FIXED_DAYS', validityValue: 0 },
  { tierCode: 'SILVER', tierName: '银卡会员', minPoints: 1000, maxPoints: 5000, sequence: 2, validityMode: 'CALENDAR_YEARS', validityValue: 1 },
  { tierCode: 'GOLD', tierName: '金卡会员', minPoints: 5000, maxPoints: 10000, sequence: 3, validityMode: 'CALENDAR_YEARS', validityValue: 1 },
  { tierCode: 'PLATINUM', tierName: '铂金会员', minPoints: 10000, maxPoints: 9999999, sequence: 4, validityMode: 'CALENDAR_YEARS', validityValue: 1 },
];

// ==================== 规则预览生成 ====================

function dimensionLabel(dim: string): string {
  const found = DIMENSION_OPTIONS.find(d => d.value === dim);
  return found ? found.label : dim;
}

function generateRulePreview(tier: TierItem): string {
  if (!tier.upgradeCriteria?.upgrade_rules) return '未配置升级规则';
  const rule = tier.upgradeCriteria.upgrade_rules as any;
  const mainDim = rule.dimension || '';
  const mainOp = rule.operator || '>=';
  const mainVal = rule.requiredValue || 0;
  let preview = `当会员${dimensionLabel(mainDim)} ${mainOp} ${mainVal}`;

  if (rule.timeWindowDays) preview += `（${rule.timeWindowDays}天内）`;

  const extra: ConditionItem[] = rule.extra_conditions || [];
  if (extra.length > 0) {
    const opLabel = rule.conditionOperator === 'OR' ? '或' : '且';
    preview += `，${opLabel}`;
    preview += extra.map(c => `${dimensionLabel(c.dimension)} ${c.operator} ${c.value}`).join(`、`);
  }

  preview += `，升级为${tier.tierName}`;
  return preview;
}

function generateRetentionPreview(tier: TierItem): string {
  if (!tier.downgradeCriteria) return '未配置保级规则';
  const dc = tier.downgradeCriteria;
  const dim = dimensionLabel(dc.retention_dimension || '');
  const days = dc.retention_cycle_days || 365;
  const val = dc.retention_required_value || 0;
  const target = dc.downgrade_target || 'BASE';
  return `每${days}天评估：${dim} ≥ ${val} 保级成功，否则降为${target}`;
}

// ==================== HoverEditable 组件 ====================

const HoverInput: React.FC<{ value: string; onChange: (v: string) => void; w?: number }> = ({ value, onChange, w }) => {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  if (editing) return <Input size="small" value={draft} autoFocus style={{ width: w }} onChange={e => setDraft(e.target.value)} onBlur={() => { onChange(draft); setEditing(false); }} onPressEnter={() => { onChange(draft); setEditing(false); }} />;
  return <span style={{ cursor: 'pointer', padding: '4px 8px', borderRadius: 4, transition: 'background 0.2s', display: 'inline-block', width: w, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} onMouseEnter={e => e.currentTarget.style.background = '#f5f5f5'} onMouseLeave={e => e.currentTarget.style.background = 'transparent'} onClick={() => { setDraft(value); setEditing(true); }}>{value || <span style={{ color: '#ccc' }}>点击编辑</span>}</span>;
};

const HoverNumber: React.FC<{ value: number; onChange: (v: number) => void; w?: number }> = ({ value, onChange, w }) => {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  if (editing) return <InputNumber size="small" value={draft} autoFocus style={{ width: w }} onChange={v => setDraft(v ?? 0)} onBlur={() => { onChange(draft); setEditing(false); }} onPressEnter={() => { onChange(draft); setEditing(false); }} />;
  return <span style={{ cursor: 'pointer', padding: '4px 8px', borderRadius: 4, transition: 'background 0.2s', display: 'inline-block', width: w }} onMouseEnter={e => e.currentTarget.style.background = '#f5f5f5'} onMouseLeave={e => e.currentTarget.style.background = 'transparent'} onClick={() => { setDraft(value); setEditing(true); }}>{value}</span>;
};

// ==================== 主页面 ====================

const TierRuleConfig: React.FC = () => {
  const PROG = useAppStore(s => s.currentProgramCode);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [tiers, setTiers] = useState<TierItem[]>(defaultTiers);
  const [activeTab, setActiveTab] = useState('definition');

  // 加载等级数据
  useEffect(() => {
    setLoading(true);
    api.get('/admin/tiers')
      .then(({ data }) => {
        const d = data?.data;
        if (d?.tiers && d.tiers.length > 0) {
          setTiers(d.tiers.map((t: any) => ({
            tierCode: t.tierCode || '',
            tierName: t.tierName || '',
            minPoints: t.minPoints ?? 0,
            maxPoints: t.maxPoints ?? 0,
            sequence: t.sequence ?? 99,
            validityMode: t.validityMode || 'CALENDAR_YEARS',
            validityValue: t.validityValue ?? 1,
            upgradeCriteria: t.upgradeCriteria || {},
            downgradeCriteria: t.downgradeCriteria || undefined,
          })));
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [PROG]);

  const updateTier = (idx: number, field: string, value: any) => {
    setTiers(prev => prev.map((t, i) => i === idx ? { ...t, [field]: value } : t));
  };

  const updateUpgradeRule = (idx: number, field: string, value: any) => {
    setTiers(prev => prev.map((t, i) => {
      if (i !== idx) return t;
      const criteria = t.upgradeCriteria || {};
      const rule = criteria.upgrade_rules || { dimension: 'TIER_POINTS', operator: '>=', requiredValue: 0, extra_conditions: [], conditionOperator: 'AND' };
      return { ...t, upgradeCriteria: { ...criteria, upgrade_rules: { ...rule, [field]: value } } };
    }));
  };

  const addExtraCondition = (idx: number) => {
    setTiers(prev => prev.map((t, i) => {
      if (i !== idx) return t;
      const criteria = t.upgradeCriteria || {};
      const rule = criteria.upgrade_rules || { dimension: 'TIER_POINTS', operator: '>=', requiredValue: 0, extra_conditions: [], conditionOperator: 'AND' };
      const extra = [...(rule.extra_conditions || []), { dimension: 'ORDER_COUNT', operator: '>=', value: 0 }];
      return { ...t, upgradeCriteria: { ...criteria, upgrade_rules: { ...rule, extra_conditions: extra } } };
    }));
  };

  const removeExtraCondition = (idx: number, condIdx: number) => {
    setTiers(prev => prev.map((t, i) => {
      if (i !== idx) return t;
      const criteria = t.upgradeCriteria || {};
      const rule = criteria.upgrade_rules || {};
      const extra = (rule.extra_conditions || []).filter((_: any, ci: number) => ci !== condIdx);
      return { ...t, upgradeCriteria: { ...criteria, upgrade_rules: { ...rule, extra_conditions: extra } } };
    }));
  };

  const updateExtraCondition = (idx: number, condIdx: number, field: string, value: any) => {
    setTiers(prev => prev.map((t, i) => {
      if (i !== idx) return t;
      const criteria = t.upgradeCriteria || {};
      const rule = criteria.upgrade_rules || {};
      const extra = (rule.extra_conditions || []).map((c: any, ci: number) => ci === condIdx ? { ...c, [field]: value } : c);
      return { ...t, upgradeCriteria: { ...criteria, upgrade_rules: { ...rule, extra_conditions: extra } } };
    }));
  };

  const updateDowngradeCriteria = (idx: number, field: string, value: any) => {
    setTiers(prev => prev.map((t, i) => {
      if (i !== idx) return t;
      const dc = t.downgradeCriteria || {};
      return { ...t, downgradeCriteria: { ...dc, [field]: value } };
    }));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const payload = tiers.map(t => {
        const item: Record<string, any> = {
          tierCode: t.tierCode,
          tierName: t.tierName,
          minPoints: t.minPoints,
          maxPoints: t.maxPoints,
          sequence: t.sequence,
          validityMode: t.validityMode,
          validityValue: t.validityValue,
        };
        if (t.upgradeCriteria?.upgrade_rules) item.upgradeRules = t.upgradeCriteria.upgrade_rules;
        if (t.downgradeCriteria) item.downgradeCriteria = t.downgradeCriteria;
        return item;
      });
      await api.put('/admin/tiers', { tiers: payload });
      message.success('等级规则配置已保存');
    } catch (e: any) {
      message.error(e.response?.data?.message || '保存失败');
    } finally {
      setSaving(false);
    }
  };

  // ==================== Tab 1: 等级定义 ====================

  const definitionColumns = [
    { title: '排序', dataIndex: 'sequence', width: 80, render: (v: number, _: any, idx: number) => <HoverNumber value={v} onChange={val => updateTier(idx, 'sequence', val)} w={50} /> },
    { title: '等级代码', dataIndex: 'tierCode', width: 140, render: (v: string, _: any, idx: number) => <HoverInput value={v} onChange={val => updateTier(idx, 'tierCode', val)} w={120} /> },
    { title: '等级名称', dataIndex: 'tierName', width: 140, render: (v: string, _: any, idx: number) => <HoverInput value={v} onChange={val => updateTier(idx, 'tierName', val)} w={120} /> },
    { title: '门槛积分', dataIndex: 'minPoints', width: 100, render: (v: number, _: any, idx: number) => <HoverNumber value={v} onChange={val => updateTier(idx, 'minPoints', val)} w={80} /> },
    { title: '上限积分', dataIndex: 'maxPoints', width: 100, render: (v: number, _: any, idx: number) => <HoverNumber value={v} onChange={val => updateTier(idx, 'maxPoints', val)} w={80} /> },
    { title: '过期模式', dataIndex: 'validityMode', width: 100, render: (v: string, _: any, idx: number) => (
      <Select size="small" value={v} style={{ width: 90 }} onChange={val => updateTier(idx, 'validityMode', val)} options={[{ label: '固定天数', value: 'FIXED_DAYS' }, { label: '自然月', value: 'CALENDAR_MONTHS' }, { label: '自然年', value: 'CALENDAR_YEARS' }]} />
    )},
    { title: '有效期', dataIndex: 'validityValue', width: 80, render: (v: number, _: any, idx: number) => <HoverNumber value={v} onChange={val => updateTier(idx, 'validityValue', val)} w={70} /> },
    { title: '操作', width: 50, render: (_: any, __: any, idx: number) => (
      <Popconfirm title="确定删除此等级？" onConfirm={() => setTiers(prev => prev.filter((_, i) => i !== idx))}>
        <Button size="small" type="text" icon={<DeleteOutlined />} danger />
      </Popconfirm>
    )},
  ];

  // ==================== Tab 2: 升级规则 ====================

  const upgradeRuleColumns = [
    { title: '等级', dataIndex: 'tierName', width: 120, render: (v: string, t: TierItem) => <Tag color="gold">{v}</Tag> },
    { title: '目标等级', width: 140, render: (_: any, t: TierItem, idx: number) => {
      const rule = (t.upgradeCriteria?.upgrade_rules as any) || {};
      // 找到比当前等级更高的等级
      const higherTiers = tiers.filter(ti => ti.sequence > t.sequence);
      return <Select size="small" value={rule.tier_target || ''} style={{ width: 120 }} placeholder="选择目标" onChange={v => updateUpgradeRule(idx, 'tier_target', v)} options={higherTiers.map(ti => ({ label: ti.tierName, value: ti.tierCode }))} />;
    }},
    { title: '评估维度', width: 180, render: (_: any, t: TierItem, idx: number) => {
      const rule = (t.upgradeCriteria?.upgrade_rules as any) || {};
      return <Select size="small" value={rule.dimension || 'TIER_POINTS'} style={{ width: 170 }} onChange={v => updateUpgradeRule(idx, 'dimension', v)} options={DIMENSION_OPTIONS} />;
    }},
    { title: '操作符', width: 100, render: (_: any, t: TierItem, idx: number) => {
      const rule = (t.upgradeCriteria?.upgrade_rules as any) || {};
      return <Select size="small" value={rule.operator || '>='} style={{ width: 90 }} onChange={v => updateUpgradeRule(idx, 'operator', v)} options={OPERATOR_OPTIONS} />;
    }},
    { title: '要求值', width: 100, render: (_: any, t: TierItem, idx: number) => {
      const rule = (t.upgradeCriteria?.upgrade_rules as any) || {};
      return <InputNumber size="small" value={rule.requiredValue || 0} style={{ width: 80 }} onChange={v => updateUpgradeRule(idx, 'requiredValue', v ?? 0)} />;
    }},
    { title: '时间窗口(天)', width: 100, render: (_: any, t: TierItem, idx: number) => {
      const rule = (t.upgradeCriteria?.upgrade_rules as any) || {};
      return <InputNumber size="small" value={rule.timeWindowDays || undefined} style={{ width: 80 }} placeholder="可选" onChange={v => updateUpgradeRule(idx, 'timeWindowDays', v)} />;
    }},
    { title: '额外条件', width: 300, render: (_: any, t: TierItem, idx: number) => {
      const rule = (t.upgradeCriteria?.upgrade_rules as any) || {};
      const extra: ConditionItem[] = rule.extra_conditions || [];
      return (
        <Space direction="vertical" size={4} style={{ width: '100%' }}>
          {extra.map((c, ci) => (
            <Space key={ci} size={4}>
              <Select size="small" value={c.dimension} style={{ width: 140 }} onChange={v => updateExtraCondition(idx, ci, 'dimension', v)} options={DIMENSION_OPTIONS} />
              <Select size="small" value={c.operator} style={{ width: 70 }} onChange={v => updateExtraCondition(idx, ci, 'operator', v)} options={OPERATOR_OPTIONS} />
              <InputNumber size="small" value={c.value} style={{ width: 60 }} onChange={v => updateExtraCondition(idx, ci, 'value', v ?? 0)} />
              <Button size="small" type="text" icon={<DeleteOutlined />} danger onClick={() => removeExtraCondition(idx, ci)} />
            </Space>
          ))}
          <Button size="small" type="link" icon={<PlusOutlined />} onClick={() => addExtraCondition(idx)}>添加条件</Button>
          {extra.length > 1 && (
            <Select size="small" value={rule.conditionOperator || 'AND'} style={{ width: 60 }} onChange={v => updateUpgradeRule(idx, 'conditionOperator', v)} options={[{ label: '且(AND)', value: 'AND' }, { label: '或(OR)', value: 'OR' }]} />
          )}
        </Space>
      );
    }},
    { title: '规则预览', width: 250, render: (_: any, t: TierItem) => (
      <Tooltip title={generateRulePreview(t)}>
        <span style={{ fontSize: 12, color: '#666', cursor: 'pointer' }}>{generateRulePreview(t)}</span>
      </Tooltip>
    )},
  ];

  // ==================== Tab 3: 降级/保级 ====================

  const retentionColumns = [
    { title: '等级', dataIndex: 'tierName', width: 120, render: (v: string) => <Tag color="gold">{v}</Tag> },
    { title: '保级周期(天)', width: 120, render: (_: any, t: TierItem, idx: number) => <InputNumber size="small" value={t.downgradeCriteria?.retention_cycle_days || 365} style={{ width: 100 }} onChange={v => updateDowngradeCriteria(idx, 'retention_cycle_days', v ?? 365)} /> },
    { title: '评估维度', width: 180, render: (_: any, t: TierItem, idx: number) => <Select size="small" value={t.downgradeCriteria?.retention_dimension || 'TIER_POINTS'} style={{ width: 170 }} onChange={v => updateDowngradeCriteria(idx, 'retention_dimension', v)} options={DIMENSION_OPTIONS} /> },
    { title: '保级门槛', width: 120, render: (_: any, t: TierItem, idx: number) => <InputNumber size="small" value={t.downgradeCriteria?.retention_required_value || 0} style={{ width: 100 }} onChange={v => updateDowngradeCriteria(idx, 'retention_required_value', v ?? 0)} /> },
    { title: '降级目标', width: 140, render: (_: any, t: TierItem, idx: number) => {
      // 找到比当前等级更低的等级
      const lowerTiers = tiers.filter(ti => ti.sequence < t.sequence);
      return <Select size="small" value={t.downgradeCriteria?.downgrade_target || ''} style={{ width: 120 }} placeholder="选择降级目标" onChange={v => updateDowngradeCriteria(idx, 'downgrade_target', v)} options={lowerTiers.map(ti => ({ label: ti.tierName, value: ti.tierCode }))} />;
    }},
    { title: '规则预览', width: 280, render: (_: any, t: TierItem) => (
      <Tooltip title={generateRetentionPreview(t)}>
        <span style={{ fontSize: 12, color: '#666', cursor: 'pointer' }}>{generateRetentionPreview(t)}</span>
      </Tooltip>
    )},
  ];

  // ==================== 页面渲染 ====================

  return (
    <Card
      title={<Space><CrownOutlined /> 等级规则配置</Space>}
      extra={<Button type="primary" icon={<SaveOutlined />} onClick={handleSave} loading={saving}>保存配置</Button>}
    >
      <style>{`.ant-input:focus, .ant-input-number:focus, .ant-input-focused, .ant-input-number-focused { box-shadow: none !important; border-color: #d9d9d9 !important; }`}</style>
      {loading ? <Spin /> : (
        <Tabs activeKey={activeTab} onChange={setActiveTab} items={[
          {
            key: 'definition',
            label: <Space><CrownOutlined /> 等级定义</Space>,
            children: (
              <Table dataSource={tiers} columns={definitionColumns} rowKey={(_, idx) => String(idx)} pagination={false} size="small" scroll={{ x: 700 }}
                footer={() => (
                  <Button size="small" type="text" icon={<PlusOutlined />} block onClick={() => setTiers(prev => [...prev, { tierCode: '', tierName: '新等级', minPoints: 0, maxPoints: 0, sequence: prev.length + 1, validityMode: 'CALENDAR_YEARS', validityValue: 1 }])}>新增等级</Button>
                )}
              />
            ),
          },
          {
            key: 'upgrade',
            label: <Space><ArrowUpOutlined /> 升级规则</Space>,
            children: (
              <>
                <Descriptions size="small" column={1} style={{ marginBottom: 16 }}>
                  <Descriptions.Item label="说明">配置每个等级的升级条件。评估维度支持：等级积分、购买次数、累计金额、连续活跃天数等。满足条件后自动触发等级升级。</Descriptions.Item>
                </Descriptions>
                <Table dataSource={tiers.filter(t => t.tierCode !== 'BASE')} columns={upgradeRuleColumns} rowKey={(t) => t.tierCode} pagination={false} size="small" scroll={{ x: 1200 }} />
              </>
            ),
          },
          {
            key: 'retention',
            label: <Space><ArrowDownOutlined /> 降级/保级</Space>,
            children: (
              <>
                <Descriptions size="small" column={1} style={{ marginBottom: 16 }}>
                  <Descriptions.Item label="说明">配置等级保级规则。定期评估会员是否满足保级条件，不满足则降级到指定等级。</Descriptions.Item>
                </Descriptions>
                <Table dataSource={tiers.filter(t => t.tierCode !== 'BASE')} columns={retentionColumns} rowKey={(t) => t.tierCode} pagination={false} size="small" scroll={{ x: 900 }} />
              </>
            ),
          },
        ]} />
      )}
    </Card>
  );
};

export default TierRuleConfig;
