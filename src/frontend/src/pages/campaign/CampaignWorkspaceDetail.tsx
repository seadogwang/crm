import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Card, Descriptions, Tag, Button, Space, Tabs, message, Spin, Typography,
  Modal, Form, Input, Select, DatePicker, InputNumber, Table, Progress, Tooltip, Divider,
} from 'antd';
import {
  ArrowLeftOutlined, PlusOutlined, PlayCircleOutlined, PauseCircleOutlined,
  LockOutlined, BarChartOutlined, RightOutlined, BranchesOutlined,
} from '@ant-design/icons';
import {
  loadWorkspaceContext, getWorkspace,
  createGoal, activateGoal, pauseGoal, completeGoal, archiveGoal,
  createInitiative, activateInitiative, pauseInitiative,
  createPortfolio, optimizePortfolio, lockPortfolio,
  getGoalsByWorkspace,
  CampaignWorkspace, CampaignGoal, CampaignInitiative, CampaignPortfolio,
} from '../../api/campaign';
import { useCampaignStyles, TitleWithDesc } from './styles/campaign-ui-standard';

const { Text, Title } = Typography;
const { RangePicker } = DatePicker;

const CampaignWorkspaceDetail: React.FC = () => {
  const { workspaceId } = useParams<{ workspaceId: string }>();
  const navigate = useNavigate();
  const s = useCampaignStyles();
  const [workspace, setWorkspace] = useState<CampaignWorkspace | null>(null);
  const [activeGoal, setActiveGoal] = useState<CampaignGoal | null>(null);
  const [allGoals, setAllGoals] = useState<CampaignGoal[]>([]);
  const [initiatives, setInitiatives] = useState<CampaignInitiative[]>([]);
  const [portfolios, setPortfolios] = useState<CampaignPortfolio[]>([]);
  const [loading, setLoading] = useState(true);

  // Modal state
  const [goalModalOpen, setGoalModalOpen] = useState(false);
  const [initiativeModalOpen, setInitiativeModalOpen] = useState(false);
  const [portfolioModalOpen, setPortfolioModalOpen] = useState(false);
  const [portfolioDetailOpen, setPortfolioDetailOpen] = useState(false);
  const [selectedPortfolio, setSelectedPortfolio] = useState<CampaignPortfolio | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  const [goalForm] = Form.useForm();
  const [initiativeForm] = Form.useForm();
  const [portfolioForm] = Form.useForm();

  useEffect(() => {
    if (workspaceId) {
      fetchContext();
    }
  }, [workspaceId]);

  const fetchContext = async () => {
    setLoading(true);
    try {
      const [ws, ctx, goals] = await Promise.all([
        getWorkspace(workspaceId!),
        loadWorkspaceContext(workspaceId!).catch(() => null),
        getGoalsByWorkspace(workspaceId!).catch(() => [] as CampaignGoal[]),
      ]);
      setWorkspace(ws);
      if (ctx) {
        setActiveGoal(ctx.activeGoal);
        setInitiatives(ctx.initiatives || []);
        setPortfolios(ctx.portfolios || []);
      }
      setAllGoals(goals || []);
    } catch (err: any) {
      message.error('加载工作区失败: ' + (err?.response?.data?.message || err.message));
    } finally {
      setLoading(false);
    }
  };

  // ==================== Goal Actions ====================

  const handleCreateGoal = async (values: any) => {
    setActionLoading(true);
    try {
      await createGoal({
        workspaceId: workspaceId!,
        name: values.name,
        description: values.description,
        goalType: values.goalType,
        targetMetric: values.targetMetric,
        targetValue: values.targetValue,
        startTime: values.timeRange?.[0]?.toISOString(),
        endTime: values.timeRange?.[1]?.toISOString(),
      });
      message.success('目标创建成功');
      setGoalModalOpen(false);
      goalForm.resetFields();
      fetchContext();
    } catch (err: any) {
      message.error('创建失败: ' + (err?.response?.data?.message || err.message));
    } finally {
      setActionLoading(false);
    }
  };

  const handleActivateGoal = async (goalId: string) => {
    try {
      await activateGoal(goalId);
      message.success('目标已激活');
      fetchContext();
    } catch (err: any) {
      message.error(err?.response?.data?.message || '激活失败');
    }
  };

  const handlePauseGoal = async (goalId: string) => {
    try {
      await pauseGoal(goalId);
      message.success('目标已暂停');
      fetchContext();
    } catch (err: any) {
      message.error(err?.response?.data?.message || '暂停失败');
    }
  };

  // ==================== Initiative Actions ====================

  const handleCreateInitiative = async (values: any) => {
    setActionLoading(true);
    try {
      await createInitiative({
        goalId: values.goalId,
        name: values.name,
        description: values.description,
        initiativeType: values.initiativeType,
        priority: values.priority,
        startTime: values.timeRange?.[0]?.toISOString(),
        endTime: values.timeRange?.[1]?.toISOString(),
        ruleConfig: values.ruleConfig ? JSON.parse(values.ruleConfig) : undefined,
      });
      message.success('举措创建成功');
      setInitiativeModalOpen(false);
      initiativeForm.resetFields();
      fetchContext();
    } catch (err: any) {
      message.error('创建失败: ' + (err?.response?.data?.message || err.message));
    } finally {
      setActionLoading(false);
    }
  };

  const handleActivateInitiative = async (initiativeId: string) => {
    try {
      await activateInitiative(initiativeId);
      message.success('举措已激活');
      fetchContext();
    } catch (err: any) {
      message.error(err?.response?.data?.message || '激活失败');
    }
  };

  const handlePauseInitiative = async (initiativeId: string) => {
    try {
      await pauseInitiative(initiativeId);
      message.success('举措已暂停');
      fetchContext();
    } catch (err: any) {
      message.error(err?.response?.data?.message || '暂停失败');
    }
  };

  // ==================== Portfolio Actions ====================

  const handleCreatePortfolio = async (values: any) => {
    setActionLoading(true);
    try {
      await createPortfolio({
        workspaceId: workspaceId!,
        name: values.name,
        description: values.description,
        optimizationMode: values.optimizationMode || 'ROI_MAXIMIZATION',
        totalBudget: values.totalBudget,
        startTime: values.timeRange?.[0]?.toISOString(),
        endTime: values.timeRange?.[1]?.toISOString(),
      });
      message.success('组合创建成功');
      setPortfolioModalOpen(false);
      portfolioForm.resetFields();
      fetchContext();
    } catch (err: any) {
      message.error('创建失败: ' + (err?.response?.data?.message || err.message));
    } finally {
      setActionLoading(false);
    }
  };

  const handleOptimizePortfolio = async (portfolioId: string) => {
    try {
      const result = await optimizePortfolio(portfolioId);
      message.success('优化完成，预算已分配');
      fetchContext();
    } catch (err: any) {
      message.error(err?.response?.data?.message || '优化失败');
    }
  };

  const handleLockPortfolio = async (portfolioId: string) => {
    try {
      await lockPortfolio(portfolioId);
      message.success('组合已锁定');
      fetchContext();
    } catch (err: any) {
      message.error(err?.response?.data?.message || '锁定失败');
    }
  };

  // ==================== Status Tags ====================

  const goalStatusTag = (status: string) => {
    const map: Record<string, { color: string }> = {
      DRAFT: { color: 'default' },
      ACTIVE: { color: 'green' },
      PAUSED: { color: 'orange' },
      COMPLETED: { color: 'blue' },
      ARCHIVED: { color: 'default' },
    };
    return <Tag color={map[status]?.color}>{status}</Tag>;
  };

  const initiativeStatusTag = (status: string) => {
    const map: Record<string, { color: string }> = {
      PLANNED: { color: 'default' },
      ACTIVE: { color: 'green' },
      PAUSED: { color: 'orange' },
      COMPLETED: { color: 'blue' },
      ARCHIVED: { color: 'default' },
    };
    return <Tag color={map[status]?.color}>{status}</Tag>;
  };

  const portfolioStatusTag = (status: string) => {
    const map: Record<string, { color: string }> = {
      DRAFT: { color: 'default' },
      OPTIMIZED: { color: 'cyan' },
      LOCKED: { color: 'blue' },
      EXECUTING: { color: 'green' },
      COMPLETED: { color: 'default' },
    };
    return <Tag color={map[status]?.color}>{status}</Tag>;
  };

  const getGoalTypeLabel = (type: string) => {
    const map: Record<string, string> = {
      REVENUE: '营收', RETENTION: '留存', ACQUISITION: '获客', ENGAGEMENT: '促活',
    };
    return map[type] || type;
  };

  const getInitiativeTypeLabel = (type: string) => {
    const map: Record<string, string> = {
      WINBACK: '召回', GROWTH: '增长', ENGAGEMENT: '促活', ACQUISITION: '获客',
    };
    return map[type] || type;
  };

  if (loading) {
    return <div style={{ display: 'flex', justifyContent: 'center', padding: 100 }}><Spin size="large" /></div>;
  }

  if (!workspace) {
    return <Card><Text type="danger">工作区不存在</Text></Card>;
  }

  // ==================== Goal Columns ====================
  const goalColumns = [
    { title: '目标名称', dataIndex: 'name', key: 'name', render: (n: string, r: CampaignGoal) => (
      <Space><Text strong>{n}</Text>{goalStatusTag(r.status)}</Space>
    )},
    { title: '类型', dataIndex: 'goalType', key: 'goalType', render: (t: string) => getGoalTypeLabel(t) },
    { title: '目标值', dataIndex: 'targetValue', key: 'targetValue',
      render: (v: number) => v ? `¥${v.toLocaleString()}` : '-' },
    { title: '当前值', dataIndex: 'currentValue', key: 'currentValue',
      render: (v: number) => v ? `¥${v.toLocaleString()}` : '¥0' },
    { title: '进度', key: 'progress', width: 200,
      render: (_: any, r: CampaignGoal) => {
        const pct = r.targetValue ? Math.min((r.currentValue / r.targetValue) * 100, 100) : 0;
        return <Progress percent={Math.round(pct)} size="small" />;
      },
    },
    { title: '有效期', key: 'period', render: (_: any, r: CampaignGoal) =>
      r.startTime ? `${new Date(r.startTime).toLocaleDateString()} ~ ${new Date(r.endTime).toLocaleDateString()}` : '-'
    },
    { title: '操作', key: 'action', width: 240, render: (_: any, r: CampaignGoal) => (
      <Space>
        {r.status === 'DRAFT' && (
          <Button type="primary" size="small" icon={<PlayCircleOutlined />}
            onClick={() => handleActivateGoal(r.id)}>激活</Button>
        )}
        {r.status === 'ACTIVE' && (
          <Button size="small" icon={<PauseCircleOutlined />}
            onClick={() => handlePauseGoal(r.id)}>暂停</Button>
        )}
        {r.status === 'PAUSED' && (
          <Button type="primary" size="small" icon={<PlayCircleOutlined />}
            onClick={() => handleActivateGoal(r.id)}>恢复</Button>
        )}
        {(r.status === 'ACTIVE' || r.status === 'PAUSED') && (
          <Button size="small" onClick={() => completeGoal(r.id)}>完成</Button>
        )}
        {r.status === 'COMPLETED' && (
          <Button size="small" onClick={() => archiveGoal(r.id)}>归档</Button>
        )}
      </Space>
    )},
  ];

  // ==================== Initiative Columns ====================
  const initiativeColumns = [
    { title: '举措名称', dataIndex: 'name', key: 'name', render: (n: string, r: CampaignInitiative) => (
      <Space><Text strong>{n}</Text>{initiativeStatusTag(r.status)}</Space>
    )},
    { title: '类型', dataIndex: 'initiativeType', key: 'initiativeType',
      render: (t: string) => <Tag>{getInitiativeTypeLabel(t)}</Tag> },
    { title: '优先级', dataIndex: 'priority', key: 'priority', width: 80 },
    { title: '有效期', key: 'period', render: (_: any, r: CampaignInitiative) =>
      r.startTime ? `${new Date(r.startTime).toLocaleDateString()} ~ ${new Date(r.endTime).toLocaleDateString()}` : '-'
    },
    { title: '操作', key: 'action', width: 200, render: (_: any, r: CampaignInitiative) => (
      <Space>
        {(r.status === 'PLANNED' || r.status === 'PAUSED') && (
          <Button type="primary" size="small" icon={<PlayCircleOutlined />}
            onClick={() => handleActivateInitiative(r.id)}>激活</Button>
        )}
        {r.status === 'ACTIVE' && (
          <Button size="small" icon={<PauseCircleOutlined />}
            onClick={() => handlePauseInitiative(r.id)}>暂停</Button>
        )}
        <Button size="small" type="primary" icon={<BranchesOutlined />}
          onClick={() => navigate(`/campaign/canvas/new?initiativeId=${r.id}&goalId=${r.goalId}&workspaceId=${workspaceId}`)}>
          画布编排
        </Button>
      </Space>
    )},
  ];

  // ==================== Portfolio Columns ====================
  const portfolioColumns = [
    { title: '组合名称', dataIndex: 'name', key: 'name', render: (n: string, r: CampaignPortfolio) => (
      <Space><Text strong>{n}</Text>{portfolioStatusTag(r.status)}</Space>
    )},
    { title: '优化模式', dataIndex: 'optimizationMode', key: 'optimizationMode', width: 160,
      render: (m: string) => {
        const map: Record<string, string> = {
          ROI_MAXIMIZATION: 'ROI 最大化', REVENUE_MAXIMIZATION: '营收最大化', BALANCED: '平衡模式',
        };
        return map[m] || m;
      },
    },
    { title: '总预算', dataIndex: 'totalBudget', key: 'totalBudget',
      render: (v: number) => v ? `¥${v.toLocaleString()}` : '-' },
    { title: '状态', dataIndex: 'status', key: 'status', width: 120,
      render: (s: string) => portfolioStatusTag(s) },
    { title: '操作', key: 'action', width: 280, render: (_: any, r: CampaignPortfolio) => (
      <Space>
        {r.status === 'DRAFT' && (
          <Button type="primary" size="small" icon={<BarChartOutlined />}
            onClick={() => handleOptimizePortfolio(r.id)}>运行优化</Button>
        )}
        {r.status === 'OPTIMIZED' && (
          <Button size="small" icon={<LockOutlined />}
            onClick={() => handleLockPortfolio(r.id)}>锁定</Button>
        )}
        <Button size="small" icon={<RightOutlined />}
            onClick={() => { setSelectedPortfolio(r); setPortfolioDetailOpen(true); }}>详情</Button>
      </Space>
    )},
  ];

  return (
    <div className="campaign-page" style={s.pageStyle}>
      {/* 标题行 */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <TitleWithDesc title={workspace.name} desc={workspace.description}
          tag={<Tag color={workspace.status === 'ACTIVE' ? 'green' : 'default'}>{workspace.status}</Tag>} />
        <Button type="text" icon={<ArrowLeftOutlined />} onClick={() => navigate('/campaign/workspaces')}>
          返回
        </Button>
      </div>

      {/* 工作区信息 */}
      <Card size="small" style={{ marginBottom: 12 }} bodyStyle={{ padding: 12 }}>
        <Descriptions size="small" column={3}>
          <Descriptions.Item label="关联目标">
            {activeGoal ? <Text strong>{activeGoal.name}</Text> : <Text type="secondary">未设置</Text>}
          </Descriptions.Item>
          <Descriptions.Item label="时区">
            {(workspace.config as any)?.timezone || 'Asia/Shanghai'}
          </Descriptions.Item>
        </Descriptions>
      </Card>

      {/* 当前激活目标 */}
      {activeGoal && (
        <Card size="small" style={{ marginBottom: 12 }} bodyStyle={{ padding: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <Space>
                <Text strong style={{ fontSize: 16 }}>{activeGoal.name}</Text>
                <Tag color="green">ACTIVE</Tag>
              </Space>
              <div style={{ marginTop: 4 }}>
                <Text type="secondary" style={{ fontSize: 12 }}>
                  类型: {getGoalTypeLabel(activeGoal.goalType)} |
                  目标: ¥{activeGoal.targetValue?.toLocaleString()} |
                  当前: ¥{activeGoal.currentValue?.toLocaleString()}
                </Text>
              </div>
            </div>
            <Progress
              style={{ width: 260 }}
              percent={activeGoal.targetValue
                ? Math.round(Math.min((activeGoal.currentValue / activeGoal.targetValue) * 100, 100))
                : 0}
              size="small"
              format={pct => `${pct}%`}
            />
          </div>
        </Card>
      )}

      {/* Tabs: 目标 / 举措 / 组合 */}
      <Card size="small" bodyStyle={{ padding: 12 }}>
        <Tabs className="campaign-tabs" defaultActiveKey="goals" items={[
          {
            key: 'goals',
            label: '目标管理',
            children: (
              <div>
                <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
                  <Button type="primary" icon={<PlusOutlined />}
                    onClick={() => { goalForm.resetFields(); setGoalModalOpen(true); }}>
                    新建目标
                  </Button>
                </div>
                <Table className="campaign-table" dataSource={allGoals} columns={goalColumns} rowKey="id"
                  size="small" pagination={{ pageSize: 10, showSizeChanger: true }} />
              </div>
            ),
          },
          {
            key: 'initiatives',
            label: '举措管理',
            children: (
              <div>
                <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
                  <Button type="primary" icon={<PlusOutlined />}
                    onClick={() => { initiativeForm.resetFields(); setInitiativeModalOpen(true); }}>
                    新建举措
                  </Button>
                </div>
                <Table className="campaign-table" dataSource={initiatives} columns={initiativeColumns} rowKey="id"
                  size="small" pagination={{ pageSize: 10, showSizeChanger: true }} />
              </div>
            ),
          },
          {
            key: 'portfolios',
            label: '组合管理',
            children: (
              <div>
                <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
                  <Button type="primary" icon={<PlusOutlined />}
                    onClick={() => { portfolioForm.resetFields(); setPortfolioModalOpen(true); }}>
                    新建组合
                  </Button>
                </div>
                <Table className="campaign-table" dataSource={portfolios} columns={portfolioColumns} rowKey="id"
                  size="small" pagination={{ pageSize: 10, showSizeChanger: true }} />
              </div>
            ),
          },
        ]} />
      </Card>

      {/* ==================== 新建目标弹窗 ==================== */}
      <Modal title="新建目标" open={goalModalOpen}
        onCancel={() => setGoalModalOpen(false)}
        onOk={() => goalForm.submit()} confirmLoading={actionLoading} okText="创建">
        <Form form={goalForm} layout="vertical" onFinish={handleCreateGoal}>
          <Form.Item name="name" label="目标名称" rules={[{ required: true }]}>
            <Input placeholder="例如：GMV提升20%" />
          </Form.Item>
          <Form.Item name="description" label="描述">
            <Input.TextArea rows={2} />
          </Form.Item>
          <Form.Item name="goalType" label="目标类型" rules={[{ required: true }]}>
            <Select options={[
              { label: '营收 (REVENUE)', value: 'REVENUE' },
              { label: '留存 (RETENTION)', value: 'RETENTION' },
              { label: '获客 (ACQUISITION)', value: 'ACQUISITION' },
              { label: '促活 (ENGAGEMENT)', value: 'ENGAGEMENT' },
            ]} />
          </Form.Item>
          <Form.Item name="targetMetric" label="关联指标">
            <Select allowClear placeholder="选择 Loyalty 指标"
              options={[
                { label: '总订单金额 (TOTAL_AMOUNT)', value: 'TOTAL_AMOUNT' },
                { label: '订单数 (ORDER_COUNT)', value: 'ORDER_COUNT' },
                { label: '等级积分 (TIER_POINTS)', value: 'TIER_POINTS' },
              ]} />
          </Form.Item>
          <Form.Item name="targetValue" label="目标值" rules={[{ required: true }]}>
            <InputNumber style={{ width: '100%' }} min={0} prefix="¥" />
          </Form.Item>
          <Form.Item name="timeRange" label="有效期">
            <RangePicker style={{ width: '100%' }} />
          </Form.Item>
        </Form>
      </Modal>

      {/* ==================== 新建举措弹窗 ==================== */}
      <Modal title="新建举措" open={initiativeModalOpen}
        onCancel={() => setInitiativeModalOpen(false)}
        onOk={() => initiativeForm.submit()} confirmLoading={actionLoading} okText="创建">
        <Form form={initiativeForm} layout="vertical" onFinish={handleCreateInitiative}>
          <Form.Item name="name" label="举措名称" rules={[{ required: true }]}>
            <Input placeholder="例如：高价值会员召回" />
          </Form.Item>
          <Form.Item name="description" label="描述">
            <Input.TextArea rows={2} />
          </Form.Item>
          <Form.Item name="goalId" label="关联目标" rules={[{ required: true }]}>
            <Select placeholder="选择目标"
              options={activeGoal ? [{ label: activeGoal.name, value: activeGoal.id }] : []} />
          </Form.Item>
          <Form.Item name="initiativeType" label="举措类型" rules={[{ required: true }]}>
            <Select options={[
              { label: '召回 (WINBACK)', value: 'WINBACK' },
              { label: '增长 (GROWTH)', value: 'GROWTH' },
              { label: '促活 (ENGAGEMENT)', value: 'ENGAGEMENT' },
              { label: '获客 (ACQUISITION)', value: 'ACQUISITION' },
            ]} />
          </Form.Item>
          <Form.Item name="priority" label="优先级" initialValue={100}>
            <InputNumber min={1} max={999} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="timeRange" label="有效期">
            <RangePicker style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="ruleConfig" label="规则配置（JSON）">
            <Input.TextArea rows={3} placeholder='{"segment": "high_value", "conditions": {...}}' />
          </Form.Item>
        </Form>
      </Modal>

      {/* ==================== 新建组合弹窗 ==================== */}
      <Modal title="新建组合" open={portfolioModalOpen}
        onCancel={() => setPortfolioModalOpen(false)}
        onOk={() => portfolioForm.submit()} confirmLoading={actionLoading} okText="创建">
        <Form form={portfolioForm} layout="vertical" onFinish={handleCreatePortfolio}>
          <Form.Item name="name" label="组合名称" rules={[{ required: true }]}>
            <Input placeholder="例如：Q2营销组合" />
          </Form.Item>
          <Form.Item name="description" label="描述">
            <Input.TextArea rows={2} />
          </Form.Item>
          <Form.Item name="optimizationMode" label="优化模式" initialValue="ROI_MAXIMIZATION">
            <Select options={[
              { label: 'ROI 最大化', value: 'ROI_MAXIMIZATION' },
              { label: '营收最大化', value: 'REVENUE_MAXIMIZATION' },
              { label: '平衡模式', value: 'BALANCED' },
            ]} />
          </Form.Item>
          <Form.Item name="totalBudget" label="总预算（元）" rules={[{ required: true }]}>
            <InputNumber style={{ width: '100%' }} min={0} prefix="¥" />
          </Form.Item>
          <Form.Item name="timeRange" label="有效期">
            <RangePicker style={{ width: '100%' }} />
          </Form.Item>
        </Form>
      </Modal>

      {/* ==================== 组合详情弹窗 ==================== */}
      <Modal title="组合详情" open={portfolioDetailOpen}
        onCancel={() => setPortfolioDetailOpen(false)}
        footer={<Button onClick={() => setPortfolioDetailOpen(false)}>关闭</Button>}
        width={560}>
        {selectedPortfolio && (
          <Descriptions column={1} bordered size="small">
            <Descriptions.Item label="组合名称">{selectedPortfolio.name}</Descriptions.Item>
            <Descriptions.Item label="描述">{selectedPortfolio.description || '-'}</Descriptions.Item>
            <Descriptions.Item label="状态">{portfolioStatusTag(selectedPortfolio.status)}</Descriptions.Item>
            <Descriptions.Item label="优化模式">
              {{ ROI_MAXIMIZATION: 'ROI 最大化', REVENUE_MAXIMIZATION: '营收最大化', BALANCED: '平衡模式' }[selectedPortfolio.optimizationMode] || selectedPortfolio.optimizationMode}
            </Descriptions.Item>
            <Descriptions.Item label="总预算">
              {selectedPortfolio.totalBudget ? `¥${selectedPortfolio.totalBudget.toLocaleString()}` : '-'}
            </Descriptions.Item>
            <Descriptions.Item label="有效期">
              {selectedPortfolio.startTime
                ? `${new Date(selectedPortfolio.startTime).toLocaleDateString()} ~ ${new Date(selectedPortfolio.endTime).toLocaleDateString()}`
                : '-'}
            </Descriptions.Item>
          </Descriptions>
        )}
      </Modal>
    </div>
  );
};

export default CampaignWorkspaceDetail;
