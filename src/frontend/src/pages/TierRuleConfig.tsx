import React, { useState, useEffect } from 'react';
import { Card, Input, InputNumber, Button, Select, Space, Tag, message, Spin, Typography, Divider, Table, Radio } from 'antd';
import { SaveOutlined, CrownOutlined, ArrowUpOutlined, ArrowDownOutlined, ThunderboltOutlined } from '@ant-design/icons';

const AddIcon = () => (
  <svg width="16" height="16" viewBox="0 0 20 20" fill="none">
    <circle cx="10" cy="10" r="9" stroke="#1a1a1a" strokeWidth="1.5" fill="white"/>
    <path d="M6 10h8M10 6v8" stroke="#1a1a1a" strokeWidth="1.5" strokeLinecap="round"/>
  </svg>
);
const DelIcon = () => (
  <svg width="16" height="16" viewBox="0 0 20 20" fill="none">
    <circle cx="10" cy="10" r="9" stroke="#1a1a1a" strokeWidth="1.5" fill="white"/>
    <path d="M6.5 6.5L13.5 13.5M13.5 6.5L6.5 13.5" stroke="#1a1a1a" strokeWidth="1.5" strokeLinecap="round"/>
  </svg>
);
import { useAppStore } from '../store';
import api from '../api';

const { Text, Title } = Typography;

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

interface ConditionItem {
  dimension: string;
  operator: string;
  value: number;
  connector: 'AND' | 'OR';
}

const OPERATOR_OPTIONS = [
  { label: '≥', value: '>=' },
  { label: '>', value: '>' },
  { label: '=', value: '==' },
  { label: '<', value: '<' },
  { label: '≤', value: '<=' },
];

const defaultTiers: TierItem[] = [
  { tierCode: 'BASE', tierName: '普通会员', minPoints: 0, maxPoints: 1000, sequence: 1, validityMode: 'FIXED_DAYS', validityValue: 0 },
  { tierCode: 'SILVER', tierName: '银卡会员', minPoints: 1000, maxPoints: 5000, sequence: 2, validityMode: 'CALENDAR_YEARS', validityValue: 1 },
];

// ==================== 主页面 ====================

