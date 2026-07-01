import React, { useState, useEffect, useCallback } from 'react';
import { Row, Col, Table, Tag, Card, Typography, Space, Select, Button, Spin } from 'antd';
import {
  TeamOutlined, UserAddOutlined, DollarOutlined, ThunderboltOutlined,
  WarningOutlined, AlertOutlined, BugOutlined, ReloadOutlined,
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import StatCard from '../components/StatCard';
import { useAppStore } from '../store';
import api from '../api';
import { useCampaignStyles, TitleWithDesc, CampaignCard } from './campaign/styles/campaign-ui-standard';

const { Text, Title } = Typography;

// ==================== 告警配置 ====================

interface AlertItem {
  type: string;
  icon: React.ReactNode;
  color: string;
  path: string;
}

const ALERT_CONFIG: Record<string, AlertItem> = {
  CASCADE_RECALC_BACKLOG: { type: 'CASCADE_RECALC_BACKLOG', icon: <WarningOutlined />, color: 'orange', path: '/system/logs' },
  SPI_TIMEOUT_RATE_HIGH: { type: 'SPI_TIMEOUT_RATE_HIGH', icon: <AlertOutlined />, color: 'red', path: '/system/spi-logs' },
  TENANT_POLLUTION: { type: 'TENANT_POLLUTION', icon: <BugOutlined />, color: '#ff4d4f', path: '/system/audit' },
  RULE_COMPILE_FAILED: { type: 'RULE_COMPILE_FAILED', icon: <WarningOutlined />, color: 'magenta', path: '/rules' },
};

// ==================== 简易趋势图（无外部依赖） ====================

const SimpleTrendChart: React.FC<{
  data: { label: string; grants: number; redeems: number }[];
  range: string;
  onRangeChange: (range: string) => void;
}> = ({ data, range, onRangeChange }) => {
  const maxVal = Math.max(...data.map(d => Math.max(d.grants, d.redeems)), 1);

  return (
    <Card
      title="积分发放/核销趋势"
      extra={
        <Select size="small" value={range} onChange={onRangeChange} style={{ width: 80 }}>
          <Select.Option value="day">日</Select.Option>
          <Select.Option value="week">周</Select.Option>
          <Select.Option value="month">月</Select.Option>
        </Select>
      }
    >
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 16, height: 200, padding: '0 8px' }}>
        {data.map((d, i) => (
          <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
            <div style={{ display: 'flex', gap: 2, alignItems: 'flex-end', height: 160 }}>
              <div
                title={`发放: ${d.grants.toLocaleString()}`}
                style={{
                  width: 14, height: `${(d.grants / maxVal) * 150}px`,
                  background: 'linear-gradient(180deg, #52c41a, #b7eb8f)',
                  borderRadius: '4px 4px 0 0',
                }}
              />
              <div
                title={`核销: ${d.redeems.toLocaleString()}`}
                style={{
                  width: 14, height: `${(d.redeems / maxVal) * 150}px`,
                  background: 'linear-gradient(180deg, #ff4d4f, #ffa39e)',
                  borderRadius: '4px 4px 0 0',
                }}
              />
            </div>
            <Text style={{ fontSize: 10, color: '#999' }}>{d.label}</Text>
          </div>
        ))}
      </div>
      <Space style={{ marginTop: 12 }}>
        <Text type="secondary" style={{ fontSize: 12 }}>
          <span style={{ display: 'inline-block', width: 12, height: 12, background: '#52c41a', borderRadius: 2, marginRight: 4 }} />
          发放
        </Text>
        <Text type="secondary" style={{ fontSize: 12 }}>
          <span style={{ display: 'inline-block', width: 12, height: 12, background: '#ff4d4f', borderRadius: 2, marginRight: 4 }} />
          核销
        </Text>
      </Space>
    </Card>
  );
};

// ==================== Dashboard 主组件 ====================

