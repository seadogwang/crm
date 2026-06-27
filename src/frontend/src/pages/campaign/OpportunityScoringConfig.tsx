/**
 * 机会评分配置页面
 *
 * 功能：
 * 1. 查看/调整评分维度权重
 * 2. 启用/禁用维度
 * 3. 设置阈值
 * 4. 新增算法维度
 * 5. 预览评分效果
 */
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Card, Table, Button, Slider, Switch, Tag, Space, Typography,
  message, Modal, Form, Input, Select, InputNumber, Divider, Alert, Row, Col,
} from 'antd';
import {
  ArrowLeftOutlined, PlusOutlined, SaveOutlined, ExperimentOutlined,
  SettingOutlined, BarChartOutlined,
} from '@ant-design/icons';
import { useCampaignStyles, TitleWithDesc } from './styles/campaign-ui-standard';

const { Text, Title } = Typography;

interface ScoringDimension {
  key: string;
  name: string;
  description: string;
  dataSource: string;
  weight: number;
  enabled: boolean;
  algorithm: string;
}

const OpportunityScoringConfig: React.FC = () => {
  const navigate = useNavigate();
  const s = useCampaignStyles();
  const [dimensions, setDimensions] = useState<ScoringDimension[]>([
    { key: 'churn', name: '流失概率', description: 'ML模型预测会员流失概率', dataSource: 'ML模型 (XGBoost v2)', weight: 0.35, enabled: true, algorithm: 'ML' },
    { key: 'uplift', name: '增量价值', description: 'ML模型预测营销带来的增量', dataSource: 'ML模型 (Uplift v2)', weight: 0.35, enabled: true, algorithm: 'ML' },
    { key: 'conversion', name: '转化概率', description: 'ML模型预测会员转化概率', dataSource: 'ML模型 (LightGBM v2)', weight: 0.20, enabled: true, algorithm: 'ML' },
    { key: 'rfm', name: 'RFM基础分', description: '基于最近消费/频率/金额计算', dataSource: 'campaign_member_dim 宽表', weight: 0.10, enabled: true, algorithm: 'RFM' },
  ]);
  const [highThreshold, setHighThreshold] = useState(0.8);
  const [midThreshold, setMidThreshold] = useState(0.5);
  const [externalEnabled, setExternalEnabled] = useState(true);
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [form] = Form.useForm();

  const totalWeight = dimensions.filter(d => d.enabled).reduce((s, d) => s + d.weight, 0);

  const handleWeightChange = (key: string, value: number) => {
    setDimensions(prev => prev.map(d => d.key === key ? { ...d, weight: value / 100 } : d));
  };

  const handleToggle = (key: string) => {
    setDimensions(prev => prev.map(d => d.key === key ? { ...d, enabled: !d.enabled } : d));
  };

  const handleSave = () => {
    message.success('评分配置已保存');
  };

  const handleAddDimension = (values: any) => {
    const newDim: ScoringDimension = {
      key: values.key,
      name: values.name,
      description: values.description,
      dataSource: values.dataSource,
      weight: values.weight / 100,
      enabled: true,
      algorithm: values.algorithm || 'CUSTOM',
    };
    setDimensions(prev => [...prev, newDim]);
    setAddModalOpen(false);
    form.resetFields();
    message.success(`已添加维度: ${values.name}`);
  };

  return (
    <div style={s.pageStyle}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <TitleWithDesc title="机会评分配置" desc="配置评分维度权重 · 阈值设置 · 算法接入 · 预览效果" />
        <Button type="text" icon={<ArrowLeftOutlined />} onClick={() => navigate('/campaign/opportunity')}>
          返回
        </Button>
      </div>

      {/* 权重配置 */}
      <Card size="small" title={<><SettingOutlined /> 评分维度权重</>} style={{ marginBottom: 12 }}>
        <Alert type="info" showIcon
          message={`当前总权重: ${(totalWeight * 100).toFixed(0)}% (${totalWeight === 1 ? '✅ 已归一化' : '⚠ 请调整至100%'})`}
          style={{ marginBottom: 12 }} />
        <Table
          dataSource={dimensions}
          rowKey="key"
          size="small"
          pagination={false}
          columns={[
            { title: '维度', key: 'name', render: (_: any, r: ScoringDimension) => (
              <div>
                <Text strong>{r.name}</Text>
                <div><Text type="secondary" style={{ fontSize: 12 }}>{r.description}</Text></div>
              </div>
            )},
            { title: '算法', dataIndex: 'algorithm', key: 'algorithm', width: 80,
              render: (a: string) => <Tag>{a}</Tag> },
            { title: '数据来源', dataIndex: 'dataSource', key: 'dataSource', width: 200, ellipsis: true },
            { title: '权重', key: 'weight', width: 200, render: (_: any, r: ScoringDimension) => (
              <Slider min={0} max={100} value={Math.round(r.weight * 100)}
                onChange={v => handleWeightChange(r.key, v)}
                disabled={!r.enabled}
                marks={{ 0: '0%', 50: '50%', 100: '100%' }}
              />
            )},
            { title: '当前值', key: 'weightVal', width: 60,
              render: (_: any, r: ScoringDimension) => <Text strong>{Math.round(r.weight * 100)}%</Text> },
            { title: '启用', key: 'enabled', width: 60, render: (_: any, r: ScoringDimension) => (
              <Switch checked={r.enabled} onChange={() => handleToggle(r.key)} size="small" />
            )},
          ]}
        />
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12 }}>
          <Button type="dashed" icon={<PlusOutlined />} onClick={() => setAddModalOpen(true)}>
            新增评分维度
          </Button>
        </div>
      </Card>

      {/* 阈值 + 外部信号 */}
      <Row gutter={12}>
        <Col span={12}>
          <Card size="small" title="评分阈值">
            <div style={{ marginBottom: 16 }}>
              <Text>高价值阈值: {highThreshold}</Text>
              <Slider min={0.5} max={1} step={0.05} value={highThreshold}
                onChange={setHighThreshold}
                marks={{ 0.5: '0.5', 0.7: '0.7', 0.8: '0.8', 0.9: '0.9', 1: '1' }} />
            </div>
            <div>
              <Text>中价值阈值: {midThreshold}</Text>
              <Slider min={0.3} max={0.7} step={0.05} value={midThreshold}
                onChange={setMidThreshold}
                marks={{ 0.3: '0.3', 0.5: '0.5', 0.7: '0.7' }} />
            </div>
            <Divider />
            <Text type="secondary" style={{ fontSize: 12 }}>
              {`评分 > ${highThreshold} → 高价值 | ${midThreshold} ~ ${highThreshold} → 中价值 | < ${midThreshold} → 低价值`}
            </Text>
          </Card>
        </Col>
        <Col span={12}>
          <Card size="small" title="外部信号">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <Text strong>启用外部信号加权</Text>
                <div><Text type="secondary" style={{ fontSize: 12 }}>竞品/舆情/政策/库存信号影响机会评分</Text></div>
              </div>
              <Switch checked={externalEnabled} onChange={setExternalEnabled} />
            </div>
            <Divider />
            <Text type="secondary" style={{ fontSize: 12 }}>
              启用后: finalScore = baseScore × externalWeight (上限 2.0x)
            </Text>
          </Card>
        </Col>
      </Row>

      {/* 算法接入说明 */}
      <Card size="small" title={<><ExperimentOutlined /> 如何接入新算法</>} style={{ marginTop: 12 }}>
        <Alert type="info" showIcon
          message="新增算法 = 新增评分维度 + 实现数据源"
          description={
            <div style={{ fontSize: 13 }}>
              <p>1. 点击"新增评分维度" → 填写维度信息</p>
              <p>2. 选择算法类型: <Tag>ML</Tag> 调用ML模型 / <Tag>RFM</Tag> 数据库计算 / <Tag>RULE</Tag> 规则引擎 / <Tag>CUSTOM</Tag> 自定义</p>
              <p>3. 配置数据源: 如 ML模型地址 / 数据库查询SQL / 规则表达式</p>
              <p>4. 后端实现对应的 ScoringAlgorithm 接口，Spring 自动注册</p>
              <p>5. 调整权重，预览效果，保存配置</p>
            </div>
          }
        />
        <div style={{ marginTop: 12 }}>
          <Text code style={{ fontSize: 12 }}>
{`// 实现新算法只需实现接口:
@Component
public class SocialScoreAlgorithm implements ScoringAlgorithm {
    public String getKey() { return "social"; }
    public double score(MemberFeature member) {
        return socialApi.getInfluence(member.getId()); // 0~1
    }
}`}
          </Text>
        </div>
      </Card>

      {/* 保存 */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
        <Button type="primary" icon={<SaveOutlined />} size="large" onClick={handleSave}>
          保存配置
        </Button>
      </div>

      {/* 新增维度弹窗 */}
      <Modal title="新增评分维度" open={addModalOpen}
        onCancel={() => setAddModalOpen(false)}
        onOk={() => form.submit()} okText="添加">
        <Form form={form} layout="vertical" onFinish={handleAddDimension}>
          <Form.Item name="key" label="维度标识" rules={[{ required: true }]}>
            <Input placeholder="如: social, weather, location" />
          </Form.Item>
          <Form.Item name="name" label="维度名称" rules={[{ required: true }]}>
            <Input placeholder="如: 社交影响力" />
          </Form.Item>
          <Form.Item name="description" label="描述">
            <Input placeholder="描述这个维度的作用" />
          </Form.Item>
          <Form.Item name="algorithm" label="算法类型" initialValue="CUSTOM">
            <Select options={[
              { label: 'ML模型', value: 'ML' },
              { label: 'RFM计算', value: 'RFM' },
              { label: '规则引擎', value: 'RULE' },
              { label: '自定义', value: 'CUSTOM' },
            ]} />
          </Form.Item>
          <Form.Item name="dataSource" label="数据来源" rules={[{ required: true }]}>
            <Input placeholder="如: 社交媒体API / 天气API / 数据库查询" />
          </Form.Item>
          <Form.Item name="weight" label="初始权重" initialValue={10}>
            <Slider min={0} max={100} marks={{ 0: '0%', 25: '25%', 50: '50%', 75: '75%', 100: '100%' }} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default OpportunityScoringConfig;