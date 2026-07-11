import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { createForm, onFormValuesChange } from '@formily/core';
import { FormProvider, createSchemaField } from '@formily/react';
import {
  FormItem, Input, NumberPicker, Select, Switch, DatePicker,
  FormLayout, FormButtonGroup, Submit,
} from '@formily/antd-v5';
import { Button, Card, Tag, Alert, Collapse, Space, Spin, Empty, Badge, message } from 'antd';
import { ExclamationCircleOutlined, EditOutlined, EyeOutlined, HistoryOutlined } from '@ant-design/icons';
import type { JsonSchema, FieldSchema, MemberData, RenderMode } from '../../types';
import { getSchema, getMember, updateMember, checkFieldDeprecation } from '../../api';

// ==================== Formily 组件注册 ====================
/** Formily 原生支持的组件列表 */
const BUILTIN_COMPONENTS: Record<string, React.FC<any>> = {
  Input, NumberPicker, Select, Switch, DatePicker,
};

/**
 * 动态注册自定义组件（可在此扩展）。
 * 设计文档 8.2.1 节：支持 Program 级别扩充自定义 x-component。
 */
const registerCustomComponent = (name: string, component: React.FC<any>) => {
  BUILTIN_COMPONENTS[name] = component;
};

// Formily SchemaField —— 动态解析 x-component
const SchemaField = createSchemaField({
  components: BUILTIN_COMPONENTS,
  scope: {},
});

// ==================== 主组件 ====================
export interface DynamicRendererProps {
  programCode: string;
  memberId: number;
  mode?: RenderMode;
  onSaved?: () => void;
}

