import React, { useState, useCallback } from 'react';
import { Card, Table, Tag, Button, Space, message, Input, Modal, Form, Select, InputNumber, Descriptions } from 'antd';
import { ReloadOutlined, PlusOutlined, BulbOutlined, EyeOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import {
  getRecommendationStrategies, createRecommendationStrategy,
  getRecommendationPreview, type RecommendationStrategyEntity, type RecommendationItemType,
} from '../../api/campaign';
import { useCampaignStyles } from './styles/campaign-ui-standard';

const STRATEGY_TYPES: Record<string, string> = {
  SIMILAR_PRODUCTS: '看了又看',
  FREQUENTLY_BOUGHT: '买了又买',
  POPULAR: '热门推荐',
  PERSONALIZED_OFFER: '个性化优惠',
  DYNAMIC_COPY: '动态文案',
};

const RecommendationPage: React.FC = () => {
  const styles = useCampaignStyles();
  const [programCode, setProgramCode] = useState('');
  const [strategies, setStrategies] = useState<RecommendationStrategyEntity[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewMember, setPreviewMember] = useState('');
  const [previewItems, setPreviewItems] = useState<RecommendationItemType[]>([]);
  const [selectedStrategy, setSelectedStrategy] = useState<string>('');

  // New strategy form
  const [newName, setNewName] = useState('');
  const [newType, setNewType] = useState('SIMILAR_PRODUCTS');
  const [newTtl, setNewTtl] = useState(3600);
  const [newConfig, setNewConfig] = useState('{"lookback_days":30,"max_items":3,"fallback_category":"热销"}');

  const loadData = useCallback(async () => {
    if (!programCode.trim()) return;
    setLoading(true);
    try {
      const data = await getRecommendationStrategies(programCode.trim());
      setStrategies(data || []);
    } catch { message.error('加载失败'); }
    finally { setLoading(false); }
  }, [programCode]);

  const handleCreate = async () => {
    if (!programCode.trim()) return;
    try {
      await createRecommendationStrategy({
        programCode: programCode.trim(), strategyName: newName,
        strategyType: newType, recommendationConfig: newConfig,
        cacheTtlSeconds: newTtl, enabled: true,
      } as any);
      message.success('策略已创建');
      setModalOpen(false);
      setNewName(''); loadData();
    } catch { message.error('创建失败'); }
  };

  const handlePreview = async (strategyId: string) => {
    if (!previewMember.trim()) return;
    try {
      const data = await getRecommendationPreview(previewMember.trim(), strategyId, 3);
      setPreviewItems(data.items || []);
      setSelectedStrategy(strategyId);
      setPreviewOpen(true);
    } catch { message.error('预览失败'); }
  };

  const columns: ColumnsType<RecommendationStrategyEntity> = [
    { title: '策略名称', dataIndex: 'strategyName', key: 'name' },
    { title: '类型', dataIndex: 'strategyType', key: 'type', width: 140,
      render: v => <Tag>{STRATEGY_TYPES[v] || v}</Tag> },
    { title: '缓存(秒)', dataIndex: 'cacheTtlSeconds', key: 'ttl', width: 80 },
    { title: '默认', dataIndex: 'isDefault', key: 'def', width: 60,
      render: v => v ? <Tag color="blue">默认</Tag> : null },
    { title: '状态', dataIndex: 'enabled', key: 'status', width: 60,
      render: v => <Tag color={v ? 'green' : 'red'}>{v ? '启用' : '禁用'}</Tag> },
    { title: '操作', key: 'action', width: 80,
      render: (_: unknown, r: RecommendationStrategyEntity) => (
        <Button size="small" icon={<EyeOutlined />} onClick={() => handlePreview(r.id)}>预览</Button>
      )},
  ];

  return (
    <div style={styles.pageStyle}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h2 style={{ margin: 0 }}><BulbOutlined style={{ marginRight: 8, color: '#fa8c16' }} />动态内容与推荐策略</h2>
        <Space>
          <Input.Search placeholder="Program Code" value={programCode} onChange={e => setProgramCode(e.target.value)}
            onSearch={loadData} style={{ width: 200 }} enterButton />
          <Button icon={<ReloadOutlined />} onClick={loadData}>刷新</Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setModalOpen(true)}>新增策略</Button>
        </Space>
      </div>

      <Card title="推荐策略" size="small" style={{ marginBottom: 16 }}>
        <Table columns={columns} dataSource={strategies} rowKey="id" loading={loading}
          pagination={false} size="small" />
      </Card>

      <Card title="快速预览" size="small">
        <Space>
          <Input placeholder="Member ID" value={previewMember} onChange={e => setPreviewMember(e.target.value)}
            style={{ width: 200 }} />
          <span>选择策略后点击[预览]</span>
        </Space>
      </Card>

      {/* Create Modal */}
      <Modal open={modalOpen} title="新增推荐策略" onCancel={() => setModalOpen(false)}
        onOk={handleCreate} okText="创建" width={560}>
        <Form layout="vertical">
          <Form.Item label="策略名称"><Input value={newName} onChange={e => setNewName(e.target.value)} placeholder="如: 看了又看" /></Form.Item>
          <Form.Item label="策略类型">
            <Select value={newType} onChange={setNewType}
              options={Object.entries(STRATEGY_TYPES).map(([k, v]) => ({ label: v, value: k }))} />
          </Form.Item>
          <Form.Item label="推荐配置 (JSON)">
            <Input.TextArea value={newConfig} onChange={e => setNewConfig(e.target.value)} rows={3}
              placeholder='{"lookback_days":30,"max_items":3}' />
          </Form.Item>
          <Form.Item label="缓存时间(秒)"><InputNumber value={newTtl} onChange={v => setNewTtl(v || 3600)} min={60} max={86400} /></Form.Item>
        </Form>
      </Modal>

      {/* Preview Modal */}
      <Modal open={previewOpen} title="推荐结果预览" onCancel={() => setPreviewOpen(false)}
        footer={<Button onClick={() => setPreviewOpen(false)}>关闭</Button>} width={600}>
        {previewItems.length > 0 ? (
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            {previewItems.map((item, i) => (
              <Card key={i} size="small" style={{ width: 160, textAlign: 'center' }}
                cover={<div style={{ height: 80, background: '#f0f0f0', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24 }}>📦</div>}>
                <div style={{ fontWeight: 500 }}>{item.productName}</div>
                <div style={{ color: '#ff4d4f' }}>¥{item.price}</div>
                <Tag style={{ marginTop: 4, fontSize: 10 }} color="blue">{item.reason}</Tag>
                <div style={{ fontSize: 10, color: '#8c8c8c', marginTop: 2 }}>
                  评分: {(item.score * 100).toFixed(0)}%
                </div>
              </Card>
            ))}
          </div>
        ) : (
          <div style={{ textAlign: 'center', padding: 20, color: '#8c8c8c' }}>无推荐结果</div>
        )}
      </Modal>
    </div>
  );
};

export default RecommendationPage;
