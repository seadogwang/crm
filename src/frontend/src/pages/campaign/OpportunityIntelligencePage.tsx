import React, { useState, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Card, Table, Button, Space, Tag, Typography, Input, Select, Modal,
  message, Row, Col, Statistic, Descriptions, Progress, Tabs, Timeline, Divider, Alert,
} from 'antd';
import {
  ThunderboltOutlined, SearchOutlined, ReloadOutlined,
  EyeOutlined, CheckCircleOutlined, WarningOutlined,
  AlertOutlined, BarChartOutlined, SafetyOutlined, ShopOutlined, SettingOutlined, PlusOutlined,
} from '@ant-design/icons';
import {
  discoverOpportunities, queryOpportunities, consumeOpportunity,
  getExternalSignals, executeSkill, calculateExternalWeight,
  listWorkspaces, getGoalsByWorkspace,
  Opportunity, ExternalSignalItem,
  CampaignWorkspace, CampaignGoal,
} from '../../api/campaign';
import { useAppStore } from '../../store';
import { useCampaignStyles, TitleWithDesc } from './styles/campaign-ui-standard';

const { Text, Title } = Typography;

const severityColor: Record<string, string> = {
  CRITICAL: '#ff4d4f', WARNING: '#fa8c16', INFO: '#1890ff',
};

const typeColor: Record<string, string> = {
  CHURN_RISK: '#ff4d4f', UPSELL: '#722ed1', WINBACK: '#fa8c16',
  CROSS_SELL: '#13c2c2', ENGAGEMENT: '#52c41a',
};

const actionLabel: Record<string, string> = {
  WINBACK_DISCOUNT: '流失召回折扣', BUNDLE_OFFER: '捆绑优惠',
  REACTIVATION_OFFER: '重新激活优惠', PRODUCT_RECOMMENDATION: '产品推荐',
  CONTENT_ENGAGEMENT: '内容促活', STANDARD_PROMOTION: '标准促销',
};

