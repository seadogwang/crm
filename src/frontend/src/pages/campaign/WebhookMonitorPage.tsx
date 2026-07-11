import React, { useState, useCallback } from 'react';
import { Card, Table, Tag, Button, Space, Statistic, Row, Col, message, Input, Modal, Descriptions } from 'antd';
import { ReloadOutlined, LinkOutlined, CheckCircleOutlined, CloseCircleOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import { getWebhookLogs, type WebhookLogEntry } from '../../api/campaign';
import { useCampaignStyles } from './styles/campaign-ui-standard';

const AUTH_STATUS: Record<string, { color: string; label: string }> = {
  SUCCESS: { color: 'green', label: '✅ 成功' },
  FAILED_API_KEY: { color: 'red', label: '❌ API Key' },
  FAILED_SIGNATURE: { color: 'red', label: '❌ 签名' },
  IP_BLOCKED: { color: 'orange', label: '⛔ IP封锁' },
  NO_TRIGGER: { color: 'default', label: '无匹配触发器' },
  ERROR: { color: 'red', label: '❌ 错误' },
};

const WebhookMonitorPage: React.FC = () => {
  const styles = useCampaignStyles();
  const [programCode, setProgramCode] = useState('');
  const [logs, setLogs] = useState<WebhookLogEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<WebhookLogEntry | null>(null);

  const loadData = useCallback(async () => {
    if (!programCode.trim()) return;
    setLoading(true);
    try {
      const data = await getWebhookLogs(programCode.trim());
      setLogs(data || []);
    } catch { message.error('加载失败'); }
    finally { setLoading(false); }
  }, [programCode]);

  const total = logs.length;
  const success = logs.filter(l => l.authStatus === 'SUCCESS').length;
  const avgLatency = total > 0 ? Math.round(logs.reduce((s, l) => s + (l.processingTimeMs || 0), 0) / total) : 0;

  const columns: ColumnsType<WebhookLogEntry> = [
    { title: '时间', dataIndex: 'receivedAt', key: 'time', width: 160,
      render: v => v ? new Date(v).toLocaleString() : '-' },
    { title: 'IP', dataIndex: 'requestIp', key: 'ip', width: 130 },
    { title: '事件', dataIndex: 'mappedEventType', key: 'event', width: 120,
      render: (v, r) => v || r.requestPath?.split('/').pop() || '-' },
    { title: '认证', dataIndex: 'authStatus', key: 'auth', width: 110,
      render: v => { const t = AUTH_STATUS[v] || { color: 'default', label: v }; return <Tag color={t.color}>{t.label}</Tag>; }},
    { title: '耗时', dataIndex: 'processingTimeMs', key: 'latency', width: 80,
      render: v => v ? `${v}ms` : '-' },
    { title: '操作', key: 'action', width: 60,
      render: (_: unknown, r: WebhookLogEntry) => <Button size="small" onClick={() => setSelected(r)}>详情</Button> },
  ];

  return (
    <div style={styles.pageStyle}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h2 style={{ margin: 0 }}><LinkOutlined style={{ marginRight: 8, color: '#1890ff' }} />Webhook 监控</h2>
        <Space>
          <Input.Search placeholder="Program Code" value={programCode} onChange={e => setProgramCode(e.target.value)}
            onSearch={loadData} style={{ width: 220 }} enterButton />
          <Button icon={<ReloadOutlined />} onClick={loadData}>刷新</Button>
        </Space>
      </div>

      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col span={6}><Card size="small"><Statistic title="总请求" value={total} /></Card></Col>
        <Col span={6}><Card size="small"><Statistic title="成功" value={success} valueStyle={{ color: '#52c41a' }}
          suffix={total > 0 ? `(${(success / total * 100).toFixed(0)}%)` : ''} /></Card></Col>
        <Col span={6}><Card size="small"><Statistic title="失败" value={total - success} valueStyle={{ color: '#ff4d4f' }} /></Card></Col>
        <Col span={6}><Card size="small"><Statistic title="平均延迟" value={avgLatency} suffix="ms" /></Card></Col>
      </Row>

      <Card title="请求日志" size="small">
        <Table columns={columns} dataSource={logs} rowKey="id"
          loading={loading} pagination={{ pageSize: 20 }} size="small" scroll={{ x: 700 }} />
      </Card>

      <Modal open={!!selected} title="Webhook 请求详情" width={700}
        onCancel={() => setSelected(null)} footer={<Button onClick={() => setSelected(null)}>关闭</Button>}>
        {selected && (
          <>
            <Descriptions size="small" column={2} bordered>
              <Descriptions.Item label="Webhook ID">{selected.id}</Descriptions.Item>
              <Descriptions.Item label="IP">{selected.requestIp}</Descriptions.Item>
              <Descriptions.Item label="认证状态">
                <Tag color={AUTH_STATUS[selected.authStatus]?.color}>{AUTH_STATUS[selected.authStatus]?.label}</Tag>
              </Descriptions.Item>
              <Descriptions.Item label="延迟">{selected.processingTimeMs}ms</Descriptions.Item>
              {selected.authError && <Descriptions.Item label="错误" span={2}>{selected.authError}</Descriptions.Item>}
            </Descriptions>
            <div style={{ marginTop: 12 }}><strong>Headers:</strong>
              <pre style={{ background: '#f5f5f5', padding: 8, fontSize: 12, maxHeight: 100, overflow: 'auto' }}>
                {selected.requestHeaders}</pre></div>
            <div style={{ marginTop: 8 }}><strong>Body:</strong>
              <pre style={{ background: '#f5f5f5', padding: 8, fontSize: 12, maxHeight: 200, overflow: 'auto' }}>
                {selected.requestBody}</pre></div>
          </>
        )}
      </Modal>
    </div>
  );
};

export default WebhookMonitorPage;
