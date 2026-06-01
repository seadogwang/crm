import React from 'react';
import { Card, Table, Tag, InputNumber, Input, Button, message, Space } from 'antd';
import { PlusOutlined, SaveOutlined, CrownOutlined } from '@ant-design/icons';
import axios from 'axios';

const PROG = sessionStorage.getItem('current_program_code') || 'PROG001';

const defaultTiers = [
  { tier_code: 'BASE', tier_name: '普通会员', sequence: 1, min_points: 0, max_points: 1000 },
  { tier_code: 'SILVER', tier_name: '银卡会员', sequence: 2, min_points: 1000, max_points: 5000 },
  { tier_code: 'GOLD', tier_name: '金卡会员', sequence: 3, min_points: 5000, max_points: 10000 },
  { tier_code: 'PLATINUM', tier_name: '铂金会员', sequence: 4, min_points: 10000, max_points: 9999999 },
];

const TierConfig: React.FC = () => {
  const [tiers, setTiers] = React.useState(defaultTiers);

  const handleSave = async () => {
    try {
      await axios.put('/api/admin/tiers', { tiers }, { headers: { 'X-Program-Code': PROG } });
      message.success('等级配置已保存');
    } catch { message.error('保存失败'); }
  };

  const updateField = (idx: number, field: string, value: any) => {
    setTiers(prev => prev.map((t, i) => i === idx ? { ...t, [field]: value } : t));
  };

  const columns = [
    { title: '等级代码', dataIndex: 'tier_code', width: 100, render: (v: string, _: any, idx: number) => <Input value={v} onChange={e => updateField(idx, 'tier_code', e.target.value)} /> },
    { title: '名称', dataIndex: 'tier_name', width: 120, render: (v: string, _: any, idx: number) => <Input value={v} onChange={e => updateField(idx, 'tier_name', e.target.value)} /> },
    { title: '排序', dataIndex: 'sequence', width: 60 },
    { title: '最低成长值', dataIndex: 'min_points', width: 120, render: (v: number, _: any, idx: number) => <InputNumber value={v} onChange={val => updateField(idx, 'min_points', val)} /> },
    { title: '最高成长值', dataIndex: 'max_points', width: 120, render: (v: number, _: any, idx: number) => <InputNumber value={v} onChange={val => updateField(idx, 'max_points', val)} /> },
  ];

  return (
    <Card title={<span><CrownOutlined /> 等级阶梯配置</span>} extra={<Button type="primary" icon={<SaveOutlined />} onClick={handleSave}>保存配置</Button>}>
      <Table dataSource={tiers} columns={columns} rowKey="tier_code" size="small" pagination={false} />
    </Card>
  );
};

export default TierConfig;