const DynamicRenderer: React.FC<DynamicRendererProps> = ({
  programCode, memberId, mode: initialMode = 'view', onSaved,
}) => {
  const [loading, setLoading] = useState(true);
  const [schema, setSchema] = useState<JsonSchema | null>(null);
  const [memberData, setMemberData] = useState<MemberData | null>(null);
  const [mode, setMode] = useState<RenderMode>(initialMode);
  const [saving, setSaving] = useState(false);
  const [showDeprecated, setShowDeprecated] = useState(false);

  const form = useMemo(() => createForm({
    validateFirst: true,
    effects() {
      onFormValuesChange((formInstance) => {
        console.debug('[DynamicRenderer] Form values changed:', formInstance.values);
      });
    },
  }), []);

  // 加载 Schema 和会员数据
  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const [schemaData, memberData] = await Promise.all([
          getSchema('MEMBER').catch(() => null),
          getMember(memberId).catch(() => null),
        ]);
        const ext = (memberData && typeof memberData === 'object' && 'ext_attributes' in memberData)
          ? (memberData as any).ext_attributes : {};
        if (schemaData && typeof schemaData === 'object' && 'schema' in schemaData) {
          setSchema((schemaData as any).schema);
        }
        if (memberData) setMemberData(memberData as any);
        form.setValues(ext || {});
      } catch (e) {
        console.error('[DynamicRenderer] 加载失败:', e);
      } finally {
        setLoading(false);
      }
    })();
  }, [programCode, memberId, form]);

  // 判断是否为历史版本
  const isDataVersionOutdated = useMemo(() => {
    if (!memberData || !schema) return false;
    const ext = (memberData as any).ext_attributes;
    const dataVersion = ext?._schema_version || (memberData as any).schema_version;
    return dataVersion && (schema as any).version && dataVersion !== (schema as any).version;
  }, [memberData, schema]);

  // 分隔活跃和废弃字段
  const { activeFields, deprecatedFields } = useMemo(() => {
    if (!schema || !schema.properties) return { activeFields: {}, deprecatedFields: {} };
    const active: Record<string, FieldSchema> = {};
    const deprecated: Record<string, FieldSchema> = {};
    for (const [key, field] of Object.entries(schema.properties || {})) {
      if (field.deprecated) {
        deprecated[key] = field;
      } else {
        active[key] = field;
      }
    }
    return { activeFields: active, deprecatedFields: deprecated };
  }, [schema]);

  // 编辑模式下只显示活跃字段
  const effectiveSchema: JsonSchema | null = useMemo(() => {
    if (!schema) return null;
    return {
      type: 'object',
      properties: mode === 'edit' ? activeFields : { ...activeFields, ...deprecatedFields },
    };
  }, [schema, mode, activeFields, deprecatedFields]);

  const handleSubmit = useCallback(async () => {
    try {
      await form.validate();
      setSaving(true);
      const values = form.values;
      await updateMember(memberId, values);
      message.success('会员数据已更新');
      setMode('view');
      onSaved?.();
    } catch (e: unknown) {
      console.error('[DynamicRenderer] 保存失败:', e);
    } finally {
      setSaving(false);
    }
  }, [form, memberId, onSaved]);

  if (loading) return <Spin tip="加载中..." style={{ display: 'block', padding: 60 }} />;
  if (!schema || !memberData) return <Empty description="无法加载数据" />;

  return (
    <div>
      {/* 版本过期提示 */}
      {isDataVersionOutdated && (
        <Alert
          style={{ marginBottom: 16 }}
          message="数据版本已过期"
          description={
            <span>
              当前存储数据版本: <Tag>{memberData.ext_attributes?._schema_version as string || memberData.schema_version}</Tag>
              ，最新 Schema 版本: <Tag color="blue">{schema.version}</Tag>
              。可点击「升级到最新版本」迁移数据结构。
            </span>
          }
          type="warning"
          showIcon
          action={<Button size="small">升级到最新版本</Button>}
        />
      )}

      {/* 模式切换 */}
      <Card
        title={
          <Space>
            <span>{mode === 'view' ? '会员详情' : '编辑会员'}</span>
            <Tag>{memberData.status}</Tag>
            {memberData.tier_code && <Tag color="gold">{memberData.tier_code}</Tag>}
          </Space>
        }
        extra={
          <Space>
            <Badge count={Object.keys(deprecatedFields).length} size="small" offset={[4, -4]}>
              <Button
                icon={<HistoryOutlined />}
                onClick={() => setShowDeprecated(!showDeprecated)}
              >
                历史遗留字段
              </Button>
            </Badge>
            <Button
              type={mode === 'edit' ? 'primary' : 'default'}
              icon={mode === 'edit' ? <EyeOutlined /> : <EditOutlined />}
              onClick={() => setMode(mode === 'edit' ? 'view' : 'edit')}
            >
              {mode === 'edit' ? '切换为只读' : '编辑'}
            </Button>
          </Space>
        }
      >
        <FormProvider form={form}>
          <FormLayout labelCol={4} wrapperCol={16}>
            {effectiveSchema && (
              <SchemaField schema={effectiveSchema as any} />
            )}
          </FormLayout>

          {mode === 'edit' && (
            <FormButtonGroup align="right" style={{ marginTop: 24 }}>
              <Button onClick={() => { form.reset(); setMode('view'); }}>取消</Button>
              <Button type="primary" loading={saving} onClick={handleSubmit}>保存</Button>
            </FormButtonGroup>
          )}
        </FormProvider>
      </Card>

      {/* 已废弃字段历史展示（折叠面板） */}
      {showDeprecated && Object.keys(deprecatedFields).length > 0 && (
        <Collapse
          style={{ marginTop: 16 }}
          items={[{
            key: 'deprecated-fields',
            label: (
              <Space>
                <ExclamationCircleOutlined style={{ color: '#faad14' }} />
                <span>历史遗留字段 ({Object.keys(deprecatedFields).length})</span>
                <Tag color="orange">只读</Tag>
              </Space>
            ),
            children: (
              <FormProvider form={form}>
                <FormLayout labelCol={4} wrapperCol={16}>
                  <SchemaField schema={{ type: 'object', properties: deprecatedFields } as any} />
                </FormLayout>
              </FormProvider>
            ),
          }]}
        />
      )}
    </div>
  );
};

// 导出组件注册函数供外部扩展
export { registerCustomComponent };
export default DynamicRenderer;