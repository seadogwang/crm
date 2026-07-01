import React, { useState, useEffect, useCallback } from 'react';
import { Table, Tag, Space, Button, Typography, DatePicker, Tooltip, message } from 'antd';
import { ReloadOutlined, WarningOutlined, ExportOutlined, SearchOutlined } from '@ant-design/icons';
import { useCampaignStyles, TitleWithDesc, CampaignCard } from './campaign/styles/campaign-ui-standard';
import api from '../api';

const { Title, Text } = Typography;
const { RangePicker } = DatePicker;

const TenantAudit: React.FC = () => {
  const [records, setRecords] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dateRange, setDateRange] = useState<[string, string] | null>(null);
  const [exporting, setExporting] = useState(false);

  const fetch = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params: Record<string, any> = { limit: 100 };
      if (dateRange) { params.start_date = dateRange[0]; params.end_date = dateRange[1]; }
      const { data } = await api.get('/admin/audit/tenant-pollution', { params });
      setRecords(data?.data || []);
    } catch (e: any) { setError(e.message || '加载失败'); setRecords([]); }
    finally { setLoading(false); }
  }, [dateRange]);

  useEffect(() => { fetch(); }, [fetch]);

  const handleExport = async () => {
    setExporting(true);
    try {
      const params: Record<string, any> = { format: 'csv' };
      if (dateRange) { params.start_date = dateRange[0]; params.end_date = dateRange[1]; }
      const { data } = await api.get('/admin/audit/tenant-pollution/export', {
        params,
        responseType: 'blob',
      });
      const url = URL.createObjectURL(new Blob([data]));
      const a = document.createElement('a');
      a.href = url;
      a.download = `tenant_audit_${Date.now()}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      message.success('导出成功');
    } catch (e: any) { message.error('导出失败'); }
    finally { setExporting(false); }
  };

  const columns = [
    { title: 'ID', dataIndex: 'id', width: 60 },
    {
      title: '时间', dataIndex: 'created_at', width: 160,
    },
    {
      title: '操作用户', dataIndex: 'username', width: 120,
      render: (v: string) => <Tag>{v}</Tag>,
    },
    {
      title: '请求租户', dataIndex: 'request_program', width: 120,
      render: (v: string) => <Tag color="blue">{v}</Tag>,
    },
    {
      title: '目标资源租户', dataIndex: 'target_program', width: 140,
      render: (v: string) => <Tag color="red">{v}</Tag>,
    },
    { title: 'API 路径', dataIndex: 'api_path', width: 250, ellipsis: true },
    { title: 'IP 地址', dataIndex: 'ip_address', width: 130 },
    {
      title: '拒绝原因', dataIndex: 'reject_reason', width: 150,
      render: (v: string) => (
        <Tooltip title={v}>
          <Tag color="red">{v?.substring(0, 20) || '—'}</Tag>
        </Tooltip>
      ),
    },
    {
      title: '', width: 40,
      render: () => (
        <Tooltip title="该用户尝试跨租户访问资源">
          <WarningOutlined style={{ color: '#ff4d4f', fontSize: 16 }} />
        </Tooltip>
      ),
    },
  ];

  return (
    <div className="campaign-page" style={{ padding: 'var(--campaign-page-padding)', minHeight: 'calc(100vh - 64px)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
        <TitleWithDesc title="租户污染审计" desc="监控和审计跨租户访问请求，识别潜在的数据隔离违规行为" />
        <Space>
          <Button icon={<ExportOutlined />} onClick={handleExport} loading={exporting}>导出 CSV</Button>
          <Button icon={<ReloadOutlined />} onClick={fetch}>刷新</Button>
        </Space>
      </div>

      <Space wrap style={{ marginBottom: 16 }}>
        <RangePicker onChange={(_, dateStrings) => setDateRange(dateStrings[0] && dateStrings[1] ? [dateStrings[0], dateStrings[1]] : null)} />
        <Button type="primary" icon={<SearchOutlined />} onClick={fetch}>查询</Button>
      </Space>

      <Table
        dataSource={records}
        columns={columns}
        loading={loading}
        rowKey="id"
        size="small"
        pagination={{ pageSize: 30 }}
        scroll={{ x: 1200 }}
        locale={{ emptyText: '暂无跨租户访问记录 ✅' }}
      />
    </div>
  );
};

export default TenantAudit;