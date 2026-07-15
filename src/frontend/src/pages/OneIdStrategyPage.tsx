import React, { useState, useEffect } from 'react';
import { Card, Button, Select, InputNumber, Switch, Space, message } from 'antd';
import { SaveOutlined, ReloadOutlined, PlusOutlined, DeleteOutlined } from '@ant-design/icons';
import api from '../api';
import { useAppStore } from '../store';

interface PriorityField { field: string; weight: number; required: boolean; }

const FIELD_OPTIONS = [
  { label: '手机号', value: 'phone' },
  { label: '邮箱', value: 'email' },
  { label: '渠道用户ID', value: 'channel_user_id' },
  { label: '渠道UnionID', value: 'channel_union_id' },
  { label: '加密手机号', value: 'encrypted_mobile' },
  { label: '会员ID', value: 'member_id' },
  { label: '姓名', value: 'name' },
];

const OneIdStrategyPage: React.FC = () => {
  const PROG = useAppStore(s => s.currentProgramCode);
  const [fields, setFields] = useState<PriorityField[]>([
    { field: 'phone', weight: 10, required: true },
    { field: 'email', weight: 5, required: false },
    { field: 'channel_user_id', weight: 3, required: false },
  ]);
  const [currentStrategy, setCurrentStrategy] = useState<any>(null);
  const [strategyList, setStrategyList] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const loadStrategy = async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/admin/one-id/strategy', { params: { programCode: PROG } });
      const list = data?.data || [];
      setStrategyList(list);
      // 默认选中第一个策略，或保留当前选中的策略
      const target = currentStrategy
        ? list.find((s: any) => s.strategyCode === currentStrategy.strategyCode) || list[0]
        : list[0];
      if (target) {
        setCurrentStrategy(target);
        setFields(target.priorityFields || []);
      }
    } catch {} finally { setLoading(false); }
  };

  useEffect(() => { loadStrategy(); }, [PROG]);

  const updateField = (idx: number, key: string, value: any) => {
    setFields(prev => prev.map((f, i) => i !== idx ? f : { ...f, [key]: value }));
  };

  const moveUp = (idx: number) => {
    if (idx === 0) return;
    setFields(prev => { const arr = [...prev]; [arr[idx-1], arr[idx]] = [arr[idx], arr[idx-1]]; return arr; });
  };
  const moveDown = (idx: number) => {
    if (idx === fields.length - 1) return;
    setFields(prev => { const arr = [...prev]; [arr[idx], arr[idx+1]] = [arr[idx+1], arr[idx]]; return arr; });
  };

  const handleSave = async () => {
    if (!currentStrategy) { message.warning('请先选择策略'); return; }
    setSaving(true);
    try {
      await api.put('/admin/one-id/strategy', {
        programCode: PROG,
        strategyCode: currentStrategy.strategyCode,
        strategyName: currentStrategy.strategyName,
        priorityFields: fields,
        isDefault: currentStrategy.isDefault ?? false,
        status: currentStrategy.status || 'ACTIVE',
      });
      message.success('已保存');
      loadStrategy(); // 保存后重新加载，确认数据
    } catch (e: any) { message.error(e?.response?.data?.message || '保存失败'); }
    finally { setSaving(false); }
  };

  return (
    <Card
      title="One-ID 策略配置"
      extra={<Space><Button icon={<ReloadOutlined />} onClick={loadStrategy}>刷新</Button><Button type="primary" icon={<SaveOutlined />} onClick={handleSave} loading={saving}>保存</Button></Space>}
    >
      <div style={{ marginBottom: 12, display: 'flex', gap: 12, alignItems: 'center' }}>
        <span style={{ color: '#888', fontSize: 12 }}>策略：</span>
        <Select size="small" value={currentStrategy?.strategyCode} style={{ width: 180 }}
          onChange={(code) => {
            const s = strategyList.find((s: any) => s.strategyCode === code);
            if (s) { setCurrentStrategy(s); setFields(s.priorityFields || []); }
          }}
          options={strategyList.map((s: any) => ({ label: s.strategyName || s.strategyCode, value: s.strategyCode }))} />
      </div>
      <div style={{ marginBottom: 12, color: '#888', fontSize: 12 }}>
        匹配优先级从上到下依次降低，系统按此顺序匹配会员身份
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 8, fontWeight: 500, fontSize: 12, color: '#888' }}>
        <span style={{ width: 28 }}>排序</span>
        <span style={{ width: 160 }}>匹配字段</span>
        <span style={{ width: 80 }}>权重</span>
        <span style={{ width: 60 }}>必填</span>
      </div>

      {fields.map((f, idx) => (
        <div key={idx} style={{ display: 'flex', gap: 8, marginBottom: 6, alignItems: 'center', padding: '6px 8px', borderRadius: 4, background: '#fafafa', border: '1px solid #f0f0f0' }}>
          <Space size={0} style={{ width: 28 }}>
            <Button size="small" type="text" style={{ padding: 0, fontSize: 10, height: 16 }} disabled={idx === 0} onClick={() => moveUp(idx)}>▲</Button>
            <Button size="small" type="text" style={{ padding: 0, fontSize: 10, height: 16 }} disabled={idx === fields.length - 1} onClick={() => moveDown(idx)}>▼</Button>
          </Space>
          <Select size="small" value={f.field} style={{ width: 160 }} showSearch optionFilterProp="label"
            options={FIELD_OPTIONS} onChange={v => updateField(idx, 'field', v)} />
          <InputNumber size="small" value={f.weight} min={1} max={10} style={{ width: 80 }}
            onChange={v => updateField(idx, 'weight', v ?? 5)} />
          <Switch size="small" checked={f.required} onChange={v => updateField(idx, 'required', v)} />
          <Button size="small" type="text" danger icon={<DeleteOutlined />}
            onClick={() => setFields(fields.filter((_, i) => i !== idx))} />
        </div>
      ))}

      <Button size="small" type="dashed" icon={<PlusOutlined />} onClick={() => setFields([...fields, { field: '', weight: 5, required: false }])}>
        添加字段
      </Button>
    </Card>
  );
};

export default OneIdStrategyPage;