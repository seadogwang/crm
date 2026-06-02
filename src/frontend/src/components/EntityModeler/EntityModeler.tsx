import React, { useState, useCallback, useRef } from 'react';
import {
  Button, Card, Space, Tag, Input, Select, Switch, Popconfirm, message, Modal,
  Tooltip, Badge, Empty, Drawer, Typography, Divider, Segmented,
} from 'antd';
import {
  PlusOutlined, DeleteOutlined, DragOutlined, KeyOutlined,
  SaveOutlined, ExportOutlined, LinkOutlined, TableOutlined,
  AimOutlined, EyeOutlined,
} from '@ant-design/icons';
import { useDrag, useDrop } from 'react-dnd';
import { HTML5Backend } from 'react-dnd-html5-backend';
import type { EntityModel, EntityField, EntityRelationship, FieldType, EntityTemplate } from './types';

const { Text, Title } = Typography;

// ==================== 内置实体模板 ====================
const ENTITY_TEMPLATES: EntityTemplate[] = [
  {
    type: 'member', displayName: '会员 Member',
    defaultFields: [
      { key: 'id', name: 'ID', type: 'Long', primaryKey: true, required: true },
      { key: 'program_code', name: '租户代码', type: 'String', required: true },
      { key: 'member_id', name: '会员号', type: 'Long', required: true, unique: true },
      { key: 'tier_code', name: '等级', type: 'String' },
      { key: 'status', name: '状态', type: 'String', required: true, defaultValue: 'ENROLLED' },
      { key: 'ext_attributes', name: '扩展属性', type: 'JSONB' },
      { key: 'created_at', name: '创建时间', type: 'DateTime' },
    ],
  },
  {
    type: 'order', displayName: '订单 Order',
    defaultFields: [
      { key: 'id', name: 'ID', type: 'Long', primaryKey: true, required: true },
      { key: 'program_code', name: '租户代码', type: 'String', required: true },
      { key: 'order_id', name: '订单号', type: 'String', required: true, unique: true },
      { key: 'member_id', name: '会员ID', type: 'Long', required: true },
      { key: 'amount', name: '金额', type: 'BigDecimal', required: true },
      { key: 'status', name: '状态', type: 'String', required: true },
      { key: 'channel', name: '渠道', type: 'String' },
      { key: 'created_at', name: '创建时间', type: 'DateTime' },
    ],
  },
  {
    type: 'transaction_event', displayName: '交易事件 Event',
    defaultFields: [
      { key: 'event_id', name: '事件ID', type: 'String', primaryKey: true, required: true },
      { key: 'program_code', name: '租户代码', type: 'String', required: true },
      { key: 'member_id', name: '会员ID', type: 'Long' },
      { key: 'event_type', name: '事件类型', type: 'String', required: true },
      { key: 'channel', name: '渠道', type: 'String' },
      { key: 'ext_attributes', name: '扩展属性', type: 'JSONB' },
      { key: 'created_at', name: '创建时间', type: 'DateTime' },
    ],
  },
  {
    type: 'points_rule', displayName: '积分规则 Rule',
    defaultFields: [
      { key: 'id', name: 'ID', type: 'Long', primaryKey: true, required: true },
      { key: 'program_code', name: '租户代码', type: 'String', required: true },
      { key: 'rule_code', name: '规则代码', type: 'String', required: true },
      { key: 'rule_name', name: '规则名称', type: 'String' },
      { key: 'event_type', name: '触发事件', type: 'String', required: true },
      { key: 'points', name: '发放积分', type: 'Integer', required: true },
      { key: 'status', name: '状态', type: 'String', required: true },
    ],
  },
  {
    type: 'account', displayName: '积分账户 Account',
    defaultFields: [
      { key: 'account_id', name: '账户ID', type: 'Long', primaryKey: true, required: true },
      { key: 'program_code', name: '租户代码', type: 'String', required: true },
      { key: 'member_id', name: '会员ID', type: 'Long', required: true },
      { key: 'account_type', name: '账户类型', type: 'String', required: true },
      { key: 'balance', name: '余额', type: 'BigDecimal', required: true },
      { key: 'version', name: '版本号', type: 'Integer', required: true },
    ],
  },
  {
    type: 'tier', displayName: '等级阶梯 Tier',
    defaultFields: [
      { key: 'tier_code', name: '等级代码', type: 'String', primaryKey: true, required: true },
      { key: 'program_code', name: '租户代码', type: 'String', required: true },
      { key: 'tier_name', name: '等级名称', type: 'String' },
      { key: 'sequence', name: '排序', type: 'Integer', required: true },
      { key: 'min_points', name: '最低成长值', type: 'BigDecimal', required: true },
      { key: 'max_points', name: '最高成长值', type: 'BigDecimal' },
    ],
  },
];

