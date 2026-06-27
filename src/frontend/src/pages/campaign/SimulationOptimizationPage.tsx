import React, { useState, useEffect } from 'react';
import {
  Card, Table, Button, InputNumber, Select, Tag, Space, Typography,
  Tabs, Form, message, Row, Col, Statistic, Descriptions, Spin, Empty, Alert,
} from 'antd';
import {
  ExperimentOutlined, RocketOutlined, HistoryOutlined, SwapOutlined,
  PlayCircleOutlined, BarChartOutlined,
} from '@ant-design/icons';
import {
  runSimulation, calculateBaseline, getSimulationHistory,
  runOptimization, getOptimizationHistory,
  listWorkspaces, getPortfoliosByWorkspace, getGoalsByWorkspace,
  SimulationFullResult, BaselineResult, OptimizationResultResponse,
  CampaignWorkspace, CampaignPortfolio,
} from '../../api/campaign';
import SimulationResultChart from './components/SimulationResultChart';
import BudgetAllocationChart from './components/BudgetAllocationChart';
import { useCampaignStyles, TitleWithDesc } from './styles/campaign-ui-standard';

const { Text, Title } = Typography;

const SimulationOptimizationPage: React.FC = () => {
  const s = useCampaignStyles();
  // Workspace/Goal
  const [workspaces, setWorkspaces] = useState<CampaignWorkspace[]>([]);
  const [portfolios, setPortfolios] = useState<CampaignPortfolio[]>([]);
  const [selectedWs, setSelectedWs] = useState('');
  const [selectedGoal, setSelectedGoal] = useState('');

  // Simulation state
  const [segCode, setSegCode] = useState('HIGH_VALUE');
  const [simChannel, setSimChannel] = useState('EMAIL');
  const [offerStrength, setOfferStrength] = useState(0.6);
  const [simBudget, setSimBudget] = useState(100000);
  const [simLoading, setSimLoading] = useState(false);
  const [simResult, setSimResult] = useState<SimulationFullResult | null>(null);
  const [baseline, setBaseline] = useState<BaselineResult | null>(null);

  // Optimization state
  const [optPortfolio, setOptPortfolio] = useState('');
  const [optType, setOptType] = useState('GREEDY');
  const [optLoading, setOptLoading] = useState(false);
  const [optResult, setOptResult] = useState<OptimizationResultResponse | null>(null);
  const [optGenerations, setOptGenerations] = useState(50);

  // History state
  const [simHistory, setSimHistory] = useState<SimulationFullResult[]>([]);
  const [optHistory, setOptHistory] = useState<any[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  useEffect(() => {
    listWorkspaces().then(ws => { setWorkspaces(ws || []); if (ws?.length) setSelectedWs(ws[0].id); }).catch(() => {});
  }, []);

  useEffect(() => {
    if (selectedWs) {
      getPortfoliosByWorkspace(selectedWs).then(ps => { setPortfolios(ps || []); if (ps?.length) setOptPortfolio(ps[0].id); }).catch(() => {});
    }
  }, [selectedWs]);

  // --- Simulation handlers ---
  const handleRunSim = async () => {
    setSimLoading(true);
    try {
      const [result, bl] = await Promise.all([
        runSimulation({
          workspaceId: selectedWs, goalId: selectedGoal || 'goal_001',
          segmentCode: segCode, channel: simChannel,
          offerStrength, budget: simBudget, name: `Sim-${Date.now()}`,
        }),
        calculateBaseline(selectedGoal || 'goal_001', segCode).catch(() => null),
      ]);
      setSimResult(result);
      setBaseline(bl);
      message.success(`模拟完成，预测 ROI: ${result.predictedRoi?.toFixed(2)}x`);
    } catch (err: any) {
      message.error(err?.response?.data?.message || err.message);
    } finally { setSimLoading(false); }
  };

  // --- Optimization handlers ---
  const handleRunOpt = async () => {
    if (!optPortfolio) { message.warning('请选择组合'); return; }
    setOptLoading(true);
    try {
      const result = await runOptimization({
        portfolioId: optPortfolio,
        optimizationType: optType,
        constraints: { maxGenerations: optGenerations, populationSize: 100 },
      });
      setOptResult(result);
      message.success(`优化完成，预期 ROI: ${result.expectedRoi?.toFixed(2)}x`);
    } catch (err: any) {
      message.error(err?.response?.data?.message || err.message);
    } finally { setOptLoading(false); }
  };

  const handleLoadHistory = async () => {
    setHistoryLoading(true);
    try {
      const [sims, opts] = await Promise.all([
        getSimulationHistory(selectedWs, 0, 50).catch(() => ({ content: [] })),
        optPortfolio ? getOptimizationHistory(optPortfolio, 0, 50).catch(() => ({ content: [] })) : Promise.resolve({ content: [] }),
      ]);
      setSimHistory(sims?.content || []);
      setOptHistory(opts?.content || []);
    } catch { /* ignore */ } finally { setHistoryLoading(false); }
  };

  let segBreakdownParsed: Record<string, any> = {};
  try { segBreakdownParsed = simResult?.segmentBreakdown ? JSON.parse(simResult.segmentBreakdown) : {}; } catch {}

  return (
    <div style={s.pageStyle}>
      <TitleWithDesc title="模拟与优化" desc="基线计算 · 三层模拟预测 · What-if 对比 · 贪心/遗传算法优化" />

      <Tabs defaultActiveKey="simulate" style={{ marginTop: 16 }} items={[
        // ==================== Tab 1: 模拟 ====================
        {
          key: 'simulate',
          label: <span><ExperimentOutlined /> 模拟</span>,
          children: (
            <Row gutter={24}>
              <Col span={8}>
                <Card title="模拟配置" size="small">
                  <Form layout="vertical">
                    <Form.Item label="工作区">
                      <Select value={selectedWs || undefined} onChange={setSelectedWs}
                        options={workspaces.map(w => ({ label: w.name, value: w.id }))} />
                    </Form.Item>
                    <Form.Item label="目标分群">
                      <Select value={segCode} onChange={setSegCode}
                        options={[
                          { label: '高价值 (HIGH_VALUE)', value: 'HIGH_VALUE' },
                          { label: '中等 (MEDIUM)', value: 'MEDIUM' },
                          { label: '低价值 (LOW)', value: 'LOW' },
                          { label: '全部 (ALL)', value: 'ALL' },
                        ]} />
                    </Form.Item>
                    <Form.Item label="渠道">
                      <Select value={simChannel} onChange={setSimChannel}
                        options={[{ label: 'EMAIL', value: 'EMAIL' }, { label: 'SMS', value: 'SMS' }, { label: 'PUSH', value: 'PUSH' }]} />
                    </Form.Item>
                    <Form.Item label="Offer 强度">
                      <InputNumber value={offerStrength} onChange={v => setOfferStrength(v || 0)} min={0} max={1} step={0.1} style={{ width: '100%' }} />
                    </Form.Item>
                    <Form.Item label="预算（元）">
                      <InputNumber value={simBudget} onChange={v => setSimBudget(v || 0)} min={0} step={10000} style={{ width: '100%' }} />
                    </Form.Item>
                    <Button type="primary" icon={<PlayCircleOutlined />} loading={simLoading} onClick={handleRunSim} block>
                      运行模拟
                    </Button>
                  </Form>
                </Card>
              </Col>
              <Col span={16}>
                {simLoading && <Card><Spin tip="模拟运行中..."><div style={{ height: 200 }} /></Spin></Card>}
                {simResult && (
                  <>
                    <Card title="模拟结果" size="small" style={{ marginBottom: 16 }}>
                      <Row gutter={16}>
                        <Col span={6}><Statistic title="基线转化" value={(simResult.baselineConversion * 100).toFixed(1)} suffix="%" /></Col>
                        <Col span={6}><Statistic title="预测转化" value={(simResult.predictedConversion * 100).toFixed(1)} suffix="%" valueStyle={{ color: '#3b82f6' }} /></Col>
                        <Col span={6}><Statistic title="提升" value={(simResult.upliftPct * 100).toFixed(0)} suffix="%" valueStyle={{ color: '#22c55e' }} /></Col>
                        <Col span={6}><Statistic title="预期 ROI" value={simResult.predictedRoi?.toFixed(2)} suffix="x" valueStyle={{ color: '#eab308' }} /></Col>
                      </Row>
                      <Row gutter={16} style={{ marginTop: 12 }}>
                        <Col span={6}><Statistic title="曝光" value={simResult.exposureCount} /></Col>
                        <Col span={6}><Statistic title="互动" value={simResult.behaviorCount} /></Col>
                        <Col span={6}><Statistic title="转化" value={simResult.conversionCount} /></Col>
                        <Col span={6}><Statistic title="置信度" value={(simResult.confidence * 100).toFixed(0)} suffix="%" /></Col>
                      </Row>
                    </Card>
                    <Card title="转化率可视化" size="small">
                      <SimulationResultChart
                        baselineConversion={simResult.baselineConversion}
                        predictedConversion={simResult.predictedConversion}
                        upliftPct={simResult.upliftPct}
                        segmentBreakdown={segBreakdownParsed}
                      />
                    </Card>
                  </>
                )}
                {!simLoading && !simResult && <Card><Empty description="配置参数后点击「运行模拟」" /></Card>}
              </Col>
            </Row>
          ),
        },

        // ==================== Tab 2: What-if 对比 ====================
        {
          key: 'compare',
          label: <span><SwapOutlined /> What-if 对比</span>,
          children: (
            <Card>
              <Alert type="info" message="选择两个模拟结果进行对比分析" style={{ marginBottom: 16 }} showIcon />
              <Row gutter={24}>
                <Col span={12}>
                  <Card size="small" title="场景 A">
                    {simResult ? (
                      <Descriptions column={1} size="small">
                        <Descriptions.Item label="转化率">{(simResult.predictedConversion * 100).toFixed(1)}%</Descriptions.Item>
                        <Descriptions.Item label="ROI">{simResult.predictedRoi?.toFixed(2)}x</Descriptions.Item>
                        <Descriptions.Item label="置信度">{(simResult.confidence * 100).toFixed(0)}%</Descriptions.Item>
                      </Descriptions>
                    ) : <Empty description="先运行模拟" />}
                  </Card>
                </Col>
                <Col span={12}>
                  <Card size="small" title="场景 B (对比中)">
                    <Empty description="运行另一个模拟以对比" />
                  </Card>
                </Col>
              </Row>
            </Card>
          ),
        },

        // ==================== Tab 3: 优化 ====================
        {
          key: 'optimize',
          label: <span><RocketOutlined /> 优化</span>,
          children: (
            <Row gutter={24}>
              <Col span={8}>
                <Card title="优化配置" size="small">
                  <Form layout="vertical">
                    <Form.Item label="工作区">
                      <Select value={selectedWs || undefined} onChange={v => { setSelectedWs(v); setOptPortfolio(''); }}
                        options={workspaces.map(w => ({ label: w.name, value: w.id }))} />
                    </Form.Item>
                    <Form.Item label="组合 (Portfolio)">
                      <Select value={optPortfolio || undefined} onChange={setOptPortfolio}
                        options={portfolios.map(p => ({ label: `${p.name} (¥${p.totalBudget?.toLocaleString()})`, value: p.id }))} />
                    </Form.Item>
                    <Form.Item label="优化算法">
                      <Select value={optType} onChange={setOptType}
                        options={[
                          { label: '贪心算法 (Greedy)', value: 'GREEDY' },
                          { label: '遗传算法 (Genetic)', value: 'GENETIC' },
                        ]} />
                    </Form.Item>
                    {optType === 'GENETIC' && (
                      <Form.Item label="进化代数">
                        <InputNumber value={optGenerations} onChange={v => setOptGenerations(v || 10)} min={10} max={200} style={{ width: '100%' }} />
                      </Form.Item>
                    )}
                    <Button type="primary" icon={<RocketOutlined />} loading={optLoading} onClick={handleRunOpt} block>
                      运行优化
                    </Button>
                  </Form>
                </Card>
              </Col>
              <Col span={16}>
                {optLoading && <Card><Spin tip={`${optType === 'GENETIC' ? '遗传算法进化中' : '贪心优化中'}...`}><div style={{ height: 200 }} /></Spin></Card>}
                {optResult && (
                  <>
                    <Card title="优化结果" size="small" style={{ marginBottom: 16 }}>
                      <Row gutter={16}>
                        <Col span={6}><Statistic title="算法" value={optResult.optimizationType} /></Col>
                        <Col span={6}><Statistic title="预期 ROI" value={optResult.expectedRoi?.toFixed(2)} suffix="x" valueStyle={{ color: '#22c55e' }} /></Col>
                        <Col span={6}><Statistic title="提升" value={(optResult.improvementPct * 100).toFixed(0)} suffix="%" valueStyle={{ color: '#3b82f6' }} /></Col>
                        <Col span={6}><Statistic title={optType === 'GENETIC' ? '进化代数' : '候选数'} value={optResult.iterationCount} /></Col>
                      </Row>
                      {optType === 'GENETIC' && (
                        <Row gutter={16} style={{ marginTop: 12 }}>
                          <Col span={12}><Statistic title="收敛时间" value={`${(optResult.convergenceTimeMs / 1000).toFixed(1)}s`} /></Col>
                          <Col span={12}><Statistic title="基线 ROI" value={optResult.baselineRoi?.toFixed(2)} suffix="x" /></Col>
                        </Row>
                      )}
                    </Card>
                    {optResult.allocationDetails?.length > 0 && (
                      <Card title="预算分配" size="small">
                        <BudgetAllocationChart
                          allocations={(optResult.allocationDetails || []).map(a => ({
                            initiativeId: a.initiativeId,
                            initiativeName: a.initiativeName,
                            allocatedBudget: a.allocatedBudget,
                            expectedRoi: a.expectedRoi,
                            percentage: a.percentage,
                            executionOrder: 0, priorityScore: 0, opportunityCount: 0,
                            targetUserCount: null, status: 'PENDING',
                          }))}
                          totalBudget={optResult.allocationDetails.reduce((s, a) => s + a.allocatedBudget, 0)}
                        />
                      </Card>
                    )}
                  </>
                )}
                {!optLoading && !optResult && <Card><Empty description="选择组合和算法后点击「运行优化」" /></Card>}
              </Col>
            </Row>
          ),
        },

        // ==================== Tab 4: 历史 ====================
        {
          key: 'history',
          label: <span><HistoryOutlined /> 历史</span>,
          children: (
            <Card size="small" extra={<Button onClick={handleLoadHistory} loading={historyLoading} size="small">刷新</Button>}>
              <Tabs size="small" items={[
                {
                  key: 'simHistory', label: '模拟历史',
                  children: (
                    <Table dataSource={simHistory} rowKey="id" size="small" loading={historyLoading}
                      pagination={{ pageSize: 10 }}
                      columns={[
                        { title: '名称', dataIndex: 'name', key: 'name' },
                        { title: '类型', dataIndex: 'simulationType', key: 'simulationType', render: (t: string) => <Tag>{t}</Tag> },
                        { title: '基线转化', dataIndex: 'baselineConversion', key: 'baselineConversion', render: (v: number) => `${(v * 100).toFixed(1)}%` },
                        { title: '预测转化', dataIndex: 'predictedConversion', key: 'predictedConversion', render: (v: number) => `${(v * 100).toFixed(1)}%` },
                        { title: 'ROI', dataIndex: 'predictedRoi', key: 'predictedRoi', render: (v: number) => <Tag color="blue">{v?.toFixed(2)}x</Tag> },
                        { title: '时间', dataIndex: 'createdAt', key: 'createdAt', render: (v: string) => v ? new Date(v).toLocaleString() : '-' },
                      ]}
                      locale={{ emptyText: <Empty description="暂无模拟历史" /> }} />
                  ),
                },
                {
                  key: 'optHistory', label: '优化历史',
                  children: (
                    <Table dataSource={optHistory} rowKey="id" size="small" loading={historyLoading}
                      pagination={{ pageSize: 10 }}
                      columns={[
                        { title: '类型', dataIndex: 'optimizationType', key: 'optimizationType', render: (t: string) => <Tag>{t}</Tag> },
                        { title: 'ROI', dataIndex: 'expectedRoi', key: 'expectedRoi', render: (v: number) => <Tag color="green">{v?.toFixed(2)}x</Tag> },
                        { title: '迭代', dataIndex: 'iterationCount', key: 'iterationCount' },
                        { title: '耗时', dataIndex: 'convergenceTimeMs', key: 'convergenceTimeMs', render: (v: number) => v ? `${(v / 1000).toFixed(1)}s` : '-' },
                        { title: '改善', dataIndex: 'improvementPct', key: 'improvementPct', render: (v: number) => `${(v * 100).toFixed(0)}%` },
                        { title: '时间', dataIndex: 'createdAt', key: 'createdAt', render: (v: string) => v ? new Date(v).toLocaleString() : '-' },
                      ]}
                      locale={{ emptyText: <Empty description="暂无优化历史" /> }} />
                  ),
                },
              ]} />
            </Card>
          ),
        },
      ]} />
    </div>
  );
};

export default SimulationOptimizationPage;
