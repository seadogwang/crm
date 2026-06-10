import React, { useState, useEffect, useCallback } from 'react';
import { Table, Tag, Button, Space, Tabs, Card, Typography, message, Popconfirm } from 'antd';
import {
  PlusOutlined, EditOutlined, ExperimentOutlined, ThunderboltOutlined,
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
          <Button size="small" icon={<EditOutlined />} onClick={() => navigate(`/rules/${record.id}/edit?type=campaign`)}>编辑</Button>
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
      children: (() => {
        const baseRule = baseRules.length > 0 ? baseRules[0] : null;
        return (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
            <Text type="secondary" style={{ fontSize: 12 }}>俱乐部长期有效的基础积分规则，通常每年调整一次</Text>
            {!baseRule ? (
              <Button type="primary" icon={<PlusOutlined />} onClick={() => navigate('/rules/new?type=base')}>
                配置基础规则
              </Button>
            ) : (
              <Button icon={<EditOutlined />} onClick={() => navigate(`/rules/${baseRule.id}/edit?type=base`)}>
                编辑基础规则
              </Button>
            )}
          </div>

          {baseRule ? (
            <Card size="small" style={{ background: '#f6ffed', border: '1px solid #b7eb8f' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Space>
                  <Tag color="green" style={{ fontSize: 13 }}>{baseRule.status}</Tag>
                  <Text strong>{baseRule.rule_name || baseRule.rule_code}</Text>
                  <Tag color="blue">{baseRule.agenda_group || 'purchase'}</Tag>
                  <Text type="secondary" style={{ fontSize: 12 }}>更新于 {baseRule.updated_at}</Text>
                </Space>
                <Space>
                  <Button size="small" onClick={() => navigate(`/rules/${baseRule.id}/test`)}>沙箱测试</Button>
                  {baseRule.status === 'ACTIVE' ? (
                    <Button size="small" danger onClick={() => handleToggleStatus(baseRule.id, baseRule.status)}>停用</Button>
                  ) : (
                    <Button size="small" type="primary" onClick={() => handleToggleStatus(baseRule.id, baseRule.status)}>启用</Button>
                  )}
                </Space>
              </div>
            </Card>
          ) : (
            <Card size="small" style={{ textAlign: 'center', padding: 40 }}>
              <Text type="secondary">尚未配置俱乐部基础规则</Text>
              <br />
              <Button type="primary" icon={<PlusOutlined />} onClick={() => navigate('/rules/new?type=base')} style={{ marginTop: 12 }}>
                配置基础规则
              </Button>
            </Card>
          )}
        </div>
      );})(),
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