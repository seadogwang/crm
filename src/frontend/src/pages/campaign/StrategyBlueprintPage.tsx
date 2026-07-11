import React, { useState, useEffect, useCallback } from 'react';
import { Card, Table, Tag, Button, Space, Modal, Form, Input, Select, message, Popconfirm } from 'antd';
import { PlusOutlined, ReloadOutlined, ExperimentOutlined, EditOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import { getStrategyBlueprints, saveStrategyBlueprint, type StrategyBlueprintEntity } from '../../api/campaign';
import { useCampaignStyles } from './styles/campaign-ui-standard';

const INDUSTRIES = ['RETAIL', 'SAAS', 'FINANCE', 'EDUCATION', 'AUTO', 'ECOMMERCE', 'GENERAL'];
const INDUSTRY_LABELS: Record<string, string> = {
  RETAIL: '零售', SAAS: 'SaaS', FINANCE: '金融', EDUCATION: '教育', AUTO: '汽车', ECOMMERCE: '电商', GENERAL: '通用',
};

const StrategyBlueprintPage: React.FC = () => {
  const styles = useCampaignStyles();
  const [blueprints, setBlueprints] = useState<StrategyBlueprintEntity[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<StrategyBlueprintEntity | null>(null);
  const [form] = Form.useForm();

  const loadBlueprints = useCallback(async () => {
    setLoading(true);
    try {
      const list = await getStrategyBlueprints();
      setBlueprints(list || []);
    } catch { message.error('加载蓝图列表失败'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { loadBlueprints(); }, [loadBlueprints]);

  const handleSave = async () => {
    try {
      const values = await form.validateFields();
      await saveStrategyBlueprint({ ...editing, ...values });
      message.success(editing ? '蓝图已更新' : '蓝图已创建');
      setModalOpen(false); setEditing(null); form.resetFields(); loadBlueprints();
    } catch (err: any) {
      if (err?.errorFields) return; // antd validation
      message.error('保存失败');
    }
  };

  const openEdit = (bp: StrategyBlueprintEntity) => {
    setEditing(bp); form.setFieldsValue(bp); setModalOpen(true);
  };

  const openCreate = () => {
    setEditing(null); form.resetFields();
    form.setFieldsValue({ isActive: true, isSystemDefault: false, fallbackMode: 'CORRELATION' });
    setModalOpen(true);
  };

  const columns: ColumnsType<StrategyBlueprintEntity> = [
    { title: '蓝图名称', dataIndex: 'blueprintName', key: 'name' },
    { title: '行业', dataIndex: 'industryType', key: 'industry', width: 80,
      render: (v: string) => <Tag color="blue">{INDUSTRY_LABELS[v] || v}</Tag> },
    { title: '版本', dataIndex: 'version', key: 'version', width: 60 },
    { title: '状态', dataIndex: 'isActive', key: 'active', width: 70,
      render: (v: boolean) => v ? <Tag color="green">启用</Tag> : <Tag color="default">禁用</Tag> },
    { title: '系统默认', dataIndex: 'isSystemDefault', key: 'default', width: 80,
      render: (v: boolean) => v ? <Tag color="gold">默认</Tag> : '-' },
    { title: '描述', dataIndex: 'description', key: 'desc', ellipsis: true },
    { title: '操作', key: 'action', width: 80,
      render: (_: unknown, r: StrategyBlueprintEntity) => (
        <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(r)}>编辑</Button>
      )},
  ];

  return (
    <div style={styles.pageStyle}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h2 style={{ margin: 0 }}>
          <ExperimentOutlined style={{ marginRight: 8, color: '#7c3aed' }} />
          策略蓝图管理
        </h2>
        <Space>
          <Button icon={<ReloadOutlined />} onClick={loadBlueprints}>刷新</Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>新建蓝图</Button>
        </Space>
      </div>

      <Card size="small">
        <Table columns={columns} dataSource={blueprints} rowKey="id" loading={loading} pagination={false} size="small" />
      </Card>

      <Modal title={editing ? '编辑蓝图' : '新建蓝图'} open={modalOpen}
        onOk={handleSave} onCancel={() => { setModalOpen(false); setEditing(null); form.resetFields(); }}
        width={560}>
        <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item name="blueprintName" label="蓝图名称" rules={[{ required: true }]}>
            <Input placeholder="如: 零售业GMV增长蓝图" />
          </Form.Item>
          <Form.Item name="industryType" label="行业类型" rules={[{ required: true }]}>
            <Select placeholder="选择行业">
              {INDUSTRIES.map(i => <Select.Option key={i} value={i}>{INDUSTRY_LABELS[i]} ({i})</Select.Option>)}
            </Select>
          </Form.Item>
          <Form.Item name="description" label="描述">
            <Input.TextArea rows={2} placeholder="如: GMV = 新客数×客单价 + 老客复购率×老客基数×客单价" />
          </Form.Item>
          <Form.Item name="fallbackMode" label="降级模式">
            <Select>
              <Select.Option value="CORRELATION">相关性分析</Select.Option>
              <Select.Option value="OUTLIER">离群值发现</Select.Option>
              <Select.Option value="TEMPLATE">通用模板</Select.Option>
            </Select>
          </Form.Item>
          <Form.Item name="isActive" label="启用状态" valuePropName="checked">
            <Select><Select.Option value={true}>启用</Select.Option><Select.Option value={false}>禁用</Select.Option></Select>
          </Form.Item>
          <Form.Item name="isSystemDefault" label="系统默认" valuePropName="checked">
            <Select><Select.Option value={false}>否</Select.Option><Select.Option value={true}>是</Select.Option></Select>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default StrategyBlueprintPage;