const FIELD_TYPES: FieldType[] = ['Long', 'String', 'Integer', 'Boolean', 'Double', 'BigDecimal', 'Date', 'DateTime', 'JSONB', 'Text', 'Enum'];
const CANVAS_DRAG_TYPE = 'ENTITY_CARD';

// ==================== 工具栏（左栏） ====================
const EntityPalette: React.FC = () => (
  <Card title="实体对象" size="small" style={{ height: '100%' }}>
    {ENTITY_TEMPLATES.map(tmpl => (
      <DraggableEntity key={tmpl.type} template={tmpl} />
    ))}
  </Card>
);

const DraggableEntity: React.FC<{ template: EntityTemplate }> = ({ template }) => {
  const [{ isDragging }, dragRef] = useDrag(() => ({
    type: CANVAS_DRAG_TYPE,
    item: { templateType: template.type },
    collect: (m) => ({ isDragging: m.isDragging() }),
  }), [template]);

  return (
    <div
      ref={dragRef}
      style={{
        padding: '8px 12px', marginBottom: 6, borderRadius: 6, cursor: 'grab',
        background: isDragging ? '#e6f7ff' : '#fff', border: '1px solid #d9d9d9',
        display: 'flex', alignItems: 'center', gap: 8, opacity: isDragging ? 0.5 : 1,
      }}
    >
      <TableOutlined />
      <span style={{ fontSize: 13 }}>{template.displayName}</span>
    </div>
  );
};

// ==================== 实体卡片（画布上的每个实体） ====================
interface EntityCardProps {
  entity: EntityModel;
  allEntities: EntityModel[];
  relationships: EntityRelationship[];
  onUpdate: (entity: EntityModel) => void;
  onDelete: (id: string) => void;
  onStartRelation: (entityId: string) => void;
  onAddField: (entityId: string) => void;
  onDeleteField: (entityId: string, fieldKey: string) => void;
  onUpdateField: (entityId: string, fieldKey: string, updates: Partial<EntityField>) => void;
}

