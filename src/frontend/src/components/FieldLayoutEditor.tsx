import React, { useState, useEffect } from 'react';
import { Card, Button, Checkbox, Input, Select, Space, Switch, Tag, message, Popconfirm, Empty } from 'antd';
import { PlusOutlined, SaveOutlined, CloseOutlined, EditOutlined, HolderOutlined, DeleteOutlined, EyeOutlined, EyeInvisibleOutlined } from '@ant-design/icons';
import api from '../api';

interface FieldConfig {
  key: string;
  label: string;
  visible: boolean;
  editable: boolean;
}

interface LayoutConfig {
  sections: {
    id: string;
    title: string;
    fields: FieldConfig[];
  }[];
}

interface Props {
  member: any;
  onSave: (layout: LayoutConfig) => void;
  onCancel: () => void;
}

const FieldLayoutEditor: React.FC<Props> = ({ member, onSave, onCancel }) => {
  const [sections, setSections] = useState<LayoutConfig['sections']>([]);
  const [saving, setSaving] = useState(false);
  const [availableFields, setAvailableFields] = useState<string[]>([]);

  useEffect(() => {
    // 加载已有布局配置
    const loadLayout = async () => {
      try {
        const { data } = await api.get('/members/layout', { params: { programCode: 'PROG001' } });
        if (data?.data?.sections) {
          setSections(data.data.sections);
          return;
        }
      } catch {}
      initDefaultLayout();
    };
    loadLayout();
  }, []);

  const initDefaultLayout = () => {
    const ext = member?.extAttributes || {};
    const extKeys = Object.keys(ext).filter(k => !k.startsWith('_'));

    // 从 schema 获取所有扩展字段（优先），没有 schema 则从已有数据获取
    const schemaFields: string[] = [];
    if (member?.fieldSchema?.properties) {
      for (const k of Object.keys(member.fieldSchema.properties)) {
        if (!k.startsWith('_')) schemaFields.push(k);
      }
    }
    const allExtKeys = schemaFields.length > 0 ? schemaFields : extKeys;

    const basicFields: FieldConfig[] = [
      { key: 'member_id', label: '会员ID', visible: true, editable: false },
      { key: 'name', label: '姓名', visible: true, editable: true },
      { key: 'gender', label: '性别', visible: true, editable: true },
      { key: 'birthday', label: '生日', visible: true, editable: true },
      { key: 'enroll_channel', label: '入会渠道', visible: true, editable: false },
      { key: 'tier_code', label: '当前等级', visible: true, editable: false },
      { key: 'status', label: '状态', visible: true, editable: false },
      { key: 'created_at', label: '创建时间', visible: true, editable: false },
    ];

    const extFieldConfigs: FieldConfig[] = allExtKeys.map(k => ({
      key: `ext_attributes.${k}`,
      label: k,
      visible: extKeys.includes(k),
      editable: true,
    }));

    setSections([
      { id: 'basic', title: '基本信息', fields: basicFields },
      { id: 'extended', title: '扩展信息', fields: extFieldConfigs },
    ]);
    updateAvailable(extFieldConfigs);
  };

  const updateAvailable = (currentExtFields: FieldConfig[]) => {
    const ext = member?.extAttributes || {};
    const schemaFields: string[] = [];
    if (member?.fieldSchema?.properties) {
      for (const k of Object.keys(member.fieldSchema.properties)) {
        if (!k.startsWith('_')) schemaFields.push(k);
      }
    }
    const allKeys = schemaFields.length > 0 ? schemaFields : Object.keys(ext).filter(k => !k.startsWith('_'));
    const usedKeys = currentExtFields.map(f => f.key.replace('ext_attributes.', ''));
    setAvailableFields(allKeys.filter(k => !usedKeys.includes(k)));
  };

  const updateField = (sectionIdx: number, fieldIdx: number, updates: Partial<FieldConfig>) => {
    setSections(prev => prev.map((s, si) => si !== sectionIdx ? s : {
      ...s,
      fields: s.fields.map((f, fi) => fi !== fieldIdx ? f : { ...f, ...updates }),
    }));
  };

  const removeField = (sectionIdx: number, fieldIdx: number) => {
    const field = sections[sectionIdx].fields[fieldIdx];
    setSections(prev => prev.map((s, si) => si !== sectionIdx ? s : {
      ...s, fields: s.fields.filter((_, fi) => fi !== fieldIdx),
    }));
    if (field.key.startsWith('ext_attributes.')) {
      const key = field.key.replace('ext_attributes.', '');
      setAvailableFields(prev => [...prev, key]);
    }
  };

  const addField = (sectionIdx: number, fieldKey: string) => {
    setSections(prev => prev.map((s, si) => si !== sectionIdx ? s : {
      ...s,
      fields: [...s.fields, { key: `ext_attributes.${fieldKey}`, label: fieldKey, visible: true, editable: true }],
    }));
    setAvailableFields(prev => prev.filter(k => k !== fieldKey));
  };

  const moveField = (sectionIdx: number, fromIdx: number, toIdx: number) => {
    if (toIdx < 0 || toIdx >= sections[sectionIdx].fields.length) return;
    setSections(prev => prev.map((s, si) => si !== sectionIdx ? s : {
      ...s,
      fields: (() => {
        const arr = [...s.fields];
        const [item] = arr.splice(fromIdx, 1);
        arr.splice(toIdx, 0, item);
        return arr;
      })(),
    }));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const layout = { sections };
      await api.post('/members/layout', { programCode: 'PROG001', layoutConfig: layout });
      message.success('布局已保存');
      onSave(layout);
    } catch (e: any) {
      message.error(e.response?.data?.message || '保存失败');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card
      title="字段排版编辑"
      extra={
        <Space>
          <Button icon={<CloseOutlined />} onClick={onCancel}>取消</Button>
          <Button type="primary" icon={<SaveOutlined />} onClick={handleSave} loading={saving}>保存布局</Button>
        </Space>
      }
    >
      <div style={{ marginBottom: 12, color: '#888', fontSize: 12 }}>
        💡 勾选控制显示，修改标签名称，拖动排序，点击「+」添加新字段
      </div>

      {sections.map((section, si) => (
        <Card
          key={section.id}
          size="small"
          title={section.title}
          style={{ marginBottom: 12 }}
          extra={section.id === 'extended' && availableFields.length > 0 && (
            <Select
              size="small"
              placeholder="+ 添加字段"
              style={{ width: 160 }}
              value={undefined}
              onChange={(v: string) => addField(si, v)}
              options={availableFields.map(k => ({ label: k, value: k }))}
            />
          )}
        >
          {section.fields.map((field, fi) => (
            <div
              key={field.key}
              style={{
                display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px',
                marginBottom: 4, borderRadius: 4, background: field.visible ? '#fff' : '#f5f5f5',
                border: '1px solid #f0f0f0',
              }}
            >
              {/* 上下移动 */}
              <Space size={0}>
                <Button size="small" type="text" style={{ padding: 0, fontSize: 10, lineHeight: '10px', height: 16 }}
                  disabled={fi === 0}
                  onClick={() => moveField(si, fi, fi - 1)}>▲</Button>
                <Button size="small" type="text" style={{ padding: 0, fontSize: 10, lineHeight: '10px', height: 16 }}
                  disabled={fi === section.fields.length - 1}
                  onClick={() => moveField(si, fi, fi + 1)}>▼</Button>
              </Space>

              {/* 显隐 */}
              <Checkbox
                checked={field.visible}
                disabled={section.id === 'basic'}
                onChange={e => updateField(si, fi, { visible: e.target.checked })}
              />

              {/* 标签编辑 */}
              <Input
                size="small"
                value={field.label}
                style={{ width: 120 }}
                onChange={e => updateField(si, fi, { label: e.target.value })}
              />

              <Tag style={{ fontSize: 10 }}>{field.key}</Tag>

              {/* 只读/可编辑 */}
              <Switch
                size="small"
                checkedChildren="可编辑"
                unCheckedChildren="只读"
                checked={field.editable}
                disabled={section.id === 'basic'}
                onChange={v => updateField(si, fi, { editable: v })}
              />

              {/* 删除 */}
              {section.id === 'extended' && (
                <Button size="small" type="text" danger icon={<DeleteOutlined />}
                  onClick={() => removeField(si, fi)} />
              )}
            </div>
          ))}
        </Card>
      ))}
    </Card>
  );
};

export default FieldLayoutEditor;