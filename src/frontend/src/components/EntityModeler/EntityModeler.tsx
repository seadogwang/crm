import React, { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import {
  ReactFlow, Controls, MiniMap, Background, BackgroundVariant,
  useNodesState, useEdgesState, addEdge, ConnectionMode,
  MarkerType, type Connection, type ReactFlowInstance,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { Button, Drawer, message } from 'antd';
import { DownloadOutlined } from '@ant-design/icons';
import EntityNodeComponent from './EntityNode';
import CustomEdgeComponent from './CustomEdge';
import EntityPanel from './EntityPanel';
import PropertyPanel from './PropertyPanel';
import ConfigModal from './ConfigModal';
import NewEntityModal from './NewEntityModal';
import Toolbar from './Toolbar';
import { EntityModelerProvider } from './EntityModelerContext';
import { SYSTEM_ENTITIES, SYSTEM_RELATIONS } from './constants';
import {
  entityToFlowNode, relationToFlowEdge, exportSchema,
  importFromJson, createNewEntityNode, createNewEdge,
} from './utils';
import type { EntityFieldExt, EntityKind, EntityNodeData, EntityFlowNode, EntityFlowEdge } from './types';

const nodeTypes = { entityNode: EntityNodeComponent };
const edgeTypes = { entityEdge: CustomEdgeComponent };

const initialNodes: EntityFlowNode[] = SYSTEM_ENTITIES.map(entityToFlowNode);
const initialEdges: EntityFlowEdge[] = SYSTEM_RELATIONS.map(relationToFlowEdge);

const EntityModeler: React.FC = () => {
  const [nodes, setNodes, onNodesChange] = useNodesState<EntityFlowNode>(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState<EntityFlowEdge>(initialEdges);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [selectedField, setSelectedField] = useState<EntityFieldExt | null>(null);
  const [showExport, setShowExport] = useState(false);
  const [configOpen, setConfigOpen] = useState(false);
  const [configEntity, setConfigEntity] = useState<EntityNodeData | null>(null);
  const [newEntityModal, setNewEntityModal] = useState<{ open: boolean; kind: EntityKind }>({ open: false, kind: 'business' });
  const idCounter = useRef(0);
  const rfInstance = useRef<ReactFlowInstance<EntityFlowNode, EntityFlowEdge> | null>(null);

  // 节点操作
  const addEntity = useCallback((kind: EntityKind) => {
    setNewEntityModal({ open: true, kind });
  }, []);

  const createEntity = useCallback((name: string, displayName: string, kind: EntityKind, schema?: object) => {
    const node = createNewEntityNode(kind, idCounter);
    node.data.name = name;
    node.data.displayName = displayName;
    // 从 JSON Schema 解析字段
    if (schema && (schema as any).properties) {
      const props = (schema as any).properties;
      const fields: EntityFieldExt[] = Object.entries(props).map(([key, val]: [string, any]) => ({
        key,
        name: val.description || val.title || key,
        type: mapJsonType(val.type),
        required: val.minLength !== undefined || (Array.isArray((schema as any).required) && ((schema as any).required as string[]).includes(key)),
        xComponent: val.minimum !== undefined || val.maximum !== undefined ? 'NumberPicker' : undefined,
      }));
      node.data.fields = fields;
    }
    setNodes(nds => [...nds, node]);
    const kindNames: Record<EntityKind, string> = { system: '系统实体', business: '业务实体', api: 'API实体' };
    message.success(`已创建${kindNames[kind]}: ${displayName}`);
  }, [setNodes]);

  const deleteSelected = useCallback(() => {
    const selectedNodes = nodes.filter(n => n.selected && n.data.kind !== 'system');
    const selectedEdges = edges.filter(e => e.selected);
    if (selectedNodes.length === 0 && selectedEdges.length === 0) return;
    const nodeIds = new Set(selectedNodes.map(n => n.id));
    setNodes(nds => nds.filter(n => !nodeIds.has(n.id)));
    setEdges(eds => eds.filter(e => !e.selected && !nodeIds.has(e.source) && !nodeIds.has(e.target)));
    if (selectedNodeId && nodeIds.has(selectedNodeId)) setSelectedNodeId(null);
    message.success(`已删除 ${selectedNodes.length + selectedEdges.length} 项`);
  }, [nodes, edges, setNodes, setEdges, selectedNodeId]);

  const selectNode = useCallback((id: string) => {
    setSelectedNodeId(id);
    setSelectedField(null);
  }, []);

  const editEntity = useCallback((node: EntityFlowNode) => {
    setConfigEntity(node.data as EntityNodeData);
    setConfigOpen(true);
  }, []);

  const focusNode = useCallback((nodeId: string) => {
    const node = nodes.find(n => n.id === nodeId);
    if (node && rfInstance.current) {
      rfInstance.current.setCenter(node.position.x + 115, node.position.y + 80, { zoom: 1, duration: 500 });
    }
  }, [nodes]);

  const handleFitView = useCallback(() => {
    rfInstance.current?.fitView({ padding: 0.2 });
  }, []);

  // 字段操作
  const origFieldKey = useRef<string>('');

  const selectField = useCallback((field: EntityFieldExt) => {
    setSelectedField(field);
    origFieldKey.current = field.key;
  }, []);

  const updateField = useCallback((field: EntityFieldExt) => {
    const oldKey = origFieldKey.current;
    setNodes(nds => nds.map(n => {
      const nodeData = n.data as EntityNodeData;
      if (n.id !== selectedNodeId) return n;
      return { ...n, data: { ...nodeData, fields: nodeData.fields.map((f: EntityFieldExt) => f.key === oldKey ? field : f) } };
    }));
    setSelectedField(field);
    origFieldKey.current = field.key;
  }, [setNodes, selectedNodeId]);

  const addField = useCallback((nodeId: string, field: EntityFieldExt) => {
    setNodes(nds => nds.map(n => {
      const nodeData = n.data as EntityNodeData;
      return n.id === nodeId ? { ...n, data: { ...nodeData, fields: [...nodeData.fields, field] } } : n;
    }));
  }, [setNodes]);

  // 连线
  const onConnect = useCallback((connection: Connection) => {
    const sourceNode = nodes.find(n => n.id === connection.source);
    const targetNode = nodes.find(n => n.id === connection.target);
    let fromField = '', toField = '';
    if (connection.sourceHandle) {
      const m = connection.sourceHandle.match(/^(?:left|right)-(?:src|tgt)-(.+)$/);
      if (m) fromField = m[1];
    }
    if (connection.targetHandle) {
      const m = connection.targetHandle.match(/^(?:left|right)-(?:src|tgt)-(.+)$/);
      if (m) toField = m[1];
    }
    if (!fromField) fromField = sourceNode?.data.fields[0]?.key || '';
    if (!toField) toField = targetNode?.data.fields[0]?.key || '';
    const newEdge = createNewEdge(connection.source!, connection.target!, sourceNode, targetNode);
    newEdge.data = { ...newEdge.data!, fromField, toField };
    setEdges(eds => addEdge<EntityFlowEdge>(newEdge, eds));
    message.success('关联已建立');
  }, [nodes, setEdges]);

  // 配置
  const openConfig = useCallback((entity: EntityNodeData) => { setConfigEntity(entity); setConfigOpen(true); }, []);
  const saveConfig = useCallback((entity: EntityNodeData) => {
    setNodes(nds => nds.map(n => n.id === entity.id ? { ...n, data: { ...entity } } : n));
  }, [setNodes]);

  // 导入导出
  const handleExport = useCallback(() => exportSchema(nodes, edges), [nodes, edges]);
  const handleImport = useCallback((json: string) => {
    const result = importFromJson(json, idCounter);
    if (!result) { message.error('JSON 格式无效'); return; }
    setNodes(nds => [...nds, ...result.nodes]);
    setEdges(eds => [...eds, ...result.edges]);
    message.success(`已导入 ${result.nodes.length} 个实体`);
  }, [setNodes, setEdges]);

  // 键盘快捷键
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === 's' || e.key === 'S') addEntity('system');
      if (e.key === 'b' || e.key === 'B') addEntity('business');
      if (e.key === 'a' || e.key === 'A') addEntity('api');
      if (e.key === 'f' || e.key === 'F') handleFitView();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [addEntity, handleFitView]);

  // Context
  const contextValue = useMemo(() => ({
    selectedNodeId, selectNode, selectField, deleteNode: (id: string) => {
      setNodes(nds => nds.filter(n => n.id !== id));
      setEdges(eds => eds.filter(e => e.source !== id && e.target !== id));
    }, openConfig, addField,
  }), [selectedNodeId, selectNode, selectField, openConfig, addField, setNodes, setEdges]);

  const hasSelection = nodes.some(n => n.selected) || edges.some(e => e.selected);

  return (
    <EntityModelerProvider value={contextValue}>
      <div style={{ display: 'flex', flex: 1, minHeight: 'calc(100vh - 120px)', background: '#fff' }}>
        {/* React Flow 画布 */}
        <div style={{ flex: 1, position: 'relative' }}>
          <ReactFlow
            nodes={nodes} edges={edges}
            onNodesChange={onNodesChange} onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onInit={(instance) => { rfInstance.current = instance; }}
            onNodeClick={(_e, node) => selectNode(node.id)}
            onPaneClick={() => { setSelectedNodeId(null); setSelectedField(null); }}
            nodeTypes={nodeTypes} edgeTypes={edgeTypes}
            fitView fitViewOptions={{ padding: 0.2 }}
            connectionMode={ConnectionMode.Loose}
            deleteKeyCode={['Delete', 'Backspace']}
            multiSelectionKeyCode="Shift"
            snapToGrid snapGrid={[10, 10]}
            defaultEdgeOptions={{
              type: 'entityEdge',
              style: { stroke: '#1677ff', strokeWidth: 1.5 },
              markerEnd: { type: MarkerType.ArrowClosed, color: '#1677ff', width: 20, height: 20 },
            }}
            style={{ background: '#fafafa' }}
          >
            <Controls />
            <MiniMap nodeColor={node => {
              const kind = (node.data as EntityNodeData)?.kind;
              return kind === 'business' ? '#1677ff' : kind === 'api' ? '#52c41a' : '#8c8c8c';
            }} style={{ background: '#f5f5f5' }} />
            <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="#e0e0e0" />
          </ReactFlow>
          {/* 悬浮工具栏 */}
          <Toolbar
            onAddEntity={addEntity}
            onDeleteSelected={deleteSelected}
            onFitView={handleFitView}
            hasSelection={hasSelection}
          />
        </div>

        {/* 右侧实体面板 */}
        <EntityPanel
          nodes={nodes}
          onAddEntity={addEntity}
          onEditEntity={editEntity}
          onFocusNode={focusNode}
        />

        {/* 属性面板 */}
        <PropertyPanel field={selectedField} onChange={updateField} onClose={() => setSelectedField(null)} />

        {/* 配置弹窗 */}
        <ConfigModal open={configOpen} entity={configEntity}
          onClose={() => setConfigOpen(false)} onSave={saveConfig} />

        {/* 新建实体弹窗 */}
        <NewEntityModal
          open={newEntityModal.open}
          kind={newEntityModal.kind}
          onClose={() => setNewEntityModal({ open: false, kind: 'business' })}
          onCreate={createEntity}
        />

        {/* 导出 */}
        <Drawer title="JSON Schema 导出" open={showExport} onClose={() => setShowExport(false)} width={600}>
          <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
            <Button size="small" icon={<DownloadOutlined />} onClick={() => {
              const blob = new Blob([handleExport()], { type: 'application/json' });
              const url = URL.createObjectURL(blob); const a = document.createElement('a');
              a.href = url; a.download = 'loyalty_schema.json'; a.click(); URL.revokeObjectURL(url);
            }}>下载 JSON</Button>
          </div>
          <pre style={{ background: '#1e1e1e', color: '#d4d4d4', padding: 12, borderRadius: 6, fontSize: 12, maxHeight: 'calc(100vh - 260px)', overflow: 'auto' }}>
            {handleExport()}
          </pre>
        </Drawer>
      </div>
    </EntityModelerProvider>
  );
};

function mapJsonType(t: string): string {
  const map: Record<string, string> = { string: 'String', number: 'Double', integer: 'Integer', boolean: 'Boolean', array: 'Array', object: 'Object' };
  return map[t] || 'String';
}

export default EntityModeler;