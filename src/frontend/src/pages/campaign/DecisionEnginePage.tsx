import React, { useState, useEffect } from 'react';
import {
  Card, Table, Button, InputNumber, Input, Select, Tag, Space, Typography,
  Tabs, Form, message, Divider, Progress, Row, Col, Statistic, Descriptions,
  Spin, Alert, Empty,
} from 'antd';
import {
  DollarOutlined, BarChartOutlined, ThunderboltOutlined,
  ExperimentOutlined, AuditOutlined, HistoryOutlined,
  PlayCircleOutlined, CheckCircleOutlined, RollbackOutlined,
} from '@ant-design/icons';
import {
  allocateBudget, allocateWithConstraints,
  prioritizeCandidates, simulateCampaign, checkAttentionBudget,
  executeDecision, applyDecision, getLatestDecision,
  getDecisionHistory, rollbackDecision,
  listWorkspaces, getPortfoliosByWorkspace, getGoalsByWorkspace,
  CampaignCandidate, AllocationResult, SimulationResult,
  DecisionResultResponse, DecisionSummary,
  CampaignWorkspace, CampaignPortfolio, CampaignGoal,
} from '../../api/campaign';
import BudgetAllocationChart from './components/BudgetAllocationChart';
import { useCampaignStyles, TitleWithDesc } from './styles/campaign-ui-standard';

const { Text, Title } = Typography;

/** 模拟候选数据（用于手动分配 Tab） */
const mockCandidates: CampaignCandidate[] = [
  { id: 'c1', name: '高价值会员召回-邮件', initiativeId: 'ini_001', recommendedBudget: 300000, minBudget: 50000, maxBudget: 500000, expectedROI: 2.3, opportunityScore: 0.85, strategicWeight: 0.9, recencyBoost: 0.3, channel: 'EMAIL', segment: 'high_value' },
  { id: 'c2', name: '新会员促活-短信', initiativeId: 'ini_002', recommendedBudget: 200000, minBudget: 30000, maxBudget: 300000, expectedROI: 1.8, opportunityScore: 0.7, strategicWeight: 0.8, recencyBoost: 0.6, channel: 'SMS', segment: 'new_member' },
  { id: 'c3', name: '会员升级激励-PUSH', initiativeId: 'ini_003', recommendedBudget: 150000, minBudget: 30000, maxBudget: 250000, expectedROI: 2.1, opportunityScore: 0.75, strategicWeight: 0.7, recencyBoost: 0.4, channel: 'PUSH', segment: 'mid_value' },
  { id: 'c4', name: '沉默用户唤醒-微信', initiativeId: 'ini_004', recommendedBudget: 100000, minBudget: 20000, maxBudget: 200000, expectedROI: 1.5, opportunityScore: 0.5, strategicWeight: 0.6, recencyBoost: 0.8, channel: 'WECHAT', segment: 'dormant' },
  { id: 'c5', name: '生日关怀-邮件', initiativeId: 'ini_005', recommendedBudget: 80000, minBudget: 10000, maxBudget: 150000, expectedROI: 3.5, opportunityScore: 0.6, strategicWeight: 0.5, recencyBoost: 0.2, channel: 'EMAIL', segment: 'all' },
];

const statusColor: Record<string, string> = {
  DRAFT: 'default', APPLIED: 'green', REJECTED: 'red',
  SUPERSEDED: 'orange', ROLLED_BACK: 'volcano',
};