const EntityCard: React.FC<EntityCardProps> = ({
  entity, allEntities, relationships, onUpdate, onDelete,
  onStartRelation, onAddField, onDeleteField, onUpdateField,
}) => {
  const relations = relationships.filter(r => r.from === entity.id || r.to === entity.id);

  return (
    <div
      style={{
        width: 420, background: '#fff', borderRadius: 8,
        border: '2px solid #1677ff', boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
      }}
    >
      {/* 实体头部 */}
      <div style={{
        background: '#1677ff', color: '#fff', padding: '8px 12px',
        borderRadius: '6px 6px 0 0', display: 'flex',
        justifyContent: 'space-between', alignItems: 'center',
      }}>
        <Space>
          <TableOutlined />
          <Input
            size="small"
            value={entity.displayName}
            onChange={e => onUpdate({ ...entity, displayName: e.target.value })}
            style={{ width: 180, background: 'transparent', color: '#fff', borderColor: 'rgba(255,255,255,0.3)' }}
          />
          <Tag color="white" style={{ color: '#1677ff', fontSize: 10 }}>
            {entity.fields.length} 字段
          </Tag>
        </Space>
        <Space size={4}>
          {relations.length > 0 && (
            <Badge count={relations.length} size="small" color="gold" />
          )}
          <Tooltip title="建立关联关系">
            <Button size="small" type="text" icon={<LinkOutlined />}
              style={{ color: '#fff' }} onClick={() => onStartRelation(entity.id)} />
          </Tooltip>
          <Popconfirm title="删除此实体?" onConfirm={() => onDelete(entity.id)}>
            <Button size="small" type="text" danger icon={<DeleteOutlined />} style={{ color: '#fff' }} />
          </Popconfirm>
        </Space>
      </div>

      {/* 字段表格 */}
      <div style={{ padding: '4px 0' }}>
        <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: '#fafafa', color: '#666' }}>
              <th style={{ padding: '4px 8px', textAlign: 'left', width: 100 }}>字段名</th>
              <th style={{ padding: '4px 4px', textAlign: 'center', width: 75 }}>类型</th>
              <th style={{ padding: '4px 2px', textAlign: 'center', width: 30 }}>PK</th>
              <th style={{ padding: '4px 2px', textAlign: 'center', width: 30 }}>必填</th>
              <th style={{ padding: '4px 2px', textAlign: 'center', width: 30 }}>UQ</th>
              <th style={{ padding: '4px 4px', textAlign: 'left', width: 70 }}>默认值</th>
              <th style={{ padding: '4px 2px', textAlign: 'center', width: 30 }} />
            </tr>
          </thead>
          <tbody>
            {entity.fields.map(field => (
              <tr key={field.key} style={{ borderTop: '1px solid #f0f0f0' }}>
                <td style={{ padding: '2px 8px' }}>
                  <Input
                    size="small" variant="borderless"
                    value={field.name}
                    onChange={e => onUpdateField(entity.id, field.key, { name: e.target.value })}
                    style={{ fontSize: 12, padding: 0 }}
                  />
                </td>
                <td style={{ padding: '2px 4px', textAlign: 'center' }}>
                  <Select
                    size="small" variant="borderless"
                    value={field.type}
                    onChange={v => onUpdateField(entity.id, field.key, { type: v })}
                    options={FIELD_TYPES.map(t => ({ label: t, value: t }))}
                    style={{ fontSize: 11, width: 70 }}
                    popupMatchSelectWidth={false}
                  />
                </td>
                <td style={{ padding: '2px 2px', textAlign: 'center' }}>
                  <Switch size="small" checked={field.primaryKey}
                    onChange={v => onUpdateField(entity.id, field.key, { primaryKey: v })} />
                </td>
                <td style={{ padding: '2px 2px', textAlign: 'center' }}>
                  <Switch size="small" checked={field.required}
                    onChange={v => onUpdateField(entity.id, field.key, { required: v })} />
                </td>
                <td style={{ padding: '2px 2px', textAlign: 'center' }}>
                  <Switch size="small" checked={field.unique}
                    onChange={v => onUpdateField(entity.id, field.key, { unique: v })} />
                </td>
                <td style={{ padding: '2px 4px' }}>
                  <Input
                    size="small" variant="borderless" placeholder="-"
                    value={field.defaultValue || ''}
                    onChange={e => onUpdateField(entity.id, field.key, { defaultValue: e.target.value || undefined })}
                    style={{ fontSize: 11, padding: 0, width: 60 }}
                  />
                </td>
                <td style={{ padding: '2px', textAlign: 'center' }}>
                  <Button size="small" type="text" danger icon={<DeleteOutlined />}
                    onClick={() => onDeleteField(entity.id, field.key)} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <Button type="dashed" size="small" block icon={<PlusOutlined />}
          style={{ margin: '4px 8px', width: 'calc(100% - 16px)' }}
          onClick={() => onAddField(entity.id)}>
          添加字段
        </Button>
      </div>
    </div>
  );
};

// ==================== 关联关系设置弹窗 ====================
interface RelationModalProps {
  open: boolean;
  sourceEntityId: string | null;
  entities: EntityModel[];
  relationships: EntityRelationship[];
  onClose: () => void;
  onSave: (rel: EntityRelationship) => void;
  onDeleteRel: (id: string) => void;
}

const RelationModal: React.FC<RelationModalProps> = ({
  open, sourceEntityId, entities, relationships, onClose, onSave, onDeleteRel,
}) => {
  const [targetId, setTargetId] = useState<string>('');
  const [fromField, setFromField] = useState('');
  const [toField, setToField] = useState('');
  const [relType, setRelType] = useState<string>('MANY_TO_ONE');

  const sourceEntity = entities.find(e => e.id === sourceEntityId);
  const targetEntity = entities.find(e => e.id === targetId);

  const handleSave = () => {
    if (!sourceEntityId || !targetId || !fromField || !toField) {
      message.warning('请完成所有选择'); return;
    }
    onSave({
      id: `rel_${Date.now()}`,
      from: sourceEntityId,
      to: targetId,
      fromField,
      toField,
      type: relType as EntityRelationship['type'],
      label: `${sourceEntity?.displayName} → ${targetEntity?.displayName}`,
    });
    setTargetId(''); setFromField(''); setToField('');
  };

  const existingRels = relationships.filter(r => r.from === sourceEntityId || r.to === sourceEntityId);

  return (
    <Modal title="关联关系管理" open={open} onCancel={onClose} onOk={handleSave} okText="添加关联"
      width={600}>
      {/* 已有关联 */}
      {existingRels.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <Text strong>已有关联：</Text>
          {existingRels.map(rel => (
            <Tag key={rel.id} closable color="blue" style={{ margin: 2 }}
              onClose={() => onDeleteRel(rel.id)}>
              {rel.fromField} → {entities.find(e => e.id === rel.to)?.displayName}.{rel.toField}
              <Text type="secondary" style={{ fontSize: 10, marginLeft: 4 }}>({rel.type})</Text>
            </Tag>
          ))}
        </div>
      )}
      <Divider />

      {/* 新建关联 */}
      <Space direction="vertical" style={{ width: '100%' }}>
        <div>
          <Text type="secondary">源实体：</Text>
          <Tag color="blue">{sourceEntity?.displayName || '未选择'}</Tag>
        </div>
        <div>
          <Text type="secondary" style={{ marginRight: 8 }}>目标实体：</Text>
          <Select value={targetId} onChange={setTargetId} style={{ width: 200 }}
            placeholder="选择关联的实体"
            options={entities.filter(e => e.id !== sourceEntityId).map(e => ({ label: e.displayName, value: e.id }))} />
        </div>
        <div>
          <Text type="secondary" style={{ marginRight: 8 }}>关联类型：</Text>
          <Segmented value={relType} onChange={v => setRelType(v as string)}
            options={[
              { label: '多对一', value: 'MANY_TO_ONE' },
              { label: '一对多', value: 'ONE_TO_MANY' },
              { label: '一对一', value: 'ONE_TO_ONE' },
              { label: '多对多', value: 'MANY_TO_MANY' },
            ]} />
        </div>
        <div>
          <Text type="secondary" style={{ marginRight: 8 }}>外键字段：</Text>
          <Select value={fromField} onChange={setFromField} style={{ width: 180 }}
            placeholder="在源实体中的字段"
            options={sourceEntity?.fields.map(f => ({ label: f.name, value: f.key })) || []} />
          <Text style={{ margin: '0 8px' }}>→ 引用</Text>
          <Select value={toField} onChange={setToField} style={{ width: 180 }}
            placeholder="目标实体的字段"
            options={targetEntity?.fields.map(f => ({ label: f.name, value: f.key })) || []} />
        </div>
        {fromField && toField && (
          <div>
            <Tag color="green">
              {sourceEntity?.displayName}.{fromField} → {targetEntity?.displayName}.{toField} [{relType}]
            </Tag>
          </div>
        )}
      </Space>
    </Modal>
  );
};

