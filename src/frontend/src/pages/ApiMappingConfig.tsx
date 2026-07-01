import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Card, Typography, Tag, Button, Space, Spin, message, Descriptions,
  Table, Empty, Select, Input, Tooltip, Popconfirm, Alert, Divider, Result,
} from 'antd';
import {
  ArrowRightOutlined, SaveOutlined, ReloadOutlined,
  ApiOutlined, DatabaseOutlined, PlusOutlined, DeleteOutlined,
} from '@ant-design/icons';
import { useCampaignStyles, TitleWithDesc, CampaignCard } from './campaign/styles/campaign-ui-standard';
import api from '../api';

const { Text, Title } = Typography;

// ==================== 类型 ====================

interface ApiOperation {
  id: number;
  channel: string;
  operation_code: string;
  operation_name: string;
  direction: string;
  http_method: string;
  http_path: string;
  target_business_entity: string | null;
  source_business_entity: string | null;
  [key: string]: any;
}

interface SchemaField {
  key: string;
  type: string;
  title: string;
  required?: boolean;
  description?: string;
  format?: string;
  children?: SchemaField[];
}

interface MappingRule {
  id: string;
  sourceField: string;
  targetField: string;
  transformExpr: string;
}

// ==================== 组件 ====================

const ApiMappingConfig: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [apiOp, setApiOp] = useState<ApiOperation | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [schemaFields, setSchemaFields] = useState<SchemaField[]>([]);
  const [schemaLoading, setSchemaLoading] = useState(false);
  const [mappings, setMappings] = useState<MappingRule[]>([]);
  const [saving, setSaving] = useState(false);

  // 自定义源字段（当 API 实体类型未定义时，手动输入）
  const [customSourceFields, setCustomSourceFields] = useState<string[]>([]);
  const [newFieldName, setNewFieldName] = useState('');

  // ---- 加载 API 操作详情 ----
  const fetchApiOperation = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data } = await api.get(`/admin/api-operations/${id}`);
      const op = data?.data;
      if (!op) {
        setError('API 操作不存在');
        return;
      }
      setApiOp(op);
      return op;
    } catch (e: any) {
      setError(e.message || '加载失败');
    } finally {
      setLoading(false);
    }
  }, [id]);

  // ---- 加载目标业务实体 Schema ----
  const loadEntitySchema = useCallback(async (entityType: string) => {
    if (!entityType) return;
    setSchemaLoading(true);
    try {
      const { data } = await api.get(`/schemas/${entityType}`);
      const schema = data?.data?.schema || data?.data;
      if (schema?.properties) {
        const fields = parseSchemaToFields(schema);
        setSchemaFields(fields);
      } else {
        setSchemaFields([]);
      }
    } catch {
      setSchemaFields([]);
    } finally {
      setSchemaLoading(false);
    }
  }, []);

  // ---- 加载已有映射配置 ----
  const loadExistingMappings = useCallback(async (op: ApiOperation) => {
    try {
      const key = op.direction === 'INBOUND' ? 'inbound_mappings' : 'outbound_mappings';
      const { data } = await api.get(`/admin/channels`);
      const channels = data?.data || [];
      const channelConfig = channels.find((c: any) => c.channel === op.channel);
      if (channelConfig?.[key]) {
        const existing = channelConfig[key][op.operation_code];
        if (Array.isArray(existing) && existing.length > 0) {
          setMappings(existing.map((m: any, i: number) => ({
            id: `map_${i}`,
            sourceField: m.source || '',
            targetField: m.target || '',
            transformExpr: m.transform || '',
          })));
        }
      }
    } catch {
      // 静默
    }
  }, []);

  useEffect(() => {
    fetchApiOperation().then((op) => {
      if (op) {
        const targetEntity = op.target_business_entity || op.source_business_entity;
        if (targetEntity) {
          loadEntitySchema(targetEntity);
        }
        loadExistingMappings(op);
      }
    });
  }, [fetchApiOperation, loadEntitySchema, loadExistingMappings]);

  // ---- 添加映射规则 ----
  const addMapping = () => {
    const newRule: MappingRule = {
      id: `map_${Date.now()}`,
      sourceField: '',
      targetField: '',
      transformExpr: '',
    };
    setMappings([...mappings, newRule]);
  };

  const updateMapping = (id: string, key: keyof MappingRule, value: string) => {
    setMappings(mappings.map(m => m.id === id ? { ...m, [key]: value } : m));
  };

  const deleteMapping = (id: string) => {
    setMappings(mappings.filter(m => m.id !== id));
  };

  // ---- 添加自定义源字段 ----
  const addCustomField = () => {
    if (newFieldName.trim() && !customSourceFields.includes(newFieldName.trim())) {
      setCustomSourceFields([...customSourceFields, newFieldName.trim()]);
      setNewFieldName('');
    }
  };

  // ---- 保存映射 ----
  const handleSave = async () => {
    if (!apiOp) return;
    setSaving(true);
    try {
      const key = apiOp.direction === 'INBOUND' ? 'inbound_mappings' : 'outbound_mappings';

      // 构建映射数据
      const mappingData: any = {};
      mappingData[apiOp.operation_code] = mappings.map(m => ({
        source: m.sourceField,
        target: m.targetField,
        transform: m.transformExpr || undefined,
      }));

      // 通过 ChannelAdapterConfig 保存映射
      const { data } = await api.put('/admin/channels', {
        channel: apiOp.channel,
        [key]: mappingData,
      });

      message.success('映射配置已保存');
    } catch (e: any) {
      message.error(e.response?.data?.message || '保存失败');
    } finally {
      setSaving(false);
    }
  };

  // ---- Schema 字段展平 ----
  function parseSchemaToFields(schema: any, prefix = ''): SchemaField[] {
    if (!schema?.properties) return [];
    const r: SchemaField[] = [];
    for (const [key, val] of Object.entries(schema.properties) as [string, any][]) {
      const fieldKey = prefix ? `${prefix}.${key}` : key;
      r.push({
        key: fieldKey,
        type: val.type || 'string',
        title: val.title || val.description || key,
        required: schema.required?.includes(key),
        description: val.description,
        format: val.format,
      });
      if (val.type === 'object' && val.properties) {
        r.push(...parseSchemaToFields(val, fieldKey));
      }
      if (val.type === 'array' && val.items?.properties) {
        r.push({
          key: fieldKey + '[]',
          type: 'array',
          title: (val.title || key) + ' (数组)',
        });
      }
    }
    return r;
  }

  // ---- 渲染 ----

  if (loading) {
    return <Spin style={{ display: 'flex', justifyContent: 'center', padding: 80 }} />;
  }

  if (error) {
    return (
      <Result
        status="error"
        title="加载失败"
        subTitle={error}
        extra={<Button type="primary" icon={<ReloadOutlined />} onClick={fetchApiOperation}>重试</Button>}
      />
    );
  }

  if (!apiOp) {
    return <Empty description="API 操作不存在" />;
  }

  const targetEntity = apiOp.target_business_entity || apiOp.source_business_entity;

  return (
    <div className="campaign-page" style={{ padding: 'var(--campaign-page-padding)', minHeight: 'calc(100vh - 64px)' }}>
      {/* 头部信息卡片 */}
      <Card size="small" style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <TitleWithDesc title="字段映射配置" desc="配置 API 字段与业务实体字段之间的映射关系和转换表达式" />
            <Descriptions size="small" column={4} style={{ marginTop: 12 }}>
              <Descriptions.Item label="操作编码">
                <Text code>{apiOp.operation_code}</Text>
              </Descriptions.Item>
              <Descriptions.Item label="方向">
                <Tag color={apiOp.direction === 'INBOUND' ? 'cyan' : 'geekblue'}>
                  {apiOp.direction === 'INBOUND' ? '← 入站' : '→ 出站'}
                </Tag>
              </Descriptions.Item>
              <Descriptions.Item label="HTTP">
                <Tag color="blue">{apiOp.http_method}</Tag>
                <Text style={{ fontFamily: 'monospace', fontSize: 12 }}>{apiOp.http_path}</Text>
              </Descriptions.Item>
              <Descriptions.Item label="渠道">
                <Tag>{apiOp.channel}</Tag>
              </Descriptions.Item>
              <Descriptions.Item label="API 名称">{apiOp.operation_name || '-'}</Descriptions.Item>
              <Descriptions.Item label="目标实体">
                {targetEntity ? (
                  <Tag color="purple"><DatabaseOutlined /> {targetEntity}</Tag>
                ) : (
                  <Text type="secondary">未关联</Text>
                )}
              </Descriptions.Item>
            </Descriptions>
          </div>
          <Space>
            <Button icon={<ReloadOutlined />} onClick={() => fetchApiOperation()}>刷新</Button>
            <Button type="primary" icon={<SaveOutlined />} onClick={handleSave} loading={saving}>
              保存映射
            </Button>
          </Space>
        </div>
      </Card>

      {!targetEntity && (
        <Alert
          type="warning"
          message="未关联业务实体"
          description="请先在 API 配置中关联目标或源业务实体，才能配置字段映射。"
          showIcon
          action={
            <Button size="small" onClick={() => navigate(`/api-config`)}>
              返回配置
            </Button>
          }
          style={{ marginBottom: 16 }}
        />
      )}

      {/* 映射配置区 */}
      <div style={{ display: 'flex', gap: 16 }}>
        {/* 左侧：源字段 */}
        <Card
          size="small"
          title={
            <Space>
              <ApiOutlined />
              <Text strong>源字段（API {apiOp.direction === 'INBOUND' ? '响应' : '请求'}）</Text>
            </Space>
          }
          style={{ flex: 1 }}
        >
          {apiOp.api_entity_type ? (
            // TODO: 如果有 api_entity_type，从 Schema 加载
            <Text type="secondary">API 实体类型: {apiOp.api_entity_type}</Text>
          ) : (
            <div>
              <Text type="secondary" style={{ display: 'block', marginBottom: 8, fontSize: 12 }}>
                手动定义源字段（API 的字段名）
              </Text>
              <Space style={{ marginBottom: 8 }}>
                <Input
                  size="small"
                  value={newFieldName}
                  onChange={(e) => setNewFieldName(e.target.value)}
                  placeholder="输入字段名"
                  onPressEnter={addCustomField}
                  style={{ width: 160 }}
                />
                <Button size="small" icon={<PlusOutlined />} onClick={addCustomField}>
                  添加
                </Button>
              </Space>
              <div>
                {customSourceFields.map((f, i) => (
                  <Tag
                    key={i}
                    closable
                    onClose={() => setCustomSourceFields(customSourceFields.filter((_, idx) => idx !== i))}
                    style={{ marginBottom: 4 }}
                  >
                    {f}
                  </Tag>
                ))}
                {customSourceFields.length === 0 && (
                  <Text type="secondary" style={{ fontSize: 11 }}>暂无自定义字段</Text>
                )}
              </div>
            </div>
          )}
        </Card>

        {/* 中间：映射规则列表 */}
        <Card
          size="small"
          title={
            <Space>
              <ArrowRightOutlined style={{ color: '#1677ff' }} />
              <Text strong>字段映射</Text>
              <Button size="small" type="dashed" icon={<PlusOutlined />} onClick={addMapping}>
                添加映射
              </Button>
            </Space>
          }
          style={{ flex: 2 }}
        >
          {mappings.length === 0 ? (
            <Empty
              description="暂无映射规则"
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              style={{ margin: '20px 0' }}
            />
          ) : (
            <div>
              {/* 表头 */}
              <div style={{
                display: 'flex', gap: 8, padding: '4px 0', marginBottom: 8,
                borderBottom: '1px solid #f0f0f0',
              }}>
                <Text strong style={{ flex: 1, fontSize: 11, color: '#666' }}>API 字段 (源)</Text>
                <Text strong style={{ flex: 1, fontSize: 11, color: '#666' }}>业务实体字段 (目标)</Text>
                <Text strong style={{ flex: 1, fontSize: 11, color: '#666' }}>转换表达式 (可选)</Text>
                <div style={{ width: 32 }} />
              </div>

              {mappings.map((m) => (
                <div key={m.id} style={{
                  display: 'flex', gap: 8, marginBottom: 6, alignItems: 'center',
                }}>
                  {/* 源字段：手动输入 + 从自定义字段选择 */}
                  <Select
                    size="small"
                    style={{ flex: 1 }}
                    value={m.sourceField || undefined}
                    onChange={(v) => updateMapping(m.id, 'sourceField', v)}
                    placeholder="源字段"
                    allowClear
                    options={customSourceFields.map(f => ({ label: f, value: f }))}
                  />

                  <ArrowRightOutlined style={{ color: '#ccc', fontSize: 11 }} />

                  {/* 目标字段：从 Schema 选择 */}
                  <Select
                    size="small"
                    style={{ flex: 1 }}
                    value={m.targetField || undefined}
                    onChange={(v) => updateMapping(m.id, 'targetField', v || '')}
                    placeholder="目标字段"
                    allowClear
                    showSearch
                    filterOption={(input, option) =>
                      (option?.label as string || '').toLowerCase().includes(input.toLowerCase())
                    }
                    options={schemaFields.map(f => ({
                      label: `${f.key} (${f.type})${f.title ? ' - ' + f.title : ''}`,
                      value: f.key,
                    }))}
                  />

                  {/* 转换表达式 */}
                  <Input
                    size="small"
                    style={{ flex: 1 }}
                    value={m.transformExpr}
                    onChange={(e) => updateMapping(m.id, 'transformExpr', e.target.value)}
                    placeholder="如 $.data.order_id"
                  />

                  <Tooltip title="删除映射">
                    <Button
                      size="small"
                      type="text"
                      danger
                      icon={<DeleteOutlined />}
                      onClick={() => deleteMapping(m.id)}
                      style={{ width: 32 }}
                    />
                  </Tooltip>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      {/* 底部：目标实体字段结构（参考） */}
      <Divider orientation="left" style={{ fontSize: 12, color: '#999' }}>
        <DatabaseOutlined /> 目标实体字段结构（参考）
      </Divider>
      {schemaLoading ? (
        <Spin size="small" />
      ) : schemaFields.length > 0 ? (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {schemaFields.map((f) => (
            <Tooltip key={f.key} title={`${f.title}${f.description ? ' - ' + f.description : ''}`}>
              <Tag style={{ cursor: 'pointer', fontSize: 10 }}>
                {f.key}
                <Text style={{ fontSize: 9, color: '#999', marginLeft: 4 }}>({f.type})</Text>
                {f.required && <Text type="danger" style={{ fontSize: 9 }}>*</Text>}
              </Tag>
            </Tooltip>
          ))}
        </div>
      ) : (
        <Text type="secondary" style={{ fontSize: 11 }}>
          {targetEntity ? '该实体暂无 Schema 定义，请在 Schema 编辑器中定义' : '未关联业务实体'}
        </Text>
      )}
    </div>
  );
};

export default ApiMappingConfig;
