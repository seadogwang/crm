import React, { useState } from 'react';
import { Table, Input, Select, Space, Tag, InputNumber, Card } from 'antd';
import { SearchOutlined, HistoryOutlined } from '@ant-design/icons';
import axios from 'axios';

const PROG = sessionStorage.getItem('current_program_code') || 'PROG001';

const PointsHistory: React.FC = () => {
  const [txs, setTxs] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [memberId, setMemberId] = useState<number | null>(null);

  const fetch = async () => {
    if (!memberId) return;
    setLoading(true);
    try {
      const { data } = await axios.get(`/api/admin/points/transactions`, {
        params: { member_id: memberId },
        headers: { 'X-Program-Code': PROG },
      });
      setTxs(data?.data || []);
    } catch { setTxs([]); }
    finally { setLoading(false); }
  };

  const typeColor: Record<string, string> = { ACCRUAL: 'green', REDEMPTION: 'red', EXPIRATION: 'orange', REPAYMENT: 'blue', CREDIT_REPAY: 'purple', OVERDRAFT: 'red', CASCADE_DEDUCT: 'magenta' };

  const columns = [
    { title: 'ID', dataIndex: 'id', width: 60 },
    { title: '类型', dataIndex: 'transaction_type', width: 110, render: (v: string) => <Tag color={typeColor[v] || 'default'}>{v}</Tag> },
    { title: '金额', dataIndex: 'amount', width: 100, render: (v: number) => <span style={{ color: v > 0 ? 'green' : 'red', fontWeight: 600 }}>{v}</span> },
    { title: '剩余', dataIndex: 'remaining_amount', width: 100 },
    { title: '状态', dataIndex: 'status', width: 90, render: (v: string) => <Tag>{v}</Tag> },
    { title: '过期时间', dataIndex: 'expires_at', width: 120 },
    { title: '规则', dataIndex: 'rule_code', width: 100 },
    { title: '时间', dataIndex: 'created_at', width: 120 },
  ];

  return (
    <Card title={<span><HistoryOutlined /> 积分流水查询</span>}>
      <Space style={{ marginBottom: 16 }}>
        <InputNumber placeholder="会员 ID" value={memberId} onChange={v => setMemberId(v)} style={{ width: 150 }} />
        <Input.Search enterButton={<SearchOutlined />} onSearch={fetch} style={{ width: 200 }} />
      </Space>
      <Table dataSource={txs} columns={columns} loading={loading} rowKey="id" size="small" pagination={{ pageSize: 30 }} scroll={{ x: 900 }} />
    </Card>
  );
};

export default PointsHistory;