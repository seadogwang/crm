import React, { useState, useEffect, useCallback } from 'react';
import { Table, Tag, Button, Space, Tabs, Typography, message, Popconfirm, Tooltip } from 'antd';
import {
  PlusOutlined, EditOutlined, FilterOutlined, ThunderboltOutlined,
  PauseCircleOutlined, PlayCircleOutlined, SettingOutlined,
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import api from '../api';
import { useCampaignStyles, TitleWithDesc, CampaignCard } from './campaign/styles/campaign-ui-standard';

const { Text } = Typography;

const RuleList: React.FC = () => {
  const navigate = useNavigate();
  const s = useCampaignStyles();
  const [rules, setRules] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<string>('base');

  const fetchRules = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/admin/rules');
      setRules(data?.data || []);
    } catch (e: any) {
      setRules([]);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchRules(); }, [fetchRules]);

  const handleToggleStatus = async (ruleId: number, currentStatus: string) => {
    const newStatus = currentStatus === 'ACTIVE' ? 'ARCHIVED' : 'ACTIVE';
    try {
      await api.put(`/admin/rules/${ruleId}`, { status: newStatus });
      message.success(`已${newStatus === 'ACTIVE' ? '启用' : '停用'}`);
      fetchRules();
    } catch (e: any) { message.error(e.response?.data?.message || '操作失败'); }
  };

  const baseRules = rules.filter((r: any) => r.rule_category !== 'promo');
  const campaignRules = rules.filter((r: any) => r.rule_category === 'promo');

  const baseColumns = [
    { title: '名称', dataIndex: 'rule_name', width: 180, ellipsis: true },
    { title: '代码', dataIndex: 'rule_code', width: 120, ellipsis: true },
    { title: '规则组', dataIndex: 'rule_category', width: 100, render: (v: string) => <Tag color="blue">{v || 'default'}</Tag> },
    { title: '状态', dataIndex: 'status', width: 90, render: (v: string) => <Tag color={v === 'ACTIVE' ? 'green' : v === 'DRAFT' ? 'orange' : 'default'}>{v}</Tag> },
    { title: '更新时间', dataIndex: 'updated_at', width: 150, ellipsis: true },
    {
      title: '操作', key: 'actions', width: 200,
      render: (_: any, record: any) => (
        <Space>
          <Tooltip title="编辑"><Button size="small" icon={<EditOutlined />} onClick={() => navigate(`/rules/${record.id}/edit?type=base`)} /></Tooltip>
          <Tooltip title="沙箱测试"><Button size="small" icon={<FilterOutlined style={{ color: '#52c41a' }} />} onClick={() => navigate(`/rules/${record.id}/test`)} /></Tooltip>
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
      label: <Space><SettingOutlined />积分基础规则</Space>,
      children: (
        <CampaignCard>
          <div style={s.toolbarStyle}>
            <Text type="secondary" style={{ fontSize: 12 }}>俱乐部基础积分规则，支持多条规则配置</Text>
            <Button type="primary" icon={<PlusOutlined />} onClick={() => navigate('/rules/new?type=base')}>
              配置基础规则
            </Button>
          </div>
          <Table className="campaign-table" dataSource={baseRules} columns={baseColumns} loading={loading}
            rowKey="id" size="small" pagination={{ pageSize: 20, showSizeChanger: true, showTotal: (t: number) => `共 ${t} 条` }}
            scroll={{ x: 'max-content' }} locale={{ emptyText: '尚未配置基础规则，点击上方按钮新建' }} />
        </CampaignCard>
      ),
    },
    {
      key: 'campaign',
      label: <Space><ThunderboltOutlined />积分活动</Space>,
      children: (
        <CampaignCard>
          <div style={s.toolbarStyle}>
            <Text type="secondary" style={{ fontSize: 12 }}>
              积分营销活动规则，包含 lifecycle 周期性活动和 ad-hoc 临时活动
            </Text>
            <Button type="primary" icon={<PlusOutlined />} onClick={() => navigate('/rules/promo/new')}>
              新建积分活动
            </Button>
          </div>
          <Table className="campaign-table" dataSource={campaignRules} columns={baseColumns} loading={loading}
            rowKey="id" size="small" pagination={{ pageSize: 20, showSizeChanger: true, showTotal: (t: number) => `共 ${t} 条` }}
            scroll={{ x: 'max-content' }} locale={{ emptyText: '暂无积分活动，点击上方按钮新建' }} />
        </CampaignCard>
      ),
    },
  ];

  return (
    <div className="campaign-page" style={s.pageStyle}>
      <TitleWithDesc title="积分规则管理" desc="管理俱乐部积分基础规则和促销活动规则，支持沙箱测试和回归验证" />
      <Tabs activeKey={activeTab} onChange={setActiveTab} items={tabItems} className="campaign-tabs" />
    </div>
  );
};

export default RuleList;