import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Button, Space, Typography, Tag, Input, Select, Switch,
  message, Spin, Modal, Tooltip, Divider, Popover,
} from 'antd';
import {
  PlusOutlined, DeleteOutlined, EditOutlined, SendOutlined,
  KeyOutlined, LockOutlined, TableOutlined,
} from '@ant-design/icons';
import {
  ReactFlow, ReactFlowProvider, Background, Controls, MiniMap,
  Handle, Position, useNodesState, useEdgesState, getSmoothStepPath,
  ConnectionMode, BaseEdge, useConnection, useReactFlow, useStore,
  type Node, type Edge, type Connection, type NodeProps, type EdgeProps,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { useAppStore } from '../store';
import api from '../api';

const { Text } = Typography;

// 节点加载后自动适配视图
const FitViewOnLoad: React.FC = () => {
  const { fitView } = useReactFlow();
  const nodeCount = useStore((s: any) => s.nodeInternals?.size || 0);
  useEffect(() => {
    if (nodeCount > 0) {
      const timer = setTimeout(() => fitView({ padding: 0.2, duration: 300 }), 200);
      return () => clearTimeout(timer);
    }
  }, [nodeCount, fitView]);
  return null;
};

// ==================== 类型 ====================

interface EntityVO {
  id: number; programCode: string; entityType: string; entityCategory: string;
  version: string; status: string; description: string;
  fieldSchema: any; entityRelations: any; layoutPosition: any;
  createdAt: string; updatedAt: string;
}

interface FieldDef {
  name: string; type: string; title: string; component: string;
  dbType: string; isPrimaryKey: boolean; isForeignKey: boolean;
  isRequired: boolean; isFixed: boolean;
}

const DB_TYPE_OPTIONS = ['VARCHAR', 'INT', 'BIGINT', 'DECIMAL', 'DATE', 'TIMESTAMP', 'BOOLEAN', 'TEXT', 'JSON'];
const FIXED_FIELD_NAMES = new Set(['memberId', 'name', 'gender', 'birthday', 'tierCode', 'status', 'schemaVersion', 'createdAt', 'orderId', 'totalAmount', 'id']);

const RIGHT_HANDLE_PREFIX = 'rh_';
const LEFT_HANDLE_PREFIX = 'lh_';

// ==================== 自定义 Edge（参考 ChartDB） ====================

const EntityEdge: React.FC<any> = React.memo(
  ({ id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, selected, data, sourceHandleId, targetHandleId }: any) => {
    const relationship = data?.relationship;
    const isSelected = selected || data?.highlighted;
    const relationType = relationship?.relationType || 'ONE_TO_MANY';

    // 使用 React Flow 提供的 sourceHandleId/targetHandleId 计算偏移
    const handleKey = `${sourceHandleId || ''}-${targetHandleId || ''}`;
    const edgeIndex = Math.abs(handleKey.split('').reduce((acc: number, c: string) => acc + c.charCodeAt(0), 0)) % 8;
    const offset = (edgeIndex + 1) * 16;

    const [edgePath, labelX, labelY] = getSmoothStepPath({
      sourceX, sourceY, targetX, targetY,
      borderRadius: 14,
      sourcePosition: sourcePosition || Position.Right,
      targetPosition: targetPosition || Position.Left,
      offset,
    });

    const sourceCardinality = relationType === 'ONE_TO_MANY' ? '1' : relationType === 'MANY_TO_MANY' ? 'N' : '1';
    const targetCardinality = relationType === 'ONE_TO_MANY' ? 'N' : relationType === 'MANY_TO_MANY' ? 'N' : '1';

    // 标记放在端点处，固定偏移（不依赖连线方向）
    const markerStartX = sourceX + 20;
    const markerStartY = sourceY - 18;
    const markerEndX = targetX - 20;
    const markerEndY = targetY - 18;

    return (
      <>
        <path id={id} d={edgePath} fill="none"
          className={`!stroke-2 ${isSelected ? '!stroke-pink-600' : '!stroke-slate-400'}`} />
        <path d={edgePath} fill="none" strokeOpacity={0} strokeWidth={20}
          className="react-flow__edge-interaction" />

        {/* 基数标记 - 起点 */}
        <g transform={`translate(${markerStartX}, ${markerStartY})`}>
          <circle r={10} fill={isSelected ? '#db2777' : '#94a3b8'} />
          <text textAnchor="middle" dy="0.35em" fontSize={11} fontWeight="bold" fill="#fff">{sourceCardinality}</text>
        </g>

        {/* 基数标记 - 终点 */}
        <g transform={`translate(${markerEndX}, ${markerEndY})`}>
          <circle r={10} fill={isSelected ? '#db2777' : '#94a3b8'} />
          <text textAnchor="middle" dy="0.35em" fontSize={11} fontWeight="bold" fill="#fff">{targetCardinality}</text>
        </g>

        {/* 编辑按钮 - 仅选中时显示 */}
        {isSelected && (
          <foreignObject width={24} height={24} x={labelX - 12} y={labelY - 12}
            className="overflow-visible" style={{ pointerEvents: 'all' }}>
            <button className="flex size-6 items-center justify-center rounded-full border-2 border-pink-600 bg-white shadow-lg hover:scale-110 transition-transform"
              title="编辑关系">
              <EditOutlined className="text-pink-600" style={{ fontSize: 12 }} />
            </button>
          </foreignObject>
        )}
      </>
    );
  }
);
EntityEdge.displayName = 'EntityEdge';

// ==================== 字段行组件 ====================

const FieldRow: React.FC<{
  field: FieldDef; focused: boolean; tableId: string;
  highlighted?: boolean;
}> = ({ field, focused, tableId, highlighted }) => {
  return (
    <div className={`relative flex h-8 items-center px-2 text-xs border-b border-slate-200 dark:border-slate-800 transition-colors ${highlighted ? 'bg-pink-100' : ''}`}>
      {/* 左侧 Handle */}
      <Handle type="target" position={Position.Left} id={`${LEFT_HANDLE_PREFIX}${field.name}`}
        className={`!absolute !left-0 !top-1/2 !-translate-y-1/2 !w-3 !h-3 !rounded-full !border-2 !border-white !bg-slate-400 transition-all duration-150 ${focused ? '!opacity-100' : '!opacity-0'}`}
        isConnectable={true} />
      {/* 图标 */}
      <span className="mr-1.5 shrink-0">
        {field.isPrimaryKey && <KeyOutlined style={{ color: '#faad14', fontSize: 10 }} />}
        {field.isFixed && !field.isPrimaryKey && <LockOutlined style={{ color: '#999', fontSize: 10 }} />}
      </span>
      <span className="flex-1 truncate">{field.title || field.name}</span>
      <span className="ml-2 shrink-0 text-[10px] text-slate-400">{field.dbType || field.type}</span>
      {/* 右侧 Handle */}
      <Handle type="source" position={Position.Right} id={`${RIGHT_HANDLE_PREFIX}${field.name}`}
        className={`!absolute !right-0 !top-1/2 !-translate-y-1/2 !w-3 !h-3 !rounded-full !border-2 !border-white !bg-slate-400 transition-all duration-150 ${focused ? '!opacity-100' : '!opacity-0'}`}
        isConnectable={true} />
    </div>
  );
};

// ==================== 实体节点 ====================

const EntityNode: React.FC<NodeProps> = React.memo(({ id, selected, data }) => {
  const entity = (data as any).entity as EntityVO;
  const onAddField = (data as any).onAddField as (fn: string, fd: any) => void;
  const onDeleteField = (data as any).onDeleteField as (fn: string) => void;
  const onPublishEntity = (data as any).onPublishEntity as () => void;
  const onExitEdit = (data as any).onExitEdit as (() => void) | undefined;
  const highlightedFields = (data as any).highlightedFields as Set<string> | undefined;

  const fields = useMemo(() => parseFields(entity), [entity]);
  const [editing, setEditing] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [editingField, setEditingField] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<any>({ name: '', title: '', dbType: 'VARCHAR', isPrimaryKey: false, isRequired: false });
  const [isHovering, setIsHovering] = useState(false);
  const connection = useConnection();

  const isTarget = connection.inProgress && connection.fromNode.id !== id && isHovering;
  const focused = selected || isHovering || isTarget;

  const startEdit = (f?: FieldDef) => {
    setEditForm(f ? { name: f.name, title: f.title, dbType: f.dbType, isPrimaryKey: f.isPrimaryKey, isRequired: f.isRequired }
      : { name: '', title: '', dbType: 'VARCHAR', isPrimaryKey: false, isRequired: false });
    setEditingField(f ? f.name : '__new__');
  };

  const handleSave = () => {
    if (!editForm.name.trim()) { message.warning('字段名不能为空'); return; }
    const jsonType = editForm.dbType === 'INT' || editForm.dbType === 'BIGINT' || editForm.dbType === 'DECIMAL' ? 'number' : editForm.dbType === 'BOOLEAN' ? 'boolean' : 'string';
    const fieldDef: any = {
      type: jsonType, title: editForm.title || editForm.name,
      'x-db-metadata': { dataType: editForm.dbType || 'VARCHAR', primaryKey: editForm.isPrimaryKey, nullable: !editForm.isRequired, foreignKey: false },
      'x-ui-metadata': { label: editForm.title || editForm.name, component: 'Input' },
    };
    onAddField(editForm.name, fieldDef);
    setEditingField(null);
  };

  const handleDelete = (fieldName: string) => {
    Modal.confirm({ title: `删除字段 "${fieldName}"？`, onOk: () => onDeleteField(fieldName) });
  };

  const exitEdit = () => {
    setEditing(false);
    setEditingField(null);
    onExitEdit?.();
  };

  const extList = fields.filter(f => !f.isFixed);
  const fixedList = fields.filter(f => f.isFixed);

  return (
    <div
      className={`flex w-full flex-col border-2 bg-white rounded-lg shadow-sm transition-all duration-200 ${selected || isTarget ? 'border-pink-600' : 'border-slate-300'}`}
      onDoubleClick={() => !editing && setEditing(true)}
      onMouseEnter={() => setIsHovering(true)}
      onMouseLeave={() => setIsHovering(false)}
      style={{ minWidth: expanded ? 400 : 240, cursor: 'grab' }}
    >
      <div className="h-1.5 rounded-t-md" style={{ backgroundColor: '#1677ff' }} />
      <div className="flex h-9 items-center justify-between bg-slate-100 px-2">
        <div className="flex items-center gap-1.5 min-w-0">
          <TableOutlined className="size-3.5 shrink-0 text-slate-600" />
          <span className="truncate text-sm font-bold">{entity.entityType}</span>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <Tag style={{ fontSize: 10, margin: 0, lineHeight: '16px' }} color={entity.status === 'PUBLISHED' ? 'green' : 'orange'}>v{entity.version}</Tag>
          <Tooltip title={expanded ? '收起宽度' : '展开宽度'}>
            <Button size="small" type="text" className="!h-6 !w-6 !p-0"
              onClick={(e) => { e.stopPropagation(); setExpanded(!expanded); }}>
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                {expanded
                  ? <><line x1="9" y1="4" x2="5" y2="7" /><line x1="9" y1="10" x2="5" y2="7" /></>
                  : <><line x1="5" y1="4" x2="9" y2="7" /><line x1="5" y1="10" x2="9" y2="7" /></>
                }
              </svg>
            </Button>
          </Tooltip>
          {editing && <Button size="small" type="text" className="!h-6 !w-6 !p-0" onClick={exitEdit}>✕</Button>}
        </div>
      </div>

      <div>
        {fields.map(f => {
          const isEditingThis = editing && editingField === f.name;
          const showEditBtn = editing && !f.isFixed && !isEditingThis;
          const highlight = highlightedFields?.has(f.name);
          return (
            <div key={f.name} className={`relative flex h-8 items-center px-2 text-xs border-b border-slate-200 transition-colors ${highlight ? 'bg-pink-100' : ''}`}>
              <Handle type="target" position={Position.Left} id={`${LEFT_HANDLE_PREFIX}${f.name}`}
                className={`!absolute !-left-1.5 !top-1/2 !-translate-y-1/2 !w-3 !h-3 !rounded-full !border-2 !border-white !bg-slate-400 transition-all duration-150 ${focused ? '!opacity-100' : '!opacity-0'}`}
                isConnectable={true} />
              {f.isPrimaryKey && <KeyOutlined style={{ color: '#faad14', fontSize: 10, marginRight: 4 }} />}
              {f.isFixed && !f.isPrimaryKey && <LockOutlined style={{ color: '#999', fontSize: 10, marginRight: 4 }} />}
              {isEditingThis ? (
                <div className="nodrag flex items-center gap-1 flex-1 bg-yellow-50 -mx-1 px-1 py-0.5 rounded">
                  <Input size="small" className="!w-16 !text-[11px]" placeholder="字段名" value={editForm.name} onChange={e => setEditForm({ ...editForm, name: e.target.value })} />
                  <Input size="small" className="!w-14 !text-[11px]" placeholder="显示名" value={editForm.title} onChange={e => setEditForm({ ...editForm, title: e.target.value })} />
                  <Select size="small" className="!w-20 !text-[11px]" value={editForm.dbType || 'VARCHAR'} onChange={v => setEditForm({ ...editForm, dbType: v })}
                    options={DB_TYPE_OPTIONS.map(t => ({ value: t, label: t }))}
                    getPopupContainer={() => document.body} />
                  <Tooltip title="主键"><Switch size="small" checked={editForm.isPrimaryKey} onChange={v => setEditForm({ ...editForm, isPrimaryKey: v })} /></Tooltip>
                  <Button size="small" type="link" className="!h-5 !text-xs !p-0" onClick={handleSave}>✓</Button>
                  <Button size="small" type="link" className="!h-5 !text-xs !p-0" onClick={() => setEditingField(null)}>✕</Button>
                </div>
              ) : (
                <>
                  <span className="flex-1 truncate">{f.title || f.name}</span>
                  <span className="text-[10px] text-slate-400 mr-1">{f.dbType}</span>
                  {showEditBtn && (
                    <div className="flex items-center gap-0.5" onMouseDownCapture={e => e.stopPropagation()}>
                      <Button size="small" type="text" className="!h-5 !w-5 !p-0" onClick={() => startEdit(f)}>✎</Button>
                      <Button size="small" type="text" danger className="!h-5 !w-5 !p-0" onClick={() => handleDelete(f.name)}>✕</Button>
                    </div>
                  )}
                </>
              )}
              <Handle type="source" position={Position.Right} id={`${RIGHT_HANDLE_PREFIX}${f.name}`}
                className={`!absolute !-right-1.5 !top-1/2 !-translate-y-1/2 !w-3 !h-3 !rounded-full !border-2 !border-white !bg-slate-400 transition-all duration-150 ${focused ? '!opacity-100' : '!opacity-0'}`}
                isConnectable={true} />
            </div>
          );
        })}
        {editing && (
          <>
            {editingField === '__new__' && (
              <div className="flex items-center gap-1 px-1 py-1 bg-yellow-50 border-b">
                <Input size="small" className="!w-16 !text-[11px]" placeholder="字段名" value={editForm.name} onChange={e => setEditForm({ ...editForm, name: e.target.value })} />
                <Input size="small" className="!w-14 !text-[11px]" placeholder="显示名" value={editForm.title} onChange={e => setEditForm({ ...editForm, title: e.target.value })} />
                <Select size="small" className="!w-16 !text-[11px]" value={editForm.dbType} onChange={v => setEditForm({ ...editForm, dbType: v })} options={DB_TYPE_OPTIONS.map(t => ({ value: t, label: t }))} />
                <Tooltip title="主键"><Switch size="small" checked={editForm.isPrimaryKey} onChange={v => setEditForm({ ...editForm, isPrimaryKey: v })} /></Tooltip>
                <Button size="small" type="link" className="!h-5 !text-xs !p-0" onClick={handleSave}>✓</Button>
                <Button size="small" type="link" className="!h-5 !text-xs !p-0" onClick={() => setEditingField(null)}>✕</Button>
              </div>
            )}
            <div className="flex items-center gap-2 px-2 py-1.5 bg-slate-50 border-t">
              <Button size="small" type="dashed" className="nodrag !text-xs" onClick={() => startEdit()}>+ 添加字段</Button>
              {entity.status !== 'PUBLISHED' && (
                <Button size="small" type="primary" className="!text-xs" icon={<SendOutlined />} onClick={onPublishEntity}>发布</Button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
});
EntityNode.displayName = 'EntityNode';

// ==================== 主组件 ====================

const EntityDesigner: React.FC = () => {
  const programCode = useAppStore(s => s.currentProgramCode);
  const [entities, setEntities] = useState<EntityVO[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [newEntity, setNewEntity] = useState({ entityType: '', displayName: '', category: 'BUSINESS' });
  const [selectedEdge, setSelectedEdge] = useState<string | null>(null);
  const [editRelPopover, setEditRelPopover] = useState<{ edgeId: string; pos: { x: number; y: number } } | null>(null);

  const nodeTypes = useMemo(() => ({ entityNode: EntityNode }), []);
  const edgeTypes: any = useMemo(() => ({ entityEdge: EntityEdge }), []);

  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [rfInstance, setRfInstance] = useState<any>(null);

  const fetchEntities = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get('/entity-designer/entities');
      const list: EntityVO[] = res?.data?.data || [];
      setEntities(list);

      const rfnodes: Node[] = list.map((e, i) => ({
        id: e.entityType,
        type: 'entityNode',
        position: e.layoutPosition?.x != null ? { x: e.layoutPosition.x, y: e.layoutPosition.y } : { x: 40 + (i % 4) * 340, y: 40 + Math.floor(i / 4) * 340 },
        data: {
          entity: e,
          onAddField: (fn: string, fd: any) => handleAddField(e.entityType, fn, fd),
          onDeleteField: (fn: string) => handleDeleteField(e.entityType, fn),
          onPublishEntity: () => handlePublish(e.entityType),
          editModeKey,
        },
      }));
      setNodes(rfnodes);

      const rfedges: Edge[] = [];
      for (const e of list) {
        if (!e.entityRelations) continue;
        for (const [, relList] of Object.entries(e.entityRelations)) {
          if (Array.isArray(relList)) {
            for (const r of relList as any[]) {
              rfedges.push({
                id: r.id || `${r.sourceEntity}-${r.targetEntity}-${r.sourceField}`,
                source: r.sourceEntity, target: r.targetEntity,
                sourceHandle: `${RIGHT_HANDLE_PREFIX}${r.sourceField}`,
                targetHandle: `${LEFT_HANDLE_PREFIX}${r.targetField}`,
                type: 'entityEdge',
                data: { relationship: { ...r, sourceField: r.sourceField, targetField: r.targetField, relationType: r.relationType || 'ONE_TO_MANY' } },
              });
            }
          }
        }
      }
      setEdges(rfedges);
      // 恢复视口
      setTimeout(() => {
        if (rfInstance) {
          const savedViewport = sessionStorage.getItem('entity-designer-viewport');
          if (savedViewport) {
            try { rfInstance.setViewport(JSON.parse(savedViewport)); } catch {}
          } else {
            rfInstance.fitView({ padding: 0.2 });
          }
        }
      }, 300);
    } catch { setEntities([]); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchEntities(); }, []);

  // 选中连线时高亮关联字段
  useEffect(() => {
    if (selectedEdge) {
      const edge = edges.find(e => e.id === selectedEdge);
      const rel = (edge as any)?.data?.relationship;
      if (rel) {
        setNodes(nds => nds.map(n => {
          const fields = new Set<string>();
          if (n.id === rel.sourceEntity) fields.add(rel.sourceField);
          if (n.id === rel.targetEntity) fields.add(rel.targetField);
          return { ...n, data: { ...n.data, highlightedFields: fields } };
        }));
      }
    } else {
      setNodes(nds => nds.map(n => ({ ...n, data: { ...n.data, highlightedFields: undefined } })));
    }
  }, [selectedEdge, edges]);

  const handleAddField = useCallback(async (entityType: string, fieldName: string, fieldDef: any) => {
    setSaving(true);
    try {
      await api.post(`/entity-designer/entities/${entityType}/fields`, { fieldName, fieldDef });
      message.success('字段已添加');
      setNodes(nds => nds.map(n => {
        if (n.id !== entityType) return n;
        const ent = (n.data as any).entity as EntityVO;
        const updated = { ...ent, fieldSchema: { ...ent.fieldSchema, properties: { ...(ent.fieldSchema?.properties || {}), [fieldName]: fieldDef } } };
        return { ...n, data: { ...n.data, entity: updated } };
      }));
    } catch (e: any) { message.error('添加失败: ' + (e.response?.data?.message || e.message)); }
    finally { setSaving(false); }
  }, [setNodes]);

  const handleDeleteField = async (entityType: string, fieldName: string) => {
    try {
      await api.delete(`/entity-designer/entities/${entityType}/fields/${fieldName}`);
      message.success('字段已删除');
      setNodes(nds => nds.map(n => {
        if (n.id !== entityType) return n;
        const ent = (n.data as any).entity as EntityVO;
        const newProps = { ...(ent.fieldSchema?.properties || {}) };
        delete newProps[fieldName];
        return { ...n, data: { ...n.data, entity: { ...ent, fieldSchema: { ...ent.fieldSchema, properties: newProps } } } };
      }));
    } catch (e: any) { message.error('删除失败: ' + (e.response?.data?.message || e.message)); }
  };

  const handlePublish = async (entityType: string) => {
    setSaving(true);
    try { await api.post(`/entity-designer/entities/${entityType}/publish`); message.success('实体已发布'); }
    catch (e: any) { message.error('发布失败: ' + (e.response?.data?.message || e.message)); }
    finally { setSaving(false); }
  };

  const onConnect = useCallback(async (connection: Connection) => {
    const sourceField = connection.sourceHandle?.replace(RIGHT_HANDLE_PREFIX, '') || '';
    const targetField = connection.targetHandle?.replace(LEFT_HANDLE_PREFIX, '') || '';
    if (!connection.source || !connection.target) return;

    const rel = { sourceEntity: connection.source, targetEntity: connection.target, relationType: 'ONE_TO_MANY', sourceField, targetField, onDelete: 'RESTRICT', description: `${sourceField} → ${targetField}` };
    try {
      await api.post(`/entity-designer/entities/${connection.source}/relations`, rel);
      message.success('关系已创建');
      const newEdge: Edge = {
        id: `rel_${Date.now()}`, source: connection.source, target: connection.target,
        sourceHandle: connection.sourceHandle || '', targetHandle: connection.targetHandle || '',
        type: 'entityEdge', data: { relationship: { ...rel, id: `rel_${Date.now()}` } },
      };
      setEdges(prev => [...prev, newEdge]);
    } catch (e: any) { message.error('创建失败: ' + (e.response?.data?.message || e.message)); }
  }, [setEdges]);

  const onEdgeClick = useCallback((_: any, edge: any) => {
    setSelectedEdge(edge.id === selectedEdge ? null : edge.id);
  }, [selectedEdge]);

  const onEdgeDoubleClick = useCallback((_: any, edge: any) => {
    setEditRelPopover({ edgeId: edge.id, pos: { x: _.clientX, y: _.clientY } });
  }, []);

  const [editModeKey, setEditModeKey] = useState(0);

  const onPaneClick = useCallback(() => {
    setSelectedEdge(null);
    setEditRelPopover(null);
    setEditModeKey(k => k + 1); // 强制所有节点重新挂载，退出编辑模式
  }, []);

  const handleDeleteEdge = () => {
    if (!selectedEdge) return;
    const edge = edges.find(e => e.id === selectedEdge);
    if (!edge) return;
    const rel: any = (edge as any).data?.relationship;
    Modal.confirm({ title: `删除关系 "${rel?.sourceField} → ${rel?.targetField}"？`, onOk: async () => {
      try {
        await api.delete(`/entity-designer/entities/${edge.source}/relations/${edge.source}/${edge.id}`);
        setEdges(prev => prev.filter(e => e.id !== selectedEdge));
        setSelectedEdge(null);
        message.success('关系已删除');
      } catch (e: any) { message.error('删除失败'); }
    }});
  };

  const handleNodeDragStop = useCallback((_: any, node: any) => {
    const pos = { x: node.position.x, y: node.position.y };
    api.put(`/entity-designer/entities/${node.id}/position`, pos).catch(() => {});
    // 保存视口
    if (rfInstance) {
      sessionStorage.setItem('entity-designer-viewport', JSON.stringify(rfInstance.getViewport()));
    }
  }, [rfInstance]);

  // 加载后打印节点位置
  useEffect(() => {
    if (nodes.length > 0) {
      console.log('Nodes loaded:', nodes.map(n => ({ id: n.id, pos: n.position })));
    }
  }, [nodes.length]);

  const handleCreateEntity = async () => {
    if (!newEntity.entityType.trim()) { message.warning('实体标识不能为空'); return; }
    setSaving(true);
    try { await api.post('/entity-designer/entities', newEntity); message.success('实体创建成功'); setCreateModalOpen(false); setNewEntity({ entityType: '', displayName: '', category: 'BUSINESS' }); fetchEntities(); }
    catch (e: any) { message.error('创建失败: ' + (e.response?.data?.message || e.message)); }
    finally { setSaving(false); }
  };

  const handleRelationTypeChange = (relType: string) => {
    if (!editRelPopover) return;
    setEdges(prev => prev.map(e => {
      if (e.id !== editRelPopover.edgeId) return e;
      return { ...e, data: { ...e.data, relationship: { ...(e.data?.relationship as any || {}), relationType: relType } } };
    }));
    setEditRelPopover(null);
  };

  if (loading) return <Spin style={{ display: 'block', margin: '100px auto' }} />;

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', position: 'relative' }}>
      <style>{`
        .react-flow__handle-connecting { opacity: 1 !important; background: #ec4899 !important; }
        .react-flow__handle-valid { opacity: 1 !important; background: #22c55e !important; }
      `}</style>

      {/* SVG markers */}
      <svg style={{ position: 'absolute', width: 0, height: 0 }}>
        <defs>
          <marker id="edge-marker" viewBox="0 0 10 7" refX="9" refY="3.5" markerWidth="8" markerHeight="6" orient="auto">
            <polygon points="0 0, 10 3.5, 0 7" fill="#94a3b8" />
          </marker>
          <marker id="edge-marker-selected" viewBox="0 0 10 7" refX="9" refY="3.5" markerWidth="8" markerHeight="6" orient="auto">
            <polygon points="0 0, 10 3.5, 0 7" fill="#db2777" />
          </marker>
        </defs>
      </svg>

      {/* 浮动工具栏 */}
      <div style={{ position: 'absolute', top: 16, left: 16, zIndex: 10, display: 'flex', alignItems: 'center', gap: 4, padding: '6px 10px', background: '#fff', border: '1px solid #e8e8e8', borderRadius: 8, boxShadow: '0 2px 8px rgba(0,0,0,0.08)' }}>
        <Tooltip title="新建实体"><Button icon={<PlusOutlined />} onClick={() => setCreateModalOpen(true)} type="text" /></Tooltip>
        <Divider type="vertical" style={{ margin: '0 4px' }} />
        <Text type="secondary" style={{ fontSize: 12 }}>{entities.length} 个实体</Text>
        {selectedEdge && (
          <>
            <Divider type="vertical" style={{ margin: '0 4px' }} />
            <Button size="small" danger onClick={handleDeleteEdge}>删除连线</Button>
          </>
        )}
      </div>

      <ReactFlowProvider>
        <ReactFlow
          nodes={nodes} edges={edges}
          onNodesChange={onNodesChange} onEdgesChange={onEdgesChange}
          onInit={setRfInstance}
          onConnect={onConnect}
          onEdgeClick={onEdgeClick} onEdgeDoubleClick={onEdgeDoubleClick}
          onPaneClick={onPaneClick}
          onNodeDragStop={handleNodeDragStop}
          nodeTypes={nodeTypes} edgeTypes={edgeTypes}
          connectionMode={ConnectionMode.Loose}
          connectionLineStyle={{ stroke: '#ec4899', strokeWidth: 2 }}
          deleteKeyCode={['Backspace', 'Delete']}
          style={{ background: '#f8fafc' }}
        >
          <Background color="#e2e8f0" gap={20} />
          <Controls />
          <MiniMap nodeStrokeWidth={3} style={{ height: 120 }} />
        </ReactFlow>
      </ReactFlowProvider>

      {/* 关系编辑 Popover */}
      {editRelPopover && (
        <div style={{ position: 'fixed', left: editRelPopover.pos.x, top: editRelPopover.pos.y, zIndex: 1000, background: '#fff', border: '1px solid #e8e8e8', borderRadius: 8, padding: 12, boxShadow: '0 4px 12px rgba(0,0,0,0.15)', minWidth: 200 }}>
          <div style={{ marginBottom: 8, fontSize: 12, color: '#666' }}>关系类型</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {['ONE_TO_ONE', 'ONE_TO_MANY', 'MANY_TO_MANY'].map(t => (
              <Button key={t} type="text" size="small" style={{ textAlign: 'left', fontWeight: (edges.find(e => e.id === editRelPopover.edgeId)?.data as any)?.relationship?.relationType === t ? 600 : 400 }}
                onClick={() => handleRelationTypeChange(t)}>
                {t === 'ONE_TO_ONE' ? '1 : 1 (一对一)' : t === 'ONE_TO_MANY' ? '1 : N (一对多)' : 'N : N (多对多)'}
              </Button>
            ))}
          </div>
          <Divider style={{ margin: '8px 0' }} />
          <Button size="small" danger block onClick={() => {
            const edge = edges.find(e => e.id === editRelPopover.edgeId);
            if (edge) {
              api.delete(`/entity-designer/entities/${edge.source}/relations/${edge.source}/${edge.id}`).catch(() => {});
              setEdges(prev => prev.filter(e => e.id !== editRelPopover.edgeId));
            }
            setEditRelPopover(null);
          }}>删除关系</Button>
        </div>
      )}

      {/* 新建实体弹窗 */}
      <Modal title="新建实体" open={createModalOpen} onCancel={() => setCreateModalOpen(false)} onOk={handleCreateEntity} confirmLoading={saving} width={400}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div><Text style={{ fontSize: 12 }}>实体标识 *</Text><Input value={newEntity.entityType} onChange={e => setNewEntity({ ...newEntity, entityType: e.target.value.toUpperCase() })} placeholder="如: MEMBER, ORDER" /></div>
          <div><Text style={{ fontSize: 12 }}>显示名称</Text><Input value={newEntity.displayName} onChange={e => setNewEntity({ ...newEntity, displayName: e.target.value })} placeholder="如: 会员" /></div>
        </div>
      </Modal>
    </div>
  );
};

function parseFields(entity: EntityVO): FieldDef[] {
  const props = entity.fieldSchema?.properties;
  if (!props) return [];
  return Object.entries(props).map(([name, def]: [string, any]) => {
    const dbMeta = def['x-db-metadata'] || {};
    const uiMeta = def['x-ui-metadata'] || {};
    return {
      name, type: def.type || 'string', title: uiMeta.label || def.title || name,
      component: uiMeta.component || 'Input', dbType: dbMeta.dataType || (def.type === 'number' ? 'INT' : 'VARCHAR'),
      isPrimaryKey: dbMeta.primaryKey || false, isForeignKey: dbMeta.foreignKey || false,
      isRequired: !dbMeta.nullable || false, isFixed: FIXED_FIELD_NAMES.has(name),
    };
  }).sort((a, b) => {
    if (a.isFixed !== b.isFixed) return a.isFixed ? -1 : 1;
    if (a.isPrimaryKey !== b.isPrimaryKey) return a.isPrimaryKey ? -1 : 1;
    return 0;
  });
}

export default EntityDesigner;