import React, { useState, useEffect, useCallback } from 'react';
import { Table, Tag, Button, Space, message, Select, Card, Statistic, Row, Col } from 'antd';
import { ReloadOutlined, PlayCircleOutlined, InboxOutlined } from '@ant-design/icons';
import axios from 'axios';

const PROG = sessionStorage.getItem('current_program_code') || 'PROG001';

const statusColors: Record<string, string> = {
  RECEIVED: 'blue', VALIDATING: 'processing', VALIDATED: 'cyan', PROCESSING: 'geekblue',
  SUCCEEDED: 'green', FAILED: 'red', TRANSFORM_FAILED: 'orange', DEAD: '#666', REJECTED: 'volcano',
};

const EventInbox: React.FC = () => {
  const [events, setEvents] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState('ALL');
  const [stats, setStats] = useState<Record<string, number>>({});
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);

  const fetch = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await axios.get('/api/admin/event-inbox', {
        params: { status: filter === 'ALL' ? undefined : filter },
        headers: { 'X-Program-Code': PROG },
      });
      setEvents(data?.data?.events || []);
      setStats(data?.data?.stats || {});
    } catch { setEvents([]); }
    finally { setLoading(false); }
  }, [filter]);

  useEffect(() => { fetch(); }, [fetch]);
  useEffect(() => {
    if (!autoRefresh) return;
    const timer = setInterval(fetch, 5000);
    return () => clearInterval(timer);
  }, [autoRefresh, fetch]);

  const handleReplay = async (id: number) => {
    await axios.post(`/api/admin/events/${id}/replay`, {}, { headers: { 'X-Program-Code': PROG } });
    message.success('死信已重放');
    fetch();
  };

  const handleBatchReplay = async () => {
    for (const id of selectedIds) {
      await axios.post(`/api/admin/events/${id}/replay`, {}, { headers: { 'X-Program-Code': PROG } });
    }
    message.success(`${selectedIds.length} 个事件已重放`);
    setSelectedIds([]); fetch();
  };

  const columns = [
    { title: 'ID', dataIndex: 'id', width: 60 },
    { title: '渠道', dataIndex: 'source_channel', width: 80, render: (v: string) => <Tag>{v}</Tag> },
    { title: '状态', dataIndex: 'status', width: 110, render: (v: string) => <Tag color={statusColors[v] || 'default'}>{v}</Tag> },
    { title: '事件ID', dataIndex: 'source_event_id', width: 130, ellipsis: true },
    { title: '重试', dataIndex: 'retry_count', width: 50 },
    { title: '错误', dataIndex: 'error_message', width: 200, ellipsis: true, render: (v: string) => v ? <span style={{ color: '#999', fontSize: 12 }}>{v}</span> : '-' },
    { title: '时间', dataIndex: 'first_seen_at', width: 120 },
    {
      title: '操作', width: 80,
      render: (_: any, r: any) => (r.status === 'DEAD' || r.status === 'FAILED') ? (
        <Button size="small" icon={<PlayCircleOutlined />} onClick={() => handleReplay(r.id)}>重放</Button>
      ) : null,
    },
  ];

  return (
    <div>
      <Row gutter={16} style={{ marginBottom: 16 }}>
        {Object.entries(stats).map(([k, v]) => (
          <Col span={4} key={k}><Card size="small"><Statistic title={k} value={v} /></Card></Col>
        ))}
      </Row>
      <Card title={<span><InboxOutlined /> 事件收件箱</span>} extra={
        <Space>
          <Select value={filter} onChange={setFilter} style={{ width: 140 }}
            options={['ALL','RECEIVED','PROCESSING','SUCCEEDED','FAILED','DEAD','TRANSFORM_FAILED'].map(s=>({label:s,value:s}))} />
          <Button icon={<ReloadOutlined />} onClick={fetch}>刷新</Button>
          <Button type={autoRefresh ? 'primary' : 'default'} onClick={() => setAutoRefresh(!autoRefresh)}>
            {autoRefresh ? '自动刷新中' : '自动刷新'}
          </Button>
          {selectedIds.length > 0 && <Button icon={<PlayCircleOutlined />} onClick={handleBatchReplay}>批量重放({selectedIds.length})</Button>}
        </Space>
      }>
        <Table rowSelection={{ selectedRowKeys: selectedIds, onChange: (keys) => setSelectedIds(keys as number[]) }}
          dataSource={events} columns={columns} loading={loading} rowKey="id" size="small" pagination={{ pageSize: 30 }} scroll={{ x: 1000 }} />
      </Card>
    </div>
  );
};

export default EventInbox;