const TierRuleConfig: React.FC = () => {
  const PROG = useAppStore(s => s.currentProgramCode);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [tiers, setTiers] = useState<TierItem[]>(defaultTiers);
  const [retentionTiers, setRetentionTiers] = useState<TierItem[]>(defaultTiers);
  const [dimensionOptions, setDimensionOptions] = useState<{ label: string; value: string }[]>([]);
  const [upgradeMode, setUpgradeMode] = useState<'direct' | 'step'>('direct');
  const [downgradeMode, setDowngradeMode] = useState<'direct' | 'step'>('direct');

  useEffect(() => {
    setLoading(true);
    api.get('/admin/tiers')
      .then(({ data }) => {
        const d = data?.data;
        if (d?.tiers && d.tiers.length > 0) {
          setRetentionTiers(d.tiers.map((t: any) => ({
            tierCode: t.tierCode || '', tierName: t.tierName || '',
            minPoints: t.minPoints ?? 0, maxPoints: t.maxPoints ?? 0,
            sequence: t.sequence ?? 99, validityMode: t.validityMode || 'CALENDAR_YEARS', validityValue: t.validityValue ?? 1,
            upgradeCriteria: t.upgradeCriteria || {}, downgradeCriteria: t.downgradeCriteria || undefined,
          })));
          setTiers(d.tiers.map((t: any) => ({
            tierCode: t.tierCode || '', tierName: t.tierName || '',
            minPoints: t.minPoints ?? 0, maxPoints: t.maxPoints ?? 0,
            sequence: t.sequence ?? 99, validityMode: t.validityMode || 'CALENDAR_YEARS', validityValue: t.validityValue ?? 1,
            upgradeCriteria: t.upgradeCriteria || {}, downgradeCriteria: t.downgradeCriteria || undefined,
          })));
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));

    api.get('/admin/tiers').then(({ data }) => {
      const d = data?.data;
      if (d?.pointTypes?.length) {
        setDimensionOptions(d.pointTypes
          .filter((p: any) => p.tierRelevant)
          .map((p: any) => ({ label: `${p.name} (${p.typeCode})`, value: p.typeCode })));
      }
    }).catch(() => {});
  }, [PROG]);

  const upgradeRule = (tiers.find(t => t.tierCode !== 'BASE')?.upgradeCriteria?.upgrade_rules as any) || {};

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
      const extra = [...(rule.extra_conditions || []), { dimension: 'ORDER_COUNT', operator: '>=', value: 0, connector: 'AND' as const }];
      return { ...t, upgradeCriteria: { ...criteria, upgrade_rules: { ...rule, extra_conditions: extra } } };
    }));
  };

  const removeExtraCondition = (tierIdx: number, condIdx: number) => {
    setTiers(prev => prev.map((t, i) => {
      if (i !== tierIdx) return t;
      const criteria = t.upgradeCriteria || {};
      const rule = criteria.upgrade_rules || {};
      const extra = (rule.extra_conditions || []).filter((_: any, ci: number) => ci !== condIdx);
      return { ...t, upgradeCriteria: { ...criteria, upgrade_rules: { ...rule, extra_conditions: extra } } };
    }));
  };

  const updateExtraCondition = (tierIdx: number, condIdx: number, field: string, value: any) => {
    setTiers(prev => prev.map((t, i) => {
      if (i !== tierIdx) return t;
      const criteria = t.upgradeCriteria || {};
      const rule = criteria.upgrade_rules || {};
      const extra = (rule.extra_conditions || []).map((c: any, ci: number) => ci === condIdx ? { ...c, [field]: value } : c);
      return { ...t, upgradeCriteria: { ...criteria, upgrade_rules: { ...rule, extra_conditions: extra } } };
    }));
  };

  const updateRetention = (idx: number, field: string, value: any) => {
    setRetentionTiers(prev => prev.map((t, i) => {
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
          tierCode: t.tierCode, tierName: t.tierName,
          minPoints: t.minPoints, maxPoints: t.maxPoints,
          sequence: t.sequence, validityMode: t.validityMode, validityValue: t.validityValue,
        };
        if (t.upgradeCriteria?.upgrade_rules) item.upgradeRules = t.upgradeCriteria.upgrade_rules;
        if (t.downgradeCriteria) item.downgradeCriteria = t.downgradeCriteria;
        return item;
      });
      await api.put('/admin/tiers', { tiers: payload });
      message.success('等级规则配置已保存');
    } catch (e: any) {
      message.error(e.response?.data?.message || '保存失败');
    } finally { setSaving(false); }
  };

  const firstIdx = tiers.findIndex(t => t.tierCode !== 'BASE');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <Card
        title={<Space><CrownOutlined />等级评估规则</Space>}
        extra={<Button type="primary" icon={<SaveOutlined />} onClick={handleSave} loading={saving}>保存全部配置</Button>}
      >
        <Spin spinning={loading}>
          <style>{`.tier-radio-group .ant-radio-button-wrapper-checked { background: #1a1a1a !important; border-color: #1a1a1a !important; color: #fff !important; } .tier-radio-group .ant-radio-button-wrapper-checked::before { background: #1a1a1a !important; }`}</style>
          <Text type="secondary" style={{ fontSize: 12, marginBottom: 16, display: 'block' }}>
            评估周期根据等级设置中的有效期自动计算，无需手动配置。
          </Text>

          <Divider style={{ margin: '4px 0' }} />

          <Card type="inner" title={<Space><ArrowUpOutlined />升级规则</Space>} size="small"
            extra={
              <Radio.Group value={upgradeMode} onChange={e => setUpgradeMode(e.target.value)} size="small" optionType="button" className="tier-radio-group">
                <Radio.Button value="direct">直升</Radio.Button>
                <Radio.Button value="step">逐级升</Radio.Button>
              </Radio.Group>
            }>
            <Table
              dataSource={upgradeMode === 'direct'
                ? tiers.filter(t => t.tierCode !== 'BASE')
                : tiers.filter(t => t.sequence < (tiers[tiers.length-1]?.sequence || 99))}
              columns={[
                ...(upgradeMode === 'step' ? [{
                  title: '起始等级', key: 'source', width: 120,
                  render: (_: any, t: TierItem) => <Tag color="blue">{t.tierName}</Tag>,
                }] : []),
                {
                  title: upgradeMode === 'direct' ? '目标等级' : '目标等级', key: 'target', width: 120,
                  render: (_: any, t: TierItem) => {
                    if (upgradeMode === 'direct') {
                      return <Tag color="gold">{t.tierName}</Tag>;
                    }
                    const rule = (t.upgradeCriteria?.upgrade_rules as any) || {};
                    const sourceTierCode = rule.source_tier || t.tierCode;
                    const sourceTier = tiers.find(ti => ti.tierCode === sourceTierCode);
                    const nextTier = tiers.filter(ti => ti.sequence > (sourceTier?.sequence ?? 0))
                      .sort((a, b) => a.sequence - b.sequence)[0];
                    return <Tag color="gold">{nextTier?.tierName || '-'}</Tag>;
                  },
                },
                {
                  title: '升级条件', key: 'conditions',
                  render: (_: any, t: TierItem) => {
                    const rule = (t.upgradeCriteria?.upgrade_rules as any) || {};
                    const extra: ConditionItem[] = rule.extra_conditions || [];
                    const actualIdx = tiers.findIndex(ti => ti.tierCode === t.tierCode);
                    return (
                      <Space direction="vertical" size={4} style={{ width: '100%' }}>
                        <Space size={4}>
                          <Select size="small" value={rule.dimension || 'TIER_POINTS'} style={{ width: 160 }} onChange={v => updateUpgradeRule(actualIdx, 'dimension', v)} options={dimensionOptions} />
                          <Select size="small" value={rule.operator || '>='} style={{ width: 60 }} onChange={v => updateUpgradeRule(actualIdx, 'operator', v)} options={OPERATOR_OPTIONS} />
                          <InputNumber size="small" value={rule.requiredValue || 0} style={{ width: 90 }} onChange={v => updateUpgradeRule(actualIdx, 'requiredValue', v ?? 0)} />
                          {extra.length === 0 && <Button size="small" type="text" icon={<AddIcon />} onClick={() => addExtraCondition(actualIdx)} />}
                        </Space>
                        {extra.map((c, ci) => (
                          <div key={ci}>
                            <div style={{ textAlign: 'center', margin: '2px 0' }}>
                              <span onClick={() => updateExtraCondition(actualIdx, ci, 'connector', c.connector === 'AND' ? 'OR' : 'AND')}
                                style={{
                                  background: c.connector === 'AND' ? '#e6f4ff' : '#fff7e6',
                                  color: c.connector === 'AND' ? '#1677ff' : '#fa8c16',
                                  border: `1px solid ${c.connector === 'AND' ? '#91caff' : '#ffd591'}`,
                                  borderRadius: 3, padding: '0 6px', fontSize: 10, fontWeight: 600, cursor: 'pointer',
                                }}>{c.connector}</span>
                            </div>
                            <Space size={4}>
                              <Select size="small" value={c.dimension} style={{ width: 160 }} onChange={v => updateExtraCondition(actualIdx, ci, 'dimension', v)} options={dimensionOptions} />
                              <Select size="small" value={c.operator} style={{ width: 60 }} onChange={v => updateExtraCondition(actualIdx, ci, 'operator', v)} options={OPERATOR_OPTIONS} />
                              <InputNumber size="small" value={c.value} style={{ width: 90 }} onChange={v => updateExtraCondition(actualIdx, ci, 'value', v ?? 0)} />
                              <Button size="small" type="text" danger icon={<DelIcon />} onClick={() => removeExtraCondition(actualIdx, ci)} />
                              {ci === extra.length - 1 && <Button size="small" type="text" icon={<AddIcon />} onClick={() => addExtraCondition(actualIdx)} />}
                            </Space>
                          </div>
                        ))}
                      </Space>
                    );
                  },
                },
              ]}
              rowKey="tierCode" pagination={false} size="small"
            />
          </Card>

          <Card type="inner" title={<Space><ArrowDownOutlined />降保级规则</Space>} size="small" style={{ marginTop: 12 }}
            extra={
              <Radio.Group value={downgradeMode} onChange={e => setDowngradeMode(e.target.value)} size="small" optionType="button" className="tier-radio-group">
                <Radio.Button value="direct">直降</Radio.Button>
                <Radio.Button value="step">逐级降</Radio.Button>
              </Radio.Group>
            }>
            <Table
              dataSource={upgradeMode === 'direct'
                ? tiers.filter(t => t.tierCode !== 'BASE')
                : tiers.filter(t => t.sequence < (tiers[tiers.length-1]?.sequence || 99))}
              columns={[
                { title: '等级', dataIndex: 'tierName', width: 120, render: (v: string) => <Tag color="gold">{v}</Tag> },
                {
                  title: '保级条件', key: 'retention', render: (_: any, t: TierItem) => {
                    const actualIdx = tiers.findIndex(ti => ti.tierCode === t.tierCode);
                    const dc = t.downgradeCriteria || {};
                    const extra: ConditionItem[] = dc.retention_extra || [];
                    return (
                      <Space direction="vertical" size={4} style={{ width: '100%' }}>
                        <Space size={4}>
                          <Select size="small" value={dc.retention_dimension || 'TIER_POINTS'} style={{ width: 160 }} onChange={v => updateRetention(actualIdx, 'retention_dimension', v)} options={dimensionOptions} />
                          <Select size="small" value={dc.retention_operator || '>='} style={{ width: 60 }} onChange={v => updateRetention(actualIdx, 'retention_operator', v)} options={OPERATOR_OPTIONS} />
                          <InputNumber size="small" value={dc.retention_required_value || 0} style={{ width: 90 }} onChange={v => updateRetention(actualIdx, 'retention_required_value', v ?? 0)} />
                          {extra.length === 0 && <Button size="small" type="text" icon={<AddIcon />} onClick={() => {
                            const n = [...tiers];
                            const existing = n[actualIdx].downgradeCriteria || {};
                            const ext = [...(existing.retention_extra || []), { dimension: 'ORDER_COUNT', operator: '>=', value: 0, connector: 'AND' as const }];
                            setTiers(prev => prev.map((t2, i2) => i2 === actualIdx ? { ...t2, downgradeCriteria: { ...existing, retention_extra: ext } } : t2));
                          }} />}
                        </Space>
                        {extra.map((c, ci) => (
                          <div key={ci}>
                            <div style={{ textAlign: 'center', margin: '2px 0' }}>
                              <span onClick={() => {
                                const n = [...tiers];
                                const ext = [...(n[actualIdx].downgradeCriteria?.retention_extra || [])];
                                ext[ci] = { ...ext[ci], connector: (c as any).connector === 'AND' ? 'OR' : 'AND' };
                                setTiers(prev => prev.map((t2, i2) => i2 === actualIdx ? { ...t2, downgradeCriteria: { ...(t2.downgradeCriteria || {}), retention_extra: ext } } : t2));
                              }}
                                style={{
                                  background: (c as any).connector === 'OR' ? '#fff7e6' : '#e6f4ff',
                                  color: (c as any).connector === 'OR' ? '#fa8c16' : '#1677ff',
                                  border: `1px solid ${(c as any).connector === 'OR' ? '#ffd591' : '#91caff'}`,
                                  borderRadius: 3, padding: '0 6px', fontSize: 10, fontWeight: 600, cursor: 'pointer',
                                }}>{(c as any).connector || 'AND'}</span>
                            </div>
                            <Space size={4}>
                            <Select size="small" value={c.dimension} style={{ width: 160 }} onChange={v => {
                              const n = [...tiers];
                              const ext = [...(n[actualIdx].downgradeCriteria?.retention_extra || [])];
                              ext[ci] = { ...ext[ci], dimension: v };
                              setTiers(prev => prev.map((t2, i2) => i2 === actualIdx ? { ...t2, downgradeCriteria: { ...(t2.downgradeCriteria || {}), retention_extra: ext } } : t2));
                            }} options={dimensionOptions} />
                            <Select size="small" value={c.operator} style={{ width: 60 }} onChange={v => {
                              const n = [...tiers];
                              const ext = [...(n[actualIdx].downgradeCriteria?.retention_extra || [])];
                              ext[ci] = { ...ext[ci], operator: v };
                              setTiers(prev => prev.map((t2, i2) => i2 === actualIdx ? { ...t2, downgradeCriteria: { ...(t2.downgradeCriteria || {}), retention_extra: ext } } : t2));
                            }} options={OPERATOR_OPTIONS} />
                            <InputNumber size="small" value={c.value} style={{ width: 90 }} onChange={v => {
                              const n = [...tiers];
                              const ext = [...(n[actualIdx].downgradeCriteria?.retention_extra || [])];
                              ext[ci] = { ...ext[ci], value: v ?? 0 };
                              setTiers(prev => prev.map((t2, i2) => i2 === actualIdx ? { ...t2, downgradeCriteria: { ...(t2.downgradeCriteria || {}), retention_extra: ext } } : t2));
                            }} />
                            <Button size="small" type="text" danger icon={<DelIcon />} onClick={() => {
                              const n = [...tiers];
                              const ext = (n[actualIdx].downgradeCriteria?.retention_extra || []).filter((_: any, ci2: number) => ci2 !== ci);
                              setTiers(prev => prev.map((t2, i2) => i2 === actualIdx ? { ...t2, downgradeCriteria: { ...(t2.downgradeCriteria || {}), retention_extra: ext } } : t2));
                            }} />
                            {ci === extra.length - 1 && <Button size="small" type="text" icon={<AddIcon />} onClick={() => {
                              const n = [...tiers];
                              const existing = n[actualIdx].downgradeCriteria || {};
                              const ext2 = [...(existing.retention_extra || []), { dimension: 'ORDER_COUNT', operator: '>=', value: 0, connector: 'AND' as const }];
                              setTiers(prev => prev.map((t2, i2) => i2 === actualIdx ? { ...t2, downgradeCriteria: { ...existing, retention_extra: ext2 } } : t2));
                            }} />}
                          </Space>
                          </div>
                        ))}
                      </Space>
                    );
                  },
                },
                ...((downgradeMode === 'step') ? [{
                  title: '降级目标', key: 'downgrade', width: 140, render: (_: any, t: TierItem) => {
                    const lower = tiers.filter(ti => ti.sequence < t.sequence);
                    const nextLower = lower.sort((a, b) => b.sequence - a.sequence)[0];
                    return <Tag color="orange">{nextLower?.tierName || '-'}</Tag>;
                  },
                }] : []),
              ]}
              rowKey="tierCode" pagination={false} size="small"
            />
          </Card>

          <Card type="inner" title={<Space><ThunderboltOutlined />降级规则</Space>} size="small" style={{ marginTop: 12 }}>
            <Text type="secondary">保级失败时自动触发降级，降级目标在保级规则中配置</Text>
          </Card>
        </Spin>
      </Card>
    </div>
  );
};

export default TierRuleConfig;