// ==================== 主组件 ====================
const EntityModeler: React.FC = () => {
  const [entities, setEntities] = useState<EntityModel[]>([]);
  const [relationships, setRelationships] = useState<EntityRelationship[]>([]);
  const [relationSource, setRelationSource] = useState<string | null>(null);
  const [showRelationModal, setShowRelationModal] = useState(false);
  const [showExport, setShowExport] = useState(false);
  const idCounter = useRef(0);

  const addEntity = useCallback((templateType: string) => {
    const tmpl = ENTITY_TEMPLATES.find(t => t.type === templateType);
    if (!tmpl) return;
    const id = `entity_${++idCounter.current}`;
    setEntities(prev => [...prev, {
      id, name: templateType,
      displayName: tmpl.displayName,
      fields: tmpl.defaultFields.map(f => ({ ...f, key: f.key + '_' + idCounter.current })),
      x: 20 + prev.length * 30, y: 20 + prev.length * 30,
    }]);
    message.success(`已添加实体: ${tmpl.displayName}`);
  }, []);

  const updateEntity = useCallback((entity: EntityModel) => {
    setEntities(prev => prev.map(e => e.id === entity.id ? entity : e));
  }, []);

  const deleteEntity = useCallback((id: string) => {
    setEntities(prev => prev.filter(e => e.id !== id));
    setRelationships(prev => prev.filter(r => r.from !== id && r.to !== id));
  }, []);

  const addField = useCallback((entityId: string) => {
    const fieldKey = `field_${++idCounter.current}`;
    setEntities(prev => prev.map(e => e.id === entityId ? {
      ...e, fields: [...e.fields, {
        key: fieldKey, name: 'new_field', type: 'String',
      }],
    } : e));
  }, []);

  const deleteField = useCallback((entityId: string, fieldKey: string) => {
    setEntities(prev => prev.map(e => e.id === entityId ? {
      ...e, fields: e.fields.filter(f => f.key !== fieldKey),
    } : e));
  }, []);

  const updateField = useCallback((entityId: string, fieldKey: string, updates: Partial<EntityField>) => {
    setEntities(prev => prev.map(e => e.id === entityId ? {
      ...e, fields: e.fields.map(f => f.key === fieldKey ? { ...f, ...updates } : f),
    } : e));
  }, []);

  const exportSchema = useCallback(() => {
    const schema: Record<string, unknown> = {
      version: '1.0.0',
      entities: entities.map(e => ({
        name: e.name,
        displayName: e.displayName,
        fields: e.fields.map(f => ({
          name: f.key,
          displayName: f.name,
          type: f.type,
          primaryKey: f.primaryKey || false,
          required: f.required || false,
          unique: f.unique || false,
          defaultValue: f.defaultValue || null,
        })),
      })),
      relationships: relationships.map(r => ({
        type: r.type,
        from: entities.find(e => e.id === r.from)?.name,
        to: entities.find(e => e.id === r.to)?.name,
        fromField: r.fromField,
        toField: r.toField,
      })),
    };
    return JSON.stringify(schema, null, 2);
  }, [entities, relationships]);

  // Canvas drop logic
  const [{ isOver }, dropRef] = useDrop(() => ({
    accept: CANVAS_DRAG_TYPE,
    drop: (item: { templateType: string }) => addEntity(item.templateType),
    collect: (monitor) => ({ isOver: monitor.isOver() }),
  }), [addEntity]);

  return (
    <div style={{ display: 'flex', flex: 1, minHeight: 'calc(100vh - 180px)', gap: 0, background: '#f5f5f5' }}>

        {/* 左工具栏 */}
        <div style={{ width: 220, padding: 12, background: '#fff', borderRight: '1px solid #e8e8e8' }}>
          <EntityPalette />
          <div style={{ marginTop: 12 }}>
            <Text type="secondary" style={{ fontSize: 11 }}>
              💡 拖拽实体到右侧画布<br />
              点击 🔗 按钮建立关联<br />
              字段直接点击编辑
            </Text>
          </div>
        </div>

        {/* 中央画布 */}
        <div style={{ flex: 1, overflow: 'auto', padding: 24 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
            <Space>
              <Title level={5} style={{ margin: 0 }}>实体模型画布</Title>
              {entities.length > 0 && (
                <Tag color="processing">{entities.length} 个实体</Tag>
              )}
            </Space>
            <Space>
              <Button icon={<EyeOutlined />} onClick={() => setShowExport(true)}
                disabled={entities.length === 0}>
                导出 JSON Schema
              </Button>
              <Button type="primary" icon={<SaveOutlined />}
                disabled={entities.length === 0}>
                保存到 Program
              </Button>
            </Space>
          </div>

          <div
            ref={dropRef}
            style={{
              minHeight: 500, padding: 24, borderRadius: 12,
              background: isOver ? '#e6f4ff' : '#fafafa',
              border: `3px dashed ${isOver ? '#1677ff' : '#d9d9d9'}`,
              transition: 'all 0.2s',
            }}
          >
            {entities.length === 0 ? (
              <Empty
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                description={
                  <span>
                    <Text strong>从左侧工具栏拖拽实体到这里</Text><br />
                    <Text type="secondary">例如：Member、Order、Product</Text>
                  </span>
                }
                style={{ padding: 80 }}
              />
            ) : (
              <div style={{
                display: 'flex', flexWrap: 'wrap', gap: 24,
                justifyContent: 'flex-start', alignItems: 'flex-start',
              }}>
                {entities.map(entity => (
                  <EntityCard
                    key={entity.id}
                    entity={entity}
                    allEntities={entities}
                    relationships={relationships}
                    onUpdate={updateEntity}
                    onDelete={deleteEntity}
                    onStartRelation={(id) => { setRelationSource(id); setShowRelationModal(true); }}
                    onAddField={addField}
                    onDeleteField={deleteField}
                    onUpdateField={updateField}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 关联弹窗 */}
      <RelationModal
        open={showRelationModal}
        sourceEntityId={relationSource}
        entities={entities}
        relationships={relationships}
        onClose={() => setShowRelationModal(false)}
        onSave={(rel) => { setRelationships(prev => [...prev, rel]); message.success('关联已建立'); }}
        onDeleteRel={(id) => setRelationships(prev => prev.filter(r => r.id !== id))}
      />

      {/* 导出预览弹窗 */}
      <Drawer title="JSON Schema 导出" open={showExport} onClose={() => setShowExport(false)} width={600}>
        <pre style={{
          background: '#1e1e1e', color: '#d4d4d4', padding: 16, borderRadius: 8,
          fontSize: 12, maxHeight: 'calc(100vh - 200px)', overflow: 'auto',
        }}>
          {exportSchema()}
        </pre>
      </Drawer>
    </>
  );
};

export default EntityModeler;