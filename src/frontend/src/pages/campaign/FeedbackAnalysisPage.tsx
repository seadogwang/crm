import React, { useState } from 'react';
import {
  Card, Table, Button, Tag, Space, Typography, Tabs, message, Row, Col, Statistic, Spin, Empty, Input,
} from 'antd';
import {
  DashboardOutlined, AlertOutlined, SettingOutlined,
  ReloadOutlined, CheckCircleOutlined, PlayCircleOutlined,
} from '@ant-design/icons';
import {
  getFeedbackMetrics, triggerFeedbackCalculation,
  getDriftHistory, getStrategyAdjustments, applyAdjustment,
  FeedbackMetrics, ModelDrift, StrategyAdjustment,
} from '../../api/campaign';
import { useCampaignStyles, TitleWithDesc } from './styles/campaign-ui-standard';

const { Text, Title } = Typography;

const FeedbackAnalysisPage: React.FC = () => {
  const s = useCampaignStyles();
  const [planId, setPlanId] = useState('plan_001');
  const [metrics, setMetrics] = useState<FeedbackMetrics | null>(null);
  const [drifts, setDrifts] = useState<ModelDrift[]>([]);
  const [adjustments, setAdjustments] = useState<StrategyAdjustment[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [m, d, a] = await Promise.all([
        getFeedbackMetrics(planId).catch(() => null),
        getDriftHistory().catch(() => []),
        getStrategyAdjustments('ws_001').catch(() => []),
      ]);
      setMetrics(m?.metrics || null);
      setDrifts(d || []);
      setAdjustments(a || []);
    } finally { setLoading(false); }
  };

  const handleCalculate = async () => {
    try { await triggerFeedbackCalculation(planId); message.success('反馈计算完成'); fetchData(); }
    catch (e: any) { message.error(e?.response?.data?.message || e.message); }
  };

  const handleApply = async (id: string) => {
    try { await applyAdjustment(id); message.success('调整已应用'); fetchData(); }
    catch (e: any) { message.error(e?.response?.data?.message || e.message); }
  };

  const predLabel = (v: number | undefined) => (v ?? 0).toFixed(2);
  const deviationPct = (v: number | undefined) => ((v ?? 0) * 100).toFixed(1);

  return (
    <div style={s.pageStyle}>
      <TitleWithDesc title="反馈闭环分析" desc="预测vs实际 · 漂移检测 · 策略调整 · 执行→采集→学习→优化" />

      <Card size="small" style={{ marginTop: 12 }}>
        <Space>
          <Text strong>计划 ID:</Text>
          <Input value={planId} onChange={e => setPlanId(e.target.value)} style={{ width: 200 }} />
          <Button icon={<ReloadOutlined />} onClick={fetchData} loading={loading}>刷新</Button>
          <Button icon={<PlayCircleOutlined />} type="primary" onClick={handleCalculate}>计算反馈</Button>
        </Space>
      </Card>

      <Tabs defaultActiveKey="analysis" style={{ marginTop: 16 }} items={[
        {
          key: 'analysis',
          label: <span><DashboardOutlined /> 反馈分析</span>,
          children: (
            <Spin spinning={loading}>
              {metrics ? (
                <>
                  <Card size="small" title="预测 vs 实际" style={{ marginBottom: 16 }}>
                    <Row gutter={16}>
                      <Col span={6}><Statistic title="ROI 预测" value={predLabel(metrics.predictedRoi)} suffix="x" /></Col>
                      <Col span={6}><Statistic title="ROI 实际" value={predLabel(metrics.actualRoi)} suffix="x"
                        valueStyle={{ color: (metrics.actualRoi || 0) >= (metrics.predictedRoi || 0) ? '#22c55e' : '#ef4444' }} /></Col>
                      <Col span={6}><Statistic title="转化率 预测" value={(metrics.predictedConversion * 100).toFixed(1)} suffix="%" /></Col>
                      <Col span={6}><Statistic title="转化率 实际" value={(metrics.actualConversion * 100).toFixed(1)} suffix="%"
                        valueStyle={{ color: (metrics.actualConversion || 0) >= (metrics.predictedConversion || 0) ? '#22c55e' : '#ef4444' }} /></Col>
                    </Row>
                    <Row gutter={16} style={{ marginTop: 12 }}>
                      <Col span={6}><Statistic title="ROI 偏差" value={deviationPct(metrics.roiDeviation)} suffix="%"
                        valueStyle={{ color: Math.abs(metrics.roiDeviation || 0) > 0.3 ? '#ef4444' : '#eab308' }} /></Col>
                      <Col span={6}><Statistic title="收入 预测" value={`¥${(metrics.predictedRevenue || 0).toLocaleString()}`} /></Col>
                      <Col span={6}><Statistic title="收入 实际" value={`¥${(metrics.actualRevenue || 0).toLocaleString()}`} /></Col>
                      <Col span={6}><Statistic title="成本" value={`¥${(metrics.actualCost || 0).toLocaleString()}`} /></Col>
                    </Row>
                    <Row gutter={16} style={{ marginTop: 12 }}>
                      <Col span={6}><Statistic title="曝光数" value={metrics.totalExposures} /></Col>
                      <Col span={6}><Statistic title="转化数" value={metrics.totalConversions} /></Col>
                      <Col span={6}><Statistic title="独立用户" value={metrics.uniqueUsers} /></Col>
                      <Col span={6}><Statistic title="计算时间" value={metrics.calculatedAt ? new Date(metrics.calculatedAt).toLocaleString() : '-'} /></Col>
                    </Row>
                  </Card>

                  {/* ROI Comparison bar chart */}
                  <Card size="small" title="ROI 对比" style={{ marginBottom: 16 }}>
                    <div style={{ marginBottom: 8 }}>
                      <Text>预测: {predLabel(metrics.predictedRoi)}x</Text>
                      <div style={{ height: 24, background: '#f0f0f0', borderRadius: 4, overflow: 'hidden', marginTop: 4 }}>
                        <div style={{ height: '100%', width: `${Math.min((metrics.predictedRoi || 0) * 20, 100)}%`, backgroundColor: '#9ca3af', borderRadius: 4 }} />
                      </div>
                    </div>
                    <div>
                      <Text>实际: {predLabel(metrics.actualRoi)}x</Text>
                      <div style={{ height: 24, background: '#f0f0f0', borderRadius: 4, overflow: 'hidden', marginTop: 4 }}>
                        <div style={{ height: '100%', width: `${Math.min((metrics.actualRoi || 0) * 20, 100)}%`, backgroundColor: (metrics.actualRoi || 0) >= (metrics.predictedRoi || 0) ? '#22c55e' : '#ef4444', borderRadius: 4 }} />
                      </div>
                    </div>
                  </Card>
                </>
              ) : <Empty description="输入计划 ID 并点击「刷新」或「计算反馈」" />}
            </Spin>
          ),
        },
        {
          key: 'drift',
          label: <span><AlertOutlined /> 漂移监测</span>,
          children: (
            <Table dataSource={drifts} rowKey="id" size="small" pagination={{ pageSize: 10 }}
              locale={{ emptyText: <Empty description="暂无漂移记录" /> }}
              columns={[
                { title: '模型', dataIndex: 'modelName', key: 'modelName', render: (t: string) => <Tag color="purple">{t}</Tag> },
                { title: '漂移分', dataIndex: 'driftScore', key: 'driftScore', render: (v: number) => v?.toFixed(4) },
                { title: '阈值', dataIndex: 'threshold', key: 'threshold', render: (v: number) => v?.toFixed(4) },
                { title: '检测到', dataIndex: 'driftDetected', key: 'driftDetected',
                  render: (v: boolean) => <Tag color={v ? 'red' : 'green'}>{v ? '是' : '否'}</Tag> },
                { title: '样本量', dataIndex: 'sampleSize', key: 'sampleSize' },
                { title: 'MAE', dataIndex: 'mae', key: 'mae', render: (v: number) => v?.toFixed(4) },
                { title: '状态', dataIndex: 'status', key: 'status', render: (s: string) => <Tag>{s}</Tag> },
                { title: '检测时间', dataIndex: 'detectedAt', key: 'detectedAt', render: (t: string) => t ? new Date(t).toLocaleString() : '-' },
              ]} />
          ),
        },
        {
          key: 'adjustments',
          label: <span><SettingOutlined /> 策略调整</span>,
          children: (
            <Table dataSource={adjustments} rowKey="id" size="small" pagination={{ pageSize: 10 }}
              locale={{ emptyText: <Empty description="暂无策略调整" /> }}
              columns={[
                { title: '类型', dataIndex: 'adjustmentType', key: 'adjustmentType', render: (t: string) => <Tag color="blue">{t}</Tag> },
                { title: '触发事件', dataIndex: 'triggerEvent', key: 'triggerEvent' },
                { title: '原因', dataIndex: 'reason', key: 'reason', render: (r: string) => <Text ellipsis style={{ maxWidth: 300 }}>{r}</Text> },
                { title: '预期提升', dataIndex: 'expectedImprovement', key: 'expectedImprovement', render: (v: number) => `${((v ?? 0) * 100).toFixed(0)}%` },
                { title: '状态', dataIndex: 'status', key: 'status', render: (s: string) => <Tag color={s === 'APPLIED' ? 'green' : s === 'PENDING' ? 'orange' : 'default'}>{s}</Tag> },
                { title: '操作', key: 'action', render: (_: any, r: StrategyAdjustment) => (
                  r.status === 'PENDING' ? <Button size="small" icon={<CheckCircleOutlined />} onClick={() => handleApply(r.id)}>应用</Button> : null
                )},
              ]} />
          ),
        },
      ]} />
    </div>
  );
};

export default FeedbackAnalysisPage;
