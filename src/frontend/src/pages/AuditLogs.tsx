import React, { useState, useEffect } from 'react';
import { Table, Tag, Card, Select, Button, Space } from 'antd';
import { ReloadOutlined, AuditOutlined, WarningOutlined } from '@ant-design/icons';
import axios from 'axios';

const PROG = sessionStorage.getItem('current_program_code') || 'PROG001';

const AuditLogs: React.FC = () => {
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState('ALL');

  const fetch = async () => {
    setLoading(true);
    try {
      const { data } = await axios.get('/api/admin/audit/unauthorized-access', {
        params: { limit: 100 },
        headers: { 'X-Program-Code': PROG },
      });
      setLogs(data?.data || []);
    } catch { setLogs([]); } finally { setLoading(false); }
  };

  useEffect(() => { fetch(); }, []);

  const columns = [
    { title: 'ID', dataIndex: 'id', width: 60 },
    { title: '操作', dataIndex: 'action', width: 150, render: (v: string) => <Tag color={v?.includes('UNAUTHORIZED') ? 'red' : 'blue'}>{v}</Tag> },
    { title: '请求ID', dataIndex: 'request_id', width: 150 },
    { title: '租户', dataIndex: 'program_code', width: 100, render: (v: string) => <Tag>{v}</Tag> },
    { title: '时间', dataIndex: 'created_at', width: 160 },
  ];

  return (
    <Card title={<span><AuditOutlined /> 审计日志</span>} extra={
      <Space>
        <Select value={filter} onChange={setFilter} style={{ width: 150 }}
          options={[{label:'全部',value:'ALL'},{label:'越权访问',value:'UNAUTHORIZED_ACCESS'},{label:'强制放行',value:'FORCE_OVERRIDE'}]} />
        <Button icon={<ReloadOutlined />} onClick={fetch}>刷新</Button>
      </Space>
    }>
      <Table dataSource={logs} columns={columns} loading={loading} rowKey="id" size="small" pagination={{ pageSize: 30 }} />
    </Card>
  );
};

export default AuditLogs;