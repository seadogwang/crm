import React from 'react';
import { Button, Input, Select, Switch, Space, Typography, Divider } from 'antd';
import { PlusOutlined, DeleteOutlined } from '@ant-design/icons';
import { FIELD_TYPES } from './constants';
import type { EntityNodeData, EntityFieldExt } from './types';

const { Text } = Typography;

interface EntityEditPanelProps {
  entity: EntityNodeData | null;
  onUpdateField: (field: EntityFieldExt) => void;
  onAddField: () => void;
  onDeleteField: (fieldKey: string) => void;
  onUpdateName: (displayName: string, name: string) => void;
  onSave: () => void;
  onClose: () => void;
}

/**
 * 实体编辑面板 — 选中节点后显示在右侧
 */
const EntityEditPanel: React.FC<EntityEditPanelProps> = ({
  entity, onUpdateField, onAddField, onDeleteField, onUpdateName, onSave,
}) => {
  if (!entity) return null;

  return (
    <div style={{ width: 320, background: '#fff', borderLeft: '1px solid #f0f0f0', display: 'flex', flexDirection: 'column', height: '100%', flexShrink: 0 }}>
      {/* 头部 */}
      <div style={{ padding: '12px 14px', borderBottom: '1px solid #f0f0f0' }}>
        <Text strong style={{ fontSize: 14 }}>{entity.displayName}</Text>
        <div style={{ marginTop: 8 }}>
          <Text type="secondary" style={{ fontSize: 10 }}>实体名称</Text>
          <Input size="small" value={entity.displayName}
            onChange={e => onUpdateName(e.target.value, entity.name)}
            style={{ marginTop: 2, fontSize: 12 }} />
        </div>
        <div style={{ marginTop: 6 }}>
          <Text type="secondary" style={{ fontSize: 10 }}>实体标识</Text>
          <Input size="small" value={entity.name}
            onChange={e => onUpdateName(entity.displayName, e.target.value)}
            style={{ marginTop: 2, fontFamily: 'monospace', fontSize: 12 }} />
        </div>
      </div>

      {/* 字段列表 */}
      <div style={{ flex: 1, overflow: 'auto', padding: '8px 14px' }}>
        <Text type="secondary" style={{ fontSize: 11, marginBottom: 8, display: 'block' }}>
          字段列表 ({entity.fields.length})
        </Text>
        {entity.fields.map((f, i) => (
          <div key={f.key} style={{
            border: '1px solid #f0f0f0', borderRadius: 6, padding: 8, marginBottom: 6,
            background: f.locked ? '#fafafa' : '#fff',
          }}>
            <div style={{ display: 'flex', gap: 6 }}>
              <Input size="small" value={f.key}
                disabled={f.locked}
                onChange={e => onUpdateField({ ...f, key: e.target.value })}
                style={{ flex: 1, fontFamily: 'monospace', fontSize: 11 }}
                placeholder="字段标识" />
              <Input size="small" value={f.name}
                onChange={e => onUpdateField({ ...f, name: e.target.value })}
                style={{ flex: 1, fontSize: 11 }}
                placeholder="中文名" />
            </div>
            <div style={{ display: 'flex', gap: 6, marginTop: 4, alignItems: 'center' }}>
              <Select size="small" value={f.type}
                disabled={f.locked}
                onChange={v => onUpdateField({ ...f, type: v })}
                style={{ width: 100, fontSize: 11 }}
                options={FIELD_TYPES.map(t => ({ label: t, value: t }))} />
              <Switch size="small" checked={f.required} disabled={f.locked}
                onChange={v => onUpdateField({ ...f, required: v })} />
              <Text style={{ fontSize: 10 }}>必填</Text>
              <Switch size="small" checked={f.primaryKey} disabled={f.locked}
                onChange={v => onUpdateField({ ...f, primaryKey: v })} />
              <Text style={{ fontSize: 10 }}>主键</Text>
              {!f.locked && (
                <Button size="small" type="text" danger icon={<DeleteOutlined />}
                  onClick={() => onDeleteField(f.key)}
                  style={{ marginLeft: 'auto', height: 22 }} />
              )}
            </div>
          </div>
        ))}
      </div>

      {/* 底部 */}
      <div style={{ padding: '8px 14px', borderTop: '1px solid #f0f0f0' }}>
        <Button size="small" block icon={<PlusOutlined />}
          onClick={onAddField} style={{ marginBottom: 6, fontSize: 11 }}>
          添加字段
        </Button>
        <Button type="primary" size="small" block onClick={onSave} style={{ fontSize: 11 }}>
          保存
        </Button>
      </div>
    </div>
  );
};

export default EntityEditPanel;