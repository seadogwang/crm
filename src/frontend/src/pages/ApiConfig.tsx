import React, { useState, useEffect, useCallback } from 'react';
import {
  Table, Tag, Button, Space, Modal, Form, Input, Select, Card,
  Typography, message, Tooltip, Drawer, Popconfirm,
} from 'antd';
import {
  PlusOutlined, EditOutlined, DeleteOutlined, LinkOutlined,
  ApiOutlined, SearchOutlined, ReloadOutlined,
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { useCampaignStyles, TitleWithDesc, CampaignCard } from './campaign/styles/campaign-ui-standard';
import api from '../api';

const { Text, Title } = Typography;

// ==================== 常量 ====================

const DIRECTION_OPTIONS = [
  { label: '入站 (INBOUND)', value: 'INBOUND' },
  { label: '出站 (OUTBOUND)', value: 'OUTBOUND' },
];

const HTTP_METHOD_OPTIONS = [
  { label: 'GET', value: 'GET' },
  { label: 'POST', value: 'POST' },
  { label: 'PUT', value: 'PUT' },
  { label: 'DELETE', value: 'DELETE' },
  { label: 'PATCH', value: 'PATCH' },
];

const AUTH_TYPE_OPTIONS = [
  { label: '无认证 (NONE)', value: 'NONE' },
  { label: 'Token', value: 'TOKEN' },
  { label: '签名 (SIGN)', value: 'SIGN' },
  { label: 'OAuth2', value: 'OAUTH2' },
  { label: 'Basic Auth', value: 'BASIC' },
];

const PAGINATION_OPTIONS = [
  { label: '无分页', value: 'NONE' },
  { label: '偏移分页', value: 'OFFSET' },
  { label: '游标分页', value: 'CURSOR' },
  { label: '页号分页', value: 'PAGE' },
];

const METHOD_COLORS: Record<string, string> = {
  GET: 'green',
  POST: 'blue',
  PUT: 'orange',
  DELETE: 'red',
  PATCH: 'purple',
};

const DIRECTION_COLORS: Record<string, string> = {
  INBOUND: 'cyan',
  OUTBOUND: 'geekblue',
};

// ==================== 组件 ====================

const ApiConfig: React.FC = () => {
  const navigate = useNavigate();
  const [operations, setOperations] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editingRecord, setEditingRecord] = useState<any | null>(null);
  const [form] = Form.useForm();
  const [entityTypes, setEntityTypes] = useState<any[]>([]);

  // 筛选状态
  const [filterChannel, setFilterChannel] = useState<string | undefined>(undefined);
  const [filterDirection, setFilterDirection] = useState<string | undefined>(undefined);
  const [filterMethod, setFilterMethod] = useState<string | undefined>(undefined);

  const fetch = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (filterChannel) params.set('channel', filterChannel);
      if (filterDirection) params.set('direction', filterDirection);
      if (filterMethod) params.set('httpMethod', filterMethod);
      const qs = params.toString();
      const { data } = await api.get(`/admin/api-operations${qs ? '?' + qs : ''}`);
      setOperations(data?.data || []);
    } catch (e: any) {
      setError(e.message || '加载失败');
      setOperations([]);
    } finally {
      setLoading(false);
    }
  }, [filterChannel, filterDirection, filterMethod]);

  const fetchEntityTypes = useCallback(async () => {
    try {
      const { data } = await api.get('/admin/api-operations/entity-types');
      setEntityTypes(data?.data || []);
    } catch {
      // 静默失败
    }
  }, []);

  useEffect(() => { fetch(); }, [fetch]);
  useEffect(() => { fetchEntityTypes(); }, [fetchEntityTypes]);

  // ---- 抽屉操作 ----

  const openCreate = () => {
    setEditingRecord(null);
    form.resetFields();
    form.setFieldsValue({ auth_type: 'NONE', pagination_type: 'NONE' });
    setDrawerOpen(true);
  };

  const openEdit = (record: any) => {
    setEditingRecord(record);
    form.setFieldsValue({
      channel: record.channel,
      operation_code: record.operation_code,
      operation_name: record.operation_name,
      direction: record.direction,
      http_method: record.http_method,
      http_path: record.http_path,
      auth_type: record.auth_type,
      pagination_type: record.pagination_type,
      target_business_entity: record.target_business_entity,
      source_business_entity: record.source_business_entity,
      api_entity_type: record.api_entity_type,
      auth_config: record.auth_config ? JSON.stringify(record.auth_config, null, 2) : '',
    });
    setDrawerOpen(true);
  };

  const closeDrawer = () => {
    setDrawerOpen(false);
    setEditingRecord(null);
    form.resetFields();
  };

  const handleSubmit = async (values: any) => {
    try {
      // 解析 auth_config 从 JSON 字符串
      let authConfig = undefined;
      if (values.auth_config && values.auth_config.trim()) {
        try {
          authConfig = JSON.parse(values.auth_config);
        } catch {
          message.error('认证配置 JSON 格式错误');
          return;
        }
      }

      const payload = {
        ...values,
        auth_config: authConfig,
      };

      if (editingRecord) {
        await api.put(`/admin/api-operations/${editingRecord.id}`, payload);
        message.success('API 操作已更新');
      } else {
        await api.post('/admin/api-operations', payload);
        message.success('API 操作已创建');
      }
      closeDrawer();
      fetch();
    } catch (e: any) {
      message.error(e.response?.data?.message || '保存失败');
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await api.delete(`/admin/api-operations/${id}`);
      message.success('已删除');
      fetch();
    } catch (e: any) {
      message.error(e.response?.data?.message || '删除失败');
    }
  };

  // ---- 表格列定义 ----

  const columns = [
    {
      title: '操作编码', dataIndex: 'operation_code', width: 160,
      render: (v: string) => <Text code style={{ fontSize: 11 }}>{v}</Text>,
    },
    {
      title: '操作名称', dataIndex: 'operation_name', width: 140,
      ellipsis: true,
    },
    {
      title: '方向', dataIndex: 'direction', width: 100,
      render: (v: string) => (
        <Tag color={DIRECTION_COLORS[v] || 'default'} style={{ fontSize: 10 }}>
          {v === 'INBOUND' ? '← 入站' : '→ 出站'}
        </Tag>
      ),
    },
    {
      title: '方法', dataIndex: 'http_method', width: 80,
      render: (v: string) => (
        <Tag color={METHOD_COLORS[v] || 'default'} style={{ fontWeight: 600, fontSize: 10 }}>
          {v}
        </Tag>
      ),
    },
    {
      title: '路径', dataIndex: 'http_path', width: 260,
      ellipsis: true,
      render: (v: string) => (
        <Text style={{ fontFamily: 'monospace', fontSize: 11, color: '#555' }}>{v}</Text>
      ),
    },
    {
      title: '认证', dataIndex: 'auth_type', width: 90,
      render: (v: string) => <Tag style={{ fontSize: 10 }}>{v}</Tag>,
    },
    {
      title: '目标实体', dataIndex: 'target_business_entity', width: 110,
      ellipsis: true,
      render: (v: string) => v ? <Tag color="purple" style={{ fontSize: 10 }}>{v}</Tag> : '-',
    },
    {
      title: '分页', dataIndex: 'pagination_type', width: 80,
      render: (v: string) => v !== 'NONE' ? <Tag style={{ fontSize: 10 }}>{v}</Tag> : '-',
    },
    {
      title: '操作', key: 'actions', width: 200, fixed: 'right' as const,
      render: (_: any, record: any) => (
        <Space>
          <Tooltip title="编辑 API 配置">
            <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(record)} />
          </Tooltip>
          <Tooltip title="字段映射配置">
            <Button
              size="small"
              icon={<LinkOutlined />}
              onClick={() => navigate(`/api-config/${record.id}/mapping`)}
              disabled={!record.target_business_entity && !record.source_business_entity}
            >
              映射
            </Button>
          </Tooltip>
          <Popconfirm title="确定删除该 API 操作？" onConfirm={() => handleDelete(record.id)}>
            <Tooltip title="删除">
              <Button size="small" danger icon={<DeleteOutlined />} />
            </Tooltip>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  // ---- 渲染 ----

  return (
    <div className="campaign-page" style={{ padding: 'var(--campaign-page-padding)', minHeight: 'calc(100vh - 64px)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
        <TitleWithDesc title="API 操作配置" desc="管理入站/出站 API 操作，配置认证、分页和业务实体映射" />
        <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
          新增 API
        </Button>
      </div>

      {/* 筛选栏 */}
      <Card size="small" style={{ marginBottom: 12 }}>
        <Space wrap>
          <Select
            placeholder="筛选渠道"
            allowClear
            style={{ width: 140 }}
            value={filterChannel}
            onChange={setFilterChannel}
            options={[
              { label: 'TMALL', value: 'TMALL' },
              { label: 'JD', value: 'JD' },
              { label: 'DOUYIN', value: 'DOUYIN' },
              { label: 'WECHAT_MINI', value: 'WECHAT_MINI' },
              { label: 'POS', value: 'POS' },
            ]}
          />
          <Select
            placeholder="筛选方向"
            allowClear
            style={{ width: 140 }}
            value={filterDirection}
            onChange={setFilterDirection}
            options={DIRECTION_OPTIONS}
          />
          <Select
            placeholder="筛选方法"
            allowClear
            style={{ width: 120 }}
            value={filterMethod}
            onChange={setFilterMethod}
            options={HTTP_METHOD_OPTIONS}
          />
          <Button icon={<ReloadOutlined />} onClick={fetch}>刷新</Button>
        </Space>
      </Card>

      {/* 数据表格 */}
      <Table
        dataSource={operations}
        columns={columns}
        loading={loading}
        rowKey="id"
        size="small"
        pagination={{ pageSize: 20, showSizeChanger: true, showTotal: (t) => `共 ${t} 条` }}
        scroll={{ x: 1300 }}
      />

      {/* 编辑抽屉 */}
      <Drawer
        title={editingRecord ? '编辑 API 操作' : '新增 API 操作'}
        width={520}
        open={drawerOpen}
        onClose={closeDrawer}
        extra={
          <Space>
            <Button onClick={closeDrawer}>取消</Button>
            <Button type="primary" onClick={() => form.submit()}>
              {editingRecord ? '保存' : '创建'}
            </Button>
          </Space>
        }
        destroyOnClose
      >
        <Form form={form} layout="vertical" onFinish={handleSubmit} size="small">
          <Form.Item name="channel" label="渠道" rules={[{ required: true, message: '请选择渠道' }]}>
            <Select
              placeholder="选择渠道"
              options={[
                { label: 'TMALL', value: 'TMALL' },
                { label: 'JD', value: 'JD' },
                { label: 'DOUYIN', value: 'DOUYIN' },
                { label: 'WECHAT_MINI', value: 'WECHAT_MINI' },
                { label: 'POS', value: 'POS' },
              ]}
            />
          </Form.Item>

          <Form.Item
            name="operation_code"
            label="操作编码"
            rules={[{ required: true, message: '请输入操作编码' }]}
            tooltip="唯一标识该 API 操作，如 taobao.trade.get"
          >
            <Input placeholder="如 taobao.trade.get" />
          </Form.Item>

          <Form.Item name="operation_name" label="操作名称">
            <Input placeholder="如 查询交易详情" />
          </Form.Item>

          <Space style={{ width: '100%' }} align="start">
            <Form.Item
              name="direction"
              label="方向"
              rules={[{ required: true }]}
              style={{ width: '50%' }}
            >
              <Select options={DIRECTION_OPTIONS} />
            </Form.Item>
            <Form.Item
              name="http_method"
              label="HTTP 方法"
              rules={[{ required: true }]}
              style={{ width: '50%' }}
            >
              <Select options={HTTP_METHOD_OPTIONS} />
            </Form.Item>
          </Space>

          <Form.Item
            name="http_path"
            label="HTTP 路径"
            rules={[{ required: true, message: '请输入 HTTP 路径' }]}
            tooltip="相对于渠道基地址的路径"
          >
            <Input placeholder="如 /api/trade/get" />
          </Form.Item>

          <Space style={{ width: '100%' }} align="start">
            <Form.Item name="auth_type" label="认证类型" style={{ width: '50%' }}>
              <Select options={AUTH_TYPE_OPTIONS} />
            </Form.Item>
            <Form.Item name="pagination_type" label="分页类型" style={{ width: '50%' }}>
              <Select options={PAGINATION_OPTIONS} />
            </Form.Item>
          </Space>

          <Form.Item name="auth_config" label="认证配置 (JSON)">
            <Input.TextArea
              rows={3}
              placeholder='{"app_key":"xxx","app_secret":"xxx"}'
              style={{ fontFamily: 'monospace', fontSize: 11 }}
            />
          </Form.Item>

          <Space style={{ width: '100%' }} align="start">
            <Form.Item name="target_business_entity" label="目标业务实体" style={{ width: '50%' }}>
              <Select
                allowClear
                placeholder="选择目标实体"
                options={entityTypes.map((e: any) => ({
                  label: e.label,
                  value: e.entityType,
                }))}
              />
            </Form.Item>
            <Form.Item name="source_business_entity" label="源业务实体" style={{ width: '50%' }}>
              <Select
                allowClear
                placeholder="选择源实体"
                options={entityTypes.map((e: any) => ({
                  label: e.label,
                  value: e.entityType,
                }))}
              />
            </Form.Item>
          </Space>

          <Form.Item name="api_entity_type" label="API 实体类型" tooltip="API 请求/响应实体名称">
            <Input placeholder="如 api_trade_response" />
          </Form.Item>
        </Form>
      </Drawer>
    </div>
  );
};

export default ApiConfig;