const DecisionEnginePage: React.FC = () => {
  const s = useCampaignStyles();
  // --- 决策执行状态 ---
  const [workspaces, setWorkspaces] = useState<CampaignWorkspace[]>([]);
  const [portfolios, setPortfolios] = useState<CampaignPortfolio[]>([]);
  const [goals, setGoals] = useState<CampaignGoal[]>([]);
  const [selectedWs, setSelectedWs] = useState<string>('');
  const [selectedPortfolio, setSelectedPortfolio] = useState<string>('');
  const [selectedGoal, setSelectedGoal] = useState<string>('');
  const [execLoading, setExecLoading] = useState(false);
  const [execResult, setExecResult] = useState<DecisionResultResponse | null>(null);
  const [execError, setExecError] = useState<string | null>(null);

  // --- 历史决策状态 ---
  const [history, setHistory] = useState<DecisionSummary[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  // --- v1 兼容状态 ---
  const [totalBudget, setTotalBudget] = useState<number>(650000);
  const [allocationResult, setAllocationResult] = useState<AllocationResult | null>(null);
  const [allocLoading, setAllocLoading] = useState(false);
  const [simResult, setSimResult] = useState<SimulationResult | null>(null);
  const [simLoading, setSimLoading] = useState(false);
  const [audienceSize, setAudienceSize] = useState<number>(50000);
  const [selectedCandidate, setSelectedCandidate] = useState<string>('c1');
  const [attentionUserId, setAttentionUserId] = useState('member_001');
  const [attentionChannel, setAttentionChannel] = useState('EMAIL');
  const [attentionResult, setAttentionResult] = useState<any>(null);

  // 加载工作区列表
  useEffect(() => {
    listWorkspaces().then(setWorkspaces).catch(() => {});
  }, []);

  // 工作区变化 → 加载组合和目标
  useEffect(() => {
    if (!selectedWs) { setPortfolios([]); setGoals([]); return; }
    getPortfoliosByWorkspace(selectedWs).then(setPortfolios).catch(() => setPortfolios([]));
    getGoalsByWorkspace(selectedWs).then(setGoals).catch(() => setGoals([]));
  }, [selectedWs]);

  // --- 决策执行 ---
  const handleExecuteDecision = async () => {
    if (!selectedWs || !selectedPortfolio) {
      message.warning('请选择工作区和组合');
      return;
    }
    setExecLoading(true);
    setExecError(null);
    setExecResult(null);
    try {
      const result = await executeDecision({
        workspaceId: selectedWs,
        portfolioId: selectedPortfolio,
        goalId: selectedGoal || goals.find(g => g.status === 'ACTIVE')?.id || '',
        constraints: {
          channelCapacity: { EMAIL: 50000, SMS: 20000, PUSH: 30000 },
          maxFrequencyPerUser: 3,
          minROIThreshold: 1.2,
        },
      });
      setExecResult(result);
      message.success(`决策完成！分配 ${result.allocations?.length || 0} 项，预期 ROI: ${result.expectedTotalRoi?.toFixed(2)}x`);
    } catch (err: any) {
      const msg = err?.response?.data?.message || err.message;
      setExecError(msg);
      message.error('决策执行失败: ' + msg);
    } finally {
      setExecLoading(false);
    }
  };

  const handleApplyDecision = async (decisionId: string) => {
    try {
      await applyDecision(decisionId);
      message.success('决策已应用，执行引擎已启动');
      if (execResult) setExecResult({ ...execResult, status: 'APPLIED', appliedAt: new Date().toISOString() });
    } catch (err: any) {
      message.error(err?.response?.data?.message || err.message);
    }
  };

  const handleRollback = async (decisionId: string) => {
    try {
      await rollbackDecision(decisionId);
      message.success('决策已回滚');
      if (execResult) setExecResult({ ...execResult, status: 'ROLLED_BACK' });
    } catch (err: any) {
      message.error(err?.response?.data?.message || err.message);
    }
  };

  // --- 历史决策 ---
  const handleLoadHistory = async () => {
    if (!selectedWs) { message.warning('请选择工作区'); return; }
    setHistoryLoading(true);
    try {
      const data = await getDecisionHistory(selectedWs, 0, 50);
      setHistory(data?.content || data || []);
    } catch (err: any) {
      message.error('加载历史失败');
    } finally {
      setHistoryLoading(false);
    }
  };

  useEffect(() => {
    if (selectedWs) handleLoadHistory();
  }, [selectedWs]);

  // --- v1 兼容方法 ---
  const handleAllocate = async () => {
    setAllocLoading(true);
    try {
      const result = await allocateBudget(mockCandidates, totalBudget);
      setAllocationResult(result);
      message.success(`预算分配完成，预期 ROI: ${result.totalExpectedROI}x`);
    } catch (err: any) {
      message.error('分配失败: ' + (err?.response?.data?.message || err.message));
    } finally { setAllocLoading(false); }
  };

  const handleConstrainedAllocate = async () => {
    setAllocLoading(true);
    try {
      const capacity = { EMAIL: 3, SMS: 2, PUSH: 4, WECHAT: 2 };
      const result = await allocateWithConstraints(mockCandidates, totalBudget, capacity);
      setAllocationResult(result);
      message.success(`带约束分配完成，预期 ROI: ${result.totalExpectedROI}x`);
    } catch (err: any) {
      message.error(err?.response?.data?.message || err.message);
    } finally { setAllocLoading(false); }
  };

  const handleSimulate = async () => {
    setSimLoading(true);
    try {
      const candidate = mockCandidates.find(c => c.id === selectedCandidate)!;
      const result = await simulateCampaign(candidate, audienceSize);
      setSimResult(result);
      message.success('模拟完成');
    } catch (err: any) {
      message.error(err?.response?.data?.message || err.message);
    } finally { setSimLoading(false); }
  };

  const handleCheckAttention = async () => {
    try {
      const result = await checkAttentionBudget(attentionUserId, attentionChannel);
      setAttentionResult(result);
    } catch (err: any) {
      message.error(err?.response?.data?.message || err.message);
    }
  };

  const candidateOptions = mockCandidates.map(c => ({ label: c.name, value: c.id }));

  const allocationColumns = [
    { title: '活动', dataIndex: 'candidateName', key: 'candidateName', render: (n: string) => <Text strong>{n}</Text> },
    { title: '分配预算', dataIndex: 'allocatedBudget', key: 'allocatedBudget', render: (v: number) => `¥${v.toLocaleString()}` },
    { title: '预期 ROI', dataIndex: 'expectedROI', key: 'expectedROI', render: (v: number) => <Tag color="blue">{v}x</Tag> },
    { title: '优先级分', dataIndex: 'priorityScore', key: 'priorityScore', render: (v: number) => v.toFixed(2) },
    { title: '占比', dataIndex: 'percentage', key: 'percentage', render: (v: number) => (
      <Space><Progress percent={+v.toFixed(1)} size="small" style={{ width: 120 }} /><span>{v.toFixed(1)}%</span></Space>
    )},
  ];

  return (
    <div style={s.pageStyle}>
      <TitleWithDesc title="营销决策引擎" desc="完整决策 · 预算分配 · 冲突仲裁 · 三层模拟 · 频控管理" />

      <Tabs defaultActiveKey="execute" style={{ marginTop: 16 }} items={[
        // ================================================================
        // Tab 1: 决策执行
        // ================================================================
        {
          key: 'execute',
          label: <span><PlayCircleOutlined /> 决策执行</span>,
          children: (
            <Row gutter={24}>
              <Col span={8}>
                <Card title="决策参数" size="small">
                  <Form layout="vertical">
                    <Form.Item label="工作区" required>
                      <Select value={selectedWs || undefined} onChange={v => { setSelectedWs(v); setSelectedPortfolio(''); setSelectedGoal(''); }}
                        placeholder="选择工作区" showSearch optionFilterProp="label"
                        options={workspaces.map(w => ({ label: w.name, value: w.id }))}
                        style={{ width: '100%' }} />
                    </Form.Item>
                    <Form.Item label="营销组合">
                      <Select value={selectedPortfolio || undefined} onChange={setSelectedPortfolio}
                        placeholder="选择组合（Portfolio）"
                        options={portfolios.map(p => ({ label: `${p.name} (¥${p.totalBudget?.toLocaleString()})`, value: p.id }))}
                        style={{ width: '100%' }} />
                    </Form.Item>
                    <Form.Item label="目标">
                      <Select value={selectedGoal || undefined} onChange={setSelectedGoal}
                        placeholder="选择目标（可选）" allowClear
                        options={goals.map(g => ({ label: `${g.name} [${g.status}]`, value: g.id }))}
                        style={{ width: '100%' }} />
                    </Form.Item>
                    <Button type="primary" icon={<PlayCircleOutlined />} loading={execLoading}
                      onClick={handleExecuteDecision} block>
                      运行决策
                    </Button>
                  </Form>
                  <Divider />
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    <b>流程：</b>加载工作区 → 构建候选 → 预算分配 → 频控校验 → 冲突仲裁 → 优先级排序 → 持久化
                  </Text>
                </Card>
              </Col>
              <Col span={16}>
                {execLoading && (
                  <Card><Spin tip="正在运行决策引擎..."><div style={{ height: 200 }} /></Spin></Card>
                )}
                {execError && (
                  <Alert type="error" message={execError} style={{ marginBottom: 16 }} showIcon closable onClose={() => setExecError(null)} />
                )}
                {execResult ? (
                  <>
                    <Card title="决策结果" size="small">
                      <Descriptions size="small" column={4} style={{ marginBottom: 16 }}>
                        <Descriptions.Item label="决策ID">{execResult.decisionId?.slice(0, 8)}...</Descriptions.Item>
                        <Descriptions.Item label="状态">
                          <Tag color={statusColor[execResult.status] || 'default'}>{execResult.status}</Tag>
                        </Descriptions.Item>
                        <Descriptions.Item label="总预算">¥{execResult.totalBudget?.toLocaleString()}</Descriptions.Item>
                        <Descriptions.Item label="预期总 ROI">
                          <Tag color="green">{execResult.expectedTotalRoi?.toFixed(2)}x</Tag>
                        </Descriptions.Item>
                        <Descriptions.Item label="分配数">{execResult.allocations?.length || 0}</Descriptions.Item>
                        <Descriptions.Item label="冲突解决">{execResult.conflictsResolved || 0}</Descriptions.Item>
                        <Descriptions.Item label="拒绝候选">{execResult.rejectedCandidates || 0}</Descriptions.Item>
                        <Descriptions.Item label="创建时间">{execResult.createdAt ? new Date(execResult.createdAt).toLocaleString() : '-'}</Descriptions.Item>
                      </Descriptions>
                      <Space>
                        {execResult.status === 'DRAFT' && (
                          <Button type="primary" icon={<CheckCircleOutlined />}
                            onClick={() => handleApplyDecision(execResult.decisionId)}>
                            应用决策
                          </Button>
                        )}
                        {execResult.status === 'APPLIED' && (
                          <Button danger icon={<RollbackOutlined />}
                            onClick={() => handleRollback(execResult.decisionId)}>
                            回滚决策
                          </Button>
                        )}
                      </Space>
                    </Card>

                    {execResult.allocations?.length > 0 && (
                      <Card title="预算分配可视化" size="small" style={{ marginTop: 16 }}>
                        <BudgetAllocationChart
                          allocations={execResult.allocations}
                          totalBudget={execResult.totalBudget || 0}
                        />
                      </Card>
                    )}

                    {execResult.arbitrationSummary && (
                      <Card title="仲裁摘要" size="small" style={{ marginTop: 16 }}>
                        <Row gutter={16}>
                          <Col span={6}><Statistic title="用户冲突" value={execResult.arbitrationSummary.userConflicts} valueStyle={{ color: '#ef4444' }} /></Col>
                          <Col span={6}><Statistic title="预算冲突" value={execResult.arbitrationSummary.budgetConflicts} valueStyle={{ color: '#eab308' }} /></Col>
                          <Col span={6}><Statistic title="渠道冲突" value={execResult.arbitrationSummary.channelConflicts} valueStyle={{ color: '#3b82f6' }} /></Col>
                          <Col span={6}><Statistic title="已解决" value={execResult.arbitrationSummary.resolved} valueStyle={{ color: '#22c55e' }} /></Col>
                        </Row>
                      </Card>
                    )}

                    {execResult.allocations?.length > 0 && (
                      <Card title="执行优先级" size="small" style={{ marginTop: 16 }}>
                        <Table dataSource={execResult.allocations || []} rowKey="initiativeId" size="small" pagination={false}
                          columns={[
                            { title: '#', dataIndex: 'executionOrder', key: 'executionOrder', width: 40 },
                            { title: 'Initiative', dataIndex: 'initiativeName', key: 'initiativeName', render: (n: string) => <Text strong>{n}</Text> },
                            { title: '预算', dataIndex: 'allocatedBudget', key: 'allocatedBudget', render: (v: number) => `¥${v?.toLocaleString()}` },
                            { title: 'ROI', dataIndex: 'expectedRoi', key: 'expectedRoi', render: (v: number) => <Tag color="blue">{v?.toFixed(1)}x</Tag> },
                            { title: '占比', dataIndex: 'percentage', key: 'percentage', render: (v: number) => <Progress percent={+v.toFixed(1)} size="small" style={{ width: 100 }} /> },
                            { title: '优先级分', dataIndex: 'priorityScore', key: 'priorityScore', render: (v: number) => v?.toFixed(2) },
                            { title: '机会数', dataIndex: 'opportunityCount', key: 'opportunityCount' },
                            { title: '状态', dataIndex: 'status', key: 'status', render: (s: string) => <Tag>{s}</Tag> },
                          ]} />
                      </Card>
                    )}
                  </>
                ) : (
                  !execLoading && (
                    <Card><Empty description="选择参数后点击「运行决策」" /></Card>
                  )
                )}
              </Col>
            </Row>
          ),
        },

        // ================================================================
        // Tab 2: 历史决策
        // ================================================================
        {
          key: 'history',
          label: <span><HistoryOutlined /> 历史决策</span>,
          children: (
            <Card title="历史决策列表" size="small"
              extra={<Button onClick={handleLoadHistory} loading={historyLoading} size="small">刷新</Button>}>
              <Table dataSource={history} rowKey="decisionId" size="small" loading={historyLoading}
                pagination={{ pageSize: 20, showSizeChanger: true, showTotal: t => `共 ${t} 条` }}
                columns={[
                  { title: '决策ID', dataIndex: 'decisionId', key: 'decisionId', render: (v: string) => <Text code>{v?.slice(0, 8)}...</Text> },
                  { title: '时间', dataIndex: 'createdAt', key: 'createdAt', render: (v: string) => v ? new Date(v).toLocaleString() : '-' },
                  { title: '总预算', dataIndex: 'totalBudget', key: 'totalBudget', render: (v: number) => v ? `¥${v.toLocaleString()}` : '-' },
                  { title: '分配预算', dataIndex: 'totalAllocated', key: 'totalAllocated', render: (v: number) => v ? `¥${v.toLocaleString()}` : '-' },
                  { title: '预期ROI', dataIndex: 'expectedTotalRoi', key: 'expectedTotalRoi', render: (v: number) => <Tag color="blue">{v?.toFixed(2)}x</Tag> },
                  { title: '冲突', dataIndex: 'conflictsResolved', key: 'conflictsResolved' },
                  { title: '状态', dataIndex: 'status', key: 'status',
                    render: (s: string) => <Tag color={statusColor[s] || 'default'}>{s}</Tag> },
                ]}
                locale={{ emptyText: <Empty description="暂无历史决策，请先运行决策引擎" /> }}
              />
            </Card>
          ),
        },

        // ================================================================
        // Tab 3: 预算分配（v1 兼容）
        // ================================================================
        {
          key: 'allocate',
          label: <span><DollarOutlined /> 预算分配</span>,
          children: (
            <Row gutter={24}>
              <Col span={8}>
                <Card title="分配参数" size="small">
                  <Form layout="vertical">
                    <Form.Item label="总预算（元）">
                      <InputNumber value={totalBudget} onChange={v => setTotalBudget(v || 0)}
                        style={{ width: '100%' }} min={0} step={50000} />
                    </Form.Item>
                    <Form.Item label="候选活动数">
                      <Text strong>{mockCandidates.length}</Text>
                    </Form.Item>
                    <Space>
                      <Button type="primary" icon={<DollarOutlined />} loading={allocLoading}
                        onClick={handleAllocate}>贪心分配</Button>
                      <Button icon={<BarChartOutlined />} loading={allocLoading}
                        onClick={handleConstrainedAllocate}>带约束分配</Button>
                    </Space>
                  </Form>
                  <Divider />
                  <Text type="secondary">
                    <b>算法：</b>按 ROI 降序排序 → 依次分配推荐预算 → 剩余按优先级二次分配<br />
                    <b>约束：</b>渠道容量限制（EMAIL:3, SMS:2, PUSH:4, WECHAT:2）
                  </Text>
                </Card>
              </Col>
              <Col span={16}>
                <Card title="候选活动列表" size="small">
                  <Table dataSource={mockCandidates} rowKey="id" size="small" pagination={false}
                    columns={[
                      { title: '活动', dataIndex: 'name', key: 'name' },
                      { title: '推荐预算', dataIndex: 'recommendedBudget', key: 'recommendedBudget', render: (v: number) => `¥${v.toLocaleString()}` },
                      { title: '预期 ROI', dataIndex: 'expectedROI', key: 'expectedROI', render: (v: number) => <Tag color="blue">{v}x</Tag> },
                      { title: '机会分', dataIndex: 'opportunityScore', key: 'opportunityScore', render: (v: number) => v.toFixed(2) },
                      { title: '渠道', dataIndex: 'channel', key: 'channel' },
                      { title: '分群', dataIndex: 'segment', key: 'segment', render: (v: string) => <Tag>{v}</Tag> },
                    ]} />
                </Card>
                {allocationResult && (
                  <Card title="分配结果" size="small" style={{ marginTop: 16 }}>
                    <Descriptions size="small" column={3} style={{ marginBottom: 16 }}>
                      <Descriptions.Item label="总预算">¥{allocationResult.totalBudget?.toLocaleString()}</Descriptions.Item>
                      <Descriptions.Item label="预期总 ROI">
                        <Tag color="green">{allocationResult.totalExpectedROI}x</Tag>
                      </Descriptions.Item>
                      <Descriptions.Item label="分配活动数">{allocationResult.allocations?.length}</Descriptions.Item>
                    </Descriptions>
                    <Table dataSource={allocationResult.allocations || []} rowKey="candidateId" size="small"
                      columns={allocationColumns} pagination={false} />
                  </Card>
                )}
              </Col>
            </Row>
          ),
        },

        // ================================================================
        // Tab 4: 模拟预测（v1 兼容）
        // ================================================================
        {
          key: 'simulate',
          label: <span><ExperimentOutlined /> 模拟预测</span>,
          children: (
            <Row gutter={24}>
              <Col span={8}>
                <Card title="模拟参数" size="small">
                  <Form layout="vertical">
                    <Form.Item label="选择活动">
                      <Select value={selectedCandidate} onChange={setSelectedCandidate}
                        options={candidateOptions} style={{ width: '100%' }} />
                    </Form.Item>
                    <Form.Item label="受众规模">
                      <InputNumber value={audienceSize} onChange={v => setAudienceSize(v || 10000)}
                        style={{ width: '100%' }} min={1000} step={10000} />
                    </Form.Item>
                    <Button type="primary" icon={<ExperimentOutlined />} loading={simLoading}
                      onClick={handleSimulate}>运行模拟</Button>
                  </Form>
                  <Divider />
                  <Text type="secondary">
                    <b>三层模型：</b><br />
                    1️⃣ Exposure：曝光概率（渠道容量 × 用户注意力）<br />
                    2️⃣ Behavior：行为概率（Offer强度 × 兴趣 - 疲劳）<br />
                    3️⃣ Conversion：转化概率（Uplift × Intent × OfferMatch）
                  </Text>
                </Card>
              </Col>
              <Col span={16}>
                {simResult ? (
                  <>
                    <Row gutter={[16, 16]}>
                      <Col span={6}><Card size="small"><Statistic title="曝光概率" value={simResult.exposureRate} suffix="%" precision={2} /></Card></Col>
                      <Col span={6}><Card size="small"><Statistic title="行为概率" value={simResult.behaviorRate} suffix="%" precision={2} /></Card></Col>
                      <Col span={6}><Card size="small"><Statistic title="转化概率" value={simResult.conversionRate} suffix="%" precision={2} /></Card></Col>
                      <Col span={6}><Card size="small"><Statistic title="预期 ROI" value={simResult.expectedROI} suffix="x" precision={2} /></Card></Col>
                    </Row>
                    <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
                      <Col span={8}><Card size="small"><Statistic title="预估触达" value={simResult.estimatedReach} /></Card></Col>
                      <Col span={8}><Card size="small"><Statistic title="预估转化" value={simResult.estimatedConversions} /></Card></Col>
                      <Col span={8}><Card size="small"><Statistic title="预期收入" value={simResult.expectedRevenue} prefix="¥" precision={0} /></Card></Col>
                    </Row>
                    <Card title="模型明细" size="small" style={{ marginTop: 16 }}>
                      <Table dataSource={Object.entries(simResult.modelDetails || {}).map(([k, v]) => ({ key: k, param: k, value: v }))}
                        rowKey="key" size="small" pagination={false} columns={[
                          { title: '参数', dataIndex: 'param', key: 'param' },
                          { title: '值', dataIndex: 'value', key: 'value', render: (v: any) => typeof v === 'number' ? v.toFixed(4) : String(v) },
                        ]} />
                    </Card>
                  </>
                ) : (
                  <Card><Text type="secondary">选择活动并运行模拟...</Text></Card>
                )}
              </Col>
            </Row>
          ),
        },

        // ================================================================
        // Tab 5: 注意力预算（v1 兼容）
        // ================================================================
        {
          key: 'attention',
          label: <span><AuditOutlined /> 注意力预算</span>,
          children: (
            <Row gutter={24}>
              <Col span={8}>
                <Card title="频控查询" size="small">
                  <Form layout="vertical">
                    <Form.Item label="用户 ID">
                      <Input value={attentionUserId} onChange={e => setAttentionUserId(e.target.value)} />
                    </Form.Item>
                    <Form.Item label="渠道">
                      <Select value={attentionChannel} onChange={setAttentionChannel}
                        options={[
                          { label: 'EMAIL', value: 'EMAIL' },
                          { label: 'SMS', value: 'SMS' },
                          { label: 'PUSH', value: 'PUSH' },
                          { label: 'WECHAT', value: 'WECHAT' },
                        ]} />
                    </Form.Item>
                    <Button type="primary" onClick={handleCheckAttention}>查询配额</Button>
                  </Form>
                </Card>
              </Col>
              <Col span={16}>
                {attentionResult && (
                  <Card title="查询结果">
                    <Descriptions column={2}>
                      <Descriptions.Item label="用户">{attentionResult.userId}</Descriptions.Item>
                      <Descriptions.Item label="渠道">{attentionResult.channel}</Descriptions.Item>
                      <Descriptions.Item label="有可用配额">
                        <Tag color={attentionResult.hasQuota ? 'green' : 'red'}>
                          {attentionResult.hasQuota ? '是' : '否'}
                        </Tag>
                      </Descriptions.Item>
                      <Descriptions.Item label="剩余曝光次数">{attentionResult.remaining}</Descriptions.Item>
                    </Descriptions>
                  </Card>
                )}
              </Col>
            </Row>
          ),
        },
      ]} />
    </div>
  );
};

export default DecisionEnginePage;
