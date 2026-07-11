import React, { useState, useCallback } from 'react';
import { Card, Table, Tag, Button, Space, Statistic, Row, Col, message, Modal, Input, Descriptions } from 'antd';
import { ReloadOutlined, PlayCircleOutlined, DeleteOutlined, WarningOutlined, BugOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import {
  getDlqList, getDlqCount, replayDlqTask, replayDlqBatch, getDlqReplayLogs, archiveDlq,
  type DlqTask, type DlqReplayLogEntry,
} from '../../api/campaign';
import { useCampaignStyles } from './styles/campaign-ui-standard';

const DlqManagementPage: React.FC = () => {
  const styles = useCampaignStyles();
  const [tasks, setTasks] = useState<DlqTask[]>([]);
  const [dlqCount, setDlqCountRaw] = useState(0);
  const [loading, setLoading] = useState(false);
  const [selectedTask, setSelectedTask] = useState<DlqTask | null>(null);
  const [replayLogs, setReplayLogs] = useState<DlqReplayLogEntry[]>([]);
  const [replayReason, setReplayReason] = useState('');

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [data, count] = await Promise.all([getDlqList(), getDlqCount()]);
      setTasks(data?.items || []);
      setDlqCountRaw(count?.dlqCount || 0);
    } catch { message.error('加载失败'); }
    finally { setLoading(false); }
  }, []);

  const handleReplay = async (taskId: string) => {
    try {
      await replayDlqTask(taskId, 'admin', replayReason || '手动重放');
      message.success('重放成功');
      loadData();
      setSelectedTask(null);
      setReplayReason('');
    } catch { message.error('重放失败'); }
  };

  const handleBatchReplay = async () => {
    try {
      const result = await replayDlqBatch({ operatorId: 'admin', reason: '批量重放' });
      message.success(`重放完成: ${result.successCount}/${result.total}`);
      loadData();
    } catch { message.error('批量重放失败'); }
  };

  const handleArchive = async () => {
    try {
      const result = await archiveDlq(7);
      message.success(`归档了 ${result.archived} 条死信`);
      loadData();
    } catch { message.error('归档失败'); }
  };

  const showDetail = async (task: DlqTask) => {
    setSelectedTask(task);
    try {
      const logs = await getDlqReplayLogs(task.id);
      setReplayLogs(logs || []);
    } catch { setReplayLogs([]); }
  };

  const columns: ColumnsType<DlqTask> = [
    { title: '时间', dataIndex: 'endTime', key: 'time', width: 160,
      render: v => v ? new Date(v).toLocaleString() : '-' },
    { title: 'Plan', dataIndex: 'planId', key: 'plan', width: 140, ellipsis: true },
    { title: '任务类型', dataIndex: 'taskType', key: 'type', width: 140,
      render: v => <Tag>{v}</Tag> },
    { title: '错误', dataIndex: 'errorMessage', key: 'error', ellipsis: true,
      render: v => <span style={{ color: '#ff4d4f' }}>{v?.substring(0, 60)}</span> },
    { title: '重放', dataIndex: 'replayedCount', key: 'replayed', width: 60 },
    { title: '操作', key: 'action', width: 120,
      render: (_: unknown, r: DlqTask) => (
        <Space size="small">
          <Button size="small" onClick={() => showDetail(r)}>详情</Button>
          <Button size="small" type="primary" icon={<PlayCircleOutlined />}
            onClick={() => handleReplay(r.id)}>重放</Button>
        </Space>
      )},
  ];

  const replayLogColumns: ColumnsType<DlqReplayLogEntry> = [
    { title: '时间', dataIndex: 'replayedAt', key: 'time', width: 160,
      render: v => v ? new Date(v).toLocaleString() : '-' },
    { title: '操作人', dataIndex: 'operatorId', key: 'op', width: 80 },
    { title: '结果', dataIndex: 'status', key: 'status', width: 80,
      render: v => <Tag color={v === 'SUCCESS' ? 'green' : 'red'}>{v}</Tag> },
    { title: '原因', dataIndex: 'reason', key: 'reason', ellipsis: true },
  ];

  return (
    <div style={styles.pageStyle}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h2 style={{ margin: 0 }}><BugOutlined style={{ marginRight: 8, color: '#ff4d4f' }} />死信队列 (DLQ)</h2>
        <Space>
          <Button icon={<ReloadOutlined />} onClick={loadData}>刷新</Button>
          <Button onClick={handleBatchReplay} icon={<PlayCircleOutlined />}>批量重放</Button>
          <Button onClick={handleArchive} icon={<DeleteOutlined />}>归档(7天前)</Button>
        </Space>
      </div>

      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col span={6}><Card size="small"><Statistic title="死信总数" value={dlqCount} valueStyle={{ color: '#ff4d4f' }} /></Card></Col>
        <Col span={6}><Card size="small"><Statistic title="当前页" value={tasks.length} /></Card></Col>
      </Row>

      <Card title="死信列表" size="small" style={{ marginBottom: 16 }}>
        <Table columns={columns} dataSource={tasks} rowKey="id"
          loading={loading} pagination={{ pageSize: 20 }} size="small" scroll={{ x: 800 }} />
      </Card>

      {/* Detail Modal */}
      <Modal open={!!selectedTask} title="死信详情" width={700}
        onCancel={() => setSelectedTask(null)}
        footer={[
          <Button key="cancel" onClick={() => setSelectedTask(null)}>关闭</Button>,
          <Button key="replay" type="primary" icon={<PlayCircleOutlined />}
            onClick={() => selectedTask && handleReplay(selectedTask.id)}>重放此任务</Button>,
        ]}>
        {selectedTask && (
          <>
            <Descriptions size="small" column={2} bordered>
              <Descriptions.Item label="Task ID">{selectedTask.id}</Descriptions.Item>
              <Descriptions.Item label="Plan ID">{selectedTask.planId}</Descriptions.Item>
              <Descriptions.Item label="任务类型">{selectedTask.taskType}</Descriptions.Item>
              <Descriptions.Item label="重放次数">{selectedTask.replayedCount}</Descriptions.Item>
              <Descriptions.Item label="失败时间">{selectedTask.endTime ? new Date(selectedTask.endTime).toLocaleString() : '-'}</Descriptions.Item>
            </Descriptions>
            <div style={{ marginTop: 12 }}>
              <strong style={{ color: '#ff4d4f' }}>错误堆栈:</strong>
              <pre style={{ background: '#fff2f0', padding: 8, borderRadius: 4, fontSize: 12, maxHeight: 150, overflow: 'auto' }}>
                {selectedTask.dlqReason || selectedTask.errorMessage}
              </pre>
            </div>
            <div style={{ marginTop: 12 }}>
              <strong>输入变量:</strong>
              <pre style={{ background: '#fafafa', padding: 8, borderRadius: 4, fontSize: 12, maxHeight: 150, overflow: 'auto' }}>
                {JSON.stringify(selectedTask.inputVariables, null, 2)}
              </pre>
            </div>
            <div style={{ marginTop: 12 }}>
              <strong>重放历史:</strong>
              <Table columns={replayLogColumns} dataSource={replayLogs} rowKey="id"
                pagination={false} size="small" style={{ marginTop: 4 }} />
            </div>
          </>
        )}
      </Modal>
    </div>
  );
};

export default DlqManagementPage;
