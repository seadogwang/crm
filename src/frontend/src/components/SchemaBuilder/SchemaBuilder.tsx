import React, { useState, useCallback, useMemo, useEffect } from 'react';
import {
  Button, Card, Space, message, Input, Switch, Form, Tag, Tooltip, Alert,
  Steps, Result, Descriptions, Badge, Drawer, Typography,
} from 'antd';
import {
  DeleteOutlined, SaveOutlined, DragOutlined,
  ExclamationCircleOutlined, CodeOutlined, EyeOutlined,
  CheckCircleOutlined, SendOutlined, ArrowRightOutlined,
  ReloadOutlined,
} from '@ant-design/icons';
import { DndProvider, useDrag, useDrop } from 'react-dnd';
import { HTML5Backend } from 'react-dnd-html5-backend';
import type { FieldSchema, JsonSchema, ComponentRegistryEntry } from '../../types';
import { checkFieldDeprecation, saveSchema, getSchema } from '../../api';

const { Text, Title, Paragraph } = Typography;

// ==================== 组件注册表 ====================
const COMPONENT_REGISTRY: ComponentRegistryEntry[] = [
  { name: 'Input', label: '文本输入', category: 'basic', defaultSchema: { title: '新字段', type: 'string', 'x-component': 'Input' } },
  { name: 'NumberPicker', label: '数字选择', category: 'basic', defaultSchema: { title: '新字段', type: 'number', 'x-component': 'NumberPicker' } },
  { name: 'Select', label: '下拉选择', category: 'basic', defaultSchema: { title: '新字段', type: 'string', 'x-component': 'Select', enum: [{ label: '选项1', value: 'opt1' }] } },
  { name: 'Switch', label: '开关', category: 'basic', defaultSchema: { title: '新字段', type: 'boolean', 'x-component': 'Switch' } },
  { name: 'DatePicker', label: '日期选择', category: 'basic', defaultSchema: { title: '新字段', type: 'string', 'x-component': 'DatePicker' } },
  { name: 'ImageUploader', label: '图片上传', category: 'advanced', defaultSchema: { title: '新字段', type: 'string', 'x-component': 'ImageUploader' } },
  { name: 'CascadingAddress', label: '级联地址', category: 'advanced', defaultSchema: { title: '新字段', type: 'string', 'x-component': 'CascadingAddress' } },
  { name: 'CustomStoreSelector', label: '门店选择器', category: 'custom', defaultSchema: { title: '新字段', type: 'string', 'x-component': 'CustomStoreSelector', 'x-component-props': { source: 'remote', endpoint: '/api/stores' } } },
];

const DRAG_TYPE = 'FIELD_PALETTE_ITEM';

/**
 * 🎯 完整操作流程：
 *
 *   步骤 1: 拖拽组件 → 配置字段属性
 *   步骤 2: 点击「保存并发布」→ 写入后端 /api/schemas/MEMBER
 *   步骤 3: 去「动态渲染器」标签页 → 打开会员 → 看到新的表单字段
 */

// ==================== 字段面板（左栏） ====================
const FieldPalette: React.FC = () => {
  const categories = useMemo(() => {
    const map = new Map<string, ComponentRegistryEntry[]>();
    for (const entry of COMPONENT_REGISTRY) {
      const list = map.get(entry.category) || [];
      list.push(entry);
      map.set(entry.category, list);
    }
    return map;
  }, []);

  const categoryLabels: Record<string, string> = {
    basic: '基础组件', advanced: '高级组件', custom: '自定义组件',
  };

  return (
    <Card title="组件面板" size="small" style={{ height: '100%' }}>
      {[...categories.entries()].map(([category, entries]) => (
        <div key={category} style={{ marginBottom: 16 }}>
          <Text type="secondary" style={{ fontSize: 11, display: 'block', marginBottom: 6 }}>
            {categoryLabels[category]}
          </Text>
          {entries.map((entry) => (
            <DraggableFieldItem key={entry.name} entry={entry} />
          ))}
        </div>
      ))}
    </Card>
  );
};

const DraggableFieldItem: React.FC<{ entry: ComponentRegistryEntry }> = ({ entry }) => {
  const [{ isDragging }, dragRef] = useDrag(() => ({
    type: DRAG_TYPE,
    item: { ...entry },
    collect: (monitor) => ({ isDragging: monitor.isDragging() }),
  }), [entry]);

  return (
    <div
      ref={dragRef}
      style={{
        padding: '6px 12px', marginBottom: 4, borderRadius: 4,
        background: isDragging ? '#e6f7ff' : '#f5f5f5',
        cursor: 'grab', opacity: isDragging ? 0.5 : 1,
        display: 'flex', alignItems: 'center', gap: 8,
        border: '1px solid #d9d9d9',
      }}
    >
      <DragOutlined /> {entry.label}
    </div>
  );
};

