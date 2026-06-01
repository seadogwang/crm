import React, { useState, useEffect } from 'react';
import { Card, Table, Tag, Button, message, Modal, Form, Input, Select } from 'antd';
import { PlusOutlined, EditOutlined, ApiOutlined } from '@ant-design/icons';
import axios from 'axios';

const PROG = sessionStorage.getItem('current_program_code') || 'PROG001';

const ChannelConfig: React.FC = () => {
  const [channels, setChannels] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [form] = Form.useForm();

  const fetch = async () => {
    setLoading(true);
    try {
      const { data } = await axios.get('/api/admin/channels', { headers: { 'X-Program-Code': PROG } });
      setChannels(data?.data || []);
    } catch { setChannels([]); } finally { setLoading(false); }
  };

  useEffect(() => { fetch(); }, []);

  const handleSave = async (values: any) => {
    await axios.put('/api/admin/channels', values, { headers: { 'X-Program-Code': PROG } });
    message.success('渠道配置已保存'); setOpen(false); form.resetFields(); fetch();
  };

  const columns = [
    { title: '渠道', dataIndex: 'channel', width: 120, render: (v: string) => <Tag color="blue">{v}</Tag> },
    { title: '状态', dataIndex: 'status', width: 80, render: (v: string) => <Tag color={v === 'ACTIVE' ? 'green' : 'orange'}>{v}</Tag> },
    { title: '请求映射', dataIndex: 'request_mapping', width: 200, ellipsis: true, render: (v: any) => v ? JSON.stringify(v).substring(0, 60) : '-' },
    { title: '速率限制', dataIndex: 'rate_limit_config', width: 150, ellipsis: true, render: (v: any) => v ? JSON.stringify(v).substring(0, 50) : '-' },
  ];

  return (
    <Card title={<span><ApiOutlined /> 渠道适配器配置</span>} extra={<Button type="primary" icon={<PlusOutlined />} onClick={() => setOpen(true)}>新增渠道</Button>}>
      <Table dataSource={channels} columns={columns} loading={loading} rowKey="id" size="small" />

      <Modal title="渠道配置" open={open} onCancel={() => setOpen(false)} onOk={() => form.submit()}>
        <Form form={form} layout="vertical" onFinish={handleSave}>
          <Form.Item name="channel" label="渠道代码" rules={[{ required: true }]}>
            <Select options={['TMALL','JD','DOUYIN','WECHAT_MINI'].map(c=>({label:c,value:c}))} />
          </Form.Item>
          <Form.Item name="auth_config" label="认证配置(JSON)"><Input.TextArea rows={3} placeholder='{"app_secret":"xxx"}' /></Form.Item>
          <Form.Item name="request_mapping" label="请求映射(JSON)"><Input.TextArea rows={3} placeholder='{"order_id":"$.order.id"}' /></Form.Item>
          <Form.Item name="rate_limit_config" label="速率限制(JSON)"><Input.TextArea rows={2} placeholder='{"qps":100}' /></Form.Item>
          <Form.Item name="status" label="状态"><Select options={[{label:'草稿',value:'DRAFT'},{label:'激活',value:'ACTIVE'}]} /></Form.Item>
        </Form>
      </Modal>
    </Card>
  );
};

export default ChannelConfig;