import React, { useState, useEffect, useCallback } from 'react';
import { Card, Table, Tag, Button, Space, Statistic, Row, Col, message, Spin, Descriptions, InputNumber, Select } from 'antd';
import {
  PlayCircleOutlined, PauseCircleOutlined, CheckCircleOutlined, ReloadOutlined,
  ExperimentOutlined, TrophyOutlined, CalculatorOutlined,
  RocketOutlined, DownloadOutlined, FundOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import {
  getPlanExperiments, getExperimentDetail, getExperimentStats,
  startExperiment, pauseExperiment, completeExperiment, promoteExperimentWinner,
  estimateSampleSize,
  type ExperimentEntity, type ExperimentVariantEntity, type ExperimentStats,
  type SampleSizeRequest, type SampleSizeResponse,
} from '../../api/campaign';
import { useCampaignStyles } from './styles/campaign-ui-standard';

const STATUS_TAG: Record<string, { color: string; label: string }> = {
  DRAFT: { color: 'default', label: '草稿' },
  RUNNING: { color: 'green', label: '运行中' },
  PAUSED: { color: 'orange', label: '已暂停' },
  COMPLETED: { color: 'blue', label: '已完成' },
  ARCHIVED: { color: 'default', label: '已归档' },
};

/** 简易 SVG 趋势图 — 变体指标对比柱状图 + 提升箭头 */
const TrendChart: React.FC<{
  variants: ExperimentVariantEntity[];
  objectiveMetric: string;
}> = ({ variants, objectiveMetric }) => {
  if (!variants || variants.length === 0) return null;

  const W = 500, H = 200, PAD = { top: 20, right: 20, bottom: 40, left: 50 };
  const plotW = W - PAD.left - PAD.right;
  const plotH = H - PAD.top - PAD.bottom;

  // Find max metric value for scale
  const maxVal = Math.max(...variants.map(v => v.metricValue || 0), 0.01);
  const barW = Math.min(60, plotW / variants.length * 0.6);
  const gap = plotW / variants.length;

  const colors = ['#94a3b8', '#3b82f6', '#f59e0b', '#22c55e', '#ef4444', '#8b5cf6'];

  const isPct = objectiveMetric !== 'REVENUE_PER_USER';
  const fmt = (v: number) => isPct ? (v * 100).toFixed(1) + '%' : v.toFixed(2);

  return (
    <div style={{ marginTop: 8 }}>
      <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4, color: '#374151' }}>
        <FundOutlined style={{ marginRight: 4 }} />指标对比
      </div>
      <svg width={W} height={H} style={{ background: '#fafbfc', borderRadius: 8, border: '1px solid #e5e7eb' }}>
        {/* Y axis labels */}
        {[0, 0.25, 0.5, 0.75, 1.0].map(ratio => {
          const y = PAD.top + plotH * (1 - ratio);
          return (
            <g key={ratio}>
              <line x1={PAD.left} y1={y} x2={W - PAD.right} y2={y} stroke="#e5e7eb" strokeDasharray="3,3" />
              <text x={PAD.left - 6} y={y + 4} textAnchor="end" fontSize={10} fill="#6b7280">
                {isPct ? (maxVal * ratio * 100).toFixed(1) + '%' : (maxVal * ratio).toFixed(1)}
              </text>
            </g>
          );
        })}

        {/* Bars */}
        {variants.map((v, i) => {
          const x = PAD.left + gap * (i + 0.5) - barW / 2;
          const barH = (v.metricValue || 0) / maxVal * plotH;
          const y = PAD.top + plotH - barH;

          return (
            <g key={v.id}>
              <rect x={x} y={y} width={barW} height={barH} rx={4}
                fill={v.isWinner ? '#f59e0b' : colors[i % colors.length]} opacity={0.85} />
              <text x={x + barW / 2} y={y - 6} textAnchor="middle" fontSize={11} fontWeight={600}
                fill={v.isWinner ? '#b45309' : '#374151'}>
                {fmt(v.metricValue || 0)}
              </text>
              <text x={x + barW / 2} y={H - 8} textAnchor="middle" fontSize={11} fill="#4b5563">
                {v.variantCode}
                {v.isWinner && '🏆'}
              </text>
            </g>
          );
        })}
      </svg>
      <div style={{ marginTop: 4, fontSize: 11, color: '#9ca3af', textAlign: 'center' }}>
        指标值 = event_count / exposure_count
      </div>
    </div>
  );
};

