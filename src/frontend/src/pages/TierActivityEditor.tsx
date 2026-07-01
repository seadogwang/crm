import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Card, Form, Input, InputNumber, Select, Button, message, Space, Tag,
  Typography, Divider, Row, Col, DatePicker, Checkbox,
} from 'antd';
import {
  SaveOutlined, SendOutlined, PlusOutlined, DeleteOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import { useCampaignStyles, TitleWithDesc, CampaignCard } from './campaign/styles/campaign-ui-standard';
import api from '../api';

const { Title, Text } = Typography;

type Option = { label: string; value: string; pointCategory?: string };
type SchemaField = Option & { type: string; format?: string; enumValues?: string[] };

interface ExtCondition {
  key: string; entity: string; field: string; type?: string; format?: string;
  op: string; value: string; valueEnd?: string;
}

const ENTITY_OPTIONS: Option[] = [
  { label: 'Order (订单)', value: 'ORDER' },
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

const HoverInput: React.FC<{ value: string; onChange: (v: string) => void; w?: number | string; placeholder?: string }> = ({ value, onChange, w, placeholder }) => {
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

const TierActivityEditor: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const isEdit = !!id;

  // 基本信息
  const [activityCode, setActivityCode] = useState('');
  const [activityName, setActivityName] = useState('');
  const [targetTierCode, setTargetTierCode] = useState('');
  const [extendValidity, setExtendValidity] = useState(true);
  const [memberScope, setMemberScope] = useState('ALL');
  const [description, setDescription] = useState('');
  const [validStartTime, setValidStartTime] = useState<string>('');
  const [validEndTime, setValidEndTime] = useState<string>('');

  // 触发条件
  const [schemasByEntity, setSchemasByEntity] = useState<Record<string, SchemaField[]>>({});
  const [extConditions, setExtConditions] = useState<ExtCondition[]>([]);

  // 动态选项
  const [tierOptions, setTierOptions] = useState<Option[]>([]);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);

  // 加载选项
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
      if (d?.tiers?.length) setTierOptions(d.tiers.map((t: any) => ({ label: `${t.tierName} (${t.tierCode})`, value: t.tierCode })));
    }).catch(() => {});
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      const payload = {
        activityCode: activityCode || `TA_${Date.now()}`,
        activityName: activityName || '未命名活动',
        targetTierCode, extendValidity, memberScope, description,
        validStartTime: validStartTime || dayjs().format('YYYY-MM-DDTHH:mm:ss'),
        validEndTime: validEndTime || undefined,
        triggerConfig: { extConditions },
      };
      if (isEdit) {
        await api.put(`/admin/tier-activities/${activityCode}`, payload);
      } else {
        await api.post('/admin/tier-activities', payload);
      }
      message.success('已保存');
    } catch (e: any) { message.error(e?.message || '保存失败'); } finally { setSaving(false); }
  };

  const handlePublish = async () => {
    setPublishing(true);
    try {
      const code = activityCode || `TA_${Date.now()}`;
      if (!isEdit) {
        await api.post('/admin/tier-activities', {
          activityCode: code, activityName: activityName || '未命名活动',
          targetTierCode, extendValidity, memberScope, description,
          validStartTime: validStartTime || dayjs().format('YYYY-MM-DDTHH:mm:ss'),
          validEndTime: validEndTime || undefined,
          triggerConfig: { extConditions },
        });
      }
      await api.post(`/admin/tier-activities/${code}/publish`);
      message.success('已发布');
      navigate('/rules/tier');
    } catch (e: any) { message.error(e?.message || '发布失败'); } finally { setPublishing(false); }
  };

  return (
    <div className="campaign-page" style={{ padding: 'var(--campaign-page-padding)', minHeight: 'calc(100vh - 64px)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
        <TitleWithDesc title={isEdit ? '编辑等级活动' : '新建等级活动'} desc="配置等级升级活动，设置触发条件和直升目标等级" />
        <Space>
          <Button onClick={() => navigate('/rules/tier')}>取消</Button>
          <Button icon={<SaveOutlined />} onClick={handleSave} loading={saving}>保存</Button>
          <Button type="primary" icon={<SendOutlined />} loading={publishing} onClick={handlePublish}>发布</Button>
        </Space>
      </div>

      <Card size="small" style={{ marginBottom: 16 }}>
        <Row gutter={8}>
          <Col span={4}><Form.Item label="活动代码" style={{ marginBottom: 0 }}><Input size="small" value={activityCode} onChange={e => setActivityCode(e.target.value)} placeholder="自动生成" /></Form.Item></Col>
          <Col span={5}><Form.Item label="活动名称" style={{ marginBottom: 0 }}><Input size="small" value={activityName} onChange={e => setActivityName(e.target.value)} placeholder="例如：618铂金直升" /></Form.Item></Col>
          <Col span={6}><Form.Item label="有效期" style={{ marginBottom: 0 }}>
            <DatePicker.RangePicker size="small" showTime format="YYYY-MM-DD HH:mm:ss"
              placeholder={['开始', '结束(留空=永久)']}
              value={[validStartTime ? dayjs(validStartTime) : null, validEndTime ? dayjs(validEndTime) : null] as any}
              onChange={(dates) => { setValidStartTime(dates?.[0] ? dates[0].format('YYYY-MM-DD HH:mm:ss') : ''); setValidEndTime(dates?.[1] ? dates[1].format('YYYY-MM-DD HH:mm:ss') : ''); }}
              style={{ width: '100%' }} />
          </Form.Item></Col>
        </Row>
      </Card>

      <Card size="small" style={{ marginBottom: 16 }}>
        <div style={{ background: '#fafafa', borderRadius: 6, padding: '10px 14px', marginBottom: 12, border: '1px solid #f0f0f0' }}>
          <Text strong style={{ fontSize: 14, color: '#262626', marginBottom: 6, display: 'block' }}>触发条件</Text>
          <div style={{ marginBottom: 8 }}>
            {extConditions.map((c, i) => {
              const condSchemas = schemasByEntity[c.entity || 'ORDER'] || [];
              const fm = condSchemas.find((f: SchemaField) => f.value === c.field);
              const attrOpts: Option[] = condSchemas.filter((f: SchemaField) => f.type !== 'array').map(f => ({ label: f.label, value: f.value }));
              return (
                <div key={c.key} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0', flexWrap: 'wrap' }}>
                  <Select size="small" value={c.entity || 'ORDER'} style={{ width: 130 }} showSearch options={ENTITY_OPTIONS}
                    onChange={v => { const n = [...extConditions]; n[i] = { key: c.key, entity: v, field: '', type: 'string', op: '==', value: '' }; setExtConditions(n); }} />
                  <Select size="small" value={c.field || undefined} style={{ width: 160 }} placeholder="选择属性" showSearch optionFilterProp="label" options={attrOpts}
                    onChange={v => { const n = [...extConditions]; const sf = condSchemas.find((f: SchemaField) => f.value === v); n[i] = { ...n[i], field: v, type: sf?.type || 'string', format: sf?.format, op: sf?.type === 'number' || sf?.format ? '>=' : '==', value: '' }; setExtConditions(n); }} />
                  {c.field ? (<>
                    <Select size="small" value={c.op} style={{ width: c.op?.startsWith('BETWEEN') ? 110 : 70 }} showSearch options={getOpsForField(c.type, c.format)}
                      onChange={v => { const n = [...extConditions]; n[i] = { ...n[i], op: v, value: '', valueEnd: '' }; setExtConditions(n); }} />
                    {c.op?.startsWith('BETWEEN') ? (
                      <Space size={4}><InputNumber size="small" placeholder="起始" style={{ width: 80 }} value={c.value ? Number(c.value) : undefined} onChange={v => { const n = [...extConditions]; n[i] = { ...n[i], value: String(v ?? '') }; setExtConditions(n); }} /><Text type="secondary">~</Text><InputNumber size="small" placeholder="结束" style={{ width: 80 }} value={c.valueEnd ? Number(c.valueEnd) : undefined} onChange={v => { const n = [...extConditions]; n[i] = { ...n[i], valueEnd: String(v ?? '') }; setExtConditions(n); }} /></Space>
                    ) : c.type === 'number' ? (
                      <InputNumber size="small" placeholder="数值" style={{ width: 100 }} value={c.value ? Number(c.value) : undefined} onChange={v => { const n = [...extConditions]; n[i] = { ...n[i], value: String(v ?? '') }; setExtConditions(n); }} />
                    ) : fm?.enumValues?.length ? (
                      <Select size="small" style={{ width: 140 }} value={c.value || undefined} options={fm.enumValues.map((e: string) => ({ label: e, value: e }))} onChange={v => { const n = [...extConditions]; n[i] = { ...n[i], value: v }; setExtConditions(n); }} />
                    ) : c.format === 'date-time' ? (
                      <DatePicker size="small" showTime format="YYYY-MM-DD HH:mm:ss" style={{ width: 170 }} value={c.value ? dayjs(c.value) : null} onChange={(d: any) => { const n = [...extConditions]; n[i] = { ...n[i], value: d ? d.format('YYYY-MM-DD HH:mm:ss') : '' }; setExtConditions(n); }} />
                    ) : (
                      <Input size="small" placeholder="输入值" style={{ width: 120 }} value={c.value} onChange={e => { const n = [...extConditions]; n[i] = { ...n[i], value: e.target.value }; setExtConditions(n); }} />
                    )}
                  </>) : null}
                  <Button size="small" type="text" style={{ padding: 0 }} icon={<svg width="16" height="16" viewBox="0 0 20 20" fill="none"><circle cx="10" cy="10" r="9" stroke="#1a1a1a" strokeWidth="1.5" fill="white"/><path d="M6 6L14 14M14 6L6 14" stroke="#1a1a1a" strokeWidth="1.5" strokeLinecap="round"/></svg>} onClick={() => setExtConditions(extConditions.filter((_, j) => j !== i))} />
                </div>
              );
            })}
          </div>
          <Button size="small" type="dashed" icon={<PlusOutlined />} onClick={() => setExtConditions([...extConditions, { key: String(Date.now()), entity: 'ORDER', field: '', type: 'string', op: '==', value: '' }])}>添加条件</Button>
        </div>

        <Divider style={{ margin: '12px 0' }} />

        <Card size="small" title={<Space><Tag color="blue">直升等级</Tag></Space>}
          extra={<Text type="secondary" style={{ fontSize: 11 }}>满足触发条件后直升到该等级</Text>}>
          <Space>
            <Text>目标等级：</Text>
            <Select size="small" value={targetTierCode || undefined} style={{ width: 200, marginRight: 100 }} placeholder="选择直升目标等级"
              onChange={v => setTargetTierCode(v)}
              options={tierOptions} />
            <Checkbox checked={extendValidity} onChange={e => setExtendValidity(e.target.checked)}>相同或高等级延长等级有效期</Checkbox>
          </Space>
        </Card>
      </Card>
    </div>
  );
};

export default TierActivityEditor;