const OpportunityIntelligencePage: React.FC = () => {
  const { currentProgramCode } = useAppStore();
  const navigate = useNavigate();
  const s = useCampaignStyles();
  // Workspace / Goal selection
  const [workspaces, setWorkspaces] = useState<CampaignWorkspace[]>([]);
  const [goals, setGoals] = useState<CampaignGoal[]>([]);
  const [workspaceId, setWorkspaceId] = useState<string>('');
  const [goalId, setGoalId] = useState<string>('');

  useEffect(() => {
    listWorkspaces().then(ws => { setWorkspaces(ws || []); if (!workspaceId && ws?.length) setWorkspaceId(ws[0].id); }).catch(() => {});
  }, []);

  useEffect(() => {
    if (workspaceId) {
      getGoalsByWorkspace(workspaceId).then(gs => { setGoals(gs || []); if (gs?.length) setGoalId(gs.find((g: CampaignGoal) => g.status === 'ACTIVE')?.id || gs[0].id); else setGoalId(''); }).catch(() => {});
    }
  }, [workspaceId]);

  // Opportunity state
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [discoverResult, setDiscoverResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [discovering, setDiscovering] = useState(false);

  // Filters
  const [typeFilter, setTypeFilter] = useState<string>('');
  const [minScore, setMinScore] = useState<number>(0);
  const [statusFilter, setStatusFilter] = useState<string>('ACTIVE');
  const [searchMember, setSearchMember] = useState('');

  // Detail modal
  const [detailModalOpen, setDetailModalOpen] = useState(false);
  const [selectedOpp, setSelectedOpp] = useState<Opportunity | null>(null);

  // External signal state
  const [signals, setSignals] = useState<ExternalSignalItem[]>([]);
  const [signalsLoading, setSignalsLoading] = useState(false);
  const [skillResult, setSkillResult] = useState<any>(null);

  const fetchOpportunities = useCallback(async () => {
    setLoading(true);
    try {
      const types = typeFilter ? [typeFilter] : undefined;
      const data = await queryOpportunities(workspaceId, goalId, {
        types, minScore: minScore > 0 ? minScore : undefined,
        status: statusFilter || undefined,
      });
      setOpportunities(data || []);
    } catch { /* ignore */ } finally { setLoading(false); }
  }, [workspaceId, goalId, typeFilter, minScore, statusFilter]);

  const handleDiscover = async () => {
    setDiscovering(true);
    try {
      const result = await discoverOpportunities(workspaceId, goalId, 10000);
      setDiscoverResult(result);
      message.success(`发现 ${result.totalDiscovered} 个机会`);
      fetchOpportunities();
    } catch (err: any) {
      message.error(err?.response?.data?.message || '发现失败');
    } finally { setDiscovering(false); }
  };

  const handleConsume = async (id: string) => {
    try {
      await consumeOpportunity(id);
      message.success('机会已消费');
      fetchOpportunities();
      setDetailModalOpen(false);
    } catch (err: any) {
      message.error(err?.response?.data?.message || '消费失败');
    }
  };

  const viewDetail = (opp: Opportunity) => {
    setSelectedOpp(opp);
    setDetailModalOpen(true);
  };

  // External signals
  const fetchSignals = useCallback(async () => {
    setSignalsLoading(true);
    try {
      const data = await getExternalSignals(currentProgramCode);
      setSignals(data?.signals || []);
    } catch { /* ignore */ } finally { setSignalsLoading(false); }
  }, []);

  const handleExecuteSkill = async (skillName: string) => {
    try {
      const result = await executeSkill(skillName);
      setSkillResult(result);
      message.success(`${skillName} 执行完成，生成 ${result.signalsGenerated} 个信号`);
      fetchSignals();
    } catch (err: any) {
      message.error(err?.response?.data?.message || '执行失败');
    }
  };

  const oppColumns = [
    { title: '评分', dataIndex: 'score', key: 'score', width: 80,
      render: (s: number) => {
        const pct = Math.round((s || 0) * 100);
        return <Tag color={pct >= 80 ? 'green' : pct >= 60 ? 'orange' : 'red'}>{pct}%</Tag>;
      },
      sorter: (a: Opportunity, b: Opportunity) => (b.score || 0) - (a.score || 0),
    },
    { title: '会员 ID', dataIndex: 'memberId', key: 'memberId', width: 110 },
    { title: '类型', dataIndex: 'opportunityType', key: 'opportunityType', width: 110,
      render: (t: string) => <Tag color={typeColor[t]}>{t}</Tag>,
    },
    { title: '推荐动作', dataIndex: 'recommendedAction', key: 'recommendedAction',
      render: (a: string) => actionLabel[a] || a,
    },
    { title: '渠道', dataIndex: 'recommendedChannel', key: 'recommendedChannel', width: 70 },
    { title: '置信度', dataIndex: 'confidence', key: 'confidence', width: 80,
      render: (c: number) => Math.round((c || 0) * 100) + '%',
    },
    { title: '状态', dataIndex: 'status', key: 'status', width: 80,
      render: (s: string) => <Tag color={s === 'ACTIVE' ? 'green' : s === 'CONSUMED' ? 'blue' : 'default'}>{s}</Tag>,
    },
    { title: '有效期', dataIndex: 'expiresAt', key: 'expiresAt', width: 120,
      render: (t: string) => t ? new Date(t).toLocaleDateString() : '-',
    },
    { title: '操作', key: 'action', width: 120,
      render: (_: any, r: Opportunity) => (
        <Space>
          <Button size="small" icon={<EyeOutlined />} onClick={() => viewDetail(r)} />
          {r.status === 'ACTIVE' && (
            <Button size="small" type="primary" icon={<CheckCircleOutlined />}
              onClick={() => handleConsume(r.id)}>消费</Button>
          )}
        </Space>
      ),
    },
  ];

  const signalColumns = [
    { title: '', dataIndex: 'severity', key: 'severity', width: 30,
      render: (s: string) => {
        const icons: Record<string, React.ReactNode> = {
          CRITICAL: <WarningOutlined style={{ color: severityColor.CRITICAL }} />,
          WARNING: <WarningOutlined style={{ color: severityColor.WARNING }} />,
          INFO: <AlertOutlined style={{ color: severityColor.INFO }} />,
        };
        return icons[s] || null;
      },
    },
    { title: '类型', dataIndex: 'signalType', key: 'signalType', width: 110,
      render: (t: string) => <Tag>{t}</Tag>,
    },
    { title: '摘要', dataIndex: 'title', key: 'title', ellipsis: true },
    { title: '影响系数', dataIndex: 'impactFactor', key: 'impactFactor', width: 90,
      render: (f: number) => <Tag color={f > 1 ? 'green' : f < 1 ? 'red' : 'default'}>{f.toFixed(2)}x</Tag>,
    },
    { title: '剩余时间', dataIndex: 'expiresAt', key: 'expiresAt', width: 100,
      render: (t: string) => t ? Math.ceil((new Date(t).getTime() - Date.now()) / 3600000) + 'h' : '-',
    },
    { title: '来源', dataIndex: 'sourceSkill', key: 'sourceSkill', width: 140 },
  ];

  return (
    <div style={s.pageStyle}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <TitleWithDesc title="机会智能" desc="市场感知 · 机会识别 · 外部信号 · 双引擎混合驱动 · AI技能主动感知" />
        <Button type="text" icon={<SettingOutlined />} onClick={() => navigate('/campaign/opportunity/config')}>
          评分配置
        </Button>
      </div>

      {/* 工作区/目标选择器 */}
      <Card size="small" style={{ marginBottom: 12 }} bodyStyle={{ padding: 12 }}>
        <Space wrap>
          <Text strong>工作区:</Text>
          <Select value={workspaceId || undefined} onChange={v => { setWorkspaceId(v); setGoalId(''); }}
            style={{ width: 220 }} placeholder="选择工作区"
            options={workspaces.map(w => ({ label: w.name, value: w.id }))} />
          <Text strong style={{ marginLeft: 16 }}>目标:</Text>
          <Select value={goalId || undefined} onChange={setGoalId}
            style={{ width: 220 }} placeholder="选择目标"
            options={goals.map(g => ({ label: `${g.name} [${g.status}]`, value: g.id }))} />
        </Space>
      </Card>

      <Tabs defaultActiveKey="opportunities" style={{ marginTop: 16 }} items={[
        // ==================== 机会列表 Tab ====================
        {
          key: 'opportunities',
          label: <span><BarChartOutlined /> 机会列表</span>,
          children: (
            <div>
              {/* 机会概览 */}
              {discoverResult && (
                <Card size="small" style={{ marginBottom: 12 }} bodyStyle={{ padding: 12 }}>
                  <Row gutter={16}>
                    <Col span={6}><Statistic title="总机会" value={discoverResult.totalDiscovered} /></Col>
                    <Col span={6}>
                      <Statistic title="高价值 (>0.8)" value={discoverResult.summary?.highValueCount || 0}
                        valueStyle={{ color: '#52c41a' }} />
                    </Col>
                    <Col span={6}>
                      <Statistic title="平均评分" value={(discoverResult.summary?.avgScore || 0)}
                        precision={2} />
                    </Col>
                    <Col span={6}>
                      <Statistic title="返回数量" value={discoverResult.returnedCount} />
                    </Col>
                  </Row>
                  {discoverResult.summary?.byType && (
                    <div style={{ marginTop: 8 }}>
                      <Text type="secondary" style={{ fontSize: 12 }}>类型分布: </Text>
                      {Object.entries(discoverResult.summary.byType).map(([type, count]: [string, any]) => (
                        <Tag key={type} color={typeColor[type]} style={{ marginTop: 4 }}>
                          {type}: {count}
                        </Tag>
                      ))}
                    </div>
                  )}
                  {/* 未覆盖分群建议 */}
                  {discoverResult.uncoveredSegments?.length > 0 && (
                    <Alert type="warning" showIcon icon={<WarningOutlined />}
                      style={{ marginTop: 12 }}
                      message="发现未覆盖的高价值机会分群"
                      description={
                        <div>
                          {discoverResult.uncoveredSegments.map((seg: any) => (
                            <div key={seg.segmentCode} style={{ marginBottom: 4 }}>
                              <Tag>{seg.segmentCode}</Tag>
                              <Text>{seg.suggestion}（{seg.opportunityCount}个机会）</Text>
                            </div>
                          ))}
                        </div>
                      }
                    />
                  )}
                </Card>
              )}

              {/* 筛选栏 */}
              <Card size="small" style={{ marginBottom: 12 }} bodyStyle={{ padding: 12 }}>
                <Space wrap>
                  <Button type="primary" icon={<ThunderboltOutlined />} loading={discovering}
                    onClick={handleDiscover}>🔄 刷新机会</Button>
                  <Select value={typeFilter} onChange={setTypeFilter} style={{ width: 140 }}
                    options={[
                      { label: '全部类型', value: '' },
                      { label: 'CHURN_RISK', value: 'CHURN_RISK' },
                      { label: 'UPSELL', value: 'UPSELL' },
                      { label: 'WINBACK', value: 'WINBACK' },
                      { label: 'CROSS_SELL', value: 'CROSS_SELL' },
                      { label: 'ENGAGEMENT', value: 'ENGAGEMENT' },
                    ]} />
                  <Select value={minScore} onChange={setMinScore} style={{ width: 120 }}
                    options={[
                      { label: '评分 ≥ 0', value: 0 },
                      { label: '评分 ≥ 0.5', value: 0.5 },
                      { label: '评分 ≥ 0.7', value: 0.7 },
                      { label: '评分 ≥ 0.8', value: 0.8 },
                      { label: '评分 ≥ 0.9', value: 0.9 },
                    ]} />
                  <Select value={statusFilter} onChange={setStatusFilter} style={{ width: 120 }}
                    options={[
                      { label: '状态: ACTIVE', value: 'ACTIVE' },
                      { label: '状态: CONSUMED', value: 'CONSUMED' },
                      { label: '全部', value: '' },
                    ]} />
                  <Input placeholder="搜索会员..." prefix={<SearchOutlined />}
                    value={searchMember} onChange={e => setSearchMember(e.target.value)}
                    style={{ width: 200 }} allowClear />
                  <Button icon={<ReloadOutlined />} onClick={fetchOpportunities}>刷新</Button>
                </Space>
              </Card>

              <Table dataSource={opportunities} columns={oppColumns} rowKey="id" size="small"
                loading={loading} pagination={{ pageSize: 20, showSizeChanger: true }}
                scroll={{ x: 1000 }} />
            </div>
          ),
        },
        // ==================== 外部信号 Tab ====================
        {
          key: 'signals',
          label: <span><AlertOutlined /> 外部信号监控</span>,
          children: (
            <div>
              <Card size="small" style={{ marginBottom: 16 }}>
                <Space wrap>
                  <Button icon={<ReloadOutlined />} loading={signalsLoading}
                    onClick={fetchSignals}>刷新信号</Button>
                  <Button onClick={() => handleExecuteSkill('COMPETITOR_MONITOR')}>
                    <SearchOutlined /> 竞品监控</Button>
                  <Button onClick={() => handleExecuteSkill('SOCIAL_LISTENING')}>
                    <AlertOutlined /> 舆情监控</Button>
                  <Button onClick={() => handleExecuteSkill('REGULATORY_WATCH')}>
                    <SafetyOutlined /> 政策法规</Button>
                  <Button onClick={() => handleExecuteSkill('INVENTORY_RISK')}>
                    <ShopOutlined /> 库存风险</Button>
                </Space>
                {skillResult && (
                  <Alert type="success" message={`技能执行完成: ${skillResult.skillName}, 生成 ${skillResult.signalsGenerated} 个信号 (${skillResult.executionTimeMs}ms)`}
                    banner closable style={{ marginTop: 8 }} />
                )}
              </Card>

              <Table dataSource={signals} columns={signalColumns} rowKey="id" size="small"
                loading={signalsLoading} pagination={{ pageSize: 10 }} />

              {/* 外部信号趋势概览 */}
              <Card title="当前活跃信号" size="small" style={{ marginTop: 16 }}>
                <Row gutter={16}>
                  {['CRITICAL', 'WARNING', 'INFO'].map(sev => {
                    const count = signals.filter(s => s.severity === sev).length;
                    return (
                      <Col span={8} key={sev}>
                        <Card size="small">
                          <Statistic
                            title={sev}
                            value={count}
                            valueStyle={{ color: severityColor[sev] }}
                            prefix={sev === 'CRITICAL' ? '🔴' : sev === 'WARNING' ? '🟡' : '🟢'}
                          />
                        </Card>
                      </Col>
                    );
                  })}
                </Row>
              </Card>
            </div>
          ),
        },
        // ==================== 技能管理 Tab ====================
        {
          key: 'skills',
          label: <span><SettingOutlined /> 技能管理</span>,
          children: (
            <div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
                <Button type="primary" icon={<PlusOutlined />}
                  onClick={() => { /* TODO: 新增技能弹窗 */ message.info('技能扩展功能开发中'); }}>
                  新增技能
                </Button>
              </div>
              <Table
                dataSource={[
                  {
                    key: 'COMPETITOR_MONITOR', name: '竞品监控', icon: '🔍',
                    schedule: '每6小时', status: '运行中', lastRun: '2分钟前',
                    signalsToday: 3, totalSignals: 156,
                    description: '爬取竞品网页，分析价格变化和促销活动',
                  },
                  {
                    key: 'SOCIAL_LISTENING', name: '舆情监控', icon: '📢',
                    schedule: '每2小时', status: '运行中', lastRun: '1小时前',
                    signalsToday: 2, totalSignals: 89,
                    description: '监控社交媒体舆情，分析品牌情感倾向',
                  },
                  {
                    key: 'REGULATORY_WATCH', name: '政策法规', icon: '🛡️',
                    schedule: '每24小时', status: '运行中', lastRun: '12小时前',
                    signalsToday: 0, totalSignals: 12,
                    description: '监控行业政策法规变化，评估合规风险',
                  },
                  {
                    key: 'INVENTORY_RISK', name: '库存风险', icon: '📦',
                    schedule: '每4小时', status: '运行中', lastRun: '3小时前',
                    signalsToday: 1, totalSignals: 45,
                    description: '监控库存水平，识别积压和缺货风险',
                  },
                ]}
                columns={[
                  { title: '技能', key: 'name', render: (_: any, r: any) => (
                    <Space><Text strong>{r.name}</Text><Tag color="green">{r.status}</Tag></Space>
                  )},
                  { title: '调度策略', dataIndex: 'schedule', key: 'schedule', width: 100 },
                  { title: '上次运行', dataIndex: 'lastRun', key: 'lastRun', width: 100 },
                  { title: '今日信号', dataIndex: 'signalsToday', key: 'signalsToday', width: 80 },
                  { title: '累计信号', dataIndex: 'totalSignals', key: 'totalSignals', width: 80 },
                  { title: '描述', dataIndex: 'description', key: 'description', ellipsis: true },
                  { title: '操作', key: 'action', width: 200, render: (_: any, r: any) => (
                    <Space>
                      <Button size="small" icon={<ThunderboltOutlined />}
                        onClick={() => handleExecuteSkill(r.key)}>执行</Button>
                      <Button size="small">配置</Button>
                      <Button size="small" danger>禁用</Button>
                    </Space>
                  )},
                ]}
                rowKey="key" size="small"
                pagination={false}
              />
            </div>
          ),
        },
      ]} />

      {/* 机会详情弹窗 */}
      <Modal title="机会详情" open={detailModalOpen} onCancel={() => setDetailModalOpen(false)}
        footer={selectedOpp?.status === 'ACTIVE' ? (
          <Button type="primary" icon={<CheckCircleOutlined />}
            onClick={() => handleConsume(selectedOpp!.id)}>消费机会</Button>
        ) : null} width={600}>
        {selectedOpp && (
          <div>
            <Descriptions column={2} size="small">
              <Descriptions.Item label="会员">{selectedOpp.memberId}</Descriptions.Item>
              <Descriptions.Item label="机会类型">
                <Tag color={typeColor[selectedOpp.opportunityType]}>{selectedOpp.opportunityType}</Tag>
              </Descriptions.Item>
              <Descriptions.Item label="综合评分" span={2}>
                <Progress percent={Math.round((selectedOpp.score || 0) * 100)}
                  size="small" status={selectedOpp.score >= 0.7 ? 'success' : 'exception'} />
              </Descriptions.Item>
            </Descriptions>
            <Divider />
            <Text strong>评分明细</Text>
            <div style={{ marginTop: 8 }}>
              {[
                { label: '流失概率', value: selectedOpp.churnProbability, color: '#ff4d4f' },
                { label: '增量价值', value: selectedOpp.upliftScore, color: '#722ed1' },
                { label: '转化概率', value: selectedOpp.conversionProbability, color: '#13c2c2' },
                { label: 'RFM 基础分', value: selectedOpp.rfmScore, color: '#fa8c16' },
              ].map(item => (
                <div key={item.label} style={{ marginBottom: 8 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
                    <Text style={{ fontSize: 12 }}>{item.label}</Text>
                    <Text style={{ fontSize: 12 }}>{Math.round((item.value || 0) * 100)}%</Text>
                  </div>
                  <Progress percent={Math.round((item.value || 0) * 100)} size="small"
                    strokeColor={item.color} showInfo={false} />
                </div>
              ))}
              <div style={{ marginTop: 4 }}>
                <Text style={{ fontSize: 12 }}>外部影响: </Text>
                <Tag color={(selectedOpp.externalInfluence || 1) > 1 ? 'green' : 'red'}>
                  {selectedOpp.externalInfluence?.toFixed(2)}x
                </Tag>
              </div>
            </div>
            <Divider />
            <Descriptions column={2} size="small">
              <Descriptions.Item label="推荐动作">{actionLabel[selectedOpp.recommendedAction] || selectedOpp.recommendedAction}</Descriptions.Item>
              <Descriptions.Item label="推荐渠道"><Tag>{selectedOpp.recommendedChannel}</Tag></Descriptions.Item>
              <Descriptions.Item label="置信度">{Math.round((selectedOpp.confidence || 0) * 100)}%</Descriptions.Item>
              <Descriptions.Item label="有效期">{selectedOpp.expiresAt ? new Date(selectedOpp.expiresAt).toLocaleDateString() : '-'}</Descriptions.Item>
              <Descriptions.Item label="来源">{selectedOpp.source}</Descriptions.Item>
              <Descriptions.Item label="检测时间">{selectedOpp.detectedAt ? new Date(selectedOpp.detectedAt).toLocaleString() : '-'}</Descriptions.Item>
            </Descriptions>
          </div>
        )}
      </Modal>
    </div>
  );
};

export default OpportunityIntelligencePage;
