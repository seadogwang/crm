import React, { useEffect, useMemo } from 'react';
import { createForm } from '@formily/core';
import { FormProvider, createSchemaField } from '@formily/react';
import {
  FormItem, Input, NumberPicker, Select, Switch, DatePicker,
  FormLayout, FormGrid, FormCollapse,
} from '@formily/antd-v5';
import { Empty, Typography, Divider } from 'antd';

const { Text, Title } = Typography;

// ==================== Formily 组件注册 ====================

const SchemaField = createSchemaField({
  components: {
    Input,
    NumberPicker,
    Select,
    Switch,
    DatePicker,
    FormItem,
    FormLayout,
    FormGrid,
    FormCollapse,
    Text: ({ value, content }: any) => (
      <span style={{ lineHeight: '32px' }}>{value ?? content ?? '—'}</span>
    ),
    Divider: () => <Divider style={{ margin: '12px 0' }} />,
    Title: ({ value, content }: any) => (
      <Title level={5} style={{ margin: '16px 0 8px' }}>{value ?? content ?? ''}</Title>
    ),
  },
});

// ==================== 类型 ====================

interface LayoutRendererProps {
  /** 会员数据 */
  member: any;
  /** 页面布局配置 (layoutConfig) */
  layoutConfig: any;
  /** 读写模式 */
  mode?: 'view' | 'edit';
  /** 保存回调 */
  onSaved?: () => void;
}

// ==================== 主组件 ====================

/**
 * 基于 layout_config 的运行时渲染器。
 * 将布局配置转换为 Formily Schema 并渲染会员详情/编辑页面。
 *
 * @see Loyalty_member_page_config.md §5.3
 */
const LayoutRenderer: React.FC<LayoutRendererProps> = ({
  member, layoutConfig, mode = 'view', onSaved,
}) => {
  const form = useMemo(() => createForm({
    validateFirst: true,
    readPretty: mode === 'view',
  }), [mode]);

  // 当会员数据变化时设置表单值
  useEffect(() => {
    if (!member) return;
    const ext = member.extAttributes || member.ext_attributes || {};
    // 合并系统字段和扩展字段
    const values: Record<string, any> = {
      memberId: member.memberId || member.member_id,
      tierCode: member.tierCode || member.tier_code,
      status: member.status,
      ...ext,
    };
    form.setValues(values);
  }, [member, form]);

  // 将 layoutConfig 转换为 Formily Schema
  const schema = useMemo(() => {
    if (!layoutConfig?.sections) return null;

    const properties: Record<string, any> = {};

    for (const section of layoutConfig.sections) {
      const sectionProps: Record<string, any> = {};

      for (const field of (section.fields || [])) {
        const dataPath = (field.field_key || '').startsWith('ext_attributes.')
          ? (field.field_key as string).substring('ext_attributes.'.length)
          : field.field_key;

        if (!dataPath) continue;

        const fieldSchema: any = {
          type: mapJsonType(field.component || 'Input'),
          title: field.label || dataPath,
          'x-component': mapComponent(field.component || 'Input'),
          'x-decorator': 'FormItem',
          'x-component-props': {
            placeholder: field.placeholder || `请输入${field.label || dataPath}`,
            readOnly: field.readonly || mode === 'view',
            disabled: field.readonly || mode === 'view',
          },
        };

        // 处理 options
        if (field.options && Array.isArray(field.options)) {
          fieldSchema['x-component-props'].options = field.options.map((o: any) => ({
            label: o.label,
            value: o.value,
          }));
        }

        // 必填校验
        if (field.required && mode === 'edit') {
          fieldSchema['x-validator'] = [{ required: true, message: `${field.label} 为必填项` }];
        }

        sectionProps[dataPath] = fieldSchema;
      }

      if (Object.keys(sectionProps).length > 0) {
        properties[section.id] = {
          type: 'object',
          title: section.title,
          properties: sectionProps,
        };
      }
    }

    return { type: 'object', properties };
  }, [layoutConfig, mode]);

  // 应用 fieldConfigOverrides
  const finalSchema = useMemo(() => {
    if (!schema || !layoutConfig?.fieldConfigOverrides) return schema;

    const overrides = layoutConfig.fieldConfigOverrides;
    const merged = JSON.parse(JSON.stringify(schema));

    for (const [key, override] of Object.entries(overrides) as [string, any][]) {
      const dataPath = key.startsWith('ext_attributes.') ? key.substring('ext_attributes.'.length) : key;
      // 在所有 section 中查找并覆盖
      for (const sectionId of Object.keys(merged.properties || {})) {
        const sectionProps = merged.properties[sectionId]?.properties;
        if (sectionProps?.[dataPath]) {
          if (override.label) sectionProps[dataPath].title = override.label;
          if (override.required !== undefined && mode === 'edit') {
            sectionProps[dataPath]['x-validator'] = override.required
              ? [{ required: true, message: `${override.label || dataPath} 为必填项` }] : undefined;
          }
          if (override.component) {
            sectionProps[dataPath]['x-component'] = mapComponent(override.component);
          }
          const compProps = sectionProps[dataPath]['x-component-props'] || {};
          if (override.placeholder) compProps.placeholder = override.placeholder;
          if (override.readonly !== undefined) {
            compProps.readOnly = override.readonly;
            compProps.disabled = override.readonly;
          }
          if (override.hidden) compProps.hidden = true;
          sectionProps[dataPath]['x-component-props'] = compProps;
        }
      }
    }

    return merged;
  }, [schema, layoutConfig, mode]);

  if (!schema || !member) {
    return <Empty description="无法加载页面布局" />;
  }

  return (
    <div style={{ padding: '0 4px' }}>
      <FormProvider form={form}>
        <SchemaField schema={finalSchema} />
      </FormProvider>
    </div>
  );
};

// ==================== 辅助函数 ====================

function mapComponent(component: string): string {
  const map: Record<string, string> = {
    Input: 'Input',
    InputNumber: 'NumberPicker',
    Select: 'Select',
    DatePicker: 'DatePicker',
    Text: 'Text',
    Switch: 'Switch',
    Radio: 'Radio',
    TextArea: 'Input.TextArea',
    Divider: 'Divider',
    Title: 'Title',
  };
  return map[component] || 'Input';
}

function mapJsonType(component: string): string {
  const map: Record<string, string> = {
    InputNumber: 'number',
    Switch: 'boolean',
    DatePicker: 'string',
    Select: 'string',
    Radio: 'string',
    Text: 'string',
    Input: 'string',
    TextArea: 'string',
  };
  return map[component] || 'string';
}

export default LayoutRenderer;