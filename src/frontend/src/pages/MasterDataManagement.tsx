import React, { useState, useEffect } from 'react';
import { Card, Tabs, Table, Button, Input, Switch, Select, Space, Tag, message, Popconfirm } from 'antd';
import { PlusOutlined, SaveOutlined, ReloadOutlined, DeleteOutlined } from '@ant-design/icons';
import api from '../api';
import { useAppStore } from '../store';

const { TabPane } = Tabs;

const HoverInput: React.FC<{ value: string; onChange: (v: string) => void; w?: number; placeholder?: string }> = ({ value, onChange, w, placeholder }) => {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value || '');
  if (editing) return <Input size="small" value={draft} autoFocus style={{ width: w }} placeholder={placeholder} onChange={e => setDraft(e.target.value)} onBlur={() => { onChange(draft); setEditing(false); }} onPressEnter={() => { onChange(draft); setEditing(false); }} />;
  return <span style={{ cursor: 'pointer', padding: '4px 8px', borderRadius: 4, display: 'inline-block', width: w, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', border: '1px solid transparent' }} onMouseEnter={e => { e.currentTarget.style.background = '#f5f5f5'; e.currentTarget.style.borderColor = '#d9d9d9'; }} onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.borderColor = 'transparent'; }} onClick={() => { setDraft(value || ''); setEditing(true); }}>{value || <span style={{ color: '#ccc' }}>{placeholder || '—'}</span>}</span>;
};

const programCode = 'PROG001';

// ==================== 枚举值管理 ====================
const EnumManagement: React.FC = () => {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const loadData = async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/master-data/definitions', { params: { programCode } });
      setItems((data?.data || []).map((d: any) => ({ ...d, dataType: 'ENUM', items: d.items || [] })));
    } catch { setItems([]); } finally { setLoading(false); }
  };

  useEffect(() => { loadData(); }, []);

  const updateField = (idx: number, field: string, value: any) => {
    setItems(prev => prev.map((item, i) => i !== idx ? item : { ...item, [field]: value }));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      for (const item of items) {
        await api.post('/master-data/types', { ...item, programCode });
      }
      message.success('已保存'); loadData();
    } catch (e: any) { message.error(e?.response?.data?.message || '保存失败'); }
    finally { setSaving(false); }
  };

  const columns = [
    { title: '编码', dataIndex: 'dataCode', width: 120, render: (v: string, _: any, idx: number) => <HoverInput value={v} onChange={val => updateField(idx, 'dataCode', val)} w={100} /> },
    { title: '名称', dataIndex: 'dataName', width: 120, render: (v: string, _: any, idx: number) => <HoverInput value={v} onChange={val => updateField(idx, 'dataName', val)} w={100} /> },
    { title: '描述', dataIndex: 'description', width: 200, render: (v: string, _: any, idx: number) => <HoverInput value={v} onChange={val => updateField(idx, 'description', val)} w={180} /> },
    { title: '状态', dataIndex: 'status', width: 70, render: (v: string, _: any, idx: number) => <Select size="small" value={v || 'ACTIVE'} style={{ width: 80 }} onChange={val => updateField(idx, 'status', val)} options={[{ label: '启用', value: 'ACTIVE' }, { label: '停用', value: 'INACTIVE' }]} /> },
    { title: '', width: 40, render: (_: any, __: any, idx: number) => (
      <span style={{ cursor: 'pointer', display: 'inline-flex' }} onClick={() => setItems(prev => prev.filter((_, i) => i !== idx))}>
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none"><circle cx="10" cy="10" r="9" stroke="#1a1a1a" strokeWidth="1.5" fill="white"/><path d="M6.5 6.5L13.5 13.5M13.5 6.5L6.5 13.5" stroke="#1a1a1a" strokeWidth="1.5" strokeLinecap="round"/></svg>
      </span>) },
  ];

  return (
    <Card title="枚举值管理" extra={<Space><Button icon={<ReloadOutlined />} onClick={loadData}>刷新</Button><Button type="primary" icon={<SaveOutlined />} onClick={handleSave} loading={saving}>保存</Button></Space>}>
      <Table dataSource={items} columns={columns} rowKey={(_, idx) => String(idx)} loading={loading} pagination={false} size="small"
        footer={() => <Button size="small" type="text" icon={<PlusOutlined />} block onClick={() => setItems([...items, { dataCode: '', dataName: '', dataType: 'ENUM', status: 'ACTIVE' }])}>添加枚举类型</Button>} />
    </Card>
  );
};

