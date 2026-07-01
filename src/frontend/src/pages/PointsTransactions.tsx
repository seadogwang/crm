import React, { useState, useCallback } from 'react';
import { Table, Input, Select, Space, Tag, InputNumber, Button, Typography, DatePicker } from 'antd';
import { SearchOutlined, HistoryOutlined } from '@ant-design/icons';
import api from '../api';
import { useCampaignStyles, TitleWithDesc, CampaignCard } from './campaign/styles/campaign-ui-standard';

const { Title } = Typography;
const { RangePicker } = DatePicker;

const PointsTransactions: React.FC = () => {
  const [txs, setTxs] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [memberId, setMemberId] = useState<number | null>(null);
  const [txType, setTxType] = useState<string | null>(null);
  const [dateRange, setDateRange] = useState<[string, string] | null>(null);
  const [exporting, setExporting] = useState(false);

  const fetch = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params: Record<string, any> = {};
      if (memberId) params.member_id = memberId;
      if (txType) params.transaction_type = txType;
      if (dateRange) { params.start_date = dateRange[0]; params.end_date = dateRange[1]; }

      const { data } = await api.get('/admin/points/transactions', { params });
      setTxs(data?.data || []);
    } catch (e: any) {
      setError(e.message || '查询失败');
      setTxs([]);
    } finally {
      setLoading(false);
    }
  }, [memberId, txType, dateRange]);

  const handleExport = async () => {
    setExporting(true);
    try {
      const params: Record<string, any> = { format: 'excel' };
      if (memberId) params.member_id = memberId;
      if (txType) params.transaction_type = txType;
      const { data } = await api.get('/admin/points/transactions/export', {
        params,
        responseType: 'blob',
      });
      const url = URL.createObjectURL(new Blob([data]));
      const a = document.createElement('a');
      a.href = url;
      a.download = `points_transactions_${Date.now()}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e: any) {
      console.error('导出失败:', e);
    } finally {
      setExporting(false);
    }
  };

  const typeColor: Record<string, string> = {
    ACCRUAL: 'green', REDEMPTION: 'red', EXPIRATION: 'orange', REPAYMENT: 'blue',
    CREDIT_REPAY: 'purple', OVERDRAFT: 'red', CASCADE_DEDUCT: 'magenta',
  };

  const columns = [
    { title: 'ID', dataIndex: 'id', width: 60 },
    { title: '会员ID', dataIndex: 'member_id', width: 80 },
    { title: '类型', dataIndex: 'transaction_type', width: 110, render: (v: string) => <Tag color={typeColor[v] || 'default'}>{v}</Tag> },
    { title: '流水号', dataIndex: 'tx_ref', width: 120, ellipsis: true },
    { title: '金额', dataIndex: 'amount', width: 100, render: (v: number) => <span style={{ color: v > 0 ? 'green' : 'red', fontWeight: 600 }}>{v}</span> },
    { title: '剩余额度', dataIndex: 'remaining_amount', width: 100 },
    { title: '批次状态', dataIndex: 'status', width: 90, render: (v: string) => <Tag>{v}</Tag> },
    { title: '过期时间', dataIndex: 'expires_at', width: 120 },
    { title: '时间', dataIndex: 'created_at', width: 140 },
  ];

  return (
    <div className="campaign-page" style={{ padding: 'var(--campaign-page-padding)', minHeight: 'calc(100vh - 64px)' }}>
      <TitleWithDesc title="积分流水" desc="查询积分交易流水，支持按会员、类型、日期范围筛选" />

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
        <Space wrap>
          <InputNumber placeholder="会员 ID" value={memberId} onChange={v => setMemberId(v)} style={{ width: 140 }} />
          <Select
            placeholder="交易类型"
            value={txType}
            onChange={setTxType}
            allowClear
            style={{ width: 150 }}
            options={['ACCRUAL', 'REDEMPTION', 'EXPIRATION', 'REPAYMENT', 'CREDIT_REPAY', 'OVERDRAFT', 'CASCADE_DEDUCT']
              .map(t => ({ label: t, value: t }))}
          />
          <RangePicker onChange={(_, dateStrings) => setDateRange(dateStrings[0] && dateStrings[1] ? [dateStrings[0], dateStrings[1]] : null)} />
          <Button type="primary" icon={<SearchOutlined />} onClick={fetch}>查询</Button>
        </Space>
      </div>

      <CampaignCard>
        <Table className="campaign-table" dataSource={txs} columns={columns} loading={loading} rowKey="id" size="small"
          pagination={{ pageSize: 20, showSizeChanger: true, showTotal: (t: number) => `共 ${t} 条` }} scroll={{ x: 'max-content' }} />
      </CampaignCard>
    </div>
  );
};

export default PointsTransactions;