const Dashboard: React.FC = () => {
  const navigate = useNavigate();
  const programCode = useAppStore(s => s.currentProgramCode);
  const s = useCampaignStyles();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<Record<string, number>>({});
  const [trendData, setTrendData] = useState<{ label: string; grants: number; redeems: number }[]>([]);
  const [alerts, setAlerts] = useState<any[]>([]);
  const [trendRange, setTrendRange] = useState('week');

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [summaryRes, trendRes, alertsRes] = await Promise.allSettled([
        api.get('/dashboard/summary'),
        api.get('/dashboard/trend', { params: { range: trendRange } }),
        api.get('/dashboard/alerts'),
      ]);

      if (summaryRes.status === 'fulfilled') {
        setSummary(summaryRes.value.data?.data || {});
      }
      if (trendRes.status === 'fulfilled') {
        setTrendData(trendRes.value.data?.data || []);
      }
      if (alertsRes.status === 'fulfilled') {
        setAlerts(alertsRes.value.data?.data || []);
      }
    } catch (e: any) {
      console.error('[Dashboard] 加载失败:', e);
      setError(e.message || '加载失败');
    } finally {
      setLoading(false);
    }
  }, [trendRange]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // 30秒轮询告警
  useEffect(() => {
    const timer = setInterval(async () => {
      try {
        const { data } = await api.get('/dashboard/alerts');
        setAlerts(data?.data || []);
      } catch {}
    }, 30000);
    return () => clearInterval(timer);
  }, []);

  // 告警列表列定义
  const alertColumns = [
    {
      title: '类型', dataIndex: 'alert_type', width: 180,
      render: (v: string) => {
        const cfg = ALERT_CONFIG[v];
        return cfg ? <Space><Tag color={cfg.color}>{cfg.icon}{v}</Tag></Space> : <Tag>{v}</Tag>;
      },
    },
    { title: '详情', dataIndex: 'detail', ellipsis: true },
    { title: '时间', dataIndex: 'created_at', width: 140 },
    {
      title: '操作', width: 80,
      render: (_: any, r: any) => {
        const cfg = ALERT_CONFIG[r.alert_type];
        if (!cfg) return null;
        return <Button size="small" type="link" onClick={() => navigate(cfg.path)}>查看</Button>;
      },
    },
  ];

  return (
    <div className="campaign-page" style={s.pageStyle}>
      <TitleWithDesc title="仪表盘" desc="会员运营核心指标概览与实时告警" />

      {/* 指标卡片行 */}
      <Row gutter={16} style={{ marginBottom: 12 }}>
        <Col xs={12} sm={6}>
          <StatCard
            title="会员总数"
            value={summary.totalMembers?.toLocaleString() || '—'}
            prefix={<TeamOutlined />}
            trend={summary.memberGrowthRate}
            trendLabel="较昨日"
            onClick={() => navigate('/members')}
          />
        </Col>
        <Col xs={12} sm={6}>
          <StatCard
            title="今日新增"
            value={summary.todayNewMembers?.toLocaleString() || '—'}
            prefix={<UserAddOutlined />}
            trend={summary.newMemberGrowthRate}
            trendLabel="较昨日"
          />
        </Col>
        <Col xs={12} sm={6}>
          <StatCard
            title="积分发放"
            value={summary.totalGranted?.toLocaleString() || '—'}
            prefix={<DollarOutlined />}
            trendLabel="本月累计"
          />
        </Col>
        <Col xs={12} sm={6}>
          <StatCard
            title="积分核销"
            value={summary.totalRedeemed?.toLocaleString() || '—'}
            prefix={<ThunderboltOutlined />}
            trendLabel="本月累计"
          />
        </Col>
      </Row>

      {/* 趋势图 + 告警列表 */}
      <Row gutter={16}>
        <Col xs={24} lg={15}>
          <SimpleTrendChart
            data={trendData.length > 0 ? trendData : generateDemoTrendData(trendRange)}
            range={trendRange}
            onRangeChange={setTrendRange}
          />
        </Col>
        <Col xs={24} lg={9}>
          <CampaignCard title={<Space><WarningOutlined />待处理告警</Space>}>
            <Table className="campaign-table"
              dataSource={alerts}
              columns={alertColumns}
              rowKey="id"
              size="small"
              pagination={false}
              locale={{ emptyText: '暂无告警 ✅' }}
              scroll={{ x: 'max-content' }}
            />
          </CampaignCard>
        </Col>
      </Row>
    </div>
  );
};

// 演示数据（后端不可用时展示）
function generateDemoTrendData(range: string) {
  const labels = range === 'day' ? ['00:00', '04:00', '08:00', '12:00', '16:00', '20:00'] :
    range === 'month' ? ['第1周', '第2周', '第3周', '第4周'] :
      ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];
  return labels.map(l => ({
    label: l,
    grants: Math.floor(Math.random() * 50000),
    redeems: Math.floor(Math.random() * 30000),
  }));
}

export default Dashboard;