// ==================== 标签管理 ====================
const TagManagement: React.FC = () => {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const loadData = async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/master-data/tags', { params: { programCode } });
      setItems(data?.data || []);
    } catch { setItems([]); } finally { setLoading(false); }
  };

  useEffect(() => { loadData(); }, []);

  const updateField = (idx: number, field: string, value: any) => {
    setItems(prev => prev.map((item, i) => i !== idx ? item : { ...item, [field]: value }));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      for (const item of items) {
        await api.post('/master-data/tags', { ...item, programCode });
      }
      message.success('已保存'); loadData();
    } catch (e: any) { message.error(e?.response?.data?.message || '保存失败'); }
    finally { setSaving(false); }
  };

  const columns = [
    { title: '标签编码', dataIndex: 'tagCode', width: 120, render: (v: string, _: any, idx: number) => <HoverInput value={v} onChange={val => updateField(idx, 'tagCode', val)} w={100} /> },
    { title: '标签名称', dataIndex: 'tagName', width: 120, render: (v: string, _: any, idx: number) => <HoverInput value={v} onChange={val => updateField(idx, 'tagName', val)} w={100} /> },
    { title: '标签组', dataIndex: 'tagGroup', width: 100, render: (v: string, _: any, idx: number) => <HoverInput value={v} onChange={val => updateField(idx, 'tagGroup', val)} w={80} /> },
    { title: '颜色', dataIndex: 'tagColor', width: 80, render: (v: string, _: any, idx: number) => <Select size="small" value={v || 'blue'} style={{ width: 70 }} onChange={val => updateField(idx, 'tagColor', val)} options={['red','blue','green','orange','purple','cyan'].map(c => ({ label: c, value: c }))} /> },
    { title: '', width: 40, render: (_: any, __: any, idx: number) => (
      <span style={{ cursor: 'pointer', display: 'inline-flex' }} onClick={() => setItems(prev => prev.filter((_, i) => i !== idx))}>
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none"><circle cx="10" cy="10" r="9" stroke="#1a1a1a" strokeWidth="1.5" fill="white"/><path d="M6.5 6.5L13.5 13.5M13.5 6.5L6.5 13.5" stroke="#1a1a1a" strokeWidth="1.5" strokeLinecap="round"/></svg>
      </span>) },
  ];

  return (
    <Card title="标签管理" extra={<Space><Button icon={<ReloadOutlined />} onClick={loadData}>刷新</Button><Button type="primary" icon={<SaveOutlined />} onClick={handleSave} loading={saving}>保存</Button></Space>}>
      <Table dataSource={items} columns={columns} rowKey={(_, idx) => String(idx)} loading={loading} pagination={false} size="small"
        footer={() => <Button size="small" type="text" icon={<PlusOutlined />} block onClick={() => setItems([...items, { tagCode: '', tagName: '', tagGroup: '', tagColor: 'blue' }])}>添加标签</Button>} />
    </Card>
  );
};

// ==================== 主页面 ====================
const MasterDataManagement: React.FC = () => (
  <Tabs defaultActiveKey="enum">
    <TabPane tab="枚举值管理" key="enum"><EnumManagement /></TabPane>
    <TabPane tab="标签管理" key="tag"><TagManagement /></TabPane>
  </Tabs>
);

export default MasterDataManagement;