import React, { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import {
  ReactFlow, Controls, MiniMap, Background, BackgroundVariant,
  useNodesState, useEdgesState, addEdge, ConnectionMode,
  MarkerType, type Connection,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { Button, Drawer, message } from 'antd';
import { DownloadOutlined } from '@ant-design/icons';
import EntityNodeComponent from './EntityNode';
import CustomEdgeComponent from './CustomEdge';
import EntityPalette from './EntityPalette';
import PropertyPanel from './PropertyPanel';
import ConfigModal from './ConfigModal';
import { EntityModelerProvider } from './EntityModelerContext';
import { SYSTEM_ENTITIES, SYSTEM_RELATIONS } from './constants';
import {
  entityToFlowNode, relationToFlowEdge, exportSchema,
  importFromJson, createNewEntityNode, createNewEdge,
} from './utils';
import type { EntityFieldExt, EntityKind, EntityNodeData, EntityFlowNode, EntityFlowEdge } from './types';

// ==================== 初始节点/边 ====================

const initialNodes: EntityFlowNode[] = SYSTEM_ENTITIES.map(entityToFlowNode);
const initialEdges: EntityFlowEdge[] = SYSTEM_RELATIONS.map(relationToFlowEdge);

// ==================== 主组件 ====================

const EntityModeler: React.FC = () => {
  // 自定义节点/边类型（memoized）
  const nodeTypes = useMemo(() => ({ entityNode: EntityNodeComponent }), []);
  const edgeTypes = useMemo(() => ({ entityEdge: CustomEdgeComponent }), []);
  const [nodes, setNodes, onNodesChange] = useNodesState<EntityFlowNode>(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState<EntityFlowEdge>(initialEdges);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [selectedField, setSelectedField] = useState<EntityFieldExt | null>(null);
  const [showExport, setShowExport] = useState(false);
  const [configOpen, setConfigOpen] = useState(false);
  const [configEntity, setConfigEntity] = useState<EntityNodeData | null>(null);
  const idCounter = useRef(0);

  // ==================== 节点操作 ====================

  const addEntity = useCallback((kind: EntityKind) => {
    const newNode = createNewEntityNode(kind, idCounter);
    setNodes((nds: EntityFlowNode[]) => [...nds, newNode]);
    const kindNames: Record<EntityKind, string> = { system: '系统实体', business: '业务实体', api: 'API实体' };
    message.success(`已添加${kindNames[kind]}`);
  }, [setNodes]);

  const deleteEntity = useCallback((nodeId: string) => {
    setNodes((nds: EntityFlowNode[]) => nds.filter(n => n.id !== nodeId));
    setEdges((eds: EntityFlowEdge[]) => eds.filter(e => e.source !== nodeId && e.target !== nodeId));
    if (selectedNodeId === nodeId) setSelectedNodeId(null);
  }, [setNodes, setEdges, selectedNodeId]);

  const selectNode = useCallback((id: string) => {
    setSelectedNodeId(id);
    setSelectedField(null);
  }, []);

  // ==================== 字段操作 ====================

  const selectField = useCallback((field: EntityFieldExt) => {
    setSelectedField(field);
  }, []);

  const updateField = useCallback((field: EntityFieldExt) => {
    setNodes((nds: EntityFlowNode[]) => nds.map(n => {
      const nodeData = n.data as EntityNodeData;
      return {
        ...n,
        data: {
          ...nodeData,
          fields: nodeData.fields.map((f: EntityFieldExt) => f.key === field.key ? field : f),
        },
      };
    }));
    setSelectedField(field);
  }, [setNodes]);

  const addField = useCallback((nodeId: string, field: EntityFieldExt) => {
    setNodes((nds: EntityFlowNode[]) => nds.map(n => {
      const nodeData = n.data as EntityNodeData;
      return n.id === nodeId
        ? { ...n, data: { ...nodeData, fields: [...nodeData.fields, field] } }
        : n;
    }));
  }, [setNodes]);

  // ==================== 连线操作 ====================

  const onConnect = useCallback((connection: Connection) => {
    const sourceNode = nodes.find(n => n.id === connection.source);
    const targetNode = nodes.find(n => n.id === connection.target);
    // 解析 Handle ID：格式 left-src-fieldKey 或 right-src-fieldKey 或 left-tgt-fieldKey 等
    let fromField = '';
    let toField = '';
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

    const newEdge = createNewEdge(
      connection.source!, connection.target!,
      sourceNode, targetNode,
    );
    newEdge.data!.fromField = fromField;
    newEdge.data!.toField = toField;
    setEdges((eds: EntityFlowEdge[]) => addEdge<EntityFlowEdge>(newEdge, eds));
    message.success('关联已建立');
  }, [nodes, setEdges]);

  // ==================== 配置弹窗 ====================

  const openConfig = useCallback((entity: EntityNodeData) => {
    setConfigEntity(entity);
    setConfigOpen(true);
  }, []);

  const saveConfig = useCallback((entity: EntityNodeData) => {
    setNodes((nds: EntityFlowNode[]) => nds.map(n =>
      n.id === entity.id
        ? { ...n, data: { ...entity } }
        : n,
    ));
  }, [setNodes]);

  // ==================== 导入导出 ====================

  const handleExport = useCallback(() => {
    return exportSchema(nodes, edges);
  }, [nodes, edges]);

  const handleImport = useCallback((json: string) => {
    const result = importFromJson(json, idCounter);
    if (!result) {
      message.error('JSON 格式无效');
      return;
    }
    setNodes((nds: EntityFlowNode[]) => [...nds, ...result.nodes]);
    setEdges((eds: EntityFlowEdge[]) => [...eds, ...result.edges]);
    message.success(`已导入 ${result.nodes.length} 个实体`);
  }, [setNodes, setEdges]);

  // ==================== 键盘快捷键 ====================

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === 's' || e.key === 'S') addEntity('system');
      if (e.key === 'b' || e.key === 'B') addEntity('business');
      if (e.key === 'a' || e.key === 'A') addEntity('api');
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [addEntity]);

  // ==================== Context 值 ====================

  const contextValue = useMemo(() => ({
    selectedNodeId,
    selectNode,
    selectField,
    deleteNode: deleteEntity,
    openConfig,
    addField,
  }), [selectedNodeId, selectNode, selectField, deleteEntity, openConfig, addField]);

  // ==================== 渲染 ====================

  return (
    <EntityModelerProvider value={contextValue}>
      <div style={{ display: 'flex', flex: 1, minHeight: 'calc(100vh - 120px)', background: '#fff' }}>
        {/* 左侧面板 */}
        <EntityPalette onAddEntity={addEntity} onImport={handleImport} />

        {/* React Flow 画布 */}
        <div style={{ flex: 1 }}>
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onNodeClick={(_e, node) => selectNode(node.id)}
            onPaneClick={() => { setSelectedNodeId(null); setSelectedField(null); }}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            fitView
            fitViewOptions={{ padding: 0.2 }}
            connectionMode={ConnectionMode.Loose}
            deleteKeyCode={['Delete', 'Backspace']}
            multiSelectionKeyCode="Shift"
            snapToGrid
            snapGrid={[10, 10]}
            defaultEdgeOptions={{
              type: 'entityEdge',
              style: { stroke: '#1677ff', strokeWidth: 2 },
              markerEnd: { type: MarkerType.ArrowClosed, color: '#1677ff', width: 20, height: 20 },
            }}
            style={{ background: '#fafafa' }}
          >
            <Controls />
            <MiniMap
              nodeColor={(node) => {
                const kind = (node.data as EntityNodeData)?.kind;
                return kind === 'business' ? '#1677ff' : kind === 'api' ? '#52c41a' : '#8c8c8c';
              }}
              style={{ background: '#f5f5f5' }}
            />
            <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="#e0e0e0" />
          </ReactFlow>
        </div>

        {/* 属性面板 */}
        <PropertyPanel
          field={selectedField}
          onChange={updateField}
          onClose={() => setSelectedField(null)}
        />

        {/* 配置弹窗 */}
        <ConfigModal
          open={configOpen}
          entity={configEntity}
          onClose={() => setConfigOpen(false)}
          onSave={saveConfig}
        />

        {/* 导出抽屉 */}
        <Drawer
          title="JSON Schema 导出"
          open={showExport}
          onClose={() => setShowExport(false)}
          width={600}
        >
          <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
            <Button
              size="small"
              icon={<DownloadOutlined />}
              onClick={() => {
                const blob = new Blob([handleExport()], { type: 'application/json' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = 'loyalty_schema.json';
                a.click();
                URL.revokeObjectURL(url);
              }}
            >下载 JSON</Button>
          </div>
          <pre style={{
            background: '#1e1e1e', color: '#d4d4d4', padding: 12,
            borderRadius: 6, fontSize: 12,
            maxHeight: 'calc(100vh - 260px)', overflow: 'auto',
          }}>
            {handleExport()}
          </pre>
        </Drawer>
      </div>
    </EntityModelerProvider>
  );
};

export default EntityModeler;