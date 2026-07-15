import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Card, Input, InputNumber, Select, Button, Switch, Space, Tag, Typography,
  Divider, Collapse, message, Spin, Radio, Empty, Dropdown,
} from 'antd';
import {
  PlusOutlined, DeleteOutlined, SaveOutlined, SendOutlined,
  CalculatorOutlined, SearchOutlined, BranchesOutlined, DownOutlined,
} from '@ant-design/icons';
import api from '../api';
import { useAppStore } from '../store';

const { Text, Title, Paragraph } = Typography;

// ==================== Types ====================
interface Condition {
  id: string; type: 'condition'; field: string; operator: string; value: string;
  connector: 'AND' | 'OR';
}
interface ConditionGroup {
  id: string; type: 'group'; connector: 'AND' | 'OR'; logic: 'AND' | 'OR';
  items: (Condition | ConditionGroup)[];
}
interface TierRow { id: string; lowerBound: number; upperBound: number | null; multiplier: number; }
interface Capping { enabled: boolean; maxPoints: number; overflowMode: 'discard' | 'multiply'; overflowMultiplier: number; }
interface TieredAction { id: string; type: 'tiered'; sourceField: string; targetField: string; pointType: string; mode: 'attribution' | 'deduction'; tiers: TierRow[]; capping: Capping; }
interface AssignAction {
  id: string; type: 'assign';
  pointType: string;
  sourceField: string;
  operator: string;  // * / + -
  value: number;
}
interface AccumulateAction {
  id: string; type: 'accumulate';
  pointType: string;
  value: number;       // 固定累加值
}
interface LoopAction { id: string; type: 'loop'; collection: string; elementVar: string; actions: ActionItem[]; }
interface BranchAction { id: string; type: 'branch'; conditions: ConditionGroup; thenActions: ActionItem[]; elseActions: ActionItem[]; }
type ActionItem = TieredAction | AssignAction | AccumulateAction | LoopAction | BranchAction;
interface RuleConfig {
  ruleId: string; name: string; category: string; priority: number; enabled: boolean; version: string;
  lhs: ConditionGroup; rhs: { then: ActionItem[]; else: ActionItem[]; }; description: string;
}

// ==================== Constants ====================
const OPERATORS = [
  { label: '>', value: '>' }, { label: '>=', value: '>=' }, { label: '<', value: '<' }, { label: '<=', value: '<=' },
  { label: '=', value: '==' }, { label: '!=', value: '!=' }, { label: '包含', value: 'IN' }, { label: '不包含', value: 'NOT_IN' },
  { label: '为空', value: 'IS_NULL' }, { label: '不为空', value: 'IS_NOT_NULL' },
];
const CATEGORIES = [{ label: '基础规则', value: 'base' }, { label: '积分翻倍', value: 'points_multiply' }, { label: '促销活动', value: 'promo' }, { label: '等级规则', value: 'tier' }];
const ACTION_TYPES = [
  { key: 'tiered', label: '📊 分段阶梯累进', desc: '按金额区间分段计算积分' },
  { key: 'assign', label: '✏️ 赋值', desc: '设置变量值' },
  { key: 'accumulate', label: '➕ 累加', desc: '在现有值上累加' },
  { key: 'loop', label: '🔄 循环遍历 (FOR)', desc: '遍历集合中的每个元素' },
  { key: 'branch', label: '❓ 条件分支 (IF-ELSE)', desc: '嵌套条件判断' },
];

let idCounter = 0;
const uid = () => `${Date.now()}_${idCounter++}`;

// ==================== 主数据选择组件 ====================
const MasterDataSelect: React.FC<{ masterData: any; value: string; onChange: (v: string) => void }> = ({ masterData, value, onChange }) => {
  const [opts, setOpts] = useState<{ label: string; value: string }[]>([]);
  useEffect(() => {
    if (masterData?.dataCode && masterData.dataType !== 'HIERARCHY') {
      api.get(`/master-data/${masterData.dataCode}/options`).then(({ data }) => {
        setOpts((data?.data || []).map((o: any) => ({ label: o.label, value: o.code })));
      }).catch(() => {});
    }
  }, [masterData?.dataCode]);
  return <Select size="small" value={value || undefined} style={{ width: 140 }} placeholder="选择值" showSearch optionFilterProp="label"
    options={opts} onChange={onChange} />;
};

const defaultConfig = (): RuleConfig => ({
  ruleId: '', name: '', category: 'base', priority: 20, enabled: true, version: '1.0.0',
  lhs: { id: uid(), type: 'group', connector: 'AND', logic: 'AND', items: [] },
  rhs: { then: [], else: [] }, description: '',
});

