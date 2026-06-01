import React, { useState, useEffect } from 'react';
import { Table, Tag, Card, Select, Button, Space, message, Popconfirm } from 'antd';
import { ReloadOutlined, BellOutlined, SendOutlined } from '@ant-design/icons';
import axios from 'axios';

const PROG = sessionStorage.getItem('current_program_code') || 'PROG001';

const NotificationPage: React.FC = () => {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState('ALL');

  const fetch = async () => {
    setLoading(true);
    try {
      const { data } = await axios.get('/api/admin/notifications', {
        params: { status: filter === 'ALL' ? undefined : filter },
        headers: { 'X-Program-Code': PROG },
      });
      setItems(data?.data || []);
    } catch { setItems([]); } finally { setLoading(false); }
  };

  useEffect(() => { fetch(); }, [filter]);

  const handleRetry = async (id: number) => {
    await axios.post(`/api/admin/notifications/${id}/retry`, {}, { headers: { 'X-Program-Code': PROG } });
    message.success('已重试'); fetch();
  };

  const statusColor: Record<string, string> = { PENDING: 'blue', SENDING: 'processing', SENT: 'green', RETRY: 'orange', FAILED: 'red', DEAD: '#666' };
  const channelColor: Record<string, string> = { SMS: 'orange', WECHAT_TEMPLATE: 'green', APP_PUSH: 'blue', EMAIL: 'purple' };

  const columns = [
    { title: 'ID', dataIndex: 'id', width: 60 },
    { title: '渠道', dataIndex: 'channel', width: 80, render: (v: string) => <Tag color={channelColor[v] || 'default'}>{v}</Tag> },
    { title: '事件类型', dataIndex: 'event_type', width: 100 },
    { title: '接收方', dataIndex: 'recipient', width: 150 },
    { title: '状态', dataIndex: 'status', width: 80, render: (v: string) => <Tag color={statusColor[v] || 'default'}>{v}</Tag> },
    { title: '重试', dataIndex: 'retry_count', width: 50 },
    { title: '错误', dataIndex: 'error_message', width: 200, ellipsis: true },
    { title: '时间', dataIndex: 'created_at', width: 120 },
    {
      title: '操作', width: 60,
      render: (_: any, r: any) => ['RETRY','FAILED','DEAD'].includes(r.status) ? (
        <Button size="small" icon={<SendOutlined />} onClick={() => handleRetry(r.id)}>重试</Button>
      ) : null,
    },
  ];

  return (
    <Card title={<span><BellOutlined /> 通知管理（出件箱）</span>} extra={
      <Space>
        <Select value={filter} onChange={setFilter} style={{ width: 120 }}
          options={['ALL','PENDING','SENT','RETRY','FAILED','DEAD'].map(s=>({label:s,value:s}))} />
        <Button icon={<ReloadOutlined />} onClick={fetch}>刷新</Button>
      </Space>
    }>
      <Table dataSource={items} columns={columns} loading={loading} rowKey="id" size="small" pagination={{ pageSize: 30 }} scroll={{ x: 1000 }} />
    </Card>
  );
};

export default NotificationPage;