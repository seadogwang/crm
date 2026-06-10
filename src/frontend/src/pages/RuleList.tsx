import React, { useState, useEffect, useCallback } from 'react';
import { Table, Tag, Button, Space, Tabs, Typography, message, Popconfirm, Tooltip } from 'antd';
import {
  PlusOutlined, EditOutlined, FilterOutlined, ThunderboltOutlined,
  PauseCircleOutlined, PlayCircleOutlined, SettingOutlined,
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import PageWrapper from '../components/PageWrapper';
import api from '../api';

const { Title, Text } = Typography;

const RuleList: React.FC = () => {
  const navigate = useNavigate();
  const [rules, setRules] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<string>('base');

  const fetchRules = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data } = await api.get('/admin/rules');
      setRules(data?.data || []);
    } catch (e: any) {
      setError(e.message || '加载失败');
      setRules([]);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchRules(); }, [fetchRules]);

  const handleToggleStatus = async (ruleId: number, currentStatus: string) => {
    const newStatus = currentStatus === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';
    try {
      await api.put(`/admin/rules/${ruleId}`, { status: newStatus });
      message.success(`已${newStatus === 'ACTIVE' ? '启用' : '停用'}`);
      fetchRules();
    } catch (e: any) { message.error(e.response?.data?.message || '操作失败'); }
  };

  // 按 agenda_group 分类: base vs campaign
  const baseRules = rules.filter((r: any) => r.agenda_group !== 'campaign');
  const campaignRules = rules.filter((r: any) => r.agenda_group === 'campaign');

  const columns = [
    { title: '名称', dataIndex: 'rule_name', width: 180 },
    { title: '代码', dataIndex: 'rule_code', width: 120 },
    { title: '积分活动类型', dataIndex: 'rule_type', width: 100, render: (v: string) => <Tag>{v || 'DRL'}</Tag> },
    { title: '状态', dataIndex: 'status', width: 90, render: (v: string) => <Tag color={v === 'ACTIVE' ? 'green' : v === 'DRAFT' ? 'orange' : 'default'}>{v}</Tag> },
    { title: '更新时间', dataIndex: 'updated_at', width: 150 },
    {
      title: '操作', key: 'actions', width: 200,
      render: (_: any, record: any) => (
        <Space>
          <Button size="small" icon={<EditOutlined />} onClick={() => navigate(`/rules/${record.id}/edit?type=campaign`)} />
                  <Button size="small" icon={<ExperimentOutlined />} onClick={() => navigate(`/rules/${record.id}/test`)} />
          <Popconfirm title={`确定${record.status === 'ACTIVE' ? '停用' : '启用'}?`} onConfirm={() => handleToggleStatus(record.id, record.status)}>
            <Button size="small" icon={record.status === 'ACTIVE' ? <PauseCircleOutlined /> : <PlayCircleOutlined />}
              danger={record.status === 'ACTIVE'}>{record.status === 'ACTIVE' ? '停用' : '启用'}</Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  const tabItems = [
    {
      key: 'base',
      label: <Space><SettingOutlined />俱乐部基础规则</Space>,
      children: (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
            <Text type="secondary" style={{ fontSize: 12 }}>俱乐部基础积分规则，支持多条规则配置</Text>
            <Button type="primary" icon={<PlusOutlined />} onClick={() => navigate('/rules/new?type=base')}>
              配置基础规则
            </Button>
          </div>
          <Table dataSource={baseRules} columns={[
            { title: '名称', dataIndex: 'rule_name', width: 180 },
            { title: '代码', dataIndex: 'rule_code', width: 120 },
            { title: '规则组', dataIndex: 'agenda_group', width: 100, render: (v: string) => <Tag color="blue">{v || 'default'}</Tag> },
            { title: '状态', dataIndex: 'status', width: 90, render: (v: string) => <Tag color={v === 'ACTIVE' ? 'green' : v === 'DRAFT' ? 'orange' : 'default'}>{v}</Tag> },
            { title: '更新时间', dataIndex: 'updated_at', width: 150 },
            {
              title: '操作', key: 'actions', width: 200,
              render: (_: any, record: any) => (
                <Space>
                  <Tooltip title="编辑"><Button size="small" icon={<EditOutlined style={{ color: '#595959' }} />} onClick={() => navigate(`/rules/${record.id}/edit?type=base`)} /></Tooltip>
                  <Tooltip title="沙箱测试"><Button size="small" icon={<FilterOutlined style={{ color: '#52c41a' }} />} onClick={() => navigate(`/rules/${record.id}/test`)} /></Tooltip>
                  <Popconfirm title={`确定${record.status === 'ACTIVE' ? '停用' : '启用'}?`} onConfirm={() => handleToggleStatus(record.id, record.status)}>
                    <Button size="small" icon={record.status === 'ACTIVE' ? <PauseCircleOutlined /> : <PlayCircleOutlined />}
                      danger={record.status === 'ACTIVE'}>{record.status === 'ACTIVE' ? '停用' : '启用'}</Button>
                  </Popconfirm>
                </Space>
              ),
            },
          ]} loading={loading} rowKey="id" size="small" pagination={{ pageSize: 10 }}
            locale={{ emptyText: '尚未配置基础规则，点击上方按钮新建' }} />
        </div>
      ),
    },
    {
      key: 'campaign',
      label: <Space><ThunderboltOutlined />积分活动</Space>,
      children: (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
            <Text type="secondary" style={{ fontSize: 12 }}>
              积分营销活动规则，包含 lifecycle 周期性活动和 ad-hoc 临时活动
            </Text>
            <Button type="primary" icon={<PlusOutlined />} onClick={() => navigate('/rules/new?type=campaign')}>
              新建积分活动
            </Button>
          </div>

          <Table dataSource={campaignRules} columns={columns} loading={loading} rowKey="id"
            size="small" pagination={{ pageSize: 20 }} scroll={{ x: 800 }}
            locale={{ emptyText: '暂无积分活动，点击上方按钮新建' }} />
        </div>
      ),
    },
  ];

  return (
    <PageWrapper loading={loading} error={error} onRetry={fetchRules}>
      <Title level={4} style={{ marginBottom: 16 }}>规则管理</Title>
      <Tabs activeKey={activeTab} onChange={setActiveTab} items={tabItems} />
    </PageWrapper>
  );
};

export default RuleList;