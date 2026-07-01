import React, { useState, useEffect, useCallback } from 'react';
import { Table, Tag, Select, Space, Button, Typography, DatePicker, Descriptions, message } from 'antd';
import { ReloadOutlined, PlayCircleOutlined, AuditOutlined, SearchOutlined } from '@ant-design/icons';
import { useCampaignStyles, TitleWithDesc, CampaignCard } from './campaign/styles/campaign-ui-standard';
import api from '../api';

const { Title } = Typography;
const { RangePicker } = DatePicker;

const SpiLogs: React.FC = () => {
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [channelFilter, setChannelFilter] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  const [dateRange, setDateRange] = useState<[string, string] | null>(null);
  const [expandedRows, setExpandedRows] = useState<number[]>([]);

  const fetch = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params: Record<string, any> = { limit: 100 };
      if (channelFilter) params.channel = channelFilter;
      if (statusFilter) params.status = statusFilter;
      if (dateRange) { params.start_date = dateRange[0]; params.end_date = dateRange[1]; }

      const { data } = await api.get('/admin/spi-logs', { params });
      setLogs(data?.data || []);
    } catch (e: any) { setError(e.message || '加载失败'); setLogs([]); }
    finally { setLoading(false); }
  }, [channelFilter, statusFilter, dateRange]);

  useEffect(() => { fetch(); }, [fetch]);

  const handleReplay = async (id: number) => {
    try {
      await api.post(`/admin/events/${id}/replay`);
      message.success('死信已重放');
      fetch();
    } catch (e: any) { message.error(e.response?.data?.message || '重放失败'); }
  };

  const statusColor: Record<string, string> = {
    SUCCEEDED: 'green', FAILED: 'red', DEAD: '#666', PROCESSING: 'geekblue',
    TRANSFORM_FAILED: 'orange', TIMEOUT: 'volcano',
  };

  const columns = [
    { title: 'ID', dataIndex: 'id', width: 60 },
    { title: '渠道', dataIndex: 'source_channel', width: 100, render: (v: string) => <Tag color="blue">{v}</Tag> },
    { title: 'Request ID', dataIndex: 'source_event_id', width: 150, ellipsis: true },
    {
      title: '状态', dataIndex: 'status', width: 100,
      render: (v: string) => <Tag color={statusColor[v] || 'default'}>{v}</Tag>,
    },
    { title: '耗时(ms)', dataIndex: 'duration_ms', width: 80 },
    { title: '重试', dataIndex: 'retry_count', width: 50 },
    { title: '错误', dataIndex: 'error_message', width: 200, ellipsis: true },
    { title: '时间', dataIndex: 'created_at', width: 150 },
    {
      title: '操作', width: 80,
      render: (_: any, r: any) => (r.status === 'DEAD' || r.status === 'FAILED') ? (
        <Button size="small" icon={<PlayCircleOutlined />} onClick={() => handleReplay(r.id)}>重放</Button>
      ) : null,
    },
  ];

  return (
    <div className="campaign-page" style={{ padding: 'var(--campaign-page-padding)', minHeight: 'calc(100vh - 64px)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
        <TitleWithDesc title="SPI 调用日志" desc="查看和追踪 SPI 适配器的调用日志，支持死信重放和请求/响应详情查看" />
        <Button icon={<ReloadOutlined />} onClick={fetch}>刷新</Button>
      </div>

      <Space wrap style={{ marginBottom: 16 }}>
        <Select
          placeholder="渠道"
          value={channelFilter}
          onChange={setChannelFilter}
          allowClear
          style={{ width: 130 }}
          options={['TMALL', 'JD', 'DOUYIN', 'WECHAT_MINI'].map(c => ({ label: c, value: c }))}
        />
        <Select
          placeholder="状态"
          value={statusFilter}
          onChange={setStatusFilter}
          allowClear
          style={{ width: 130 }}
          options={['SUCCEEDED', 'FAILED', 'DEAD', 'TRANSFORM_FAILED', 'TIMEOUT'].map(s => ({ label: s, value: s }))}
        />
        <RangePicker onChange={(_, dateStrings) => setDateRange(dateStrings[0] && dateStrings[1] ? [dateStrings[0], dateStrings[1]] : null)} />
        <Button type="primary" icon={<SearchOutlined />} onClick={fetch}>查询</Button>
      </Space>

      <Table
        dataSource={logs}
        columns={columns}
        loading={loading}
        rowKey="id"
        size="small"
        pagination={{ pageSize: 30 }}
        scroll={{ x: 1100 }}
        expandable={{
          expandedRowRender: (record: any) => (
            <div style={{ padding: '8px 16px' }}>
              <Descriptions bordered size="small" column={2}>
                <Descriptions.Item label="请求头" span={2}>
                  <pre style={{ fontSize: 11, margin: 0, maxHeight: 120, overflow: 'auto', background: '#fff', padding: 4, borderRadius: 4, border: '1px solid #e8e8e8' }}>
                    {record.request_headers ? JSON.stringify(record.request_headers, null, 2) : '—'}
                  </pre>
                </Descriptions.Item>
                <Descriptions.Item label="请求体" span={2}>
                  <pre style={{ fontSize: 11, margin: 0, maxHeight: 200, overflow: 'auto', background: '#fff', padding: 4, borderRadius: 4, border: '1px solid #e8e8e8' }}>
                    {record.request_body ? JSON.stringify(record.request_body, null, 2) : '—'}
                  </pre>
                </Descriptions.Item>
                <Descriptions.Item label="响应体" span={2}>
                  <pre style={{ fontSize: 11, margin: 0, maxHeight: 200, overflow: 'auto', background: '#fff', padding: 4, borderRadius: 4, border: '1px solid #e8e8e8' }}>
                    {record.response_body ? JSON.stringify(record.response_body, null, 2) : '—'}
                  </pre>
                </Descriptions.Item>
              </Descriptions>
            </div>
          ),
          rowExpandable: () => true,
        }}
      />
    </div>
  );
};

export default SpiLogs;