import React, { useCallback, useRef, useState } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  type Node,
  type Edge,
  type OnConnectEnd,
  MarkerType,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { Button, Card, Input, InputNumber, Select, Space, message, Typography, Divider, Tag, Checkbox } from 'antd';
import { PlusOutlined, SaveOutlined, SendOutlined, PlayCircleOutlined, DeleteOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import PageWrapper from '../components/PageWrapper';
import api from '../api';
import FlowDesignerNode, { NODE_TYPES, type NodeTypeKey } from './FlowDesignerNode';
import { useFlowStore } from './useFlowStore';

const { Title, Text } = Typography;

const nodeTypes = { custom: FlowDesignerNode };

const FlowDesigner: React.FC = () => {
  const navigate = useNavigate();
  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const {
    nodes, edges, selectedNode, chainName, chainType,
    setChainName, setChainType,
    addNode, removeSelectedNode,
    onConnect, onNodesChange, onEdgesChange, onNodeClick,
    generateEL, loadFlow, clear,
  } = useFlowStore();

  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [elPreview, setElPreview] = useState('');
  const [testResult, setTestResult] = useState<any>(null);
  const [testPayload, setTestPayload] = useState('{"memberId":"8821","amount":200}');

  /** 从组件库拖拽到画布 */
  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  }, []);

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const nodeType = e.dataTransfer.getData('application/reactflow') as NodeTypeKey;
      if (!nodeType || !reactFlowWrapper.current) return;

      const bounds = reactFlowWrapper.current.getBoundingClientRect();
      const position = {
        x: e.clientX - bounds.left - 60,
        y: e.clientY - bounds.top - 25,
      };
      addNode(nodeType, position);
    },
    [addNode],
  );

  /** 保存 */
  const handleSave = async () => {
    if (nodes.length === 0) { message.warning('请先添加组件'); return; }
    setSaving(true);
    try {
      const el = generateEL();
      setElPreview(el);
      const payload = {
        chainName,
        chainType,
        elExpression: el,
        flowGraph: { nodes, edges },
      };
      await api.post('/admin/flows', payload);
      message.success('流程已保存');
    } catch (e: any) {
      message.error(e.response?.data?.message || '保存失败');
    } finally { setSaving(false); }
  };

  /** 发布 */
  const handlePublish = async () => {
    if (nodes.length === 0) { message.warning('请先添加组件'); return; }
    setPublishing(true);
    try {
      const el = generateEL();
      setElPreview(el);
      // 先保存
      const { data: saveData } = await api.post('/admin/flows', {
        chainName, chainType,
        elExpression: el,
        flowGraph: { nodes, edges },
      });
      const flowId = saveData?.data?.id;
      if (flowId) {
        await api.post(`/admin/flows/${flowId}/publish`);
      }
      message.success('流程已发布！LiteFlow 规则已热更新');
    } catch (e: any) {
      message.error(e.response?.data?.message || '发布失败');
    } finally { setPublishing(false); }
  };

  /** 生成 EL */
  const handleGenerateEL = () => {
    const el = generateEL();
    setElPreview(el);
    if (!el) message.warning('请先添加并连接组件');
  };

  /** 测试执行 */
  const handleTest = async () => {
    try {
      const payload = JSON.parse(testPayload);
      const { data } = await api.post('/admin/flows/test-run', {
        chainName,
        payload,
      });
      setTestResult(data?.data);
    } catch (e: any) {
      message.error('测试执行失败: ' + (e.message || '未知错误'));
    }
  };

  return (
    <PageWrapper>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
        <Title level={4} style={{ margin: 0 }}>流程设计器</Title>
        <Space>
          <Button icon={<PlayCircleOutlined />} onClick={handleGenerateEL}>生成 EL</Button>
          <Button icon={<SaveOutlined />} onClick={handleSave} loading={saving}>保存</Button>
          <Button type="primary" icon={<SendOutlined />} onClick={handlePublish} loading={publishing}>发布</Button>
        </Space>
      </div>

      <div style={{ display: 'flex', gap: 12, height: 'calc(100vh - 160px)' }}>
        {/* 左侧：组件库 */}
        <Card size="small" title="组件库" style={{ width: 180, flexShrink: 0 }}>
          <Space direction="vertical" style={{ width: '100%' }}>
            <Text strong style={{ fontSize: 11, color: '#999' }}>流程配置</Text>
            <Input size="small" placeholder="链名称" value={chainName}
              onChange={(e) => setChainName(e.target.value)} />
            <Select size="small" value={chainType} onChange={setChainType} style={{ width: '100%' }}
              options={[
                { label: 'ORDER', value: 'ORDER' },
                { label: 'BEHAVIOR', value: 'BEHAVIOR' },
                { label: 'REFUND', value: 'REFUND' },
              ]} />
            <Divider style={{ margin: '8px 0' }} />
            <Text strong style={{ fontSize: 11, color: '#999' }}>拖拽到画布</Text>
            {Object.entries(NODE_TYPES).map(([key, def]) => (
              <Card
                key={key}
                size="small"
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.setData('application/reactflow', key);
                  e.dataTransfer.effectAllowed = 'move';
                }}
                bodyStyle={{ padding: '8px 12px' }}
                style={{ cursor: 'grab', borderLeft: `3px solid ${def.color}` }}
              >
                <div style={{ fontSize: 12, fontWeight: 500 }}>{def.label}</div>
                <div style={{ fontSize: 10, color: '#999' }}>{def.componentName}</div>
              </Card>
            ))}
          </Space>
        </Card>

        {/* 中间：画布 */}
        <div ref={reactFlowWrapper} style={{ flex: 1, border: '1px solid #d9d9d9', borderRadius: 8, overflow: 'hidden' }}>
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onNodeClick={onNodeClick}
            onDragOver={onDragOver}
            onDrop={onDrop}
            nodeTypes={nodeTypes}
            fitView
            deleteKeyCode={['Backspace', 'Delete']}
            onNodesDelete={() => {/* handled by useFlowStore */}}
            connectionLineStyle={{ stroke: '#999', strokeWidth: 2 }}
            defaultEdgeOptions={{
              style: { stroke: '#1677ff', strokeWidth: 2 },
              markerEnd: { type: MarkerType.ArrowClosed, color: '#1677ff' },
            }}
          >
            <Background />
            <Controls />
            <MiniMap nodeColor={(n) => (n.data as any)?.color || '#ddd'} />
          </ReactFlow>
        </div>

        {/* 右侧：属性面板 */}
        <Card size="small" title={selectedNode ? '节点属性' : 'EL 与测试'} style={{ width: 280, flexShrink: 0 }}>
          {selectedNode ? (
            <Space direction="vertical" style={{ width: '100%' }}>
              <div style={{ background: '#f5f5f5', borderRadius: 4, padding: 8 }}>
                <Text strong style={{ fontSize: 13 }}>{(selectedNode.data as any)?.label}</Text>
                <br />
                <Tag color={(selectedNode.data as any)?.color} style={{ marginTop: 4 }}>
                  {(selectedNode.data as any)?.componentName}
                </Tag>
              </div>
              <Divider style={{ margin: '8px 0' }} />

              {/* 组件参数 (cmpData) */}
              <Text style={{ fontSize: 12, color: '#595959' }}>组件参数 (JSON)</Text>
              <Input.TextArea
                size="small"
                rows={4}
                style={{ fontFamily: 'monospace', fontSize: 11 }}
                placeholder='{"key": "value"}'
                value={typeof (selectedNode.data as any)?.cmpData === 'object'
                  ? JSON.stringify((selectedNode.data as any)?.cmpData, null, 2)
                  : ((selectedNode.data as any)?.cmpData || '')}
                onChange={(e) => {
                  try {
                    const parsed = e.target.value.trim() ? JSON.parse(e.target.value) : undefined;
                    const updated = { ...selectedNode, data: { ...selectedNode.data, cmpData: parsed } };
                    useFlowStore.setState((s) => ({
                      nodes: s.nodes.map((n) => n.id === selectedNode.id ? updated : n),
                      selectedNode: updated,
                    }));
                  } catch {
                    // 保存原始字符串，允许编辑中
                    const updated = { ...selectedNode, data: { ...selectedNode.data, cmpData: e.target.value } };
                    useFlowStore.setState((s) => ({
                      nodes: s.nodes.map((n) => n.id === selectedNode.id ? updated : n),
                      selectedNode: updated,
                    }));
                  }
                }}
              />

              <Divider style={{ margin: '8px 0' }} />
              <Text style={{ fontSize: 12, color: '#595959' }}>执行配置</Text>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Text style={{ fontSize: 11, color: '#999', width: 60 }}>超时(ms)</Text>
                <InputNumber size="small" style={{ flex: 1 }} min={100} step={100}
                  value={(selectedNode.data as any)?.timeout || 5000}
                  onChange={(v) => {
                    const updated = { ...selectedNode, data: { ...selectedNode.data, timeout: v } };
                    useFlowStore.setState((s) => ({ nodes: s.nodes.map((n) => n.id === selectedNode.id ? updated : n), selectedNode: updated }));
                  }} />
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Text style={{ fontSize: 11, color: '#999', width: 60 }}>重试次数</Text>
                <InputNumber size="small" style={{ flex: 1 }} min={0} max={10}
                  value={(selectedNode.data as any)?.retryCount || 0}
                  onChange={(v) => {
                    const updated = { ...selectedNode, data: { ...selectedNode.data, retryCount: v } };
                    useFlowStore.setState((s) => ({ nodes: s.nodes.map((n) => n.id === selectedNode.id ? updated : n), selectedNode: updated }));
                  }} />
              </div>
              <Checkbox
                checked={(selectedNode.data as any)?.async || false}
                onChange={(e) => {
                  const updated = { ...selectedNode, data: { ...selectedNode.data, async: e.target.checked } };
                  useFlowStore.setState((s) => ({ nodes: s.nodes.map((n) => n.id === selectedNode.id ? updated : n), selectedNode: updated }));
                }}>异步执行</Checkbox>
              <Divider style={{ margin: '8px 0' }} />
              <Button size="small" danger icon={<DeleteOutlined />} block onClick={removeSelectedNode}>删除节点</Button>
            </Space>
          ) : (
            <Space direction="vertical" style={{ width: '100%' }}>
              {elPreview && (
                <pre style={{
                  background: '#1e1e1e', color: '#d4d4d4', padding: 8, borderRadius: 4,
                  fontSize: 11, maxHeight: 200, overflow: 'auto', whiteSpace: 'pre-wrap', wordBreak: 'break-all',
                }}>
                  {elPreview}
                </pre>
              )}
              <Divider style={{ margin: '8px 0' }} />
              <Text strong style={{ fontSize: 11 }}>测试载荷 (JSON)</Text>
              <Input.TextArea
                value={testPayload}
                onChange={(e) => setTestPayload(e.target.value)}
                rows={4}
                style={{ fontSize: 11, fontFamily: 'monospace' }}
              />
              <Button block icon={<PlayCircleOutlined />} onClick={handleTest}>测试执行</Button>
              {testResult && (
                <Card size="small" style={{ background: testResult.success ? '#f6ffed' : '#fff2f0' }}>
                  <Text style={{ fontSize: 11 }}>
                    {testResult.success ? '✅ 成功' : '❌ 失败'} | 动作数: {testResult.actionCount}
                  </Text>
                </Card>
              )}
              <Divider style={{ margin: '8px 0' }} />
              <Button block onClick={clear}>清空画布</Button>
            </Space>
          )}
        </Card>
      </div>
    </PageWrapper>
  );
};

export default FlowDesigner;