// ==================== Simulation ====================
function simulateTiered(action: TieredAction, amount: number) {
  const tiers = [...action.tiers].sort((a, b) => b.lowerBound - a.lowerBound);
  let remaining = amount, totalPoints = 0;
  const steps: string[] = [];
  for (const tier of tiers) {
    if (remaining <= 0) break;
    const upper = tier.upperBound ?? Infinity;
    const stepSize = upper - tier.lowerBound;
    if (remaining > tier.lowerBound) {
      const applicable = tier.upperBound === null ? remaining : Math.min(remaining - tier.lowerBound, stepSize);
      const pts = applicable * tier.multiplier;
      steps.push(`${applicable} × ${tier.multiplier} = ${pts}`);
      totalPoints += pts; remaining -= applicable;
    }
  }
  let finalPoints = totalPoints, capped = false, consumedAmount = amount - remaining, overflowPoints = 0;
  if (action.capping?.enabled && finalPoints > action.capping.maxPoints) {
    capped = true;
    let cr = amount, cp = 0;
    for (const tier of tiers) {
      if (cr <= 0) break;
      const upper = tier.upperBound ?? Infinity, stepSize = upper - tier.lowerBound;
      if (cr > tier.lowerBound) {
        const applicable = tier.upperBound === null ? cr : Math.min(cr - tier.lowerBound, stepSize);
        const pts = applicable * tier.multiplier;
        if (cp + pts >= action.capping.maxPoints) {
          const needPts = action.capping.maxPoints - cp;
          consumedAmount = amount - cr + (needPts / tier.multiplier);
          cp = action.capping.maxPoints; break;
        }
        cp += pts; cr -= applicable;
      }
    }
    finalPoints = action.capping.maxPoints;
    if (action.capping.overflowMode === 'multiply') {
      overflowPoints = (amount - consumedAmount) * action.capping.overflowMultiplier;
      finalPoints += overflowPoints;
    }
  }
  return { steps, grossPoints: totalPoints, capped, finalPoints, consumedAmount: Math.round(consumedAmount), overflowPoints };
}

