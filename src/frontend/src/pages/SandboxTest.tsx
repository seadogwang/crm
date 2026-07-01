import React, { useState, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import {
  Card, Table, Tag, Button, Select, Space, Typography, Alert, Descriptions, Row, Col, Statistic,
} from 'antd';
import { PlayCircleOutlined, CheckCircleOutlined, CloseCircleOutlined, WarningOutlined } from '@ant-design/icons';
import api from '../api';
import { useCampaignStyles, TitleWithDesc } from './campaign/styles/campaign-ui-standard';

const { Title, Text } = Typography;

const SandboxTest: React.FC = () => {
  const { id } = useParams<{ id: string }>();

  const [loading, setLoading] = useState(false);
  const [dataset, setDataset] = useState<string>('ai_mock');
  const [report, setReport] = useState<any>(null);
  const [diffs, setDiffs] = useState<any[]>([]);

  const runTest = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.post(`/admin/rules/${id}/validate`, {
        dataset_type: dataset,
      });
      const r = data?.data;
      setReport(r);
      setDiffs(r?.diffs || []);
    } catch (e: any) {
      console.error('沙箱测试失败:', e);
    } finally {
      setLoading(false);
    }
  }, [id, dataset]);

  const diffColumns = [
    {
      title: '用例ID', dataIndex: 'case_id', width: 100,
    },
    {
      title: '基线结果', dataIndex: 'baseline_result', width: 200,
      render: (v: any) => v ? <pre style={{ fontSize: 11, margin: 0, maxHeight: 80, overflow: 'auto' }}>{JSON.stringify(v)}</pre> : '—',
    },
    {
      title: '候选结果', dataIndex: 'candidate_result', width: 200,
      render: (v: any) => v ? <pre style={{ fontSize: 11, margin: 0, maxHeight: 80, overflow: 'auto' }}>{JSON.stringify(v)}</pre> : '—',
    },
    {
      title: '差异类型', dataIndex: 'diff_type', width: 120,
      render: (v: string) => {
        const colors: Record<string, string> = { DOUBLE_REWARD: 'red', SHADOWING: 'orange', TIER_DIFF: 'volcano', MISSING: 'magenta' };
        return <Tag color={colors[v] || 'default'}>{v}</Tag>;
      },
    },
    {
      title: '严重度', dataIndex: 'severity', width: 80,
      render: (v: string) => <Tag color={v === 'CRITICAL' ? 'red' : v === 'WARNING' ? 'orange' : 'green'}>{v}</Tag>,
    },
  ];

  return (
    <div className="campaign-page" style={{ padding: 'var(--campaign-page-padding)', minHeight: 'calc(100vh - 64px)' }}>
      <TitleWithDesc title={`沙箱回归测试 — 规则 #${id}`} desc="沙箱环境下运行回归测试，对比基线规则与候选规则的输出差异" />

      {/* 测试控制 */}
      <Card size="small" style={{ marginBottom: 12 }}>
        <Space>
          <Text strong>测试数据集：</Text>
          <Select value={dataset} onChange={setDataset} style={{ width: 200 }}
            options={[
              { label: 'AI 模拟数据集', value: 'ai_mock' },
              { label: '生产切片（7天）', value: 'production_slice_7d' },
              { label: '生产切片（30天）', value: 'production_slice_30d' },
            ]} />
          <Button type="primary" icon={<PlayCircleOutlined />} onClick={runTest} loading={loading}>
            执行沙箱测试
          </Button>
        </Space>
      </Card>

      {!report && !loading && (
        <Alert type="info" message="选择测试数据集后点击「执行沙箱测试」开始回归验证" showIcon />
      )}

      {/* 汇总报告 */}
      {report && (
        <>
          <Row gutter={16} style={{ marginBottom: 16 }}>
            <Col span={6}>
              <Card size="small">
                <Statistic title="总用例数" value={report.totalCases || 0} />
              </Card>
            </Col>
            <Col span={6}>
              <Card size="small">
                <Statistic title="一致" value={report.matchCount || 0} valueStyle={{ color: '#3f8600' }}
                  prefix={<CheckCircleOutlined />} />
              </Card>
            </Col>
            <Col span={6}>
              <Card size="small">
                <Statistic title="差异" value={report.diffCount || 0} valueStyle={{ color: '#cf1322' }}
                  prefix={<CloseCircleOutlined />} />
              </Card>
            </Col>
            <Col span={6}>
              <Card size="small">
                <Statistic title="警告级别" value={report.level || 'GREEN'}
                  valueStyle={{
                    color: report.level === 'RED' ? '#cf1322' : report.level === 'YELLOW' ? '#faad14' : '#3f8600',
                  }}
                  prefix={report.level === 'RED' ? <CloseCircleOutlined /> : report.level === 'YELLOW' ? <WarningOutlined /> : <CheckCircleOutlined />}
                />
              </Card>
            </Col>
          </Row>

          {/* 双列对比 */}
          {diffs.length > 0 ? (
            <Card title="差异明细">
              <Table dataSource={diffs} columns={diffColumns} rowKey="case_id" size="small"
                pagination={{ pageSize: 20 }} scroll={{ x: 800 }}
                rowClassName={(record) => record.severity === 'CRITICAL' ? 'row-critical' : ''} />
            </Card>
          ) : (
            <Alert type="success" message="所有测试用例通过，无差异 ✅" showIcon />
          )}
        </>
      )}
    </div>
  );
};

export default SandboxTest;