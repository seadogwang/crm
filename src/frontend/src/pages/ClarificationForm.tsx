import React, { useState, useRef } from 'react';
import { Form, Input, InputNumber, Select, DatePicker, Button, Space, Typography, Divider, Tag, Table } from 'antd';
import { CheckOutlined, PlusOutlined, DeleteOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';

const { Text } = Typography;

interface FieldSchema {
  id: string;
  label: string;
  type: 'text' | 'textarea' | 'number' | 'select' | 'multi_select' | 'datetime' | 'datetime_range' | 'sku_selector' | 'category_selector' | 'step_table';
  required?: boolean;
  placeholder?: string;
  options?: { value: string; label: string }[];
  value?: any;
  unit?: string;
  help?: string;
  columns?: { key: string; label: string; type: string }[]; // step_table
  rows?: Record<string, any>[]; // step_table
}

interface SectionSchema {
  id: string;
  title: string;
  fields: FieldSchema[];
}

interface FormSchema {
  sections: SectionSchema[];
}

interface Props {
  schema: FormSchema;
  onSubmit: (formData: Record<string, any>) => void;
  loading?: boolean;
}

const StepTableEditor: React.FC<{ field: FieldSchema; refs: React.MutableRefObject<Record<string, any>> }> = ({ field, refs }) => {
  const [rows, setRows] = useState<Record<string, any>[]>(
    field.rows || field.value || [{ lower: 0, upper: '', value: '' }]
  );

  const updateAndSync = (newRows: Record<string, any>[]) => {
    setRows(newRows);
    refs.current[field.id] = newRows;
  };

  // 初始化 ref
  React.useEffect(() => {
    refs.current[field.id] = rows;
  }, []);

  const addRow = () => {
    updateAndSync([...rows, { lower: '', upper: '', value: '' }]);
  };

  const removeRow = (idx: number) => {
    if (rows.length <= 1) return;
    updateAndSync(rows.filter((_, i) => i !== idx));
  };

  const updateRow = (idx: number, key: string, val: any) => {
    const updated = [...rows];
    updated[idx] = { ...updated[idx], [key]: val };
    updateAndSync(updated);
  };

  return (
    <div>
      <Table
        size="small"
        pagination={false}
        dataSource={rows.map((r, i) => ({ ...r, _key: i }))}
        rowKey="_key"
        columns={[
          ...(field.columns || [
            { key: 'lower', label: '下限', type: 'number' },
            { key: 'upper', label: '上限', type: 'number' },
            { key: 'value', label: '倍数/积分值', type: 'number' },
          ]).map(col => ({
            title: col.label,
            dataIndex: col.key,
            render: (_: any, record: any) => (
              <InputNumber
                size="small"
                style={{ width: '100%' }}
                placeholder={col.key === 'upper' ? '空=无上限' : ''}
                value={record[col.key]}
                onChange={v => updateRow(record._key, col.key, v)}
              />
            ),
          })),
          {
            title: '',
            width: 40,
            render: (_: any, record: any) => (
              <Button
                type="text" size="small" danger
                icon={<DeleteOutlined />}
                onClick={() => removeRow(record._key)}
                disabled={rows.length <= 1}
              />
            ),
          },
        ]}
      />
      <Button type="dashed" size="small" icon={<PlusOutlined />} onClick={addRow} style={{ marginTop: 4 }}>
        添加阶梯
      </Button>
    </div>
  );
};

const ClarificationForm: React.FC<Props> = ({ schema, onSubmit, loading }) => {
  const [form] = Form.useForm();
  const stepTableRefs = useRef<Record<string, any>>({});

  const handleSubmit = () => {
    const values = form.getFieldsValue();
    const allData: Record<string, any> = {};
    schema.sections.forEach(section => {
      section.fields.forEach(field => {
        if (field.type === 'step_table') {
          allData[field.id] = stepTableRefs.current[field.id] || field.value || [];
        } else if (values[field.id] !== undefined) {
          allData[field.id] = values[field.id];
        }
      });
    });
    onSubmit(allData);
  };

  const renderField = (field: FieldSchema) => {
    const commonProps = {
      placeholder: field.placeholder,
      style: { width: '100%', maxWidth: 400 },
    };

    switch (field.type) {
      case 'text':
        return <Input {...commonProps} />;

      case 'textarea':
        return <Input.TextArea rows={2} {...commonProps} />;

      case 'number':
        return (
          <InputNumber
            {...commonProps}
            style={{ width: '100%' }}
            addonAfter={field.unit}
          />
        );

      case 'select':
        return (
          <Select
            {...commonProps}
            options={field.options}
          />
        );

      case 'multi_select':
        return (
          <Select
            {...commonProps}
            mode="multiple"
            options={field.options}
          />
        );

      case 'datetime':
        return (
          <DatePicker
            showTime
            {...commonProps}
            style={{ width: '100%' }}
          />
        );

      case 'datetime_range':
        return (
          <DatePicker.RangePicker
            showTime
            {...commonProps}
            style={{ width: '100%' }}
          />
        );

      case 'sku_selector':
        return (
          <Select
            {...commonProps}
            mode="tags"
            placeholder="输入商品SKU搜索..."
            tokenSeparators={[',', ' ']}
          />
        );

      case 'category_selector':
        return (
          <Select
            {...commonProps}
            mode="tags"
            placeholder="输入品类名称..."
            tokenSeparators={[',', ' ']}
          />
        );

      case 'step_table':
        return <StepTableEditor field={field} refs={stepTableRefs} />;

      default:
        return <Input {...commonProps} />;
    }
  };

  // 设置初始值
  React.useEffect(() => {
    const initialValues: Record<string, any> = {};
    schema.sections.forEach(section => {
      section.fields.forEach(field => {
        if (field.value !== undefined) {
          if (field.type === 'datetime' || field.type === 'datetime_range') {
            // 日期类型转换
            if (typeof field.value === 'string') {
              initialValues[field.id] = dayjs(field.value);
            } else if (field.value?.start && field.value?.end) {
              initialValues[field.id] = [dayjs(field.value.start), dayjs(field.value.end)];
            } else {
              initialValues[field.id] = field.value;
            }
          } else {
            initialValues[field.id] = field.value;
          }
        }
      });
    });
    form.setFieldsValue(initialValues);
  }, [schema]);

  if (!schema || !schema.sections) return null;

  return (
    <div style={{
      background: '#fafafa', borderRadius: 8, padding: 16,
      border: '1px solid #f0f0f0', marginTop: 8,
      maxWidth: 600,
    }}>
      <div style={{ marginBottom: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
        <Tag color="blue">📋 请完善以下信息</Tag>
        <Text type="secondary" style={{ fontSize: 12 }}>AI 已预填推断的值，请确认或修改</Text>
      </div>
      <Form form={form} layout="vertical" size="small">
        {schema.sections.map(section => (
          <div key={section.id} style={{ marginBottom: 12 }}>
            <Text strong style={{ fontSize: 13, color: '#555' }}>{section.title}</Text>
            <Divider style={{ margin: '4px 0 8px' }} />
            {section.fields.map(field => (
              <Form.Item
                key={field.id}
                name={field.id}
                label={field.label}
                rules={field.required ? [{ required: true, message: `请填写${field.label}` }] : []}
                extra={field.help && <Text type="secondary" style={{ fontSize: 11 }}>{field.help}</Text>}
              >
                {renderField(field)}
              </Form.Item>
            ))}
          </div>
        ))}
        <div style={{ textAlign: 'right', marginTop: 8 }}>
          <Button type="primary" icon={<CheckOutlined />} onClick={handleSubmit} loading={loading}>
            生成规则
          </Button>
        </div>
      </Form>
    </div>
  );
};

export default ClarificationForm;