// ==================== Component ====================
const RuleEngineEditor: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const PROG = useAppStore(s => s.currentProgramCode);
  const isNew = !id || id === 'new';

  const [config, setConfig] = useState<RuleConfig>(defaultConfig());
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [simAmount, setSimAmount] = useState(8900);
  const [varSearch, setVarSearch] = useState('');
  const [orderFields, setOrderFields] = useState<{ code: string; label: string; type: string; children?: { code: string; label: string; type: string }[] }[]>([]);
  const [memberFields, setMemberFields] = useState<{ code: string; label: string; type: string; masterData?: any }[]>([]);
  const [pointTypeOptions, setPointTypeOptions] = useState<{ label: string; value: string; pointCategory?: string; isTierCalc?: boolean }[]>([]);
  const [rulePurpose, setRulePurpose] = useState('EARN_POINTS'); // EARN_POINTS | TIER_UPGRADE
  const [variableOptions, setVariableOptions] = useState<{ label: string; value: string }[]>([]);
  const [masterDataOptions, setMasterDataOptions] = useState<Record<string, { label: string; value: string }[]>>({});

  useEffect(() => {
    api.get('/schemas/ORDER').then(({ data }) => {
      const s = data?.data?.schema || data?.data;
      const fields: { code: string; label: string; type: string; children?: { code: string; label: string; type: string }[] }[] = [];
      const props = s?.properties || {};
      for (const [k, v] of Object.entries(props) as any) {
        const field: any = { code: k, label: v.title || k, type: v.type || 'string' };
        // 如果是数组类型且有 items 定义，提取子字段
        if (v.type === 'array' && v.items?.properties) {
          field.children = Object.entries(v.items.properties).map(([ck, cv]: any) => ({
            code: `${k}.${ck}`, label: cv.title || ck, type: cv.type || 'string',
          }));
        }
        fields.push(field);
      }
      setOrderFields(fields);
    }).catch(() => {});
    api.get('/schemas/MEMBER').then(({ data }) => {
      const s = data?.data?.schema || data?.data;
      setMemberFields(Object.entries(s?.properties || {}).map(([k, v]: any) => ({
        code: k, label: v.title || k, type: v.type || 'string',
        masterData: v['x-master-data'] || null,
      })));
    }).catch(() => {});
    api.get('/point-types', { params: { programCode: PROG } }).then(({ data }) => {
      setPointTypeOptions((data?.data || []).map((p: any) => ({ label: `${p.typeName} (${p.typeCode})`, value: p.typeCode, pointCategory: p.pointCategory, isTierCalc: p.isTierCalc })));
    }).catch(() => {});
    api.get('/variables', { params: { programCode: PROG } }).then(({ data }) => {
      setVariableOptions((data?.data || []).filter((v: any) => v.status === 'ACTIVE').map((v: any) => ({ label: `${v.varName} (${v.varCode})`, value: v.varCode })));
    }).catch(() => {});
    if (!isNew) {
      setLoading(true);
      api.get(`/admin/rules/${id}`).then(({ data: d }) => {
        const r = d?.data;
        if (r?.metadata) {
          const meta = r.metadata;
          setConfig({
            ...meta,
            ruleId: meta.ruleId || r.ruleCode || '',
            name: meta.name || r.ruleName || '',
            category: meta.category || r.ruleGroup || 'base',
            priority: meta.priority || r.priority || 20,
            lhs: meta.lhs || { id: uid(), type: 'group', connector: 'AND', logic: 'AND', items: [] },
            rhs: { then: meta.rhs?.then || [], else: meta.rhs?.else || [] },
          });
        }
      }).catch(() => {}).finally(() => setLoading(false));
    }
  }, [id, isNew, PROG]);

  const allFields = useMemo(() => {
    const fields: { code: string; label: string; group: string; isCollection?: boolean; masterData?: any }[] = [];
    orderFields.forEach(f => {
      if (f.type !== 'array') fields.push({ code: f.code, label: f.label, group: '订单' });
      (f.children || []).forEach(c => fields.push({ code: c.code, label: `${f.label} › ${c.label}`, group: '订单' }));
    });
    memberFields.forEach(f => { if (f.type !== 'array') fields.push({ ...f, group: '会员' }); });
    variableOptions.forEach(f => fields.push({ code: f.value, label: f.label, group: '变量' }));
    return fields;
  }, [orderFields, memberFields, variableOptions]);

  const filteredFields = useMemo(() => {
    if (!varSearch) return allFields;
    const kw = varSearch.toLowerCase();
    return allFields.filter(f => f.label.toLowerCase().includes(kw) || f.code.toLowerCase().includes(kw));
  }, [allFields, varSearch]);

  // 根据规则类型过滤积分类型：累积规则用可兑换+记录，等级规则用算等级+记录
  const filteredPointTypes = useMemo(() => {
    if (rulePurpose === 'EARN_POINTS') return pointTypeOptions.filter(p => p.pointCategory === 'RECORD' || !p.isTierCalc);
    return pointTypeOptions.filter(p => p.pointCategory === 'RECORD' || p.isTierCalc);
  }, [pointTypeOptions, rulePurpose]);

  const updateConfig = useCallback((updater: (prev: RuleConfig) => RuleConfig) => setConfig(prev => updater({ ...prev })), []);

  // ---- Condition helpers ----
  const addConditionToGroup = (group: ConditionGroup, field = '') => {
    const newCond: Condition = { id: uid(), type: 'condition', field, operator: '>', value: '', connector: 'AND' };
    return { ...group, items: [...group.items, newCond] };
  };
  const addSubGroup = (group: ConditionGroup) => {
    const newGroup: ConditionGroup = { id: uid(), type: 'group', connector: 'OR', logic: 'AND', items: [] };
    return { ...group, items: [...group.items, newGroup] };
  };
  const removeFromGroup = (group: ConditionGroup, itemId: string) => ({ ...group, items: group.items.filter(i => i.id !== itemId) });
  const updateInGroup = (group: ConditionGroup, itemId: string, updates: any) => ({
    ...group, items: group.items.map(i => i.id !== itemId ? i : { ...i, ...updates }),
  });

  const insertFieldToCondition = (fieldCode: string) => {
    updateConfig(prev => {
      const lastItem = prev.lhs.items[prev.lhs.items.length - 1];
      if (lastItem && lastItem.type === 'condition' && !lastItem.field) {
        return { ...prev, lhs: updateInGroup(prev.lhs, lastItem.id, { field: fieldCode }) };
      }
      return { ...prev, lhs: addConditionToGroup(prev.lhs, fieldCode) };
    });
  };

  const handleSave = async (status = 'DRAFT') => {
    setSaving(true);
    try {
      const payload = {
        programCode: PROG, status, ruleName: config.name || '未命名规则',
        ruleCode: config.ruleId || `RULE_${Date.now()}`, ruleGroup: config.category,
        priority: config.priority, metadata: config, rulePurpose,
      };
      if (isNew) await api.post('/admin/rules', payload);
      else await api.put(`/admin/rules/${id}`, payload);
      message.success(status === 'ACTIVE' ? '已发布' : '已保存');
      navigate('/rules/engine');
    } catch (e: any) {
      message.error(e?.response?.data?.message || '保存失败');
    } finally { setSaving(false); }
  };

  // ---- Simulation ----
  const tieredAction = (config.rhs?.then?.[0] as TieredAction | undefined);
  const simResult = tieredAction?.type === 'tiered' ? simulateTiered(tieredAction, simAmount) : null;

  const naturalDesc = useMemo(() => {
    const parts: string[] = [];
    const conds = config.lhs.items.filter(i => i.type === 'condition') as Condition[];
    if (conds.length > 0) {
      parts.push(`当 ${conds.map(c => `${allFields.find(f => f.code === c.field)?.label || c.field} ${OPERATORS.find(o => o.value === c.operator)?.label || c.operator} ${c.value}`).join(' 且 ')} 时`);
    }
    if (tieredAction && tieredAction.type === 'tiered') {
      parts.push(`执行分段阶梯累进（依据 ${tieredAction.sourceField}），${tieredAction.tiers.map(t => `${t.lowerBound}~${t.upperBound ?? '∞'} → ${t.multiplier}倍`).join('，')}`);
    }
    return parts.join('；');
  }, [config, allFields, tieredAction]);

  if (loading) return <Spin style={{ display: 'block', margin: '100px auto' }} />;

  // Get sub-fields for a collection
  const getCollectionFields = (collectionCode: string) => {
    const parent = orderFields.find(f => f.code === collectionCode);
    return (parent?.children || []).map(c => ({ code: c.code, label: c.label, group: '订单明细' }));
  };

  // ---- Render: Condition Group (recursive) ----
  const renderConditionGroup = (group: ConditionGroup, depth = 0, onUpdate: (g: ConditionGroup) => void, fieldFilter?: { code: string; label: string; group: string }[]) => {
    const fields = fieldFilter || allFields;
    const isRoot = depth === 0;
    return (
      <div style={{ marginLeft: isRoot ? 0 : 16, borderLeft: isRoot ? 'none' : '3px solid #91caff', paddingLeft: isRoot ? 0 : 12, marginBottom: isRoot ? 0 : 8 }}>
        {!isRoot && (
          <div style={{ marginBottom: 4, display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ background: '#f0f0f0', border: '1px solid #d9d9d9', borderRadius: 4, padding: '2px 10px', fontSize: 12, fontWeight: 500, color: '#595959' }}>条件组</span>
            <Button size="small" type="text" danger icon={<DeleteOutlined />} onClick={() => onUpdate(removeFromGroup(group, group.id))} />
          </div>
        )}
        <div style={{ background: isRoot ? 'transparent' : '#fafafa', borderRadius: isRoot ? 0 : 6, padding: isRoot ? 0 : '8px 12px', border: isRoot ? 'none' : '1px solid #e8e8e8' }}>
          {group.items.map((item, idx) => {
            const isFirst = idx === 0;
            if (item.type === 'group') {
              const sg = item as ConditionGroup;
              return (
                <div key={item.id}>
                  {!isFirst && (
                    <div style={{ textAlign: 'center', margin: '4px 0' }}>
                      <span onClick={() => onUpdate({ ...group, items: group.items.map(i => i.id === sg.id ? { ...sg, connector: sg.connector === 'AND' ? 'OR' : 'AND' } : i) })}
                        style={{ background: sg.connector === 'AND' ? '#e6f4ff' : '#fff7e6', color: sg.connector === 'AND' ? '#1677ff' : '#fa8c16', border: `1px solid ${sg.connector === 'AND' ? '#91caff' : '#ffd591'}`, borderRadius: 4, padding: '1px 8px', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>{sg.connector}</span>
                    </div>
                  )}
                  {renderConditionGroup(sg, depth + 1, (u) => onUpdate({ ...group, items: group.items.map(i => i.id === u.id ? u : i) }))}
                </div>
              );
            }
            const cond = item as Condition;
            return (
              <div key={cond.id}>
                {!isFirst && (
                  <div style={{ textAlign: 'center', margin: '4px 0' }}>
                    <span onClick={() => onUpdate(updateInGroup(group, cond.id, { connector: cond.connector === 'AND' ? 'OR' : 'AND' }))}
                      style={{ background: cond.connector === 'AND' ? '#e6f4ff' : '#fff7e6', color: cond.connector === 'AND' ? '#1677ff' : '#fa8c16', border: `1px solid ${cond.connector === 'AND' ? '#91caff' : '#ffd591'}`, borderRadius: 4, padding: '1px 8px', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>{cond.connector}</span>
                  </div>
                )}
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <Select size="small" value={cond.field || undefined} style={{ width: 220 }} placeholder="选择字段" showSearch optionFilterProp="label" dropdownMatchSelectWidth={false}
                    options={fields.map(f => ({ label: `${f.label} (${f.group})`, value: f.code }))}
                    onChange={v => onUpdate(updateInGroup(group, cond.id, { field: v }))} />
                  <Select size="small" value={cond.operator} style={{ width: 90 }} options={OPERATORS}
                    onChange={v => onUpdate(updateInGroup(group, cond.id, { operator: v }))} />
                  {!['IS_NULL', 'IS_NOT_NULL'].includes(cond.operator) && (
                    cond.field && allFields.find((f: any) => f.code === cond.field)?.masterData ? (
                      <MasterDataSelect
                        masterData={allFields.find((f: any) => f.code === cond.field)?.masterData}
                        value={cond.value}
                        onChange={v => onUpdate(updateInGroup(group, cond.id, { value: v }))}
                      />
                    ) : (
                      <Input size="small" placeholder="值" style={{ width: 100 }} value={cond.value}
                        onChange={e => onUpdate(updateInGroup(group, cond.id, { value: e.target.value }))} />
                    )
                  )}
                  <Button size="small" type="text" danger icon={<DeleteOutlined />} onClick={() => onUpdate(removeFromGroup(group, cond.id))} />
                </div>
              </div>
            );
          })}
          <Space size={4} style={{ marginTop: 8 }}>
            <Button size="small" type="dashed" icon={<PlusOutlined />} onClick={() => onUpdate(addConditionToGroup(group))}>添加条件</Button>
            <Button size="small" type="dashed" icon={<BranchesOutlined />} onClick={() => onUpdate(addSubGroup(group))}>添加条件组</Button>
          </Space>
        </div>
      </div>
    );
  };

  // ---- Render: Action List (recursive) ----
  const renderActions = (actions: ActionItem[], onUpdate: (actions: ActionItem[]) => void, depth = 0, collectionContext?: string) => {
    const restrictedFields = collectionContext ? getCollectionFields(collectionContext) : undefined;
    return (
    <div style={{ marginLeft: depth * 16, borderLeft: depth > 0 ? '3px solid #b7eb8f' : 'none', paddingLeft: depth > 0 ? 12 : 0 }}>
      {actions.length === 0 && depth === 0 && <Empty description="暂无动作" image={Empty.PRESENTED_IMAGE_SIMPLE} style={{ margin: '12px 0' }} />}
      {actions.map((action, ai) => {
        const updateThis = (a: ActionItem) => { const u = [...actions]; u[ai] = a; onUpdate(u); };
        const removeThis = () => onUpdate(actions.filter((_, i) => i !== ai));

        if (action.type === 'assign' || action.type === 'accumulate') {
          const a = action as AssignAction;
          const MATH_OPS = [
            { label: '×', value: '*' }, { label: '÷', value: '/' },
            { label: '+', value: '+' }, { label: '-', value: '-' },
          ];
          return (
            <Card key={a.id} size="small" style={{ marginBottom: 6 }}
              title={<Space><Tag color={a.type === 'assign' ? 'blue' : 'orange'}>{a.type === 'assign' ? '✏️ 赋值' : '➕ 累加'}</Tag></Space>}
              extra={<Button size="small" type="text" danger icon={<DeleteOutlined />} onClick={removeThis} />}>
              {a.type === 'assign' ? (
                <Space wrap>
                  <Text style={{ fontSize: 12 }}>将</Text>
                  <Select size="small" value={a.pointType || undefined} style={{ width: 150 }} placeholder="积分类型" options={filteredPointTypes} showSearch optionFilterProp="label"
                    onChange={v => updateThis({ ...a, pointType: v })} />
                  <Text style={{ fontSize: 12 }}>设为</Text>
                  <Select size="small" value={a.sourceField || undefined} style={{ width: 130 }} placeholder="变量池字段" showSearch optionFilterProp="label"
                    options={allFields.map(f => ({ label: f.label, value: f.code }))}
                    onChange={v => updateThis({ ...a, sourceField: v })} />
                  <Select size="small" value={a.operator || '*'} style={{ width: 50 }} options={MATH_OPS}
                    onChange={v => updateThis({ ...a, operator: v })} />
                  <InputNumber size="small" value={a.value || 1} step={0.5} style={{ width: 80 }}
                    onChange={v => updateThis({ ...a, value: v ?? 1 })} />
                </Space>
              ) : (
                <Space wrap>
                  <Text style={{ fontSize: 12 }}>在</Text>
                  <Select size="small" value={a.pointType || undefined} style={{ width: 150 }} placeholder="积分类型" options={filteredPointTypes} showSearch optionFilterProp="label"
                    onChange={v => updateThis({ ...a, pointType: v })} />
                  <Text style={{ fontSize: 12 }}>上累加</Text>
                  <InputNumber size="small" value={a.value || 0} style={{ width: 100 }}
                    onChange={v => updateThis({ ...a, value: v ?? 0 })} />
                </Space>
              )}
            </Card>
          );
        }

        if (action.type === 'loop') {
          const a = action as LoopAction;
          return (
            <Card key={a.id} size="small" style={{ marginBottom: 6, background: '#fafafa', border: '1px dashed #d9d9d9' }}
              title={<Space><Tag color="purple">🔄 循环遍历</Tag></Space>}
              extra={<Button size="small" type="text" danger icon={<DeleteOutlined />} onClick={removeThis} />}>
              <Space style={{ marginBottom: 8 }}>
                <Text style={{ fontSize: 12 }}>遍历集合:</Text>
                <Select size="small" value={a.collection || undefined} style={{ width: 140 }} placeholder="选择集合字段"
                  options={orderFields.filter(f => f.type === 'array').map(f => ({ label: f.label, value: f.code }))}
                  onChange={v => updateThis({ ...a, collection: v })} />
                <Text style={{ fontSize: 12 }}>元素变量:</Text>
                <Input size="small" placeholder="如 item" value={a.elementVar} style={{ width: 80 }}
                  onChange={e => updateThis({ ...a, elementVar: e.target.value })} />
              </Space>
              {renderActions(a.actions || [], (sub) => updateThis({ ...a, actions: sub }), depth + 1, a.collection)}
            </Card>
          );
        }

        if (action.type === 'branch') {
          const a = action as BranchAction;
          return (
            <Card key={a.id} size="small" style={{ marginBottom: 6, background: '#fafafa', border: '1px dashed #d9d9d9' }}
              title={<Space><Tag color="cyan">❓ 条件分支</Tag></Space>}
              extra={<Button size="small" type="text" danger icon={<DeleteOutlined />} onClick={removeThis} />}>
              <div style={{ marginBottom: 8 }}><Text type="secondary" style={{ fontSize: 11 }}>如果满足：</Text>
                {renderConditionGroup(a.conditions, 0, (g) => updateThis({ ...a, conditions: g }), restrictedFields)}
              </div>
              <Divider style={{ margin: '4px 0' }} />
              <div style={{ background: '#f6ffed', borderRadius: 4, padding: '4px 8px', marginBottom: 4 }}>
                <Text strong style={{ fontSize: 12, color: '#52c41a' }}>那么 (THEN)：</Text>
                {renderActions(a.thenActions || [], (sub) => updateThis({ ...a, thenActions: sub }), depth + 1, collectionContext)}
              </div>
              <div style={{ background: '#fff2f0', borderRadius: 4, padding: '4px 8px' }}>
                <Text strong style={{ fontSize: 12, color: '#ff4d4f' }}>否则 (ELSE)：</Text>
                {renderActions(a.elseActions || [], (sub) => updateThis({ ...a, elseActions: sub }), depth + 1, collectionContext)}
              </div>
            </Card>
          );
        }

        if (action.type === 'tiered') {
          const ta = action as TieredAction;
          return (
            <Card key={ta.id} size="small" style={{ marginBottom: 6 }}
              title={<Space><Tag color="green">📊 分段阶梯累进</Tag></Space>}
              extra={<Button size="small" type="text" danger icon={<DeleteOutlined />} onClick={removeThis} />}>
              <div style={{ background: '#f6ffed', borderRadius: 4, padding: '6px 10px', marginBottom: 8, fontSize: 12 }}>
                <Text type="secondary">公式：</Text>
                <Select size="small" value={ta.pointType || undefined} style={{ width: 150 }} placeholder="积分类型" options={filteredPointTypes} showSearch optionFilterProp="label"
                  onChange={v => updateThis({ ...ta, pointType: v })} />
                <Text style={{ margin: '0 4px' }}>=</Text>
                <Select size="small" value={ta.sourceField} style={{ width: 130 }} placeholder="依据字段" options={orderFields.map(f => ({ label: f.label, value: f.code }))}
                  onChange={v => updateThis({ ...ta, sourceField: v })} />
                <Text style={{ margin: '0 4px' }}>× 阶梯倍数</Text>
              </div>
              <div style={{ display: 'flex', gap: 12, marginBottom: 8, flexWrap: 'wrap' }}>
                <Radio.Group size="small" value={ta.mode} onChange={e => updateThis({ ...ta, mode: e.target.value as any })}>
                  <Radio.Button value="attribution">区间归属</Radio.Button>
                  <Radio.Button value="deduction">档位扣减</Radio.Button>
                </Radio.Group>
              </div>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, marginBottom: 8 }}>
                <thead><tr style={{ background: '#fafafa' }}>
                  <th style={{ padding: '4px 8px' }}>下限</th><th style={{ padding: '4px 8px' }}>上限</th><th style={{ padding: '4px 8px' }}>倍数</th><th style={{ width: 40 }}></th>
                </tr></thead>
                <tbody>{ta.tiers.map((tier, ti) => (
                  <tr key={tier.id}>
                    <td style={{ padding: 2 }}><InputNumber size="small" value={tier.lowerBound} min={0} style={{ width: 70 }}
                      onChange={v => { const t = [...ta.tiers]; t[ti] = { ...t[ti], lowerBound: v ?? 0 }; updateThis({ ...ta, tiers: t }); }} /></td>
                    <td style={{ padding: 2 }}><InputNumber size="small" value={tier.upperBound} min={0} placeholder="∞" style={{ width: 70 }}
                      onChange={v => { const t = [...ta.tiers]; t[ti] = { ...t[ti], upperBound: v || null }; updateThis({ ...ta, tiers: t }); }} /></td>
                    <td style={{ padding: 2 }}><InputNumber size="small" value={tier.multiplier} min={0} step={0.5} style={{ width: 60 }}
                      onChange={v => { const t = [...ta.tiers]; t[ti] = { ...t[ti], multiplier: v ?? 1 }; updateThis({ ...ta, tiers: t }); }} /></td>
                    <td style={{ padding: 2 }}><Button size="small" type="text" danger icon={<DeleteOutlined />}
                      onClick={() => { const t = ta.tiers.filter((_, j) => j !== ti); updateThis({ ...ta, tiers: t }); }} /></td>
                  </tr>
                ))}</tbody>
              </table>
              <Button size="small" type="dashed" icon={<PlusOutlined />} block
                onClick={() => updateThis({ ...ta, tiers: [...ta.tiers, { id: uid(), lowerBound: 0, upperBound: 1000, multiplier: 1.0 }] })}>添加阶梯行</Button>
              <Collapse ghost size="small" style={{ marginTop: 8 }} items={[{
                key: 'cap', label: <Text style={{ fontSize: 12 }}>积分上限与溢出处理</Text>,
                children: (
                  <div style={{ background: '#fffbe6', padding: 12, borderRadius: 6 }}>
                    <Space><Switch size="small" checked={ta.capping?.enabled} onChange={v => updateThis({ ...ta, capping: { ...ta.capping, enabled: v } })} />
                      <Text style={{ fontSize: 12 }}>启用积分上限</Text></Space>
                    {ta.capping?.enabled && (
                      <div style={{ marginTop: 8, display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
                        <Space><Text style={{ fontSize: 12 }}>最高</Text><InputNumber size="small" value={ta.capping.maxPoints} min={0} style={{ width: 100 }}
                          onChange={v => updateThis({ ...ta, capping: { ...ta.capping, maxPoints: v ?? 0 } })} addonAfter="分" /></Space>
                        <Space><Text style={{ fontSize: 12 }}>超出后</Text>
                          <Radio.Group size="small" value={ta.capping.overflowMode} onChange={e => updateThis({ ...ta, capping: { ...ta.capping, overflowMode: e.target.value as any } })}>
                            <Radio.Button value="discard">丢弃</Radio.Button><Radio.Button value="multiply">按倍数继续</Radio.Button>
                          </Radio.Group>
                          {ta.capping.overflowMode === 'multiply' && <InputNumber size="small" value={ta.capping.overflowMultiplier} min={0} step={0.5} style={{ width: 60 }}
                            onChange={v => updateThis({ ...ta, capping: { ...ta.capping, overflowMultiplier: v ?? 1 } })} addonAfter="倍" />}
                        </Space>
                      </div>
                    )}
                  </div>
                ),
              }]} />
            </Card>
          );
        }
        return null;
      })}
      <Dropdown menu={{ items: ACTION_TYPES.map(a => ({
        key: a.key, label: <div><div style={{ fontWeight: 500 }}>{a.label}</div><div style={{ fontSize: 11, color: '#888' }}>{a.desc}</div></div>,
        onClick: () => {
          const nid = uid(); let na: ActionItem;
          switch (a.key) {
            case 'tiered': na = { id: nid, type: 'tiered', sourceField: 'orderAmount', targetField: 'finalPoints', pointType: '', mode: 'deduction', tiers: [{ id: uid(), lowerBound: 0, upperBound: 1000, multiplier: 1.0 }, { id: uid(), lowerBound: 1000, upperBound: 2000, multiplier: 1.2 }, { id: uid(), lowerBound: 2000, upperBound: 3000, multiplier: 1.5 }, { id: uid(), lowerBound: 3000, upperBound: null, multiplier: 2.0 }], capping: { enabled: false, maxPoints: 10000, overflowMode: 'multiply', overflowMultiplier: 1.0 } }; break;
            case 'assign': na = { id: nid, type: 'assign', pointType: '', sourceField: '', operator: '*', value: 1 }; break;
            case 'accumulate': na = { id: nid, type: 'accumulate', pointType: '', value: 0 }; break;
            case 'loop': na = { id: nid, type: 'loop', collection: 'items', elementVar: 'item', actions: [] }; break;
            case 'branch': na = { id: nid, type: 'branch', conditions: { id: uid(), type: 'group', connector: 'AND', logic: 'AND', items: [] }, thenActions: [], elseActions: [] }; break;
            default: return;
          }
          onUpdate([...actions, na]);
        },
      })), }} trigger={['click']}>
        <Button size="small" type="dashed" icon={<PlusOutlined />} style={{ marginTop: actions.length > 0 ? 8 : 0 }}>添加动作 <DownOutlined /></Button>
      </Dropdown>
    </div>
  );
  };

  return (
    <div style={{ height: 'calc(100vh - 80px)', display: 'flex', flexDirection: 'column' }}>
      {/* 第一行：标题 + 返回 */}
      <div style={{ display: 'flex', alignItems: 'center', padding: '8px 16px', borderBottom: '1px solid #f0f0f0', background: '#fff' }}>
        <Title level={5} style={{ margin: 0 }}>规则配置</Title>
        <div style={{ flex: 1 }} />
        <Button onClick={() => navigate('/rules')}>返回列表</Button>
      </div>
      {/* 第二行：规则类型 + 名称 + 优先级 + 操作按钮 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 16px', borderBottom: '1px solid #f0f0f0', background: '#fafafa' }}>
        <Select value={rulePurpose} style={{ width: 170 }}
          onChange={v => setRulePurpose(v)}
          options={[
            { label: '积分累积规则', value: 'EARN_POINTS' },
            { label: '等级积分累积规则', value: 'TIER_UPGRADE' },
          ]} />
        <Input placeholder="规则名称" value={config.name} style={{ width: 200 }}
          onChange={e => updateConfig(prev => ({ ...prev, name: e.target.value }))} />
        <Text type="secondary">优先级:</Text>
        <InputNumber value={config.priority} min={1} max={999} style={{ width: 70 }}
          onChange={v => updateConfig(prev => ({ ...prev, priority: v ?? 20 }))} />
        <div style={{ flex: 1 }} />
        <Button icon={<SaveOutlined />} onClick={() => handleSave('DRAFT')} loading={saving}>保存</Button>
        <Button type="primary" icon={<SendOutlined />} onClick={() => handleSave('ACTIVE')} loading={saving}>发布</Button>
      </div>

      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        {/* Left: Variable Pool */}
        <div style={{ width: 260, borderRight: '1px solid #f0f0f0', background: '#fafafa', overflow: 'auto', padding: 12 }}>
          <div style={{ marginBottom: 8 }}><Text strong style={{ fontSize: 13 }}>变量池</Text>
            <Input size="small" prefix={<SearchOutlined />} placeholder="搜索字段..." value={varSearch}
              onChange={e => setVarSearch(e.target.value)} style={{ marginTop: 4 }} allowClear />
          </div>
          {['订单', '会员', '变量'].map(group => {
            const fields = group === '订单' ? orderFields : group === '会员' ? memberFields : variableOptions.map(v => ({ code: v.value, label: v.label, type: 'string' }));
            const filtered = fields.filter((f: any) => {
              const kw = varSearch.toLowerCase();
              return f.label.toLowerCase().includes(kw) || f.code.toLowerCase().includes(kw) ||
                (f.children || []).some((c: any) => c.label.toLowerCase().includes(kw) || c.code.toLowerCase().includes(kw));
            });
            if (filtered.length === 0) return null;
            return (
              <Collapse key={group} defaultActiveKey={[group]} ghost size="small" items={[{
                key: group, label: <Text strong style={{ fontSize: 12 }}>{group === '订单' ? '📦' : group === '会员' ? '👤' : '📊'} {group}相关</Text>,
                children: filtered.map((f: any) => (
                  <div key={f.code}>
                    <div style={{ padding: '4px 8px', cursor: 'pointer', borderRadius: 4, fontSize: 12, display: 'flex', alignItems: 'center', gap: 4 }}
                      onMouseEnter={e => { e.currentTarget.style.background = '#e6f4ff'; }} onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
                      onClick={() => insertFieldToCondition(f.code)} title="点击添加到条件">
                      <Text style={{ fontSize: 12 }}>{f.label}</Text>
                      <Text type="secondary" style={{ fontSize: 10 }}>{f.code}</Text>
                      {f.type === 'array' && <Tag color="purple" style={{ fontSize: 10, marginLeft: 4 }}>集合</Tag>}
                    </div>
                    {f.children && f.children.length > 0 && (
                      <div style={{ marginLeft: 16, borderLeft: '2px solid #e8e8e8', paddingLeft: 8 }}>
                        {f.children.map((c: any) => (
                          <div key={c.code} style={{ padding: '3px 8px', cursor: 'pointer', borderRadius: 4, fontSize: 11, display: 'flex', alignItems: 'center', gap: 4 }}
                            onMouseEnter={e => { e.currentTarget.style.background = '#fff7e6'; }} onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
                            onClick={() => insertFieldToCondition(c.code)} title="点击添加到条件">
                            <Text style={{ fontSize: 11 }}>{c.label}</Text>
                            <Text type="secondary" style={{ fontSize: 9 }}>{c.code}</Text>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )),
              }]} />
            );
          })}
        </div>

        {/* Center: Canvas */}
        <div style={{ flex: 1, overflow: 'auto', padding: 12 }}>
          <Card size="small" style={{ marginBottom: 12, background: '#f0f5ff', border: '1px solid #adc6ff' }}
            title={<Space><Tag color="blue">如果 (IF)</Tag><Text>满足以下条件：</Text></Space>}>
            {config.lhs.items.length === 0 ? (
              <Empty description="暂无条件" image={Empty.PRESENTED_IMAGE_SIMPLE} style={{ margin: '12px 0' }} />
            ) : renderConditionGroup(config.lhs, 0, (g) => updateConfig(prev => ({ ...prev, lhs: g })))}
          </Card>
          <Card size="small" style={{ marginBottom: 12, background: '#f6ffed', border: '1px solid #b7eb8f' }}
            title={<Space><Tag color="green">那么 (THEN)</Tag><Text>执行：</Text></Space>}>
            {renderActions(config.rhs?.then || [], (a) => updateConfig(prev => ({ ...prev, rhs: { ...prev.rhs, then: a } })))}
          </Card>
          <Card size="small" style={{ background: '#fff2f0', border: '1px solid #ffccc7' }}
            title={<Space><Tag color="red">否则 (ELSE)</Tag><Text>执行：</Text></Space>}>
            {renderActions(config.rhs?.else || [], (a) => updateConfig(prev => ({ ...prev, rhs: { ...prev.rhs, else: a } })))}
          </Card>
        </div>

        {/* Right: Preview */}
        <div style={{ width: 320, borderLeft: '1px solid #f0f0f0', background: '#fafafa', overflow: 'auto', padding: 12 }}>
          <Card size="small" title="规则语义预览"><Paragraph style={{ fontSize: 12, whiteSpace: 'pre-wrap' }}>{naturalDesc}</Paragraph></Card>
          <Card size="small" title={<Space><CalculatorOutlined />模拟计算器</Space>} style={{ marginTop: 12 }}>
            <Space style={{ marginBottom: 12 }}><Text style={{ fontSize: 12 }}>订单金额：</Text>
              <InputNumber value={simAmount} min={0} onChange={v => setSimAmount(v ?? 0)} style={{ width: 120 }} addonAfter="元" />
            </Space>
            {simResult && (
              <div style={{ fontSize: 12 }}>
                {simResult.steps.map((s, i) => <div key={i} style={{ padding: '2px 0' }}>· {s}</div>)}
                <Divider style={{ margin: '8px 0' }} />
                <div>毛积分：<Text strong>{simResult.grossPoints.toFixed(0)}</Text> 分</div>
                {simResult.capped && <><div>触发上限：<Text type="danger">{simResult.grossPoints.toFixed(0)} → {simResult.finalPoints.toFixed(0)}</Text></div>
                  {simResult.overflowPoints > 0 && <div>溢出补足：<Text>{simResult.overflowPoints.toFixed(0)} 分</Text></div>}</>}
                <Divider style={{ margin: '8px 0' }} />
                <div><Text strong style={{ fontSize: 16, color: '#1677ff' }}>最终 {simResult.finalPoints.toFixed(0)} 分</Text></div>
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
};

export default RuleEngineEditor;