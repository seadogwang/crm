import React, { useState } from 'react';
import {
  Card, Row, Col, Button, Space, Tag, Typography, Modal, Input, Form,
  message, Descriptions, Table, Slider, Statistic, Alert, Divider, Timeline,
} from 'antd';
import {
  PauseCircleOutlined, PlayCircleOutlined, StopOutlined,
  ForwardOutlined, SettingOutlined, WarningOutlined,
  HistoryOutlined, ThunderboltOutlined, SafetyOutlined,
} from '@ant-design/icons';
import {
  pauseCampaign, resumeCampaign, cancelCampaign,
  skipNode, overrideConfig, getInterventions, getPlanStatus,
  emergencyThrottle, removeThrottle, checkBeforeExecution,
  CampaignInterventionCommand,
} from '../../api/campaign';
import { useCampaignStyles, TitleWithDesc } from './styles/campaign-ui-standard';

const { Text, Title } = Typography;
const { TextArea } = Input;

const InterventionDashboard: React.FC = () => {
  const s = useCampaignStyles();
  const [planId, setPlanId] = useState('plan_001');
  const [nodeId, setNodeId] = useState('N3');
  const [tenantId, setTenantId] = useState('default');
  const [status, setStatus] = useState<any>(null);
  const [history, setHistory] = useState<CampaignInterventionCommand[]>([]);
  const [throttleValue, setThrottleValue] = useState(1.0);
  const [actionLoading, setActionLoading] = useState(false);
  const [reasonModal, setReasonModal] = useState<{ open: boolean; action: string; title: string }>({
    open: false, action: '', title: '',
  });
  const [configModal, setConfigModal] = useState(false);
  const [configForm] = Form.useForm();
  const [reasonForm] = Form.useForm();

  const fetchStatus = async () => {
    try {
      const s = await getPlanStatus(planId);
      setStatus(s);
    } catch { message.error('获取状态失败'); }
  };

  const fetchHistory = async () => {
    try {
      const h = await getInterventions(planId);
      setHistory(h || []);
    } catch { /* ignore */ }
  };

  const handleAction = async (action: string, reason: string) => {
    setActionLoading(true);
    try {
      const body = { operatorId: 'admin', reason };
      let result: any;
      switch (action) {
        case 'pause': result = await pauseCampaign(planId, body); break;
        case 'resume': result = await resumeCampaign(planId, body); break;
        case 'cancel': result = await cancelCampaign(planId, body); break;
        case 'skip': result = await skipNode(planId, nodeId, body); break;
      }
      message.success(`操作成功: ${action}`);
      fetchStatus(); fetchHistory();
    } catch (err: any) {
      message.error(err?.response?.data?.message || '操作失败');
    } finally {
      setActionLoading(false);
      setReasonModal({ open: false, action: '', title: '' });
      reasonForm.resetFields();
    }
  };

  const handleOverrideConfig = async (values: any) => {
    setActionLoading(true);
    try {
      const config = JSON.parse(values.configJson || '{}');
      await overrideConfig(planId, values.nodeId || nodeId, {
        config, operatorId: 'admin', reason: values.reason,
      });
      message.success('配置覆盖成功');
      setConfigModal(false);
      configForm.resetFields();
      fetchHistory();
    } catch (err: any) {
      message.error(err?.response?.data?.message || '配置覆盖失败');
    } finally { setActionLoading(false); }
  };

  const handleThrottle = async () => {
    try {
      await emergencyThrottle(tenantId, throttleValue);
      message.success(`限流系数已设为 ${throttleValue}`);
      fetchStatus();
    } catch (err: any) { message.error(err?.response?.data?.message || '限流失败'); }
  };

  const handleRemoveThrottle = async () => {
    try {
      await removeThrottle(tenantId);
      setThrottleValue(1.0);
      message.success('限流已取消');
      fetchStatus();
    } catch (err: any) { message.error(err?.response?.data?.message || '取消失败'); }
  };

  const handleCheck = async () => {
    try {
      const result = await checkBeforeExecution(planId, nodeId, tenantId);
      if (result?.allowed) {
        message.success('✅ 检查通过，可以执行');
      } else {
        message.warning('⛔ ' + (result?.message || '被阻断'));
      }
    } catch (err: any) { message.error(err?.response?.data?.message || '检查失败'); }
  };

  const openReasonModal = (action: string, title: string) => {
    reasonForm.resetFields();
    setReasonModal({ open: true, action, title });
  };

  const actionButtons = [
    { key: 'pause', icon: <PauseCircleOutlined />, label: '暂停', color: 'orange', onClick: () => openReasonModal('pause', '暂停活动') },
    { key: 'resume', icon: <PlayCircleOutlined />, label: '恢复', color: 'green', onClick: () => openReasonModal('resume', '恢复活动') },
    { key: 'cancel', icon: <StopOutlined />, label: '取消', color: 'red', onClick: () => openReasonModal('cancel', '取消活动') },
    { key: 'skip', icon: <ForwardOutlined />, label: '跳过节点', color: 'purple', onClick: () => openReasonModal('skip', '跳过节点') },
    { key: 'config', icon: <SettingOutlined />, label: '覆盖配置', color: 'blue', onClick: () => { setConfigModal(true); } },
  ];

  const commandTypeColor: Record<string, string> = {
    PAUSE: 'orange', RESUME: 'green', CANCEL: 'red',
    SKIP_NODE: 'purple', UPDATE_CONFIG: 'blue',
  };

  return (
    <div style={s.pageStyle}>
      <TitleWithDesc title="人工干预中心" desc="活动控制 · 节点干预 · 紧急限流 · 防护检查 · 审计追溯" />

      <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
        <Col span={6}>
          <Card size="small" title="活动选择">
            <Space direction="vertical" style={{ width: '100%' }}>
              <Input addonBefore="计划ID" value={planId} onChange={e => setPlanId(e.target.value)} />
              <Input addonBefore="节点ID" value={nodeId} onChange={e => setNodeId(e.target.value)} />
              <Input addonBefore="租户" value={tenantId} onChange={e => setTenantId(e.target.value)} />
              <Space>
                <Button size="small" onClick={fetchStatus}>查状态</Button>
                <Button size="small" onClick={fetchHistory}>查历史</Button>
              </Space>
            </Space>
          </Card>

          {status && (
            <Card size="small" title="运行状态" style={{ marginTop: 16 }}>
              <Descriptions column={1} size="small">
                <Descriptions.Item label="状态">
                  <Tag color={status.status === 'PAUSED_BY_USER' ? 'orange' : status.status === 'CANCELLED' ? 'red' : 'green'}>
                    {status.status}
                  </Tag>
                </Descriptions.Item>
                <Descriptions.Item label="已暂停">
                  <Tag color={status.paused ? 'red' : 'green'}>{status.paused ? '是' : '否'}</Tag>
                </Descriptions.Item>
                <Descriptions.Item label="跳过节点">
                  {status.skippedNodes?.length > 0
                    ? <Space>{status.skippedNodes.map((n: string) => <Tag key={n}>{n}</Tag>)}</Space>
                    : <Text type="secondary">无</Text>}
                </Descriptions.Item>
                <Descriptions.Item label="限流系数">
                  <Tag color={status.throttleFactor < 1 ? 'orange' : 'green'}>{status.throttleFactor}</Tag>
                </Descriptions.Item>
              </Descriptions>
              <Button size="small" icon={<HistoryOutlined />} onClick={fetchHistory} block>刷新历史</Button>
            </Card>
          )}

          <Card size="small" title="紧急限流" style={{ marginTop: 16 }}>
            <Statistic title="当前限流系数" value={throttleValue} precision={2} prefix={<ThunderboltOutlined />}
              valueStyle={{ color: throttleValue < 0.5 ? '#ff4d4f' : throttleValue < 1 ? '#fa8c16' : '#52c41a' }} />
            <Slider min={0} max={1} step={0.05} value={throttleValue} onChange={setThrottleValue} />
            <Text type="secondary" style={{ fontSize: 12 }}>1.0=无限制 0.0=完全阻断</Text>
            <Space style={{ marginTop: 8 }}>
              <Button size="small" type="primary" danger icon={<ThunderboltOutlined />}
                onClick={handleThrottle}>应用限流</Button>
              <Button size="small" onClick={handleRemoveThrottle}>取消限流</Button>
            </Space>
          </Card>
        </Col>

        <Col span={18}>
          <Card title="执行控制" size="small">
            <Space wrap>
              {actionButtons.map(btn => (
                <Button key={btn.key} icon={btn.icon}
                  style={{ borderColor: btn.color, color: btn.color }}
                  onClick={btn.onClick} loading={actionLoading}>{btn.label}</Button>
              ))}
            </Space>
            <Divider />
            <Alert type="info" message={
              <Text>
                <b>状态机：</b>
                <Tag>RUNNING</Tag> → <Tag color="orange">PAUSED_BY_USER</Tag> (可恢复) / <Tag color="red">CANCELLED</Tag> (不可恢复) / <Tag color="purple">NODE_SKIPPED</Tag> / <Tag color="blue">OVERRIDDEN</Tag>
              </Text>
            } banner />
          </Card>

          <Card title="Worker 防护检查" size="small" style={{ marginTop: 16 }}>
            <Space>
              <Button icon={<SafetyOutlined />} onClick={handleCheck}>执行前检查</Button>
              <Text type="secondary">检查活动是否暂停、节点是否跳过、限流是否触发</Text>
            </Space>
          </Card>

          <Card title="干预历史" size="small" style={{ marginTop: 16 }}>
            <Timeline
              items={(history || []).map((h: CampaignInterventionCommand) => ({
                color: h.commandType === 'CANCEL' ? 'red' : h.commandType === 'PAUSE' ? 'orange' : h.commandType === 'RESUME' ? 'green' : 'blue',
                children: (
                  <div>
                    <Space>
                      <Tag color={commandTypeColor[h.commandType]}>{h.commandType}</Tag>
                      <Text strong>{h.operatorId}</Text>
                      {h.reason && <Text type="secondary">— {h.reason}</Text>}
                    </Space>
                    {h.targetNodeId && <div><Text type="secondary">节点: {h.targetNodeId}</Text></div>}
                    <Text type="secondary" style={{ fontSize: 12 }}>{new Date(h.createdAt).toLocaleString('zh-CN')}</Text>
                  </div>
                ),
              }))}
            />
          </Card>
        </Col>
      </Row>

      {/* 原因输入弹窗 */}
      <Modal title={reasonModal.title} open={reasonModal.open}
        onCancel={() => setReasonModal({ open: false, action: '', title: '' })}
        onOk={() => {
          const reason = reasonForm.getFieldValue('reason') || '';
          handleAction(reasonModal.action, reason);
        }}
        okText="确认" confirmLoading={actionLoading}>
        <Form form={reasonForm} layout="vertical">
          <Form.Item name="reason" label="操作原因">
            <TextArea rows={3} placeholder="请输入操作原因..." />
          </Form.Item>
        </Form>
      </Modal>

      {/* 配置覆盖弹窗 */}
      <Modal title="覆盖节点配置" open={configModal}
        onCancel={() => setConfigModal(false)}
        onOk={() => configForm.submit()} confirmLoading={actionLoading} okText="覆盖">
        <Form form={configForm} layout="vertical" onFinish={handleOverrideConfig}>
          <Form.Item name="nodeId" label="节点 ID" initialValue={nodeId}>
            <Input />
          </Form.Item>
          <Form.Item name="configJson" label="新配置（JSON）" initialValue='{"segment": "override_segment"}'>
            <TextArea rows={5} />
          </Form.Item>
          <Form.Item name="reason" label="原因">
            <TextArea rows={2} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default InterventionDashboard;
