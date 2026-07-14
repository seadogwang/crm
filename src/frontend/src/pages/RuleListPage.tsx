import React, { useState, useEffect } from 'react';
import { Card, Table, Button, Space, Tag, Typography, Input } from 'antd';
import { PlusOutlined, EditOutlined, ExperimentOutlined, SearchOutlined, ReloadOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import api from '../api';
import { useAppStore } from '../store';

const { Text } = Typography;

const STATUS_MAP: Record<string, { color: string; label: string }> = {
  DRAFT: { color: 'default', label: '草稿' },
  ACTIVE: { color: 'success', label: '已发布' },
  INACTIVE: { color: 'default', label: '已停用' },
};

const RuleList: React.FC = () => {
  const navigate = useNavigate();
  const PROG = useAppStore(s => s.currentProgramCode);
  const [rules, setRules] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');

  const loadRules = async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/admin/rules', { params: { programCode: PROG } });
      setRules(data?.data?.rules || data?.data || []);
    } catch { setRules([]); }
    finally { setLoading(false); }
  };

  useEffect(() => { loadRules(); }, [PROG]);

  const filtered = search
    ? rules.filter((r: any) => r.ruleName?.includes(search) || r.ruleCode?.includes(search))
    : rules;

  const columns = [
    {
      title: '规则名称', dataIndex: 'ruleName', width: 200,
      render: (v: string, r: any) => (
        <Text strong style={{ cursor: 'pointer' }} onClick={() => navigate(`/rules/engine/${r.id}/edit`)}>{v || r.ruleCode}</Text>
      ),
    },
    {
      title: '规则代码', dataIndex: 'ruleCode', width: 140,
      render: (v: string) => <Text type="secondary" style={{ fontSize: 12 }}>{v}</Text>,
    },
    {
      title: '规则组', dataIndex: 'ruleGroup', width: 80,
      render: (v: string) => <Tag>{v === 'promo' ? '促销' : '基础'}</Tag>,
    },
    {
      title: '优先级', dataIndex: 'priority', width: 70,
    },
    {
      title: '状态', dataIndex: 'status', width: 80,
      render: (v: string) => {
        const m = STATUS_MAP[v] || { color: 'default', label: v || '草稿' };
        return <Tag color={m.color}>{m.label}</Tag>;
      },
    },
    {
      title: '版本', dataIndex: 'version', width: 50,
      render: (v: number) => <Text type="secondary">v{v || 1}</Text>,
    },
    {
      title: '更新时间', dataIndex: 'updatedAt', width: 120,
      render: (v: string) => v ? new Date(v).toLocaleDateString('zh-CN') : '-',
    },
    {
      title: '操作', width: 120,
      render: (_: any, r: any) => (
        <Space>
          <Button size="small" type="link" icon={<EditOutlined />}
            onClick={() => navigate(`/rules/engine/${r.id}/edit`)} />
          <Button size="small" type="link" icon={<ExperimentOutlined />}
            onClick={() => navigate(`/rules/engine/${r.id}/edit`)}>测试</Button>
        </Space>
      ),
    },
  ];

  return (
    <Card
      title="积分规则"
      extra={
        <Space>
          <Input prefix={<SearchOutlined />} placeholder="搜索" value={search}
            onChange={e => setSearch(e.target.value)} allowClear style={{ width: 160 }} />
          <Button icon={<ReloadOutlined />} onClick={loadRules}>刷新</Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => navigate('/rules/engine')}>新建规则</Button>
        </Space>
      }
    >
      <Table dataSource={filtered} columns={columns} rowKey="id" loading={loading} size="middle"
        pagination={{ showTotal: t => `共 ${t} 条`, pageSize: 15 }} />
    </Card>
  );
};

export default RuleList;