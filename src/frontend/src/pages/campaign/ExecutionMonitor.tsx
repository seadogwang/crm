import React, { useState, useEffect } from 'react';
import {
  Card, Table, Button, Input, Select, Tag, Space, Typography,
  Tabs, message, Row, Col, Statistic, Progress, Modal, Empty, Alert,
} from 'antd';
import {
  CloudUploadOutlined, PlayCircleOutlined, PauseCircleOutlined,
  CaretRightOutlined, StopOutlined, ReloadOutlined,
  DashboardOutlined, SyncOutlined, BugOutlined,
  CheckCircleOutlined, ClockCircleOutlined,
} from '@ant-design/icons';
import {
  deployPlan, startExecution, executeNode, completeInstance,
  getInstanceByPlan, getWorkers, getJobTypes,
  getExecutionStatus, pauseExecution, resumeExecution,
} from '../../api/campaign';
import { useCampaignStyles, TitleWithDesc } from './styles/campaign-ui-standard';

const { Text, Title } = Typography;

const ExecutionMonitor: React.FC = () => {
  const s = useCampaignStyles();
  const [planId, setPlanId] = useState('plan_001');
  const [instance, setInstance] = useState<any>(null);
  const [status, setStatus] = useState<any>(null);
  const [workers, setWorkers] = useState<Record<string, any>>({});
  const [jobTypes, setJobTypes] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [debugJobType, setDebugJobType] = useState('');
  const [debugVars, setDebugVars] = useState('{}');

  const fetchAll = async () => {
    setLoading(true);
    try {
      const [inst, st, ws, jts] = await Promise.all([
        getInstanceByPlan(planId).catch(() => null),
        getExecutionStatus(planId).catch(() => null),
        getWorkers().catch(() => ({})),
        getJobTypes().catch(() => []),
      ]);
      setInstance(inst); setStatus(st); setWorkers(ws || {}); setJobTypes(jts || []);
    } finally { setLoading(false); }
  };

  useEffect(() => { fetchAll(); }, [planId]);

  const handleDeploy = async () => {
    try { await deployPlan(planId); message.success('部署成功'); fetchAll(); }
    catch (e: any) { message.error(e?.response?.data?.message || e.message); }
  };
  const handleStart = async () => {
    try { await startExecution(planId); message.success('启动成功'); fetchAll(); }
    catch (e: any) { message.error(e?.response?.data?.message || e.message); }
  };
  const handlePause = async () => {
    try { await pauseExecution(planId); message.success('已暂停'); fetchAll(); }
    catch (e: any) { message.error(e?.response?.data?.message || e.message); }
  };
  const handleResume = async () => {
    try { await resumeExecution(planId); message.success('已恢复'); fetchAll(); }
    catch (e: any) { message.error(e?.response?.data?.message || e.message); }
  };
  const handleComplete = async () => {
    if (!instance) return;
    try { await completeInstance(instance.instanceKey); message.success('已完成'); fetchAll(); }
    catch (e: any) { message.error(e?.response?.data?.message || e.message); }
  };
  const handleExecuteNode = async () => {
    if (!instance || !debugJobType) { message.warning('请先启动实例并选择 Job 类型'); return; }
    try {
      let vars = {};
      try { vars = JSON.parse(debugVars); } catch { message.warning('变量 JSON 格式错误'); return; }
      await executeNode(instance.instanceKey, debugJobType, vars);
      message.success('节点执行完成'); fetchAll();
    } catch (e: any) { message.error(e?.response?.data?.message || e.message); }
  };

  return (
    <div style={s.pageStyle}>
      <TitleWithDesc title="执行监控" desc="流程部署 · 实例管理 · Worker 监控 · 节点执行 · 暂停/恢复/取消" />

      <Card size="small" style={{ marginTop: 12 }}>
        <Space wrap>
          <Text strong>计划 ID:</Text>
          <Input value={planId} onChange={e => setPlanId(e.target.value)} style={{ width: 200 }} />
          <Button icon={<ReloadOutlined />} onClick={fetchAll} loading={loading}>刷新</Button>
          {!instance && <Button icon={<CloudUploadOutlined />} onClick={handleDeploy}>部署</Button>}
          {!instance && <Button icon={<PlayCircleOutlined />} type="primary" onClick={handleStart}>启动</Button>}
          {(instance?.state === 'ACTIVE' || instance?.state === 'RUNNING') && (
            <>
              <Button icon={<PauseCircleOutlined />} onClick={handlePause}>暂停</Button>
              <Button icon={<StopOutlined />} danger onClick={handleComplete}>完成</Button>
            </>
          )}
          {instance?.state === 'PAUSED' && (
            <Button icon={<CaretRightOutlined />} type="primary" onClick={handleResume}>恢复</Button>
          )}
        </Space>
      </Card>

      <Tabs defaultActiveKey="dashboard" style={{ marginTop: 16 }} items={[
        {
          key: 'dashboard',
          label: <span><DashboardOutlined /> 执行仪表板</span>,
          children: (
            <Row gutter={[16, 16]}>
              <Col span={24}>
                <Card size="small" title="流程实例">
                  {instance ? (
                    <Row gutter={16}>
                      <Col span={4}><Statistic title="实例 Key" value={instance.instanceKey} /></Col>
                      <Col span={4}><Statistic title="流程 ID" value={instance.bpmnProcessId?.slice(0, 20) || '-'} /></Col>
                      <Col span={4}><Statistic title="版本" value={instance.version} /></Col>
                      <Col span={4}><Statistic title="状态" value={instance.state}
                        valueStyle={{ color: /ACTIVE|RUNNING/.test(instance.state) ? '#22c55e' : /FAILED|CANCELLED/.test(instance.state) ? '#ef4444' : '#eab308' }} /></Col>
                      <Col span={4}><Statistic title="启动时间" value={instance.startTime ? new Date(instance.startTime).toLocaleTimeString() : '-'} /></Col>
                      <Col span={4}><Statistic title="执行步数" value={instance.executionHistory?.length || 0} /></Col>
                    </Row>
                  ) : <Empty description="尚未启动 — 请点击「部署」然后「启动」" />}
                </Card>
              </Col>
              {instance && (
                <Col span={24}>
                  <Card size="small" title="执行进度">
                    <Progress percent={instance.executionHistory?.length ? Math.min(instance.executionHistory.length * 20, 100) : 10} />
                    <Space wrap style={{ marginTop: 8 }}>
                      {jobTypes.map(jt => (
                        <Tag key={jt} color={instance.executionHistory?.some((h: any) => h.jobType === jt) ? 'green' : 'default'}>
                          {instance.executionHistory?.some((h: any) => h.jobType === jt) ? <CheckCircleOutlined /> : <ClockCircleOutlined />} {jt}
                        </Tag>
                      ))}
                    </Space>
                  </Card>
                </Col>
              )}
              {instance?.executionHistory?.length > 0 && (
                <Col span={24}>
                  <Card size="small" title="执行记录">
                    <Table dataSource={instance.executionHistory || []} rowKey="id" size="small" pagination={false}
                      columns={[
                        { title: 'Job 类型', dataIndex: 'jobType', key: 'jobType', render: (t: string) => <Tag>{t}</Tag> },
                        { title: '时间', dataIndex: 'executedAt', key: 'executedAt', render: (t: string) => t ? new Date(t).toLocaleTimeString() : '-' },
                        { title: '输出', key: 'output', render: (_: any, r: any) => <Text code style={{ fontSize: 11 }}>{JSON.stringify(r.output).slice(0, 80)}</Text> },
                      ]} />
                  </Card>
                </Col>
              )}
            </Row>
          ),
        },
        {
          key: 'workers',
          label: <span><SyncOutlined /> Worker 状态</span>,
          children: (
            <Card size="small" title="已注册 Worker">
              <Table dataSource={Object.entries(workers).map(([type, info]: [string, any]) => ({ key: type, type, ...info }))}
                rowKey="key" size="small" pagination={false}
                columns={[
                  { title: 'Job 类型', dataIndex: 'type', key: 'type', render: (t: string) => <Tag color="blue">{t}</Tag> },
                  { title: 'Worker 类', dataIndex: 'className', key: 'className', render: (v: string) => <Text code style={{ fontSize: 12 }}>{v}</Text> },
                  { title: '状态', dataIndex: 'status', key: 'status', render: (s: string) => <Tag color={s === 'active' ? 'green' : 'default'}>{s}</Tag> },
                ]} />
            </Card>
          ),
        },
        {
          key: 'debug',
          label: <span><BugOutlined /> 调试</span>,
          children: (
            <Row gutter={24}>
              <Col span={8}>
                <Card title="手动执行节点" size="small">
                  {!instance ? (
                    <Alert type="warning" message="请先在仪表板中部署并启动流程实例" showIcon />
                  ) : (
                    <>
                      <div style={{ marginBottom: 12 }}>
                        <Text strong>Job 类型</Text>
                        <Select value={debugJobType || undefined} onChange={setDebugJobType} style={{ width: '100%', marginTop: 4 }}
                          options={jobTypes.map(jt => ({ label: jt, value: jt }))} />
                      </div>
                      <div style={{ marginBottom: 12 }}>
                        <Text strong>变量 (JSON)</Text>
                        <Input.TextArea rows={3} value={debugVars} onChange={e => setDebugVars(e.target.value)}
                          style={{ marginTop: 4, fontFamily: 'monospace', fontSize: 12 }} />
                      </div>
                      <Button type="primary" icon={<PlayCircleOutlined />} onClick={handleExecuteNode} block>执行节点</Button>
                    </>
                  )}
                </Card>
              </Col>
              <Col span={16}>
                <Card><Empty description="执行后查看结果" /></Card>
              </Col>
            </Row>
          ),
        },
      ]} />
    </div>
  );
};

export default ExecutionMonitor;
