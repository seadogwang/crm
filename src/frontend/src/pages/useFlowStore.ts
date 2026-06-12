import { create } from 'zustand';
import {
  type Node,
  type Edge,
  type Connection,
  type NodeChange,
  type EdgeChange,
  addEdge,
  applyNodeChanges,
  applyEdgeChanges,
} from '@xyflow/react';
import type { NodeTypeKey, FlowNodeData } from './FlowDesignerNode';
import { NODE_TYPES } from './FlowDesignerNode';

interface FlowStore {
  nodes: Node[];
  edges: Edge[];
  selectedNode: Node | null;
  chainName: string;
  chainType: string;

  setChainName: (name: string) => void;
  setChainType: (type: string) => void;
  addNode: (nodeType: NodeTypeKey, position: { x: number; y: number }) => void;
  removeSelectedNode: () => void;
  onConnect: (connection: Connection) => void;
  onNodesChange: (changes: NodeChange[]) => void;
  onEdgesChange: (changes: EdgeChange[]) => void;
  onNodeClick: (_event: React.MouseEvent, node: Node) => void;
  generateEL: () => string;
  loadFlow: (nodes: Node[], edges: Edge[], chainName?: string, chainType?: string) => void;
  clear: () => void;
}

let nodeIdCounter = 0;

export const useFlowStore = create<FlowStore>((set, get) => ({
  nodes: [],
  edges: [],
  selectedNode: null,
  chainName: 'ORDER_CHAIN',
  chainType: 'ORDER',

  setChainName: (name) => set({ chainName: name }),
  setChainType: (type) => set({ chainType: type }),

  addNode: (nodeType, position) => {
    const def = NODE_TYPES[nodeType];
    const id = `node_${++nodeIdCounter}`;
    const newNode: Node = {
      id,
      type: 'custom',
      position,
      data: {
        label: def.label,
        componentName: def.componentName,
        color: def.color,
      } satisfies FlowNodeData,
    };
    set((state) => ({ nodes: [...state.nodes, newNode] }));
  },

  removeSelectedNode: () => {
    const { selectedNode } = get();
    if (!selectedNode) return;
    set((state) => ({
      nodes: state.nodes.filter((n) => n.id !== selectedNode.id),
      edges: state.edges.filter((e) => e.source !== selectedNode.id && e.target !== selectedNode.id),
      selectedNode: null,
    }));
  },

  onConnect: (connection) => {
    set((state) => ({ edges: addEdge({ ...connection, type: 'default' }, state.edges) }));
  },

  onNodesChange: (changes) => {
    set((state) => ({ nodes: applyNodeChanges(changes, state.nodes) }));
  },

  onEdgesChange: (changes) => {
    set((state) => ({ edges: applyEdgeChanges(changes, state.edges) }));
  },

  onNodeClick: (_event, node) => {
    set({ selectedNode: node });
  },

  /** 根据 DAG 拓扑排序生成 LiteFlow EL 表达式 */
  generateEL: () => {
    const { nodes, edges, chainName } = get();
    if (nodes.length === 0) return '';

    // 构建邻接表
    const adjacency: Record<string, string[]> = {};
    const inDegree: Record<string, number> = {};
    for (const n of nodes) {
      adjacency[n.id] = [];
      inDegree[n.id] = 0;
    }
    for (const e of edges) {
      adjacency[e.source]?.push(e.target);
      inDegree[e.target] = (inDegree[e.target] || 0) + 1;
    }

    // 找到起始节点（入度为 0）
    const startNodes = nodes.filter((n) => inDegree[n.id] === 0);
    if (startNodes.length === 0) return '// 无法生成：无起始节点';

    const sorted: string[] = [];
    for (const n of startNodes) {
      sorted.push(n.id);
    }

    // 拓扑排序
    const queue = [...startNodes.map((n) => n.id)];
    while (queue.length > 0) {
      const current = queue.shift()!;
      for (const next of adjacency[current] || []) {
        inDegree[next]--;
        if (inDegree[next] === 0) {
          sorted.push(next);
          queue.push(next);
        }
      }
    }

    // 映射 nodeId → componentName
    const nodeMap = new Map(nodes.map((n) => [n.id, (n.data as unknown as FlowNodeData).componentName]));
    const components = sorted.map((id) => nodeMap.get(id) || 'unknownCmp').filter(Boolean);

    return `${chainName} = THEN(\n    ${components.join(',\n    ')}\n);`;
  },

  loadFlow: (nodes, edges, chainName, chainType) => {
    nodeIdCounter = nodes.length;
    set({
      nodes,
      edges,
      chainName: chainName || 'ORDER_CHAIN',
      chainType: chainType || 'ORDER',
      selectedNode: null,
    });
  },

  clear: () => {
    nodeIdCounter = 0;
    set({ nodes: [], edges: [], selectedNode: null });
  },
}));