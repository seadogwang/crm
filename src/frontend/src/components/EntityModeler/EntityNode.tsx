import React from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { Button, Space } from 'antd';
import { PlusOutlined, DeleteOutlined, SettingOutlined, LockOutlined, KeyOutlined } from '@ant-design/icons';
import { useEntityModeler } from './EntityModelerContext';
import { COLORS, BG_COLORS, BADGES } from './constants';
import type { EntityNodeData, EntityFieldExt, EntityKind } from './types';

const EntityNodeComponent: React.FC<NodeProps> = ({ id, data, selected }) => {
  const { selectNode, selectField, deleteNode, openConfig, addField } = useEntityModeler();
  const nodeData = data as unknown as EntityNodeData;
  const { kind, displayName, fields } = nodeData;
  const c = COLORS[kind as EntityKind];

  const handleHeaderClick = () => selectNode(id);
  const handleAddField = () => {
    addField(id, { key: `new_field_${Date.now()}`, name: '新字段', type: 'String' });
  };

  return (
    <div style={{
      minWidth: 230, maxWidth: 260,
      border: `2px solid ${selected ? c : '#d9d9d9'}`,
      borderRadius: 8, background: '#fff',
      boxShadow: selected ? '0 2px 8px rgba(0,0,0,0.12)' : '0 1px 3px rgba(0,0,0,0.06)',
    }}>
      {/* 头部 */}
      <div onMouseDown={e => { e.stopPropagation(); handleHeaderClick(); }} style={{
        background: c, color: '#fff', padding: '4px 8px', borderRadius: '6px 6px 0 0',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        fontSize: 12, fontWeight: 600, cursor: 'pointer', height: 28,
      }}>
        <span>{BADGES[kind as EntityKind]} {displayName}</span>
        <Space size={2}>
          <Button size="small" type="text" icon={<SettingOutlined />} style={{ color: '#fff', fontSize: 14, height: 20 }}
            onClick={e => { e.stopPropagation(); openConfig(nodeData); }} />
          <Button size="small" type="text" danger icon={<DeleteOutlined />} style={{ color: '#fff', fontSize: 14, height: 20 }}
            onClick={e => { e.stopPropagation(); deleteNode(id); }} />
        </Space>
      </div>

      {/* 字段列表 - 每个字段左右各有 source+target Handle */}
      <div style={{ padding: '2px 0' }}>
        {fields.map((f, idx) => (
          <div key={f.key} style={{
            display: 'flex', alignItems: 'center', padding: '3px 8px', cursor: 'pointer',
            borderTop: '1px solid #f5f5f5', fontSize: 11, position: 'relative',
            background: f.locked ? BG_COLORS.system : '#fff', height: 23,
          }}>
            {/* 左侧 source Handle */}
            <Handle type="source" position={Position.Left}
              id={`left-src-${f.key}`}
              style={{ position: 'absolute', left: -6, top: '50%', transform: 'translateY(-50%)', width: 8, height: 8, borderRadius: '50%', background: f.primaryKey ? '#faad14' : c, border: '2px solid #fff', opacity: 0 }} />
            {/* 左侧 target Handle */}
            <Handle type="target" position={Position.Left}
              id={`left-tgt-${f.key}`}
              style={{ position: 'absolute', left: -6, top: '50%', transform: 'translateY(-50%)', width: 8, height: 8, borderRadius: '50%', background: f.primaryKey ? '#faad14' : c, border: '2px solid #fff', opacity: 0 }} />
            {/* 右侧 source Handle */}
            <Handle type="source" position={Position.Right}
              id={`right-src-${f.key}`}
              style={{ position: 'absolute', right: -6, top: '50%', transform: 'translateY(-50%)', width: 8, height: 8, borderRadius: '50%', background: f.primaryKey ? '#faad14' : c, border: '2px solid #fff', opacity: 0 }} />
            {/* 右侧 target Handle */}
            <Handle type="target" position={Position.Right}
              id={`right-tgt-${f.key}`}
              style={{ position: 'absolute', right: -6, top: '50%', transform: 'translateY(-50%)', width: 8, height: 8, borderRadius: '50%', background: f.primaryKey ? '#faad14' : c, border: '2px solid #fff', opacity: 0 }} />

            <span style={{ flex: 1, color: '#1a1a1a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontFamily: 'monospace', fontSize: 11 }}>
              {f.locked && <LockOutlined style={{ fontSize: 9, color: '#999', marginRight: 3 }} />}
              {f.primaryKey && <KeyOutlined style={{ fontSize: 9, color: '#faad14', marginRight: 3 }} />}
              {f.key}
            </span>
            <span style={{ color: '#888', fontSize: 10, marginLeft: 8, fontFamily: 'monospace' }}>{f.type}</span>
            {f.name && f.name !== f.key && (
              <span style={{ color: '#bbb', fontSize: 10, marginLeft: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 60 }}>{f.name}</span>
            )}
          </div>
        ))}
      </div>

      <Button type="dashed" size="small" block icon={<PlusOutlined />}
        style={{ margin: '2px 4px', width: 'calc(100% - 8px)', fontSize: 11, height: 24 }}
        onClick={handleAddField}>添加字段</Button>
    </div>
  );
};

export default EntityNodeComponent;