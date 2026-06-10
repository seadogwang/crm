import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import {
  Card, Form, Input, InputNumber, Select, Button, message, Space, Tag,
  Typography, Divider, Table, Checkbox, Radio, Row, Col, DatePicker, Collapse,
} from 'antd';
import {
  SaveOutlined, SendOutlined, PlusOutlined, DeleteOutlined,
  PlayCircleOutlined, EditOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import PageWrapper from '../components/PageWrapper';
import api from '../api';

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
}

const ENTITY_OPTIONS: Option[] = [
  { label: 'ORDER (订单)', value: 'ORDER' },
  { label: 'BEHAVIOR (行为)', value: 'BEHAVIOR' },
  { label: 'MEMBER (会员)', value: 'MEMBER' },
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

  // 触发条件 — 与基础规则一致
  const [selectedEntity, setSelectedEntity] = useState('ORDER');
  const [schemaFields, setSchemaFields] = useState<SchemaField[]>([]);
  const [extConditions, setExtConditions] = useState<ExtCondition[]>([]);
  const [editingCondIdx, setEditingCondIdx] = useState<number | null>(null);

  // 奖励规则
  const [steps, setSteps] = useState<RewardStep[]>([
    { key: '1', lower: 0, upper: undefined, multiplier: 1.0, isCycleThreshold: false, lowerInclusive: true, upperInclusive: false },
  ]);
  const [cycleMode, setCycleMode] = useState<string>('SINGLE_MATCH');
  const [remainderMode, setRemainderMode] = useState<string>('USE_STEP_MULTIPLIER');
  const [remainderFixedMult, setRemainderFixedMult] = useState(1.0);
  const [perOrderLimit, setPerOrderLimit] = useState<number | undefined>(undefined);
  const [accumulativeLimit, setAccumulativeLimit] = useState<number | undefined>(undefined);
  const [excessStrategy, setExcessStrategy] = useState('STOP');
  const [downgradeMultiplier, setDowngradeMultiplier] = useState(1.0);
  const [downgradeContinueCycle, setDowngradeContinueCycle] = useState(false);

  // 预览
  const [previewAmount, setPreviewAmount] = useState(1000);
  const [previewAlready, setPreviewAlready] = useState(0);
  const [previewResult, setPreviewResult] = useState<any>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  // 保存
  const [saving, setSaving] = useState(false);

  // 加载 Schema — 根据选中实体
  useEffect(() => {
    api.get(`/schemas/${selectedEntity}`).then(({ data }) => {
      const s = data?.data?.schema || data?.data;
      setSchemaFields(Object.entries(s?.properties || {}).map(([k, v]: any) => ({
        label: `${v.title || k} (${k})`, value: k, type: v.type || 'string', format: v.format, enumValues: v.enum,
      })));
    }).catch(() => {});
  }, [selectedEntity]);

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
              value: typeof c.value === 'string' ? c.value : JSON.stringify(c.value),
              valueEnd: c.valueEnd || '',
            })));
          }
          if (meta.reward) {
            const rw = meta.reward;
            if (rw.steps) setSteps(rw.steps);
            if (rw.cycleMode) setCycleMode(rw.cycleMode);
            if (rw.perOrderLimit) setPerOrderLimit(rw.perOrderLimit);
            if (rw.accumulativeLimit) setAccumulativeLimit(rw.accumulativeLimit);
            if (rw.excessStrategy) setExcessStrategy(rw.excessStrategy);
            if (rw.remainderMode) setRemainderMode(rw.remainderMode);
          }
        }
      } catch (e) {}
    }).catch(() => {});
  }, [id]);

  
  const addStep = () => {
    const lastStep = steps[steps.length - 1];
    setSteps([...steps, { key: String(Date.now()), lower: lastStep.upper || 0, upper: undefined, multiplier: 1.0, isCycleThreshold: false, lowerInclusive: true, upperInclusive: false }]);
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
      entity: c.entity,
      attribute: c.field,
      operator: c.op,
      type: c.type,
      value: c.op?.startsWith('BETWEEN') ? { min: Number(c.value), max: Number(c.valueEnd) } : c.value,
    })),
    effective_time_range: {
      start: effectiveStart || null,
      end: isPermanent ? null : (effectiveEnd || null),
    },
    reward: {
      steps: steps.map(s => ({ lower: s.lower, upper: s.upper, multiplier: s.multiplier, isCycleThreshold: s.isCycleThreshold })),
      cycleMode,
      cycleThresholdOrder: cycleThresholds,
      remainderMode,
      remainderFixedMultiplier: remainderFixedMult,
      perOrderLimit: perOrderLimit,
      accumulativeLimit: accumulativeLimit,
      excessStrategy,
      downgradeMultiplier,
      downgradeContinueCycle,
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
    { title: '循环点', dataIndex: 'isCycleThreshold', width: 60, render: (v: boolean, _: any, i: number) => <Checkbox checked={v} onChange={e => { const n = [...steps]; n[i] = { ...n[i], isCycleThreshold: e.target.checked }; setSteps(n); }} /> },
    { title: '操作', key: 'act', width: 60, render: (_: any, __: any, i: number) => <Button size="small" danger icon={<DeleteOutlined />} onClick={() => removeStep(steps[i].key)} /> },
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

      {/* 触发条件 — 与基础规则一致 */}
      <div style={{ marginBottom: 12 }}>
        <Text type="secondary" style={{ fontSize: 12, marginBottom: 4, display: 'block' }}>业务实体</Text>
        <Space wrap>
          {ENTITY_OPTIONS.map(e => (
            <Button key={e.value}
              type={selectedEntity === e.value ? 'primary' : 'default'}
              size="small"
              onClick={() => setSelectedEntity(e.value)}
            >{e.label}</Button>
          ))}
        </Space>
      </div>

      <Card size="small" title={<Space><Tag color="blue">{selectedEntity}</Tag>可用属性</Space>}
        extra={<Text type="secondary" style={{ fontSize: 11 }}>点击属性添加为条件</Text>} style={{ marginBottom: 12 }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {schemaFields.filter(f => f.type !== 'array').map(f => {
            const added = extConditions.some(c => c.field === f.value && c.entity === selectedEntity);
            return (
              <Tag key={f.value}
                style={{ cursor: 'pointer', fontSize: 12, padding: '2px 10px', border: added ? '1px solid #1677ff' : '1px dashed #d9d9d9', background: added ? '#f0f5ff' : '#fff' }}
                color={added ? (f.type === 'number' ? 'blue' : f.type === 'string' ? 'green' : 'orange') : undefined}
                onClick={() => {
                  const exists = extConditions.findIndex(c => c.field === f.value && c.entity === selectedEntity);
                  if (exists >= 0) { setEditingCondIdx(exists); }
                  else {
                    const newIdx = extConditions.length;
                    setExtConditions([...extConditions, { key: String(Date.now()), entity: selectedEntity, field: f.value, type: f.type, format: f.format, op: f.type === 'number' || f.format ? '>=' : '==', value: '' }]);
                    setEditingCondIdx(newIdx);
                  }
                }}
              >{added ? '✓ ' : '+ '}{f.label}</Tag>
            );
          })}
        </div>
      </Card>

      {/* 条件列表 */}
      {extConditions.filter(c => c.field).length > 0 && (
        <Card size="small" title={<Space><Tag color="green">{extConditions.filter(c => c.field).length}</Tag>已添加的条件</Space>} style={{ marginTop: 12, marginBottom: 12 }}>
          {extConditions.filter(c => c.field).map((c, i) => {
            const fm = schemaFields.find(f => f.value === c.field);
            const isEditing = editingCondIdx === i;
            return (
              <div key={c.key} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: isEditing ? '6px 8px' : '4px 0', background: isEditing ? '#fffbe6' : 'transparent', borderRadius: 4, flexWrap: 'wrap' }}>
                <Tag color={c.entity === 'ORDER' ? 'blue' : c.entity === 'MEMBER' ? 'green' : 'orange'} style={{ fontSize: 10, margin: 0 }}>{c.entity}</Tag>
                <Tag color={c.type === 'number' ? 'blue' : c.format === 'date-time' ? 'orange' : 'green'} style={{ margin: 0, flexShrink: 0 }}>{fm?.label || c.field}</Tag>
                {isEditing ? (<>
                  <Select size="small" value={c.op} options={getOpsForField(c.type, c.format)} style={{ width: c.op?.startsWith('BETWEEN') ? 120 : 70 }}
                    onChange={v => { const n = [...extConditions]; n[i] = { ...n[i], op: v, value: '', valueEnd: '' }; setExtConditions(n); }} />
                  {c.op?.startsWith('BETWEEN') ? (
                    <Space size={4}>
                      {c.format === 'date-time' ? <DatePicker size="small" showTime format="YYYY-MM-DD HH:mm:ss" placeholder="起始" style={{ width: 150 }} value={c.value ? dayjs(c.value) : null} onChange={(d: any) => { const n = [...extConditions]; n[i] = { ...n[i], value: d ? d.format('YYYY-MM-DD HH:mm:ss') : '' }; setExtConditions(n); }} /> : <InputNumber size="small" placeholder="起始" style={{ width: 80 }} value={c.value ? Number(c.value) : undefined} onChange={v => { const n = [...extConditions]; n[i] = { ...n[i], value: String(v ?? '') }; setExtConditions(n); }} />}
                      <Text type="secondary">~</Text>
                      {c.format === 'date-time' ? <DatePicker size="small" showTime format="YYYY-MM-DD HH:mm:ss" placeholder="结束" style={{ width: 150 }} value={c.valueEnd ? dayjs(c.valueEnd) : null} onChange={(d: any) => { const n = [...extConditions]; n[i] = { ...n[i], valueEnd: d ? d.format('YYYY-MM-DD HH:mm:ss') : '' }; setExtConditions(n); }} /> : <InputNumber size="small" placeholder="结束" style={{ width: 80 }} value={c.valueEnd ? Number(c.valueEnd) : undefined} onChange={v => { const n = [...extConditions]; n[i] = { ...n[i], valueEnd: String(v ?? '') }; setExtConditions(n); }} />}
                    </Space>
                  ) : c.type === 'number' ? (
                    <InputNumber size="small" placeholder="数值" style={{ width: 100 }} value={c.value ? Number(c.value) : undefined} onChange={v => { const n = [...extConditions]; n[i] = { ...n[i], value: String(v ?? '') }; setExtConditions(n); }} onPressEnter={() => setEditingCondIdx(null)} />
                  ) : fm?.enumValues?.length ? (
                    <Select size="small" style={{ width: 140 }} value={c.value || undefined} options={fm.enumValues.map(e => ({ label: e, value: e }))} onChange={v => { const n = [...extConditions]; n[i] = { ...n[i], value: v }; setExtConditions(n); setEditingCondIdx(null); }} />
                  ) : c.format === 'date-time' ? (
                    <DatePicker size="small" showTime format="YYYY-MM-DD HH:mm:ss" style={{ width: 170 }} value={c.value ? dayjs(c.value) : null} onChange={(d: any) => { const n = [...extConditions]; n[i] = { ...n[i], value: d ? d.format('YYYY-MM-DD HH:mm:ss') : '' }; setExtConditions(n); setEditingCondIdx(null); }} />
                  ) : (
                    <Input size="small" placeholder="输入值" style={{ width: 120 }} value={c.value} onChange={e => { const n = [...extConditions]; n[i] = { ...n[i], value: e.target.value }; setExtConditions(n); }} onPressEnter={() => setEditingCondIdx(null)} />
                  )}
                  <Button size="small" type="link" onClick={() => setEditingCondIdx(null)}>确定</Button>
                  <Button size="small" type="link" danger onClick={() => { setExtConditions(extConditions.filter((_, j) => j !== i)); setEditingCondIdx(null); }}>×</Button>
                </>) : (<>
                  <Text style={{ fontSize: 12 }}>{c.op?.startsWith('BETWEEN') ? `${c.op === 'BETWEEN_EQ' ? '区间[含]' : '区间'} ${c.value || '?'} ~ ${c.valueEnd || '?'}` : `${c.op} ${c.value || '(未设置)'}`}</Text>
                  <Button size="small" type="link" style={{ padding: 0 }} icon={<EditOutlined style={{ fontSize: 13, color: '#595959' }} />} onClick={() => setEditingCondIdx(i)} />
                  <Button size="small" type="link" danger style={{ padding: 0 }} icon={<DeleteOutlined style={{ fontSize: 13, color: '#8c8c8c' }} />} onClick={() => setExtConditions(extConditions.filter((_, j) => j !== i))} />
                </>)}
              </div>
            );
          })}
        </Card>
      )}

      {/* 奖励规则 */}
      <Card size="small" title="奖励规则（阶梯）" extra={<Button size="small" type="dashed" icon={<PlusOutlined />} onClick={addStep}>添加区间</Button>} style={{ marginBottom: 16 }}>
        <Table dataSource={steps} columns={stepColumns} rowKey="key" size="small" pagination={false} />
        <Text type="secondary" style={{ fontSize: 11 }}>上限为空表示无上限；"循环点"仅在启用循环扣除时显示</Text>
      </Card>

      {/* 循环扣除配置 */}
      <Collapse ghost style={{ marginBottom: 16 }} items={[{
        key: 'cycle', label: <Space><Checkbox checked={cycleMode === 'THRESHOLD_LOOP'} onChange={e => setCycleMode(e.target.checked ? 'THRESHOLD_LOOP' : 'SINGLE_MATCH')}>启用循环扣除</Checkbox></Space>,
        children: (
          <div>
            <Form.Item label="循环分段点（从高到低）" style={{ marginBottom: 8 }}>
              {cycleThresholds.map((t, i) => <Tag key={i} color="blue" style={{ marginRight: 4 }}>{t}</Tag>)}
              {cycleThresholds.length === 0 && <Text type="secondary">请在阶梯表格中勾选"循环点"</Text>}
            </Form.Item>
            <Form.Item label="剩余金额处理" style={{ marginBottom: 0 }}>
              <Radio.Group value={remainderMode} onChange={e => setRemainderMode(e.target.value)}>
                <Radio value="USE_STEP_MULTIPLIER">按阶梯倍数</Radio>
                <Radio value="FIXED_MULTIPLIER">固定倍数</Radio>
              </Radio.Group>
              {remainderMode === 'FIXED_MULTIPLIER' && <InputNumber size="small" min={0.1} step={0.1} value={remainderFixedMult} onChange={v => setRemainderFixedMult(v || 0.1)} style={{ marginLeft: 8 }} />}
            </Form.Item>
          </div>
        ),
      }]} />

      {/* 上限控制 */}
      <Card size="small" title="上限控制" style={{ marginBottom: 16 }}>
        <Row gutter={16}>
          <Col span={8}><Form.Item label="单笔上限" style={{ marginBottom: 0 }}><InputNumber size="small" min={0} value={perOrderLimit} onChange={v => setPerOrderLimit(v || undefined)} addonAfter="分" style={{ width: '100%' }} placeholder="不限" /></Form.Item></Col>
          <Col span={8}><Form.Item label="累计上限" style={{ marginBottom: 0 }}><InputNumber size="small" min={0} value={accumulativeLimit} onChange={v => setAccumulativeLimit(v || undefined)} addonAfter="分" style={{ width: '100%' }} placeholder="不限" /></Form.Item></Col>
        </Row>
        {(accumulativeLimit || 0) > 0 && (
          <>
            <Divider style={{ margin: '8px 0' }} />
            <Form.Item label="超限策略" style={{ marginBottom: 0 }}>
              <Select size="small" value={excessStrategy} options={EXCESS_STRATEGIES} style={{ width: 200 }}
                onChange={v => setExcessStrategy(v)} />
            </Form.Item>
            {excessStrategy === 'TRUNCATE_AND_DOWNGRADE' && (
              <div style={{ marginTop: 8 }}>
                <Form.Item label="降级倍数" style={{ marginBottom: 4 }}>
                  <InputNumber size="small" min={0} step={0.1} value={downgradeMultiplier} onChange={v => setDowngradeMultiplier(v || 0)} />
                </Form.Item>
                <Checkbox checked={downgradeContinueCycle} onChange={e => setDowngradeContinueCycle(e.target.checked)}>降级后继续循环</Checkbox>
              </div>
            )}
          </>
        )}
      </Card>

      {/* 预览 */}
      <Card size="small" title={<Space><PlayCircleOutlined />测试与预览</Space>} style={{ marginBottom: 16 }}>
        <Row gutter={16} align="middle">
          <Col>订单金额: <InputNumber size="small" min={0} value={previewAmount} onChange={v => setPreviewAmount(v || 0)} style={{ width: 100 }} addonAfter="元" /></Col>
          <Col>已累计: <InputNumber size="small" min={0} value={previewAlready} onChange={v => setPreviewAlready(v || 0)} style={{ width: 100 }} addonAfter="分" /></Col>
          <Col><Button icon={<PlayCircleOutlined />} onClick={handlePreview} loading={previewLoading}>运行预览</Button></Col>
        </Row>
        {previewResult && (
          <Card size="small" style={{ marginTop: 12, background: '#f6ffed' }}>
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
      </Card>
    </PageWrapper>
  );
};

export default PromoEditor;