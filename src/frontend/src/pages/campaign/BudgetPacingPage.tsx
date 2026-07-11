import React, { useState } from 'react';
import { Card, Table, Tag, Button, Space, Statistic, Row, Col, message, Input, Descriptions, Progress, Switch, Select, InputNumber } from 'antd';
import { ReloadOutlined, DollarOutlined, WarningOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import {
  getBudgetStatus, saveBudgetPacing, getBudgetConsumptions, getBudgetAlerts,
  type BudgetStatus, type BudgetConsumptionEntity, type BudgetAlertEntity, type BudgetPacingEntity,
} from '../../api/campaign';
import { useCampaignStyles } from './styles/campaign-ui-standard';

const ALERT_TAGS: Record<string, { color: string; label: string }> = {
  WARN: { color: 'orange', label: '⚠ 警告' },
  CRITICAL: { color: 'red', label: '🔴 严重' },
  STOP: { color: 'red', label: '⛔ 停止' },
  DAILY_CAP: { color: 'gold', label: '📅 日上限' },
};

const BudgetPacingPage: React.FC = () => {
  const styles = useCampaignStyles();
  const [planId, setPlanId] = useState('');
  const [status, setStatus] = useState<BudgetStatus | null>(null);
  const [consumptions, setConsumptions] = useState<BudgetConsumptionEntity[]>([]);
  const [alerts, setAlerts] = useState<BudgetAlertEntity[]>([]);
  const [loading, setLoading] = useState(false);

  // Config form state
  const [totalBudget, setTotalBudget] = useState(100000);
  const [pacingMode, setPacingMode] = useState('EVEN');
  const [dailyCapEnabled, setDailyCapEnabled] = useState(true);
  const [dailyCapAmount, setDailyCapAmount] = useState(10000);

  const loadData = async () => {
    if (!planId.trim()) return;
    setLoading(true);
    try {
      const [s, c, a] = await Promise.all([
        getBudgetStatus(planId.trim()),
        getBudgetConsumptions(planId.trim()),
        getBudgetAlerts(planId.trim()),
      ]);
      setStatus(s);
      setConsumptions(c || []);
      setAlerts(a || []);
      if (s) {
        setTotalBudget(s.totalBudget);
        setPacingMode(s.pacingMode);
        setDailyCapEnabled(s.dailyCapEnabled);
        setDailyCapAmount(s.dailyCapAmount);
      }
    } catch { message.error('加载失败'); }
    finally { setLoading(false); }
  };

  const handleSave = async () => {
    if (!planId.trim()) return;
    try {
      await saveBudgetPacing(planId.trim(), {
        planId: planId.trim(), totalBudget,
        pacingMode, dailyCapEnabled, dailyCapAmount,
      } as Partial<BudgetPacingEntity>);
      message.success('保存成功');
      loadData();
    } catch { message.error('保存失败'); }
  };

  const ratio = status?.consumptionRatio || 0;
  const ratioColor = ratio >= 1 ? '#ff4d4f' : ratio >= 0.8 ? '#fa8c16' : ratio >= 0.95 ? '#ff4d4f' : '#52c41a';

  const consumptionColumns: ColumnsType<BudgetConsumptionEntity> = [
    { title: '时间', dataIndex: 'consumedAt', key: 'time', width: 180,
      render: v => v ? new Date(v).toLocaleString() : '-' },
    { title: '金额', dataIndex: 'amount', key: 'amount', width: 100,
      render: v => `¥${Number(v).toFixed(2)}` },
    { title: '数量', dataIndex: 'quantity', key: 'qty', width: 80 },
    { title: '渠道', dataIndex: 'channel', key: 'channel', width: 80 },
    { title: '类型', dataIndex: 'consumptionType', key: 'type', width: 100 },
  ];

  const alertColumns: ColumnsType<BudgetAlertEntity> = [
    { title: '时间', dataIndex: 'triggeredAt', key: 'time', width: 180,
      render: v => v ? new Date(v).toLocaleString() : '-' },
    { title: '类型', dataIndex: 'alertType', key: 'type', width: 100,
      render: v => {
        const t = ALERT_TAGS[v] || { color: 'default', label: v };
        return <Tag color={t.color}>{t.label}</Tag>;
      }},
    { title: '消息', dataIndex: 'alertMessage', key: 'msg' },
    { title: '状态', dataIndex: 'status', key: 'status', width: 80,
      render: v => <Tag color={v === 'ACTIVE' ? 'red' : 'green'}>{v}</Tag> },
  ];

  return (
    <div style={styles.pageStyle}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h2 style={{ margin: 0 }}><DollarOutlined style={{ marginRight: 8, color: '#52c41a' }} />预算节奏控制</h2>
        <Space>
          <Input.Search placeholder="Plan ID" value={planId} onChange={e => setPlanId(e.target.value)}
            onSearch={loadData} style={{ width: 260 }} enterButton />
          <Button icon={<ReloadOutlined />} onClick={loadData}>刷新</Button>
        </Space>
      </div>

      {status && (
        <>
          {/* Budget Overview */}
          <Row gutter={16} style={{ marginBottom: 16 }}>
            <Col span={6}><Card size="small"><Statistic title="总预算" value={status.totalBudget} prefix="¥" precision={2} /></Card></Col>
            <Col span={6}><Card size="small"><Statistic title="已消耗" value={status.totalConsumed} prefix="¥" precision={2}
              valueStyle={{ color: ratioColor }} /></Card></Col>
            <Col span={6}><Card size="small"><Statistic title="剩余" value={status.totalRemaining} prefix="¥" precision={2}
              valueStyle={{ color: '#52c41a' }} /></Card></Col>
            <Col span={6}><Card size="small"><Statistic title="今日已用" value={status.todayConsumed} prefix="¥" precision={2} /></Card></Col>
          </Row>

          <Row gutter={16} style={{ marginBottom: 16 }}>
            <Col span={12}>
              <Card size="small" title="消耗进度">
                <Progress percent={Math.min(ratio * 100, 100)} status={ratio >= 1 ? 'exception' : ratio >= 0.8 ? 'active' : 'active'}
                  strokeColor={ratioColor} />
                {status.isPausedByBudget && <Tag color="red" icon={<WarningOutlined />} style={{ marginTop: 8 }}>预算耗尽已暂停</Tag>}
              </Card>
            </Col>
            <Col span={12}>
              <Card size="small" title="今日进度">
                {status.dailyCapAmount > 0 && (
                  <Progress percent={Math.min((status.todayConsumed / status.dailyCapAmount) * 100, 100)}
                    status={status.todayConsumed >= status.dailyCapAmount ? 'exception' : 'active'} />
                )}
              </Card>
            </Col>
          </Row>

          {/* Config Form */}
          <Card title="节奏配置" size="small" style={{ marginBottom: 16 }}>
            <Descriptions column={2} size="small" bordered>
              <Descriptions.Item label="总预算">
                <InputNumber value={totalBudget} onChange={v => setTotalBudget(v || 0)}
                  style={{ width: 160 }} prefix="¥" />
              </Descriptions.Item>
              <Descriptions.Item label="节奏模式">
                <Select value={pacingMode} onChange={setPacingMode} style={{ width: 160 }}
                  options={[
                    { label: '匀速消耗', value: 'EVEN' },
                    { label: '前倾消耗', value: 'FRONT_LOADED' },
                    { label: '加速消耗', value: 'ACCELERATED' },
                    { label: '动态调速', value: 'DYNAMIC' },
                  ]} />
              </Descriptions.Item>
              <Descriptions.Item label="每日上限">
                <Space>
                  <Switch checked={dailyCapEnabled} onChange={setDailyCapEnabled} />
                  <InputNumber value={dailyCapAmount} onChange={v => setDailyCapAmount(v || 0)}
                    disabled={!dailyCapEnabled} style={{ width: 120 }} prefix="¥" />
                </Space>
              </Descriptions.Item>
              <Descriptions.Item label="已暂停">
                <Tag color={status.isPausedByBudget ? 'red' : 'green'}>
                  {status.isPausedByBudget ? '是' : '否'}
                </Tag>
              </Descriptions.Item>
            </Descriptions>
            <div style={{ marginTop: 12, textAlign: 'right' }}>
              <Button type="primary" onClick={handleSave}>💾 保存配置</Button>
            </div>
          </Card>

          {/* Alerts */}
          <Card title="告警记录" size="small" style={{ marginBottom: 16 }}>
            <Table columns={alertColumns} dataSource={alerts} rowKey="id"
              pagination={{ pageSize: 5 }} size="small" />
          </Card>

          {/* Consumption Details */}
          <Card title="消耗明细" size="small">
            <Table columns={consumptionColumns} dataSource={consumptions} rowKey="id"
              pagination={{ pageSize: 10, showTotal: t => `共 ${t} 条` }} size="small" />
          </Card>
        </>
      )}

      {!status && !loading && (
        <Card><div style={{ textAlign: 'center', padding: 40, color: '#8c8c8c' }}>
          <DollarOutlined style={{ fontSize: 48 }} /><p style={{ marginTop: 16 }}>输入 Plan ID 查看预算节奏状态</p>
        </div></Card>
      )}
    </div>
  );
};

export default BudgetPacingPage;
