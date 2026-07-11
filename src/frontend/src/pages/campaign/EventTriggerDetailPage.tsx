import React, { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Card, Table, Tag, Button, Space, Descriptions, Statistic, message, Spin, Tabs, Row, Col } from 'antd';
import { PlayCircleOutlined, PauseCircleOutlined, ReloadOutlined, ArrowLeftOutlined, ThunderboltOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import { getPlanTriggers, getTriggerLogs, getTriggerStats, pauseEventTrigger, resumeEventTrigger, type CampaignEventTrigger, type EventTriggerLog, type TriggerStats } from '../../api/campaign';
import { useCampaignStyles } from './styles/campaign-ui-standard';

const STATUS_COLORS: Record<string, string> = {
  ACTIVE: 'green',
  PAUSED: 'orange',
  DISABLED: 'red',
};

const STATUS_LABELS: Record<string, string> = {
  ACTIVE: '运行中',
  PAUSED: '已暂停',
  DISABLED: '已禁用',
};

const TRIGGER_STATUS_TAGS: Record<string, { color: string; label: string }> = {
  TRIGGERED: { color: 'green', label: '已触发' },
  SKIPPED: { color: 'orange', label: '已跳过' },
  FAILED: { color: 'red', label: '失败' },
  DUPLICATE: { color: 'gold', label: '重复' },
  FILTER_NOT_MATCH: { color: 'default', label: '过滤未匹配' },
  DISABLED: { color: 'default', label: '已禁用' },
  OUT_OF_WINDOW: { color: 'default', label: '超出时间窗口' },
  NOT_DEPLOYED: { color: 'default', label: '未部署' },
};

/**
 * 事件驱动 Campaign 详情页 — 触发器配置、执行统计和日志。
 */
const EventTriggerDetailPage: React.FC = () => {
  const { planId } = useParams<{ planId: string }>();
  const navigate = useNavigate();
  const styles = useCampaignStyles();

  const [triggers, setTriggers] = useState<CampaignEventTrigger[]>([]);
  const [logs, setLogs] = useState<EventTriggerLog[]>([]);
  const [stats, setStats] = useState<TriggerStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [logLoading, setLogLoading] = useState(false);
  const [activeTriggerId, setActiveTriggerId] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    if (!planId) return;
    setLoading(true);
    try {
      const [triggerList, statsData] = await Promise.all([
        getPlanTriggers(planId),
        getTriggerStats(planId),
      ]);
      setTriggers(triggerList || []);
      setStats(statsData);
      if (triggerList && triggerList.length > 0 && !activeTriggerId) {
        setActiveTriggerId(triggerList[0].id);
      }
    } catch {
      message.error('加载触发器数据失败');
    } finally {
      setLoading(false);
    }
  }, [planId, activeTriggerId]);

  const loadLogs = useCallback(async () => {
    if (!activeTriggerId) return;
    setLogLoading(true);
    try {
      const logList = await getTriggerLogs(activeTriggerId);
      setLogs(logList || []);
    } catch {
      message.error('加载触发日志失败');
    } finally {
      setLogLoading(false);
    }
  }, [activeTriggerId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    loadLogs();
  }, [loadLogs]);

  const handlePause = async (triggerId: string) => {
    try {
      await pauseEventTrigger(triggerId);
      message.success('触发器已暂停');
      loadData();
    } catch {
      message.error('暂停失败');
    }
  };

  const handleResume = async (triggerId: string) => {
    try {
      await resumeEventTrigger(triggerId);
      message.success('触发器已恢复');
      loadData();
    } catch {
      message.error('恢复失败');
    }
  };

  const logColumns: ColumnsType<EventTriggerLog> = [
    { title: '时间', dataIndex: 'triggerTime', key: 'triggerTime', width: 180,
      render: (v: string) => v ? new Date(v).toLocaleString() : '-' },
    { title: '会员ID', dataIndex: 'memberId', key: 'memberId', width: 120 },
    { title: '事件类型', dataIndex: 'eventType', key: 'eventType', width: 140 },
    { title: '状态', dataIndex: 'skipReason', key: 'status', width: 120,
      render: (_: string, record: EventTriggerLog) => {
        const statusKey = record.triggered ? 'TRIGGERED' : (record.skipReason || 'SKIPPED');
        const tag = TRIGGER_STATUS_TAGS[statusKey] || { color: 'default', label: statusKey };
        return <Tag color={tag.color}>{tag.label}</Tag>;
      }},
    { title: '原因', dataIndex: 'skipReason', key: 'reason', width: 140,
      render: (v: string, record: EventTriggerLog) => record.triggered ? '-' : v },
    { title: '流程实例', dataIndex: 'processInstanceKey', key: 'instance', width: 120,
      render: (v: number) => v ? String(v) : '-' },
    { title: '去重Key', dataIndex: 'dedupKey', key: 'dedup', ellipsis: true },
  ];

  const triggerColumns: ColumnsType<CampaignEventTrigger> = [
    { title: '事件类型', dataIndex: 'eventType', key: 'eventType', width: 160,
      render: (v: string) => <Tag icon={<ThunderboltOutlined />} color="purple">{v}</Tag> },
    { title: '事件来源', dataIndex: 'eventSource', key: 'eventSource', width: 120 },
    { title: '状态', dataIndex: 'enabled', key: 'status', width: 100,
      render: (v: boolean) => (
        <Tag color={v ? 'green' : 'red'}>{v ? '启用' : '禁用'}</Tag>
      )},
    { title: '去重窗口(分)', dataIndex: 'dedupWindowMinutes', key: 'dedup', width: 100 },
    { title: '操作', key: 'action', width: 160,
      render: (_: unknown, record: CampaignEventTrigger) => (
        <Space size="small">
          {record.enabled ? (
            <Button size="small" icon={<PauseCircleOutlined />} onClick={() => handlePause(record.id)}>暂停</Button>
          ) : (
            <Button size="small" type="primary" icon={<PlayCircleOutlined />} onClick={() => handleResume(record.id)}>恢复</Button>
          )}
        </Space>
      )},
  ];

  if (loading) {
    return <div style={{ textAlign: 'center', padding: 100 }}><Spin size="large" /></div>;
  }

  return (
    <div style={styles.pageStyle}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <Space>
          <Button icon={<ArrowLeftOutlined />} onClick={() => navigate(-1)}>返回</Button>
          <h2 style={{ margin: 0 }}>
            <ThunderboltOutlined style={{ marginRight: 8, color: '#8b5cf6' }} />
            事件触发器管理
          </h2>
        </Space>
        <Button icon={<ReloadOutlined />} onClick={loadData}>刷新</Button>
      </div>

      {/* Stats Overview */}
      {stats && (
        <Row gutter={16} style={{ marginBottom: 16 }}>
          <Col span={4}>
            <Card size="small">
              <Statistic title="总触发次数" value={stats.totalLogs} />
            </Card>
          </Col>
          <Col span={4}>
            <Card size="small">
              <Statistic title="成功触发" value={stats.triggered} valueStyle={{ color: '#3f8600' }} />
            </Card>
          </Col>
          <Col span={4}>
            <Card size="small">
              <Statistic title="去重过滤" value={stats.deduped} valueStyle={{ color: '#faad14' }} />
            </Card>
          </Col>
          <Col span={4}>
            <Card size="small">
              <Statistic title="过滤未匹配" value={stats.filterNotMatch} valueStyle={{ color: '#999' }} />
            </Card>
          </Col>
          <Col span={4}>
            <Card size="small">
              <Statistic title="成功率" value={stats.successRate} precision={1} suffix="%" valueStyle={{ color: stats.successRate > 80 ? '#3f8600' : '#cf1322' }} />
            </Card>
          </Col>
          <Col span={4}>
            <Card size="small">
              <Statistic title="活跃触发器" value={triggers.filter(t => t.enabled).length} />
            </Card>
          </Col>
        </Row>
      )}

      {/* Trigger Config */}
      <Card title="触发器配置" style={{ marginBottom: 16 }}>
        <Table
          columns={triggerColumns}
          dataSource={triggers}
          rowKey="id"
          pagination={false}
          size="small"
          onRow={(record) => ({
            onClick: () => setActiveTriggerId(record.id),
            style: { background: activeTriggerId === record.id ? '#f0f5ff' : undefined, cursor: 'pointer' },
          })}
        />

        {activeTriggerId && (() => {
          const trigger = triggers.find(t => t.id === activeTriggerId);
          if (!trigger) return null;
          return (
            <Descriptions bordered size="small" column={2} style={{ marginTop: 16 }}>
              <Descriptions.Item label="事件类型">{trigger.eventType}</Descriptions.Item>
              <Descriptions.Item label="事件来源">{trigger.eventSource}</Descriptions.Item>
              <Descriptions.Item label="Kafka Topic">{trigger.eventTopic || '-'}</Descriptions.Item>
              <Descriptions.Item label="去重窗口(分钟)">{trigger.dedupWindowMinutes}</Descriptions.Item>
              <Descriptions.Item label="去重键字段">{trigger.dedupKeyFields}</Descriptions.Item>
              <Descriptions.Item label="状态">
                <Tag color={trigger.enabled ? 'green' : 'red'}>{trigger.enabled ? '启用' : '禁用'}</Tag>
              </Descriptions.Item>
              <Descriptions.Item label="生效时间">{trigger.startTime ? new Date(trigger.startTime).toLocaleString() : '-'}</Descriptions.Item>
              <Descriptions.Item label="失效时间">{trigger.endTime ? new Date(trigger.endTime).toLocaleString() : '-'}</Descriptions.Item>
              <Descriptions.Item label="事件过滤" span={2}>
                <pre style={{ margin: 0, fontSize: 12 }}>{trigger.eventFilter || '-'}</pre>
              </Descriptions.Item>
            </Descriptions>
          );
        })()}
      </Card>

      {/* Trigger Logs */}
      <Card title="触发日志">
        <Table
          columns={logColumns}
          dataSource={logs}
          rowKey="id"
          loading={logLoading}
          pagination={{ pageSize: 20, showSizeChanger: true, showTotal: (total) => `共 ${total} 条` }}
          size="small"
          scroll={{ x: 900 }}
        />
      </Card>
    </div>
  );
};

export default EventTriggerDetailPage;
