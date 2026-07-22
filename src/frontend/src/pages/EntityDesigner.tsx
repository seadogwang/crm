import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Button, Space, Typography, Tag, Input, Select, Switch,
  message, Spin, Modal, Tooltip, Divider, Popover,
} from 'antd';
import {
  PlusOutlined, DeleteOutlined, EditOutlined, SendOutlined,
  KeyOutlined, LockOutlined, TableOutlined, AimOutlined,
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

// 节点加载后自动适配视图 — 居中显示所有实体
const FitViewOnLoad: React.FC<{ nodeCount: number }> = ({ nodeCount }) => {
  const { fitView } = useReactFlow();
  useEffect(() => {
    if (nodeCount > 0) {
      // 延迟确保节点完成渲染后再居中
      const timer = setTimeout(() => {
        fitView({ padding: 0.3, duration: 500, maxDuration: 1000 });
      }, 400);
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
  showInUI?: boolean; availableInRules?: boolean;
  masterData?: any;
}

const DB_TYPE_OPTIONS = ['VARCHAR', 'INT', 'BIGINT', 'DECIMAL', 'DATE', 'TIMESTAMP', 'BOOLEAN', 'TEXT', 'JSON', 'MASTER_DATA'];
const FIXED_FIELD_NAMES = new Set(['memberId', 'member_id', 'name', 'gender', 'birthday', 'enroll_channel', 'enroll_time', 'tierCode', 'tier_code', 'status', 'schemaVersion', 'createdAt', 'created_at', 'updated_at', 'phone', 'email', 'orderId', 'totalAmount', 'id']);

const LEFT_HANDLE_PREFIX = 'lh_';
const RIGHT_HANDLE_PREFIX = 'rh_';
// 左右两侧各有 source 和 target handle，支持连线方向自动翻转
const LEFT_SOURCE_PREFIX = 'ls_';
const RIGHT_TARGET_PREFIX = 'rt_';

// ==================== 自定义 Edge（参考 ChartDB） ====================

const EntityEdge: React.FC<any> = React.memo(
  ({ id, source, target, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, selected, data }: any) => {
    const relationship = data?.relationship;
    const isSelected = selected || data?.highlighted;
    const relationType = relationship?.relationType || 'ONE_TO_MANY';

    const [edgePath, labelX, labelY] = getSmoothStepPath({
      sourceX, sourceY, targetX, targetY,
      sourcePosition: sourcePosition || Position.Right,
      targetPosition: targetPosition || Position.Left,
      borderRadius: 14,
    });

    const sourceCardinality = relationType === 'ONE_TO_MANY' || relationType === 'ONE_TO_ONE' ? '1' : 'N';
    const targetCardinality = relationType === 'MANY_TO_ONE' || relationType === 'ONE_TO_ONE' ? '1' : 'N';

    const markerStartX = sourceX + (sourcePosition === Position.Right ? 18 : -18);
    const markerStartY = sourceY;
    const markerEndX = targetX + (targetPosition === Position.Right ? 18 : -18);
    const markerEndY = targetY;

    return (
      <>
        <path id={id} d={edgePath} fill="none"
          className={`!stroke-2 ${isSelected ? '!stroke-pink-600' : '!stroke-slate-400'}`} />
        <path d={edgePath} fill="none" strokeOpacity={0} strokeWidth={20}
          className="react-flow__edge-interaction" />

        <g transform={`translate(${markerStartX}, ${markerStartY})`}>
          <circle r={9} fill={isSelected ? '#db2777' : '#94a3b8'} />
          <text textAnchor="middle" dy="0.35em" fontSize={10} fontWeight="bold" fill="#fff">{sourceCardinality}</text>
        </g>

        <g transform={`translate(${markerEndX}, ${markerEndY})`}>
          <circle r={9} fill={isSelected ? '#db2777' : '#94a3b8'} />
          <text textAnchor="middle" dy="0.35em" fontSize={10} fontWeight="bold" fill="#fff">{targetCardinality}</text>
        </g>

        {isSelected && (
          <foreignObject width={24} height={24} x={labelX - 12} y={labelY - 12}
            className="overflow-visible" style={{ pointerEvents: 'all' }}>
            <button className="relative flex size-6 items-center justify-center rounded-full border-2 border-pink-600 bg-white shadow-lg transition-all hover:scale-110 hover:bg-pink-50"
              title="编辑关系"
              onMouseDown={e => e.stopPropagation()}
              onClick={e => {
                e.stopPropagation();
                const rect = (e.target as HTMLElement).closest('button')?.getBoundingClientRect();
                if (rect) {
                  const evt = new CustomEvent('edge-button-click', { bubbles: true, detail: { edgeId: id, x: rect.left, y: rect.bottom + 4 } });
                  window.dispatchEvent(evt);
                }
              }}>
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="size-4 text-pink-600" aria-hidden="true"><circle cx="12" cy="12" r="1"></circle><circle cx="19" cy="12" r="1"></circle><circle cx="5" cy="12" r="1"></circle></svg>
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
      {/* 左侧：target + source */}
      <Handle type="target" position={Position.Left} id={`${LEFT_HANDLE_PREFIX}${field.name}`}
        className={`!absolute !left-0 !top-1/2 !-translate-y-1/2 !w-3 !h-3 !rounded-full !border-2 !border-white !bg-blue-400 transition-all duration-150 ${focused ? '!opacity-100' : '!opacity-0'}`}
        isConnectable={true} />
      <Handle type="source" position={Position.Left} id={`${LEFT_SOURCE_PREFIX}${field.name}`}
        className={`!absolute !left-0 !top-1/2 !-translate-y-1/2 !w-3 !h-3 !rounded-full !border-2 !border-white !bg-green-400 transition-all duration-150 ${focused ? '!opacity-100' : '!opacity-0'}`}
        isConnectable={true} />
      {/* 图标 */}
      <span className="mr-1.5 shrink-0">
        {field.isPrimaryKey && <KeyOutlined style={{ color: '#faad14', fontSize: 10 }} />}
        {field.isFixed && !field.isPrimaryKey && <LockOutlined style={{ color: '#999', fontSize: 10 }} />}
      </span>
      <span className="flex-1 truncate">{field.title || field.name}</span>
      <span className="ml-2 shrink-0 text-[10px] text-slate-400">{field.dbType || field.type}</span>
      {/* 右侧：source + target */}
      <Handle type="source" position={Position.Right} id={`${RIGHT_HANDLE_PREFIX}${field.name}`}
        className={`!absolute !right-0 !top-1/2 !-translate-y-1/2 !w-3 !h-3 !rounded-full !border-2 !border-white !bg-green-400 transition-all duration-150 ${focused ? '!opacity-100' : '!opacity-0'}`}
        isConnectable={true} />
      <Handle type="target" position={Position.Right} id={`${RIGHT_TARGET_PREFIX}${field.name}`}
        className={`!absolute !right-0 !top-1/2 !-translate-y-1/2 !w-3 !h-3 !rounded-full !border-2 !border-white !bg-blue-400 transition-all duration-150 ${focused ? '!opacity-100' : '!opacity-0'}`}
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
  const [editForm, setEditForm] = useState<any>({ name: '', title: '', dbType: 'VARCHAR', isPrimaryKey: false, isRequired: false, showInUI: true, availableInRules: true,
    masterDataCode: '', masterDataType: 'ENUM', masterValueField: 'code', masterLabelField: 'label', masterComponent: 'select' });
  const [isHovering, setIsHovering] = useState(false);
  const connection = useConnection();
  const [masterDataOptions, setMasterDataOptions] = useState<{ label: string; value: string }[]>([]);

  useEffect(() => {
    api.get('/master-data/definitions').then(({ data }: any) => {
      setMasterDataOptions((data?.data || []).map((d: any) => ({
        label: `${d.dataName} (${d.dataCode})`, value: d.dataCode,
      })));
    }).catch(() => {
      setMasterDataOptions([
        { label: 'GENDER (性别)', value: 'GENDER' },
        { label: 'CHANNEL (渠道)', value: 'CHANNEL' },
        { label: 'ORDER_STATUS (订单状态)', value: 'ORDER_STATUS' },
      ]);
    });
  }, []);

  const isTarget = connection.inProgress && connection.fromNode.id !== id && isHovering;
  const focused = selected || isHovering || isTarget;

  const startEdit = (f?: FieldDef) => {
    setEditForm(f ? { name: f.name, title: f.title, dbType: f.masterData ? 'MASTER_DATA' : f.dbType, isPrimaryKey: f.isPrimaryKey, isRequired: f.isRequired,
      showInUI: f.showInUI ?? true, availableInRules: f.availableInRules ?? true,
      masterDataCode: f.masterData?.dataCode || '', masterDataType: f.masterData?.dataType || 'ENUM',
      masterValueField: f.masterData?.valueField || 'code', masterLabelField: f.masterData?.labelField || 'label',
      masterComponent: f.masterData?.component || 'select' }
      : { name: '', title: '', dbType: 'VARCHAR', isPrimaryKey: false, isRequired: false, showInUI: true, availableInRules: true,
        masterDataCode: '', masterDataType: 'ENUM', masterValueField: 'code', masterLabelField: 'label', masterComponent: 'select' });
    setEditingField(f ? f.name : '__new__');
  };

  const handleSave = () => {
    if (!editForm.name.trim()) { message.warning('字段名不能为空'); return; }
    const isMaster = editForm.dbType === 'MASTER_DATA' || !!editForm.masterDataCode;
    const jsonType = editForm.dbType === 'INT' || editForm.dbType === 'BIGINT' || editForm.dbType === 'DECIMAL' ? 'number' : editForm.dbType === 'BOOLEAN' ? 'boolean' : 'string';
    const fieldDef: any = {
      type: jsonType, title: editForm.title || editForm.name,
      'x-db-metadata': { dataType: editForm.dbType === 'MASTER_DATA' ? 'VARCHAR' : (editForm.dbType || 'VARCHAR'), primaryKey: editForm.isPrimaryKey, nullable: !editForm.isRequired, foreignKey: false },
      'x-ui-metadata': { label: editForm.title || editForm.name, component: isMaster ? (editForm.masterComponent || 'select') : 'Input', showInUI: editForm.showInUI ?? true, availableInRules: editForm.availableInRules ?? true },
    };
    if (editForm.masterDataCode) {
      fieldDef['x-master-data'] = {
        dataCode: editForm.masterDataCode,
        dataType: editForm.masterDataType || 'ENUM',
        valueField: editForm.masterValueField || 'code',
        labelField: editForm.masterLabelField || 'label',
        component: editForm.masterComponent || 'select',
      };
    }
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

  const extList = fields.filter(f => !f.isFixed && f.showInUI !== false);
  const fixedList = fields.filter(f => f.isFixed && f.showInUI !== false);

  return (
    <div
      className={`flex w-full flex-col border-2 bg-white rounded-lg shadow-sm transition-all duration-200 ${selected || isTarget ? 'border-pink-600' : 'border-slate-300'}`}
      onDoubleClick={() => !editing && setEditing(true)}
      onMouseEnter={() => setIsHovering(true)}
      onMouseLeave={() => setIsHovering(false)}
      style={{ minWidth: expanded ? 520 : 240, cursor: 'grab' }}
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

      {editing && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1.2fr 36px 36px 36px 48px', alignItems: 'center', padding: '0 8px', height: 28, fontSize: 10, color: '#94a3b8', background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
          <span>字段</span>
          <span>显示名称</span>
          <span>类型</span>
          <span style={{ textAlign: 'center' }}>主键</span>
          <span style={{ textAlign: 'center' }}>界面</span>
          <span style={{ textAlign: 'center' }}>规则</span>
          <span style={{ textAlign: 'center' }}>操作</span>
        </div>
      )}
      <div>
        {fields.filter(f => f.showInUI !== false).map(f => {
          const isEditingThis = editing && editingField === f.name;
          const showEditBtn = editing && !isEditingThis;
          const highlight = highlightedFields?.has(f.name);
          return (
            <React.Fragment key={f.name}>
            <div className="relative nodrag" style={{
              display: 'grid', gridTemplateColumns: '1fr 1fr 1.2fr 36px 36px 36px 48px',
              alignItems: 'center', padding: '0 8px', fontSize: 12,
              borderBottom: '1px solid #e2e8f0',
              minHeight: 32,
              background: highlight ? '#fdf2f8' : undefined,
            }}>
              <Handle type="target" position={Position.Left} id={`${LEFT_HANDLE_PREFIX}${f.name}`}
                className={`!absolute !-left-1.5 !top-1/2 !-translate-y-1/2 !w-3 !h-3 !rounded-full !border-2 !border-white !bg-blue-400 !opacity-100`}
                isConnectable={true} />
              <Handle type="source" position={Position.Left} id={`${LEFT_SOURCE_PREFIX}${f.name}`}
                className={`!absolute !-left-1.5 !top-1/2 !-translate-y-1/2 !w-3 !h-3 !rounded-full !border-2 !border-white !bg-green-400 transition-all duration-150 ${focused ? '!opacity-100' : '!opacity-0'}`}
                isConnectable={true} />
              {isEditingThis ? (
                <>
                  <Input size="small" style={{ width: '100%', fontSize: 11, height: 24 }} placeholder="字段名" value={editForm.name} disabled={f.isFixed} onChange={e => setEditForm({ ...editForm, name: e.target.value })} />
                  <Input size="small" style={{ width: '100%', fontSize: 11, height: 24 }} placeholder="显示名" value={editForm.title} onChange={e => setEditForm({ ...editForm, title: e.target.value })} />
                  <Select size="small" style={{ width: '100%', fontSize: 11, height: 24 }} value={editForm.dbType || 'VARCHAR'} disabled={f.isFixed} onChange={v => setEditForm({ ...editForm, dbType: v })}
                    options={DB_TYPE_OPTIONS.map(t => ({ value: t, label: t }))}
                    getPopupContainer={() => document.body} />
                  <span style={{ textAlign: 'center' }}><Switch size="small" disabled={f.isFixed} checked={editForm.isPrimaryKey} onChange={v => setEditForm({ ...editForm, isPrimaryKey: v })} /></span>
                  <span style={{ textAlign: 'center' }}><Switch size="small" checked={editForm.showInUI !== false} onChange={v => setEditForm({ ...editForm, showInUI: v })} /></span>
                  <span style={{ textAlign: 'center' }}><Switch size="small" checked={editForm.availableInRules !== false} onChange={v => setEditForm({ ...editForm, availableInRules: v })} /></span>
                  <span style={{ textAlign: 'center', display: 'flex', gap: 2, justifyContent: 'center' }}>
                    <Button size="small" type="text" style={{ height: 20, padding: 0, color: '#1a1a1a' }} onClick={handleSave}>✓</Button>
                    <Button size="small" type="text" style={{ height: 20, padding: 0, color: '#ff4d4f' }} onClick={() => setEditingField(null)}>✕</Button>
                  </span>
                </>
              ) : (
                <>
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 11 }}>{f.name}</span>
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 11, color: '#888' }}>{f.title || f.name}</span>
                  <span style={{ fontSize: 10, color: '#999' }}>{f.dbType}</span>
                  <span style={{ textAlign: 'center' }}>{f.isPrimaryKey ? <KeyOutlined style={{ color: '#faad14', fontSize: 10 }} /> : null}</span>
                  <span style={{ textAlign: 'center', fontSize: 10 }}>{f.showInUI !== false ? '✓' : '✕'}</span>
                  <span style={{ textAlign: 'center', fontSize: 10 }}>{f.availableInRules !== false ? '✓' : '✕'}</span>
                  <span style={{ textAlign: 'center' }}>
                    {showEditBtn && (
                      <span style={{ display: 'inline-flex', gap: 2 }}>
                        <Button size="small" type="text" className="!h-5 !w-5 !p-0" onClick={() => startEdit(f)}>✎</Button>
                        <Button size="small" type="text" danger className="!h-5 !w-5 !p-0" onClick={() => handleDelete(f.name)}>✕</Button>
                      </span>
                    )}
                  </span>
                </>
              )}
              <Handle type="source" position={Position.Right} id={`${RIGHT_HANDLE_PREFIX}${f.name}`}
                className={`!absolute !-right-1.5 !top-1/2 !-translate-y-1/2 !w-3 !h-3 !rounded-full !border-2 !border-white !bg-green-400 !opacity-100`}
                isConnectable={true} />
              <Handle type="target" position={Position.Right} id={`${RIGHT_TARGET_PREFIX}${f.name}`}
                className={`!absolute !-right-1.5 !top-1/2 !-translate-y-1/2 !w-3 !h-3 !rounded-full !border-2 !border-white !bg-blue-400 transition-all duration-150 ${focused ? '!opacity-100' : '!opacity-0'}`}
                isConnectable={true} />
            </div>
            {isEditingThis && (editForm.dbType === 'MASTER_DATA' || editForm.masterDataCode) && (
              <div className="nodrag" style={{
                display: 'grid', gridTemplateColumns: '1fr 1fr 1.2fr 36px 36px 36px 48px',
                alignItems: 'center', padding: '0 8px', fontSize: 11,
                background: '#f0f5ff', borderBottom: '1px solid #e2e8f0', minHeight: 28,
              }}>
                <div style={{ borderRight: '1px solid #fff', height: '100%' }} />
                <div style={{ borderRight: '1px solid #fff', height: '100%' }} />
                <div style={{ gridColumn: '3 / span 5', display: 'flex', gap: 4, alignItems: 'center', minHeight: 28 }}>
                  <Select size="small" style={{ flex: 1, height: 22, fontSize: 10, minWidth: 0 }} placeholder="主数据集" value={editForm.masterDataCode || undefined}
                    onChange={v => setEditForm({ ...editForm, masterDataCode: v })}
                    options={masterDataOptions}
                    getPopupContainer={() => document.body} />
                  <Select size="small" style={{ flex: 1, height: 22, fontSize: 10, minWidth: 0 }} value={editForm.masterDataType}
                    onChange={v => setEditForm({ ...editForm, masterDataType: v })}
                    options={[{ label: '枚举', value: 'ENUM' }, { label: '层级', value: 'HIERARCHY' }]}
                    getPopupContainer={() => document.body} />
                  <Select size="small" style={{ flex: 1, height: 22, fontSize: 10, minWidth: 0 }} value={editForm.masterComponent}
                    onChange={v => setEditForm({ ...editForm, masterComponent: v })}
                    options={[{ label: '下拉选择', value: 'select' }, { label: '单选', value: 'radio' }, { label: '级联', value: 'cascade-select' }]}
                    getPopupContainer={() => document.body} />
                </div>
              </div>
            )}
            </React.Fragment>
          );
        })}
        {editing && (
          <>
            {editingField === '__new__' && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1.2fr 36px 36px 36px 48px', alignItems: 'center', padding: '0 8px', background: '#fffbeb', borderBottom: '1px solid #e2e8f0', minHeight: 32 }}>
                <Input size="small" style={{ width: '90%', fontSize: 11, height: 24 }} placeholder="字段名" value={editForm.name} onChange={e => setEditForm({ ...editForm, name: e.target.value })} />
                <Input size="small" style={{ width: '90%', fontSize: 11, height: 24 }} placeholder="显示名" value={editForm.title} onChange={e => setEditForm({ ...editForm, title: e.target.value })} />
                <Select size="small" style={{ width: '95%', fontSize: 11, height: 24 }} value={editForm.dbType} onChange={v => setEditForm({ ...editForm, dbType: v })} options={DB_TYPE_OPTIONS.map(t => ({ value: t, label: t }))}
                  getPopupContainer={() => document.body} />
                <span style={{ textAlign: 'center' }}><Switch size="small" checked={editForm.isPrimaryKey} onChange={v => setEditForm({ ...editForm, isPrimaryKey: v })} /></span>
                <span></span>
                <span></span>
                <span style={{ textAlign: 'center', display: 'flex', gap: 2, justifyContent: 'center' }}>
                  <Button size="small" type="text" style={{ height: 20, padding: 0, color: '#1a1a1a' }} onClick={handleSave}>✓</Button>
                  <Button size="small" type="text" style={{ height: 20, padding: 0, color: '#ff4d4f' }} onClick={() => setEditingField(null)}>✕</Button>
                </span>
              </div>
            )}
            {editingField === '__new__' && editForm.dbType === 'MASTER_DATA' && (
              <div className="nodrag" style={{
                display: 'grid', gridTemplateColumns: '1fr 1fr 1.2fr 36px 36px 36px 48px',
                alignItems: 'center', padding: '0 8px', fontSize: 11,
                background: '#f0f5ff', borderBottom: '1px solid #e2e8f0', minHeight: 28,
              }}>
                <div style={{ borderRight: '1px solid #fff', height: '100%' }} />
                <div style={{ borderRight: '1px solid #fff', height: '100%' }} />
                <div style={{ gridColumn: '3 / span 5', display: 'flex', gap: 4, alignItems: 'center', minHeight: 28 }}>
                  <Select size="small" style={{ flex: 1, height: 22, fontSize: 10, minWidth: 0 }} placeholder="主数据集" value={editForm.masterDataCode || undefined}
                    onChange={v => setEditForm({ ...editForm, masterDataCode: v })}
                    options={masterDataOptions}
                    getPopupContainer={() => document.body} />
                  <Select size="small" style={{ flex: 1, height: 22, fontSize: 10, minWidth: 0 }} value={editForm.masterDataType}
                    onChange={v => setEditForm({ ...editForm, masterDataType: v })}
                    options={[{ label: '枚举', value: 'ENUM' }, { label: '层级', value: 'HIERARCHY' }]}
                    getPopupContainer={() => document.body} />
                  <Select size="small" style={{ flex: 1, height: 22, fontSize: 10, minWidth: 0 }} value={editForm.masterComponent}
                    onChange={v => setEditForm({ ...editForm, masterComponent: v })}
                    options={[{ label: '下拉选择', value: 'select' }, { label: '单选', value: 'radio' }, { label: '级联', value: 'cascade-select' }]}
                    getPopupContainer={() => document.body} />
                </div>
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
  const rfRef = React.useRef<any>(null);
  useEffect(() => { rfRef.current = rfInstance; }, [rfInstance]);

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
      const seenEdgeKeys = new Set<string>();
      // 构建位置映射，用于初始化连线方向
      const posMap = new Map<string, {x: number, y: number}>();
      for (const e of list) {
        if (e.layoutPosition?.x != null) {
          posMap.set(e.entityType, {x: e.layoutPosition.x, y: e.layoutPosition.y});
        }
      }
      for (const e of list) {
        if (!e.entityRelations) continue;
        for (const [, relList] of Object.entries(e.entityRelations)) {
          if (Array.isArray(relList)) {
            for (const r of relList as any[]) {
              const key = `${r.sourceEntity}|${r.targetEntity}|${r.sourceField}|${r.targetField}`;
              if (seenEdgeKeys.has(key)) continue;
              seenEdgeKeys.add(key);
              // 根据存储位置计算连线方向
              const sp = posMap.get(r.sourceEntity);
              const tp = posMap.get(r.targetEntity);
              let srcH = `${RIGHT_HANDLE_PREFIX}${r.sourceField}`;
              let tgtH = `${LEFT_HANDLE_PREFIX}${r.targetField}`;
              if (sp && tp) {
                const ddx = tp.x - sp.x;
                const ddy = tp.y - sp.y;
                const vertical = Math.abs(ddy) > Math.abs(ddx);
                if (vertical) {
                  srcH = ddx >= 0 ? `${RIGHT_HANDLE_PREFIX}${r.sourceField}` : `${LEFT_SOURCE_PREFIX}${r.sourceField}`;
                  tgtH = ddx >= 0 ? `${RIGHT_TARGET_PREFIX}${r.targetField}` : `${LEFT_HANDLE_PREFIX}${r.targetField}`;
                } else {
                  srcH = ddx >= 0 ? `${RIGHT_HANDLE_PREFIX}${r.sourceField}` : `${LEFT_SOURCE_PREFIX}${r.sourceField}`;
                  tgtH = ddx >= 0 ? `${LEFT_HANDLE_PREFIX}${r.targetField}` : `${RIGHT_TARGET_PREFIX}${r.targetField}`;
                }
              }
              rfedges.push({
                id: r.id || `${r.sourceEntity}-${r.targetEntity}-${r.sourceField}`,
                source: r.sourceEntity, target: r.targetEntity,
                sourceHandle: srcH,
                targetHandle: tgtH,
                type: 'entityEdge',
                data: { relationship: { ...r, sourceField: r.sourceField, targetField: r.targetField, relationType: r.relationType || 'ONE_TO_MANY' } },
              });
            }
          }
        }
      }
      setEdges(rfedges);
      // fitView 由 FitViewOnLoad 组件自动处理
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
        type: 'entityEdge', data: { relationship: { ...rel, id: `rel_${Date.now()}` } },
      };
      setEdges(prev => [...prev, newEdge]);
    } catch (e: any) { message.error('创建失败: ' + (e.response?.data?.message || e.message)); }
  }, [setEdges]);

  const onEdgeClick = useCallback((_: any, edge: any) => {
    setSelectedEdge(edge.id === selectedEdge ? null : edge.id);
  }, [selectedEdge]);

  // 监听 edge 按钮点击事件
  useEffect(() => {
    const handler = (e: any) => {
      setEditRelPopover({ edgeId: e.detail.edgeId, pos: { x: e.detail.x, y: e.detail.y } });
    };
    window.addEventListener('edge-button-click', handler);
    return () => window.removeEventListener('edge-button-click', handler);
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
    api.put(`/entity-designer/entities/${node.id}/position`, { x: node.position.x, y: node.position.y }).catch(() => {});
    const rf = rfRef.current;
    if (rf) {
      sessionStorage.setItem('entity-designer-viewport', JSON.stringify(rf.getViewport()));
      const nodes = rf.getNodes();
      const nodeMap = new Map(nodes.map(n => [n.id, n]));
      setEdges(prev => prev.map(e => {
        const sn = nodeMap.get(e.source);
        const tn = nodeMap.get(e.target);
        if (!sn || !tn) return e;
        const ddx = tn.position.x - sn.position.x;
        const ddy = tn.position.y - sn.position.y;
        const vertical = Math.abs(ddy) > Math.abs(ddx);
        const rel = (e.data as any)?.relationship;
        if (!rel?.sourceField) return e;
        // 垂直同侧，水平异侧
        const srcH = vertical
          ? (ddx >= 0 ? `${RIGHT_HANDLE_PREFIX}${rel.sourceField}` : `${LEFT_SOURCE_PREFIX}${rel.sourceField}`)
          : (ddx >= 0 ? `${RIGHT_HANDLE_PREFIX}${rel.sourceField}` : `${LEFT_SOURCE_PREFIX}${rel.sourceField}`);
        const tgtH = vertical
          ? (ddx >= 0 ? `${RIGHT_TARGET_PREFIX}${rel.targetField}` : `${LEFT_HANDLE_PREFIX}${rel.targetField}`)
          : (ddx >= 0 ? `${LEFT_HANDLE_PREFIX}${rel.targetField}` : `${RIGHT_TARGET_PREFIX}${rel.targetField}`);
        return { ...e, sourceHandle: srcH, targetHandle: tgtH };
      }));
    }
  }, [setEdges]);

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

  const handleSwitchDirection = useCallback(async () => {
    if (!editRelPopover) return;
    const edge = edges.find(e => e.id === editRelPopover.edgeId);
    if (!edge) return;
    const rel = (edge.data as any)?.relationship;
    // 不翻转 source/target，只翻转基数标记：1:N ↔ N:1
    const newType = rel.relationType === 'ONE_TO_MANY' ? 'MANY_TO_ONE' : 'ONE_TO_MANY';
    try {
      await api.put(`/entity-designer/entities/${edge.source}/relations/${edge.source}/${edge.id}`, { relationType: newType });
    } catch {}
    setEdges(prev => prev.map(e => {
      if (e.id !== editRelPopover.edgeId) return e;
      return { ...e, data: { ...e.data, relationship: { ...rel, relationType: newType } } };
    }));
    setEditRelPopover(null);
  }, [editRelPopover, edges, setEdges]);

  const handleRelationTypeChange = async (relType: string) => {
    if (!editRelPopover) return;
    const edge = edges.find(e => e.id === editRelPopover.edgeId);
    if (!edge) return;
    const rel = (edge.data as any)?.relationship;
    try {
      await api.put(`/entity-designer/entities/${edge.source}/relations/${edge.source}/${edge.id}`, { relationType: relType });
    } catch {}
    setEdges(prev => prev.map(e => {
      if (e.id !== editRelPopover.edgeId) return e;
      return { ...e, data: { ...e.data, relationship: { ...(rel || {}), relationType: relType } } };
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
        <Divider type="vertical" style={{ margin: '0 4px' }} />
        <Tooltip title="居中显示"><Button icon={<AimOutlined />} onClick={() => rfInstance?.fitView({ padding: 0.3, duration: 500 })} type="text" /></Tooltip>
        {selectedEdge && (
          <>
            <Divider type="vertical" style={{ margin: '0 4px' }} />
            <Button size="small" danger onClick={handleDeleteEdge}>删除连线</Button>
          </>
        )}
      </div>

      <ReactFlowProvider>
        <FitViewOnLoad nodeCount={nodes.length} />
        <ReactFlow
          nodes={nodes} edges={edges}
          onNodesChange={onNodesChange} onEdgesChange={onEdgesChange}
          onInit={(instance) => {
            setRfInstance(instance);
            // 初始化后延迟适配视图
            setTimeout(() => instance.fitView({ padding: 0.3, duration: 500 }), 500);
          }}
          onConnect={onConnect}
          onEdgeClick={onEdgeClick}
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

      {/* 关系编辑 Popover — ChartDB 风格 */}
      {editRelPopover && (() => {
        const edge = edges.find(e => e.id === editRelPopover.edgeId);
        const rel = (edge?.data as any)?.relationship;
        const relType = rel?.relationType || 'ONE_TO_MANY';
        return (
          <div style={{ position: 'fixed', left: editRelPopover.pos.x, top: editRelPopover.pos.y, zIndex: 1000, background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, padding: 8, boxShadow: '0 4px 12px rgba(0,0,0,0.15)', display: 'flex', alignItems: 'center', gap: 4 }}>
            <button onClick={() => handleRelationTypeChange('ONE_TO_ONE')}
              style={{ border: '1px solid #e2e8f0', background: relType === 'ONE_TO_ONE' ? '#334155' : '#fff', color: relType === 'ONE_TO_ONE' ? '#fff' : '#334155', borderRadius: 6, padding: '2px 10px', fontSize: 12, fontWeight: 500, cursor: 'pointer', height: 28, minWidth: 44 }}>
              1:1
            </button>
            <button onClick={() => handleRelationTypeChange('ONE_TO_MANY')}
              style={{ border: '1px solid #e2e8f0', background: relType === 'ONE_TO_MANY' ? '#334155' : '#fff', color: relType === 'ONE_TO_MANY' ? '#fff' : '#334155', borderRadius: 6, padding: '2px 10px', fontSize: 12, fontWeight: 500, cursor: 'pointer', height: 28, minWidth: 44 }}>
              1:N
            </button>
            <div style={{ width: 1, height: 24, background: '#e2e8f0', margin: '0 4px' }} />
            <button title="互换方向" onClick={() => handleSwitchDirection()}
              style={{ border: 'none', background: 'transparent', color: '#0ea5e9', cursor: 'pointer', padding: 4, borderRadius: 4, height: 28, width: 28, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M8 3 4 7l4 4"/><path d="M4 7h16"/><path d="m16 21 4-4-4-4"/><path d="M20 17H4"/></svg>
            </button>
            <button title="删除关系" onClick={() => {
              if (edge) {
                api.delete(`/entity-designer/entities/${edge.source}/relations/${edge.source}/${edge.id}`).catch(() => {});
                setEdges(prev => prev.filter(e => e.id !== editRelPopover.edgeId));
              }
              setEditRelPopover(null);
            }}
              style={{ border: 'none', background: 'transparent', color: '#ef4444', cursor: 'pointer', padding: 4, borderRadius: 4, height: 28, width: 28, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10 11v6"/><path d="M14 11v6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
            </button>
          </div>
        );
      })()}

      {/* 新建实体弹窗 */}
      <Modal title="新建实体" open={createModalOpen} onCancel={() => setCreateModalOpen(false)} onOk={handleCreateEntity} confirmLoading={saving} width={420}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div><Text style={{ fontSize: 12 }}>实体标识 *</Text><Input value={newEntity.entityType} onChange={e => setNewEntity({ ...newEntity, entityType: e.target.value.toUpperCase() })} placeholder="如: PRODUCT" /></div>
          <div><Text style={{ fontSize: 12 }}>显示名称</Text><Input value={newEntity.displayName} onChange={e => setNewEntity({ ...newEntity, displayName: e.target.value })} placeholder="如: 产品" /></div>
          <div><Text style={{ fontSize: 12 }}>类别</Text>
            <Select value={newEntity.category || 'BUSINESS'} onChange={v => setNewEntity({ ...newEntity, category: v })}
              options={[
                { label: 'BUSINESS - 主数据', value: 'BUSINESS' },
                { label: 'HIERARCHY - 分类', value: 'HIERARCHY' },
                { label: 'SYSTEM - 系统实体', value: 'SYSTEM' },
              ]} style={{ width: '100%' }} />
          </div>
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
      showInUI: uiMeta.showInUI ?? true, availableInRules: uiMeta.availableInRules ?? true,
      masterData: def['x-master-data'] || null,
    };
  }).sort((a, b) => {
    if (a.isFixed !== b.isFixed) return a.isFixed ? -1 : 1;
    if (a.isPrimaryKey !== b.isPrimaryKey) return a.isPrimaryKey ? -1 : 1;
    return 0;
  });
}

export default EntityDesigner;