/**
 * A/B 测试实验仪表板 — 实验列表、结果查看、启停管理、趋势图、导出。
 */
const ExperimentDashboardPage: React.FC = () => {
  const styles = useCampaignStyles();

  const [experiments, setExperiments] = useState<ExperimentEntity[]>([]);
  const [selected, setSelected] = useState<ExperimentEntity | null>(null);
  const [variants, setVariants] = useState<ExperimentVariantEntity[]>([]);
  const [stats, setStats] = useState<ExperimentStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [planId, setPlanId] = useState('');

  // --------- 样本量估算器 ---------
  const [showEstimator, setShowEstimator] = useState(false);
  const [estMetric, setEstMetric] = useState<string>('CLICK_RATE');
  const [estBaseline, setEstBaseline] = useState<number>(0.12);
  const [estMde, setEstMde] = useState<number>(0.05);
  const [estSignificance, setEstSignificance] = useState<number>(0.95);
  const [estPower, setEstPower] = useState<number>(0.80);
  const [estVariants, setEstVariants] = useState<number>(2);
  const [estDailyTraffic, setEstDailyTraffic] = useState<number | undefined>(undefined);
  const [estResult, setEstResult] = useState<SampleSizeResponse | null>(null);
  const [estLoading, setEstLoading] = useState(false);

  const handleEstimate = async () => {
    setEstLoading(true);
    try {
      const req: SampleSizeRequest = {
        objectiveMetric: estMetric,
        baselineRate: estBaseline,
        minimumDetectableEffect: estMde,
        statisticalSignificance: estSignificance,
        statisticalPower: estPower,
        variantCount: estVariants,
        dailyTraffic: estDailyTraffic,
      };
      const result = await estimateSampleSize(req);
      setEstResult(result);
    } catch {
      message.error('样本量估算失败');
    } finally {
      setEstLoading(false);
    }
  };

  const loadExperiments = useCallback(async () => {
    if (!planId.trim()) {
      setExperiments([]);
      return;
    }
    setLoading(true);
    try {
      const list = await getPlanExperiments(planId.trim());
      setExperiments(list || []);
    } catch {
      message.error('加载实验列表失败');
    } finally {
      setLoading(false);
    }
  }, [planId]);

  const loadDetail = useCallback(async (expId: string) => {
    try {
      const [detail, statsData] = await Promise.all([
        getExperimentDetail(expId),
        getExperimentStats(expId),
      ]);
      if (detail) {
        setSelected(detail.experiment);
        setVariants(detail.variants || []);
      }
      setStats(statsData);
    } catch {
      message.error('加载实验详情失败');
    }
  }, []);

  const handleAction = async (expId: string, action: 'start' | 'pause' | 'complete') => {
    try {
      if (action === 'start') await startExperiment(expId);
      else if (action === 'pause') await pauseExperiment(expId);
      else await completeExperiment(expId);
      message.success('操作成功');
      loadExperiments();
      loadDetail(expId);
    } catch {
      message.error('操作失败');
    }
  };

  // --------- 推全胜者 ---------
  const handlePromote = async (expId: string) => {
    try {
      await promoteExperimentWinner(expId);
      message.success('胜者已推全成功！配置已应用到生产环境');
      loadExperiments();
      loadDetail(expId);
    } catch {
      message.error('推全失败，请确认实验有胜者且状态为已完成');
    }
  };

  // --------- 导出报告 ---------
  const handleExport = () => {
    if (!selected || !stats) {
      message.warning('请先选择一个实验查看详情');
      return;
    }

    const report = {
      exportedAt: new Date().toISOString(),
      experiment: {
        id: selected.id,
        name: selected.name,
        objectiveMetric: selected.objectiveMetric,
        objectiveDirection: selected.objectiveDirection,
        status: selected.status,
        trafficAllocationPct: selected.trafficAllocationPct,
        statisticalSignificance: selected.statisticalSignificance,
        totalSampleSize: selected.totalSampleSize,
        autoPromoteWinner: selected.autoPromoteWinner,
        winningVariantId: selected.winningVariantId,
        promoted: selected.promoted || false,
      },
      stats: {
        totalAssignments: stats.totalAssignments,
        winnerId: stats.winnerId,
        overallImprovement: stats.overallImprovement,
        significantVariants: stats.significantVariants,
      },
      variants: variants.map(v => ({
        name: v.variantName,
        code: v.variantCode,
        trafficPercentage: v.trafficPercentage,
        exposureCount: v.exposureCount,
        eventCount: v.eventCount,
        metricValue: v.metricValue,
        relativeImprovement: v.relativeImprovement,
        pValue: v.pValue,
        confidenceInterval: v.confidenceInterval,
        isWinner: v.isWinner,
        nodeOverrides: v.nodeOverrides,
      })),
    };

    const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `experiment-report-${selected.id}-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    message.success('报告已导出');
  };

  const expColumns: ColumnsType<ExperimentEntity> = [
    { title: '实验名称', dataIndex: 'name', key: 'name' },
    { title: '目标指标', dataIndex: 'objectiveMetric', key: 'metric', width: 140,
      render: (v: string) => <Tag>{v}</Tag> },
    { title: '状态', dataIndex: 'status', key: 'status', width: 100,
      render: (v: string) => {
        const t = STATUS_TAG[v] || { color: 'default', label: v };
        return <Tag color={t.color}>{t.label}</Tag>;
      }},
    { title: '胜者', dataIndex: 'winningVariantId', key: 'winner', width: 100,
      render: (v: string, r: ExperimentEntity) => {
        if (v && (r as any).promoted) return <Tag icon={<RocketOutlined />} color="green">已推全</Tag>;
        if (v) return <Tag icon={<TrophyOutlined />} color="gold">已确定</Tag>;
        return '-';
      }},
    { title: '操作', key: 'action', width: 260,
      render: (_: unknown, record: ExperimentEntity) => (
        <Space size="small">
          <Button size="small" onClick={() => loadDetail(record.id)}>查看</Button>
          {record.status === 'DRAFT' && (
            <Button size="small" type="primary" icon={<PlayCircleOutlined />}
              onClick={() => handleAction(record.id, 'start')}>启动</Button>
          )}
          {record.status === 'RUNNING' && (
            <>
              <Button size="small" icon={<PauseCircleOutlined />}
                onClick={() => handleAction(record.id, 'pause')}>暂停</Button>
              <Button size="small" icon={<CheckCircleOutlined />}
                onClick={() => handleAction(record.id, 'complete')}>完成</Button>
            </>
          )}
          {record.status === 'PAUSED' && (
            <Button size="small" type="primary" icon={<PlayCircleOutlined />}
              onClick={() => handleAction(record.id, 'start')}>恢复</Button>
          )}
          {record.status === 'COMPLETED' && record.winningVariantId && !record.promoted && (
            <Button size="small" type="primary" icon={<RocketOutlined />}
              style={{ background: '#f59e0b', borderColor: '#f59e0b' }}
              onClick={() => handlePromote(record.id)}>推全</Button>
          )}
        </Space>
      )},
  ];

  const variantColumns: ColumnsType<ExperimentVariantEntity> = [
    { title: '变体', dataIndex: 'variantName', key: 'name', width: 100 },
    { title: '代码', dataIndex: 'variantCode', key: 'code', width: 60 },
    { title: '流量%', dataIndex: 'trafficPercentage', key: 'traffic', width: 80 },
    { title: '曝光', dataIndex: 'exposureCount', key: 'exposure', width: 80 },
    { title: '事件', dataIndex: 'eventCount', key: 'events', width: 80 },
    { title: '指标值', dataIndex: 'metricValue', key: 'metric', width: 100,
      render: (v: number) => v != null ? (v * 100).toFixed(2) + '%' : '-' },
    { title: '相对提升', dataIndex: 'relativeImprovement', key: 'improvement', width: 100,
      render: (v: number) => v != null ? <span style={{ color: v > 0 ? '#52c41a' : '#ff4d4f' }}>{(v * 100).toFixed(1)}%</span> : '-' },
    { title: 'P值', dataIndex: 'pValue', key: 'pvalue', width: 90,
      render: (v: number) => v != null ? v.toFixed(4) : '-' },
    { title: '置信区间', dataIndex: 'confidenceInterval', key: 'ci', width: 90 },
    { title: '胜者', dataIndex: 'isWinner', key: 'winner', width: 80,
      render: (v: boolean) => v ? <TrophyOutlined style={{ color: '#faad14' }} /> : null },
  ];

  return (
    <div style={styles.pageStyle}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h2 style={{ margin: 0 }}>
          <ExperimentOutlined style={{ marginRight: 8, color: '#f59e0b' }} />
          A/B 测试实验仪表板
        </h2>
        <Space>
          <input
            placeholder="输入 Plan ID"
            value={planId}
            onChange={e => setPlanId(e.target.value)}
            style={{ padding: '4px 8px', borderRadius: 4, border: '1px solid #d9d9d9' }}
          />
          <Button icon={<ReloadOutlined />} onClick={loadExperiments}>查询</Button>
        </Space>
      </div>

      {/* Sample Size Estimator */}
      <Card
        size="small"
        style={{ marginBottom: 16 }}
        title={
          <Space><CalculatorOutlined style={{ color: '#7c3aed' }} />样本量估算器</Space>
        }
        extra={
          <Button size="small" type="link" onClick={() => setShowEstimator(!showEstimator)}>
            {showEstimator ? '收起' : '展开'}
          </Button>
        }
      >
        {showEstimator && (
          <>
            <Row gutter={12} style={{ marginBottom: 12 }}>
              <Col span={4}>
                <Select value={estMetric} onChange={setEstMetric} style={{ width: '100%' }} size="small">
                  <Select.Option value="CLICK_RATE">点击率</Select.Option>
                  <Select.Option value="CONVERSION_RATE">转化率</Select.Option>
                  <Select.Option value="OPEN_RATE">打开率</Select.Option>
                  <Select.Option value="REVENUE_PER_USER">人均收入</Select.Option>
                </Select>
              </Col>
              <Col span={3}>
                <InputNumber size="small" value={estBaseline} onChange={v => setEstBaseline(v || 0)}
                  step={0.01} min={0.001} max={0.999} style={{ width: '100%' }} addonAfter="基线" />
              </Col>
              <Col span={3}>
                <InputNumber size="small" value={estMde} onChange={v => setEstMde(v || 0)}
                  step={0.01} min={0.001} max={5} style={{ width: '100%' }} addonAfter="MDE" />
              </Col>
              <Col span={3}>
                <Select value={estSignificance} onChange={setEstSignificance} style={{ width: '100%' }} size="small">
                  <Select.Option value={0.90}>显著性 90%</Select.Option>
                  <Select.Option value={0.95}>显著性 95%</Select.Option>
                  <Select.Option value={0.99}>显著性 99%</Select.Option>
                </Select>
              </Col>
              <Col span={3}>
                <Select value={estPower} onChange={setEstPower} style={{ width: '100%' }} size="small">
                  <Select.Option value={0.80}>功效 80%</Select.Option>
                  <Select.Option value={0.85}>功效 85%</Select.Option>
                  <Select.Option value={0.90}>功效 90%</Select.Option>
                  <Select.Option value={0.95}>功效 95%</Select.Option>
                </Select>
              </Col>
              <Col span={2}>
                <InputNumber size="small" value={estVariants} onChange={v => setEstVariants(v || 2)}
                  min={2} max={10} style={{ width: '100%' }} addonAfter="组" />
              </Col>
              <Col span={3}>
                <InputNumber size="small" value={estDailyTraffic} onChange={v => setEstDailyTraffic(v || undefined)}
                  min={0} style={{ width: '100%' }} placeholder="日流量(可选)" addonAfter="/天" />
              </Col>
              <Col span={3}>
                <Button type="primary" size="small" icon={<CalculatorOutlined />}
                  loading={estLoading} onClick={handleEstimate} block>估算</Button>
              </Col>
            </Row>
            {estResult && (
              <Row gutter={16}>
                <Col span={6}><Card size="small"><Statistic title="每组样本量" value={estResult.sampleSizePerGroup}
                  suffix={estResult.sampleSizePerGroup >= 999999999 ? ' (效应量过小)' : ' 人'} /></Card></Col>
                <Col span={6}><Card size="small"><Statistic title="总样本量" value={estResult.totalSampleSize}
                  suffix={` 人 (${estResult.variantCount} 组)`} /></Card></Col>
                <Col span={6}><Card size="small"><Statistic title="绝对效应量"
                  value={estResult.objectiveMetric === 'REVENUE_PER_USER'
                    ? estResult.absoluteEffect.toFixed(4)
                    : (estResult.absoluteEffect * 100).toFixed(2) + '%'} /></Card></Col>
                <Col span={6}><Card size="small"><Statistic title="预计实验时长"
                  value={estResult.estimatedDays != null ? `${estResult.estimatedDays} 天` : '需输入日流量'}
                  valueStyle={{ color: estResult.estimatedDays != null && estResult.estimatedDays <= 14 ? '#52c41a' : '#faad14' }} /></Card></Col>
              </Row>
            )}
            {estResult && (
              <div style={{ marginTop: 8, fontSize: 12, color: '#8c8c8c' }}>📐 {estResult.formula}</div>
            )}
          </>
        )}
      </Card>

      {/* Experiment List */}
      <Card title="实验列表" size="small" style={{ marginBottom: 16 }}>
        <Table columns={expColumns} dataSource={experiments} rowKey="id"
          loading={loading} pagination={false} size="small" />
      </Card>

      {/* Experiment Detail */}
      {selected && (
        <>
          <Card
            title={`实验详情: ${selected.name}`}
            size="small"
            style={{ marginBottom: 16 }}
            extra={
              <Space>
                <Button size="small" icon={<DownloadOutlined />} onClick={handleExport}>导出报告</Button>
              </Space>
            }
          >
            <Descriptions size="small" column={3}>
              <Descriptions.Item label="目标指标">{selected.objectiveMetric}</Descriptions.Item>
              <Descriptions.Item label="优化方向">{selected.objectiveDirection}</Descriptions.Item>
              <Descriptions.Item label="状态">
                <Tag color={STATUS_TAG[selected.status]?.color}>{STATUS_TAG[selected.status]?.label}</Tag>
              </Descriptions.Item>
              <Descriptions.Item label="实验流量">{selected.trafficAllocationPct}%</Descriptions.Item>
              <Descriptions.Item label="最大样本量">{selected.totalSampleSize || '不限'}</Descriptions.Item>
              <Descriptions.Item label="显著性水平">{(selected.statisticalSignificance * 100).toFixed(0)}%</Descriptions.Item>
              {selected.promoted && (
                <Descriptions.Item label="推全状态">
                  <Tag icon={<RocketOutlined />} color="green">已推全</Tag>
                </Descriptions.Item>
              )}
            </Descriptions>
          </Card>

          {/* Stats Overview */}
          {stats && (
            <Row gutter={16} style={{ marginBottom: 16 }}>
              <Col span={4}><Card size="small"><Statistic title="总分配" value={stats.totalAssignments} /></Card></Col>
              <Col span={4}><Card size="small"><Statistic title="胜者ID" value={stats.winnerId || '未确定'} /></Card></Col>
              <Col span={4}><Card size="small"><Statistic title="整体提升" value={stats.overallImprovement ? (stats.overallImprovement * 100).toFixed(1) + '%' : '-'} /></Card></Col>
              <Col span={4}><Card size="small"><Statistic title="显著变体数" value={stats.significantVariants?.length || 0} /></Card></Col>
              <Col span={8}>
                <Card size="small">
                  <Space style={{ width: '100%', justifyContent: 'flex-end' }}>
                    {selected.status === 'COMPLETED' && selected.winningVariantId && !selected.promoted && (
                      <Button type="primary" icon={<RocketOutlined />}
                        style={{ background: '#f59e0b', borderColor: '#f59e0b' }}
                        onClick={() => handlePromote(selected.id)}>
                        推全胜者
                      </Button>
                    )}
                    <Button icon={<DownloadOutlined />} onClick={handleExport}>导出报告</Button>
                  </Space>
                </Card>
              </Col>
            </Row>
          )}

          {/* Trend Chart */}
          {variants.length > 0 && stats && (
            <Card size="small" style={{ marginBottom: 16 }}>
              <TrendChart variants={variants} objectiveMetric={selected.objectiveMetric} />
            </Card>
          )}

          {/* Variants Table */}
          <Card title="变体详情" size="small">
            <Table columns={variantColumns} dataSource={variants} rowKey="id"
              pagination={false} size="small"
              rowClassName={record => record.isWinner ? 'experiment-winner-row' : ''} />
          </Card>
        </>
      )}

      {!selected && !loading && experiments.length === 0 && planId && (
        <Card>
          <div style={{ textAlign: 'center', padding: 40, color: '#8c8c8c' }}>
            <ExperimentOutlined style={{ fontSize: 48 }} />
            <p style={{ marginTop: 16 }}>该计划暂无实验，请在画布中创建 EXPERIMENT 节点</p>
          </div>
        </Card>
      )}
    </div>
  );
};

export default ExperimentDashboardPage;
