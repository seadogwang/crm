import React, { useState, useCallback } from 'react';
import { Card, Input, InputNumber, Row, Col, Typography, Progress, Button, Space, Table, Tag } from 'antd';
import { SearchOutlined, DollarOutlined } from '@ant-design/icons';
import api from '../api';
import { useCampaignStyles, TitleWithDesc, CampaignCard } from './campaign/styles/campaign-ui-standard';

const { Title, Text } = Typography;

const PointsAccounts: React.FC = () => {
  const [memberId, setMemberId] = useState<number | null>(null);
  const [accounts, setAccounts] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetch = useCallback(async () => {
    if (!memberId) return;
    setLoading(true);
    setError(null);
    try {
      const { data } = await api.get(`/members/${memberId}/accounts`);
      setAccounts(data?.data || []);
    } catch (e: any) {
      setError(e.response?.data?.message || '查询失败');
      setAccounts([]);
    } finally {
      setLoading(false);
    }
  }, [memberId]);

  return (
    <div className="campaign-page" style={{ padding: 'var(--campaign-page-padding)', minHeight: 'calc(100vh - 64px)' }}>
      <TitleWithDesc title="积分账户总览" desc="查询会员积分账户余额、累计获得/消耗/过期明细" />

      <Space style={{ marginBottom: 12 }}>
        <InputNumber
          placeholder="会员 ID"
          value={memberId}
          onChange={v => setMemberId(v)}
          style={{ width: 180 }}
        />
        <Button type="primary" icon={<SearchOutlined />} onClick={fetch}>查询</Button>
      </Space>

      {memberId && accounts.length === 0 && !loading && (
        <Text type="secondary">请输入会员ID查询积分账户</Text>
      )}

      <Row gutter={16}>
        {accounts.map(acc => (
          <Col xs={24} sm={12} md={8} key={acc.account_type} style={{ marginBottom: 12 }}>
            <Card
              title={<Space><DollarOutlined />{acc.account_type || '积分账户'}</Space>}
              size="small"
            >
              <Title level={3} style={{ margin: 0 }}>{acc.balance?.toLocaleString() || 0}</Title>
              <Text type="secondary">可用余额</Text>

              {acc.credit_limit > 0 && (
                <div style={{ marginTop: 12 }}>
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    信用已用: {acc.credit_used || 0} / {acc.credit_limit}
                  </Text>
                  <Progress
                    percent={Math.round((acc.credit_used || 0) / acc.credit_limit * 100)}
                    size="small"
                    status={acc.credit_used >= acc.credit_limit ? 'exception' : 'active'}
                  />
                </div>
              )}

              <div style={{ marginTop: 8, fontSize: 12, color: '#999' }}>
                <div>累计获得: {acc.total_earned?.toLocaleString() || 0}</div>
                <div>累计消耗: {acc.total_spent?.toLocaleString() || 0}</div>
                <div>累计过期: {acc.total_expired?.toLocaleString() || 0}</div>
              </div>
            </Card>
          </Col>
        ))}
      </Row>
    </div>
  );
};

export default PointsAccounts;