import React, { useState, useEffect, useCallback } from 'react';
import { Table, Tag, Select, Space, Button, Typography, DatePicker, Drawer, Descriptions, Input } from 'antd';
import { ReloadOutlined, FileTextOutlined, SearchOutlined } from '@ant-design/icons';
import { useCampaignStyles, TitleWithDesc, CampaignCard } from './campaign/styles/campaign-ui-standard';
import api from '../api';

const { Title, Text } = Typography;
const { RangePicker } = DatePicker;

const OperationLogs: React.FC = () => {
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [userFilter, setUserFilter] = useState<string | null>(null);
  const [actionFilter, setActionFilter] = useState<string | null>(null);
  const [dateRange, setDateRange] = useState<[string, string] | null>(null);
  const [selectedLog, setSelectedLog] = useState<any>(null);

  const fetch = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params: Record<string, any> = { limit: 100 };
      if (userFilter) params.username = userFilter;
      if (actionFilter) params.action = actionFilter;
      if (dateRange) { params.start_date = dateRange[0]; params.end_date = dateRange[1]; }

      const { data } = await api.get('/admin/audit/operations', { params });
      setLogs(data?.data || []);
    } catch (e: any) { setError(e.message || '加载失败'); setLogs([]); }
    finally { setLoading(false); }
  }, [userFilter, actionFilter, dateRange]);

  useEffect(() => { fetch(); }, [fetch]);

  const columns = [
    { title: 'ID', dataIndex: 'id', width: 60 },
    {
      title: '用户', dataIndex: 'username', width: 120,
      render: (v: string) => <Tag>{v}</Tag>,
    },
    {
      title: '操作', dataIndex: 'action', width: 180,
      render: (v: string) => <Tag color={v?.includes('DELETE') ? 'red' : v?.includes('CREATE') ? 'green' : 'blue'}>{v}</Tag>,
    },
    { title: '目标对象', dataIndex: 'target_type', width: 120, render: (v: string) => <Tag>{v}</Tag> },
    { title: '目标ID', dataIndex: 'target_id', width: 100 },
    { title: 'IP', dataIndex: 'ip_address', width: 130 },
    { title: '时间', dataIndex: 'created_at', width: 160 },
    {
      title: '操作', width: 60,
      render: (_: any, r: any) => (
        <Button size="small" type="link" onClick={() => setSelectedLog(r)}>详情</Button>
      ),
    },
  ];

  return (
    <div className="campaign-page" style={{ padding: 'var(--campaign-page-padding)', minHeight: 'calc(100vh - 64px)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
        <TitleWithDesc title="操作日志" desc="查看系统操作审计日志，追踪用户创建、更新、删除等关键操作记录" />
        <Button icon={<ReloadOutlined />} onClick={fetch}>刷新</Button>
      </div>

      <Space wrap style={{ marginBottom: 16 }}>
        <Input
          placeholder="用户名"
          value={userFilter || ''}
          onChange={e => setUserFilter(e.target.value || null)}
          style={{ width: 150 }}
        />
        <Select
          placeholder="操作类型"
          value={actionFilter}
          onChange={setActionFilter}
          allowClear
          style={{ width: 150 }}
          options={['CREATE', 'UPDATE', 'DELETE', 'LOGIN', 'LOGOUT', 'EXPORT'].map(a => ({ label: a, value: a }))}
        />
        <RangePicker onChange={(_, dateStrings) => setDateRange(dateStrings[0] && dateStrings[1] ? [dateStrings[0], dateStrings[1]] : null)} />
        <Button type="primary" icon={<SearchOutlined />} onClick={fetch}>查询</Button>
      </Space>

      <Table dataSource={logs} columns={columns} loading={loading} rowKey="id" size="small"
        pagination={{ pageSize: 30 }} scroll={{ x: 900 }} />

      {/* 详情 Drawer */}
      <Drawer title="操作详情" open={!!selectedLog} onClose={() => setSelectedLog(null)} width={500}>
        {selectedLog && (
          <Descriptions bordered size="small" column={1}>
            <Descriptions.Item label="用户">{selectedLog.username}</Descriptions.Item>
            <Descriptions.Item label="操作">{selectedLog.action}</Descriptions.Item>
            <Descriptions.Item label="目标对象">{selectedLog.target_type}</Descriptions.Item>
            <Descriptions.Item label="目标ID">{selectedLog.target_id}</Descriptions.Item>
            <Descriptions.Item label="IP 地址">{selectedLog.ip_address}</Descriptions.Item>
            <Descriptions.Item label="User Agent">{selectedLog.user_agent || '—'}</Descriptions.Item>
            <Descriptions.Item label="时间">{selectedLog.created_at}</Descriptions.Item>
            <Descriptions.Item label="详情">
              <pre style={{ maxHeight: 300, overflow: 'auto', fontSize: 12, background: '#fff', padding: 8, borderRadius: 4, border: '1px solid #e8e8e8' }}>
                {selectedLog.detail ? JSON.stringify(selectedLog.detail, null, 2) : '—'}
              </pre>
            </Descriptions.Item>
          </Descriptions>
        )}
      </Drawer>
    </div>
  );
};

export default OperationLogs;