// ==================== 设计画布（中栏） ====================
interface DesignCanvasProps {
  schema: JsonSchema;
  onChange: (schema: JsonSchema) => void;
}

const DesignCanvas: React.FC<DesignCanvasProps> = ({ schema, onChange }) => {
  const [editingKey, setEditingKey] = useState<string | null>(null);

  const [{ isOver }, dropRef] = useDrop(() => ({
    accept: DRAG_TYPE,
    drop: (item: ComponentRegistryEntry) => {
      const key = `field_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
      onChange({
        ...schema,
        properties: {
          ...schema.properties,
          [key]: { ...item.defaultSchema, title: `${item.label}_${Object.keys(schema.properties).length + 1}` },
        },
      });
      message.success(`已添加字段: ${item.label}`);
    },
    collect: (monitor) => ({ isOver: monitor.isOver() }),
  }), [schema, onChange]);

  const fields = Object.entries(schema.properties);

  const updateField = useCallback((key: string, updates: Partial<FieldSchema>) => {
    onChange({ ...schema, properties: { ...schema.properties, [key]: { ...schema.properties[key], ...updates } } });
  }, [schema, onChange]);

  const removeField = useCallback(async (key: string) => {
    const check = await checkFieldDeprecation('MEMBER', key).catch(() => null);
    if (check && !check.safe_to_deprecate) {
      message.warning(`字段被规则引用，已标记为废弃而非删除`);
    }
    onChange({
      ...schema,
      properties: { ...schema.properties, [key]: { ...schema.properties[key], deprecated: true, deprecated_at: new Date().toISOString() } },
    });
    message.info(`字段已标记为废弃`);
  }, [schema, onChange]);

  return (
    <div
      ref={dropRef}
      style={{
        minHeight: 400, padding: 16, borderRadius: 8,
        background: isOver ? '#f0f5ff' : '#fafafa',
        border: `2px dashed ${isOver ? '#1677ff' : '#d9d9d9'}`,
      }}
    >
      {fields.length === 0 && (
        <div style={{ textAlign: 'center', color: '#999', padding: 80 }}>
          <DragOutlined style={{ fontSize: 40 }} />
          <p style={{ marginTop: 16, fontSize: 16 }}>👈 从左侧拖拽组件到这里</p>
          <p style={{ fontSize: 13, color: '#bbb' }}>例如：拖一个"文本输入"作为"宠物名称"字段</p>
        </div>
      )}

      {fields.map(([key, field]) => (
        <div
          key={key}
          style={{
            padding: 12, marginBottom: 8, borderRadius: 6,
            background: field.deprecated ? '#fff7e6' : '#fff',
            border: `1px solid ${field.deprecated ? '#faad14' : '#e8e8e8'}`,
            opacity: field.deprecated ? 0.7 : 1,
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>
              <strong>{field.title}</strong>
              <Tag style={{ marginLeft: 8 }} color="blue">{field['x-component'] || field.type}</Tag>
              {field.required && <Tag color="red">必填</Tag>}
              {field.deprecated && <Tag color="orange">已废弃</Tag>}
            </span>
            <Space>
              <Button size="small" onClick={() => setEditingKey(key === editingKey ? null : key)}>
                {key === editingKey ? '收起' : '配置'}
              </Button>
              <Button size="small" danger icon={<DeleteOutlined />} onClick={() => removeField(key)} />
            </Space>
          </div>

          {editingKey === key && (
            <div style={{ marginTop: 12, padding: 12, background: '#fafafa', borderRadius: 4 }}>
              <Form layout="vertical" size="small">
                <Form.Item label="字段标题">
                  <Input value={field.title} onChange={(e) => updateField(key, { title: e.target.value })} />
                </Form.Item>
                <Form.Item label="必填">
                  <Switch checked={field.required} onChange={(v) => updateField(key, { required: v })} />
                </Form.Item>
                <Form.Item label="联动表达式 (可选)">
                  <Input.TextArea
                    rows={2}
                    value={field['x-reactions'] || ''}
                    onChange={(e) => updateField(key, { 'x-reactions': e.target.value || undefined })}
                    placeholder='{{ $self.visible = ($deps[0] === "dog") }}'
                  />
                </Form.Item>
              </Form>
            </div>
          )}
        </div>
      ))}
    </div>
  );
};

// ==================== 主组件 ====================
export interface SchemaBuilderProps {
  entityType?: string;
  onPublished?: () => void;
}

const SchemaBuilder: React.FC<SchemaBuilderProps> = ({ entityType = 'MEMBER', onPublished }) => {
  const [schema, setSchema] = useState<JsonSchema>({ type: 'object', properties: {} });
  const [currentVersion, setCurrentVersion] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [published, setPublished] = useState(false);
  const [showJson, setShowJson] = useState(false);
  const [loadingSchema, setLoadingSchema] = useState(true);

  // 加载当前生效的 Schema
  useEffect(() => {
    getSchema(entityType).then(data => {
      if (data?.schema) {
        setSchema(data.schema);
        setCurrentVersion(data.version);
      }
    }).catch(() => {}).finally(() => setLoadingSchema(false));
  }, [entityType]);

  const handlePublish = useCallback(async () => {
    setSaving(true);
    try {
      await saveSchema(entityType, schema);
      setPublished(true);
      setCurrentVersion(`v${Date.now()}`);
      message.success('Schema 已保存并发布！');
      onPublished?.();
    } catch (e: unknown) {
      message.error(e instanceof Error ? e.message : '发布失败');
    } finally {
      setSaving(false);
    }
  }, [schema, entityType, onPublished]);

  const fieldCount = Object.keys(schema.properties).length;
  const deprecatedCount = Object.values(schema.properties).filter(f => f.deprecated).length;

  return (
    <DndProvider backend={HTML5Backend}>
      {/* ====== 顶部操作流程指引 ====== */}
      <div style={{ padding: '16px 16px 0 16px' }}>
        <Card size="small" style={{ background: '#f6ffed', border: '1px solid #b7eb8f' }}>
          <Steps
            size="small"
            current={fieldCount > 0 ? (published ? 2 : 1) : 0}
            items={[
              {
                title: '拖拽字段',
                description: '从左侧组件面板把需要的字段拖入画布',
              },
              {
                title: '保存并发布',
                description: published ? '✅ 已发布' : '点击下方「保存并发布 Schema」',
              },
              {
                title: '去渲染器查看效果',
                description: '切换到「动态渲染器」标签，打开会员即可看到新字段',
              },
            ]}
          />
        </Card>
      </div>

      {/* ====== 主区域 ====== */}
      <div style={{ display: 'flex', gap: 16, padding: 16 }}>
        {/* 左栏：组件面板 */}
        <div style={{ width: 200, flexShrink: 0 }}>
          <FieldPalette />
        </div>

        {/* 中栏：设计画布 */}
        <div style={{ flex: 1 }}>
          <Card
            title={
              <Space>
                <span>会员属性 Schema 设计器</span>
                {currentVersion && <Tag color="green">{currentVersion}</Tag>}
              </Space>
            }
            extra={
              <Space>
                <Badge count={fieldCount} overflowCount={99}>
                  <Tag>字段数</Tag>
                </Badge>
                {deprecatedCount > 0 && <Tag color="orange">{deprecatedCount} 个废弃</Tag>}
                <Button icon={<CodeOutlined />} onClick={() => setShowJson(!showJson)}>
                  {showJson ? '隐藏' : '查看'} JSON
                </Button>
              </Space>
            }
          >
            {loadingSchema ? (
              <div style={{ textAlign: 'center', padding: 40 }}>加载中...</div>
            ) : showJson ? (
              <pre style={{ background: '#1e1e1e', color: '#d4d4d4', padding: 16, borderRadius: 8, overflow: 'auto', maxHeight: 500, fontSize: 12 }}>
                {JSON.stringify(schema, null, 2)}
              </pre>
            ) : (
              <DesignCanvas schema={schema} onChange={setSchema} />
            )}
          </Card>

          {/* ====== 发布按钮 ====== */}
          <div style={{ marginTop: 16, textAlign: 'center' }}>
            {published ? (
              <Result
                status="success"
                title="发布成功！"
                subTitle={
                  <span>
                    当前 Schema 版本 <Tag>{currentVersion}</Tag> 已生效。<br />
                    现在去 <Text code>动态渲染器</Text> 标签页打开会员，即可看到新字段。
                  </span>
                }
                extra={[
                  <Button key="again" icon={<ReloadOutlined />} onClick={() => setPublished(false)}>
                    继续编辑
                  </Button>,
                  <Button key="renderer" type="primary" icon={<EyeOutlined />}
                    onClick={() => {
                      const tabEvent = new CustomEvent('switchTab', { detail: 'renderer' });
                      window.dispatchEvent(tabEvent);
                    }}
                  >
                    去动态渲染器查看效果
                  </Button>,
                ]}
              />
            ) : (
              <Button
                type="primary"
                size="large"
                icon={<SendOutlined />}
                onClick={handlePublish}
                loading={saving}
                disabled={fieldCount === 0}
                style={{ minWidth: 200 }}
              >
                {fieldCount === 0 ? '请先拖拽字段到画布' : `保存并发布 Schema（${fieldCount} 个字段）`}
              </Button>
            )}
          </div>

          {deprecatedCount > 0 && (
            <Alert
              style={{ marginTop: 12 }}
              message={`${deprecatedCount} 个字段已废弃`}
              description="废弃字段不会被物理删除，仅在只读模式下查看，编辑模式下自动隐藏。"
              type="warning" showIcon icon={<ExclamationCircleOutlined />}
            />
          )}
        </div>
      </div>
    </DndProvider>
  );
};

export default SchemaBuilder;