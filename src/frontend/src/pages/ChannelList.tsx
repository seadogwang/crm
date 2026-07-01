import React, { useState, useEffect, useCallback } from 'react';
import { Table, Tag, Button, Space, Modal, Form, Input, Select, Typography, message } from 'antd';
import { PlusOutlined, EditOutlined, LinkOutlined, ApiOutlined, CodeOutlined, ThunderboltOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import api from '../api';
import { useCampaignStyles, TitleWithDesc, CampaignCard } from './campaign/styles/campaign-ui-standard';

const ChannelList: React.FC = () => {
  const navigate = useNavigate();
  const s = useCampaignStyles();
  const [channels, setChannels] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [form] = Form.useForm();

  const fetch = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/admin/channels');
      setChannels(data?.data || []);
    } catch (e: any) {
      setChannels([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetch(); }, [fetch]);

  const handleCreate = async (values: any) => {
    try {
      await api.put('/admin/channels', values);
      message.success('渠道已创建');
      setCreateOpen(false);
      form.resetFields();
      fetch();
    } catch (e: any) { message.error(e.response?.data?.message || '创建失败'); }
  };

  const handleTestConnection = async (channel: string) => {
    try {
      const { data } = await api.post(`/admin/channels/${channel}/test`);
      if (data.code === 'SUCCESS') message.success(`${channel} 连接测试成功`);
      else message.warning(data.message);
    } catch (e: any) { message.error(e.response?.data?.message || '测试失败'); }
  };

  const columns = [
    { title: '渠道标识', dataIndex: 'channel', width: 120,
      render: (v: string) => <Tag color="blue"><ApiOutlined /> {v}</Tag> },
    { title: '渠道名称', dataIndex: 'channel_name', width: 120, ellipsis: true },
    { title: '映射模式', dataIndex: 'mapping_mode', width: 100,
      render: (v: string) => <Tag color={v === 'VISUAL' ? 'green' : 'purple'}>{v === 'VISUAL' ? <LinkOutlined /> : <CodeOutlined />} {v || 'SCRIPT'}</Tag> },
    { title: '状态', dataIndex: 'status', width: 80,
      render: (v: string) => {
        const colorMap: Record<string, string> = { ACTIVE: 'green', DRAFT: 'orange', INACTIVE: 'default' };
        return <Tag color={colorMap[v] || 'default'}>{v}</Tag>;
      }},
    { title: '速率限制', dataIndex: 'rate_limit_config', width: 150, ellipsis: true,
      render: (v: any) => v ? `QPS: ${v.qps || '—'}` : '—' },
    { title: '操作', key: 'actions', width: 200,
      render: (_: any, record: any) => (
        <Space>
          <Button size="small" icon={<EditOutlined />} onClick={() => navigate(`/channels/${record.id}/mapping`)}>映射配置</Button>
          <Button size="small" icon={<ThunderboltOutlined />} onClick={() => handleTestConnection(record.channel)}>测试连接</Button>
        </Space>
      ),
    },
  ];

  return (
    <div className="campaign-page" style={s.pageStyle}>
      <TitleWithDesc title="渠道适配器配置" desc="管理外部渠道接入配置，包括天猫、京东、抖音、微信小程序等" />

      <div style={s.toolbarStyle}>
        <div />
        <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateOpen(true)}>新增渠道</Button>
      </div>

      <CampaignCard>
        <Table className="campaign-table" dataSource={channels} columns={columns} loading={loading} rowKey="id"
          size="small" pagination={{ pageSize: 20, showSizeChanger: true, showTotal: (t: number) => `共 ${t} 条` }}
          scroll={{ x: 'max-content' }} />
      </CampaignCard>

      <Modal title="新增渠道" className="campaign-modal" open={createOpen} onCancel={() => setCreateOpen(false)} onOk={() => form.submit()}>
        <Form form={form} layout="vertical" onFinish={handleCreate} className="campaign-form">
          <Form.Item name="channel" label="渠道代码" rules={[{ required: true }]}>
            <Select options={['TMALL', 'JD', 'DOUYIN', 'WECHAT_MINI'].map(c => ({ label: c, value: c }))} />
          </Form.Item>
          <Form.Item name="channel_name" label="渠道名称"><Input placeholder="如 天猫旗舰店" /></Form.Item>
          <Form.Item name="mapping_mode" label="映射模式" initialValue="SCRIPT">
            <Select options={[{ label: '可视模式', value: 'VISUAL' }, { label: '脚本模式', value: 'SCRIPT' }]} />
          </Form.Item>
          <Form.Item name="auth_config" label="认证配置(JSON)">
            <Input.TextArea rows={3} placeholder='{"app_key":"xxx","app_secret":"xxx"}' />
          </Form.Item>
          <Form.Item name="rate_limit_config" label="速率限制(JSON)">
            <Input.TextArea rows={2} placeholder='{"qps":100}' />
          </Form.Item>
          <Form.Item name="status" label="状态" initialValue="DRAFT">
            <Select options={[{ label: '草稿', value: 'DRAFT' }, { label: '激活', value: 'ACTIVE' }]} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default ChannelList;