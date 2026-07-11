import React, { useState, useEffect } from 'react';
import { Card, Table, Button, Switch, Input, Select, Space, message } from 'antd';
import { SaveOutlined, ReloadOutlined } from '@ant-design/icons';
import api from '../api';
import { useAppStore } from '../store';

const CHANNELS = [
  { key: 'TMALL', label: '天猫', icon: '🐱' },
  { key: 'JD', label: '京东', icon: '🐶' },
  { key: 'DOUYIN', label: '抖音', icon: '🎵' },
];

// hover 输入框
const HoverInput: React.FC<{ value: string; onChange: (v: string) => void; w?: number; placeholder?: string }> = ({ value, onChange, w, placeholder }) => {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value || '');
  if (editing) return <Input size="small" value={draft} autoFocus style={{ width: w }} placeholder={placeholder} onChange={e => setDraft(e.target.value)} onBlur={() => { onChange(draft); setEditing(false); }} onPressEnter={() => { onChange(draft); setEditing(false); }} />;
  return <span style={{ cursor: 'pointer', padding: '4px 8px', borderRadius: 4, display: 'inline-block', width: w, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', border: '1px solid transparent' }} onMouseEnter={e => { e.currentTarget.style.background = '#f5f5f5'; e.currentTarget.style.borderColor = '#d9d9d9'; }} onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.borderColor = 'transparent'; }} onClick={() => { setDraft(value || ''); setEditing(true); }}>{value || <span style={{ color: '#ccc' }}>{placeholder || '—'}</span>}</span>;
};

interface ChannelConfig {
  channel: string;
  enabled: boolean;
  tmallSalt: string;
  encryptType: string;
}

const ChannelMemberPass: React.FC = () => {
  const PROG = useAppStore(s => s.currentProgramCode);
  const [configs, setConfigs] = useState<ChannelConfig[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const loadConfigs = async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/admin/channel-pass/config', { params: { programCode: PROG } });
      const list = data?.data || [];
      const all = CHANNELS.map(c => {
        const existing = list.find((cfg: any) => cfg.channel === c.key);
        return existing || { channel: c.key, enabled: false, tmallSalt: '', encryptType: c.key === 'TMALL' ? 'TMALL_MD5_DOUBLE' : 'NONE' };
      });
      setConfigs(all);
    } catch { setConfigs(CHANNELS.map(c => ({ channel: c.key, enabled: false, tmallSalt: '', encryptType: c.key === 'TMALL' ? 'TMALL_MD5_DOUBLE' : 'NONE' }))); }
    finally { setLoading(false); }
  };

  useEffect(() => { loadConfigs(); }, [PROG]);

  const updateField = (idx: number, field: string, value: any) => {
    setConfigs(prev => prev.map((c, i) => i !== idx ? c : { ...c, [field]: value }));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      for (const cfg of configs) {
        await api.put('/admin/channel-pass/config', { ...cfg, programCode: PROG });
      }
      message.success('已保存');
      loadConfigs();
    } catch (e: any) {
      message.error(e?.response?.data?.message || '保存失败');
    } finally { setSaving(false); }
  };

  const columns = [
    {
      title: '渠道', dataIndex: 'channel', width: 80,
      render: (v: string) => { const ch = CHANNELS.find(c => c.key === v); return <span>{ch?.icon} {ch?.label || v}</span>; },
    },
    {
      title: '开通', dataIndex: 'enabled', width: 60,
      render: (v: boolean, _: any, idx: number) => <Switch size="small" checked={v} onChange={c => updateField(idx, 'enabled', c)} />,
    },
    {
      title: '加密方式', dataIndex: 'encryptType', width: 150,
      render: (v: string, _: any, idx: number) => (
        <Select size="small" value={v} style={{ width: 140 }}
          onChange={val => updateField(idx, 'encryptType', val)}
          options={[
            { label: '无', value: 'NONE' },
            { label: '双重MD5', value: 'TMALL_MD5_DOUBLE' },
            { label: 'MD5', value: 'MD5' },
            { label: 'SHA256', value: 'SHA256' },
          ]} />
      ),
    },
    {
      title: '加密 Salt', dataIndex: 'tmallSalt', width: 200,
      render: (v: string, _: any, idx: number) => <HoverInput value={v} onChange={val => updateField(idx, 'tmallSalt', val)} w={180} placeholder="渠道加密盐值" />,
    },
  ];

  return (
    <Card
      title="渠道会员通配置"
      extra={<Space><Button icon={<ReloadOutlined />} onClick={loadConfigs}>刷新</Button><Button type="primary" icon={<SaveOutlined />} onClick={handleSave} loading={saving}>保存</Button></Space>}
    >
      <style>{`.ant-input:focus, .ant-input-number:focus, .ant-input-focused, .ant-input-number-focused { box-shadow: none !important; border-color: #d9d9d9 !important; }`}</style>
      <Table dataSource={configs} columns={columns} rowKey="channel" loading={loading} pagination={false} size="small" />
    </Card>
  );
};

export default ChannelMemberPass;