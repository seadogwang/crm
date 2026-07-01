import React, { useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Card, Button, Space, Tabs, Input, Tag, Typography, Table, message, Alert, Tree } from 'antd';
import {
  ArrowLeftOutlined, SaveOutlined, LinkOutlined, CodeOutlined,
  DeleteOutlined, PlusOutlined,
} from '@ant-design/icons';
import Editor from '@monaco-editor/react';
import { useCampaignStyles, TitleWithDesc, CampaignCard } from './campaign/styles/campaign-ui-standard';
import api from '../api';

const { Title, Text } = Typography;

// ==================== JSON 解析为树节点 ====================

interface TreeNode {
  key: string;
  title: string;
  path: string;
  value?: string;
  children?: TreeNode[];
  isLeaf?: boolean;
}

function jsonToTree(obj: any, prefix = '$', acc: TreeNode[] = []): TreeNode[] {
  if (obj === null || obj === undefined) return acc;
  if (typeof obj !== 'object') {
    acc.push({ key: prefix, title: `${prefix}: ${String(obj).substring(0, 30)}`, path: prefix, value: String(obj), isLeaf: true });
    return acc;
  }
  if (Array.isArray(obj)) {
    obj.forEach((item, i) => {
      jsonToTree(item, `${prefix}[${i}]`, acc);
    });
  } else {
    Object.entries(obj).forEach(([k, v]) => {
      if (typeof v === 'object' && v !== null && !Array.isArray(v)) {
        const nodeKey = `${prefix}.${k}`;
        const children: TreeNode[] = [];
        jsonToTree(v, nodeKey, children);
        acc.push({ key: nodeKey, title: k, path: nodeKey, children: children.length > 0 ? children : undefined });
      } else if (Array.isArray(v)) {
        const nodeKey = `${prefix}.${k}`;
        const children: TreeNode[] = [];
        v.forEach((item, i) => jsonToTree(item, `${nodeKey}[${i}]`, children));
        acc.push({ key: nodeKey, title: `${k} [${v.length}]`, path: nodeKey, children });
      } else {
        const nodeKey = `${prefix}.${k}`;
        acc.push({ key: nodeKey, title: `${k}: ${String(v).substring(0, 30)}`, path: nodeKey, value: String(v), isLeaf: true });
      }
    });
  }
  return acc;
}

// ==================== 映射编辑器 ====================

const MappingEditor: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [activeMode, setActiveMode] = useState<'visual' | 'script'>('script');

  // 可视模式状态
  const [sourceJson, setSourceJson] = useState('{\n  "order": {\n    "id": "123",\n    "total_fee": 5000\n  },\n  "user": {\n    "mobile": "13800138000"\n  }\n}');
  const [sourceTree, setSourceTree] = useState<TreeNode[]>([]);
  const [mappings, setMappings] = useState<{ sourcePath: string; targetPath: string }[]>([]);
  const [selectedSource, setSelectedSource] = useState<string | null>(null);

  // 脚本模式状态
  const [jsCode, setJsCode] = useState(`function transform(source) {
    return {
        event_type: "ORDER_PAID",
        member_id: source.user?.mobile,
        channel: "TMALL",
        payload: {
            order_amount: source.order?.total_fee || 0,
            external_order_id: source.order?.id,
        },
    };
}`);
  const [testInput, setTestInput] = useState(sourceJson);
  const [testOutput, setTestOutput] = useState<string | null>(null);
  const [testError, setTestError] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);

  // 解析源 JSON 为树
  const handleParseJson = useCallback(() => {
    try {
      const parsed = JSON.parse(sourceJson);
      setSourceTree(jsonToTree(parsed));
      message.success('JSON 解析成功');
    } catch {
      message.error('JSON 格式错误');
      setSourceTree([]);
    }
  }, [sourceJson]);

  // 可视模式：点击源节点标记为选中，再点击目标节点添加映射
  const handleSourceNodeClick = (path: string) => {
    setSelectedSource(path);
    message.info(`已选中源路径: ${path}，请点击右侧目标字段`);
  };

  const handleTargetNodeClick = (targetPath: string) => {
    if (!selectedSource) { message.warning('请先点击左侧源节点'); return; }
    setMappings(prev => {
      if (prev.some(m => m.targetPath === targetPath)) {
        return prev.map(m => m.targetPath === targetPath ? { ...m, sourcePath: selectedSource } : m);
      }
      return [...prev, { sourcePath: selectedSource, targetPath }];
    });
    setSelectedSource(null);
    message.success(`映射: ${selectedSource} → ${targetPath}`);
  };

  // 脚本模式：测试运行
  const handleTestRun = async () => {
    try {
      JSON.parse(testInput);
    } catch {
      message.error('输入 JSON 格式错误');
      return;
    }
    setTesting(true);
    setTestOutput(null);
    setTestError(null);
    try {
      const { data } = await api.post(`/open/spi/TMALL/test/transform`, {
        channel: 'TMALL',
        js_code: jsCode,
        source_json: testInput,
      });
      if (data.data?.success) {
        setTestOutput(JSON.stringify(data.data.result, null, 2));
      } else {
        setTestError(data.data?.error || '转换失败');
      }
    } catch (e: any) {
      setTestError(e.message || '请求失败');
    } finally {
      setTesting(false);
    }
  };

  // 目标 Schema 树（固定结构）
  const targetSchemaTree: TreeNode[] = [
    {
      key: '$.event_type', title: 'event_type: String', path: '$.event_type', isLeaf: true,
    },
    {
      key: '$.member_id', title: 'member_id: String', path: '$.member_id', isLeaf: true,
    },
    {
      key: '$.channel', title: 'channel: String', path: '$.channel', isLeaf: true,
    },
    {
      key: '$.payload', title: 'payload', path: '$.payload',
      children: [
        { key: '$.payload.order_amount', title: 'order_amount: Number', path: '$.payload.order_amount', isLeaf: true },
        { key: '$.payload.external_order_id', title: 'external_order_id: String', path: '$.payload.external_order_id', isLeaf: true },
        { key: '$.payload.item_count', title: 'item_count: Number', path: '$.payload.item_count', isLeaf: true },
        { key: '$.payload.pay_type', title: 'pay_type: String', path: '$.payload.pay_type', isLeaf: true },
      ],
    },
  ];

  const handleSave = async () => {
    try {
      if (activeMode === 'visual') {
        await api.put(`/admin/channels/${id}`, {
          mapping_config: { mappings },
        });
      } else {
        await api.put(`/admin/channels/${id}`, {
          transform_script: jsCode,
        });
      }
      message.success('配置已保存');
    } catch (e: any) {
      message.error(e.response?.data?.message || '保存失败');
    }
  };

  return (
    <div className="campaign-page" style={{ padding: 'var(--campaign-page-padding)', minHeight: 'calc(100vh - 64px)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
        <Space>
          <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/channels')}>返回</Button>
          <TitleWithDesc title={`映射编辑器 — 渠道 #${id}`} desc="通过可视模式或脚本模式配置 SPI 渠道数据转换映射" />
        </Space>
        <Space>
          <Button icon={<SaveOutlined />} onClick={handleSave}>保存</Button>
        </Space>
      </div>

      <Tabs
        activeKey={activeMode}
        onChange={(key) => setActiveMode(key as 'visual' | 'script')}
        items={[
          {
            key: 'visual',
            label: <span><LinkOutlined /> 可视模式</span>,
            children: (
              <div style={{ display: 'flex', gap: 16, height: 'calc(100vh - 240px)' }}>
                {/* 左：源数据预览 */}
                <Card title="源数据预览 (粘贴JSON)" size="small" style={{ width: 350 }}
                  extra={<Button size="small" onClick={handleParseJson}>解析</Button>}>
                  <Input.TextArea
                    value={sourceJson}
                    onChange={e => setSourceJson(e.target.value)}
                    rows={8}
                    style={{ fontFamily: 'monospace', fontSize: 12, marginBottom: 8 }}
                  />
                  <div style={{ overflow: 'auto', maxHeight: 'calc(100% - 160px)' }}>
                    <Tree
                      treeData={sourceTree}
                      defaultExpandAll
                      onSelect={(keys) => {
                        if (keys.length > 0) handleSourceNodeClick(String(keys[0]));
                      }}
                    />
                  </div>
                  {selectedSource && (
                    <Tag color="blue" style={{ marginTop: 8 }}>已选中: {selectedSource}</Tag>
                  )}
                </Card>

                {/* 中间：映射关系 */}
                <Card title="映射规则" size="small" style={{ width: 200 }}>
                  {mappings.length === 0 ? (
                    <Text type="secondary">点击左侧源节点，再点击右侧目标节点，建立映射关系</Text>
                  ) : (
                    mappings.map((m, i) => (
                      <div key={i} style={{ marginBottom: 8, fontSize: 12 }}>
                        <Tag color="green" closable onClose={() => setMappings(prev => prev.filter((_, j) => j !== i))}>
                          {m.sourcePath} → {m.targetPath}
                        </Tag>
                      </div>
                    ))
                  )}
                </Card>

                {/* 右：目标Schema树 */}
                <Card title="目标数据结构 (TransactionEvent)" size="small" style={{ flex: 1 }}>
                  <Tree
                    treeData={targetSchemaTree}
                    defaultExpandAll
                    onSelect={(keys) => {
                      if (keys.length > 0) handleTargetNodeClick(String(keys[0]));
                    }}
                  />
                  {mappings.length > 0 && (
                    <div style={{ marginTop: 16 }}>
                      <Text type="secondary">已映射的节点旁会显示来源路径</Text>
                    </div>
                  )}
                </Card>
              </div>
            ),
          },
          {
            key: 'script',
            label: <span><CodeOutlined /> 脚本模式</span>,
            children: (
              <div style={{ display: 'flex', gap: 16, height: 'calc(100vh - 240px)' }}>
                {/* 左：编辑器 */}
                <Card
                  title="转换脚本 (JavaScript)"
                  size="small"
                  style={{ flex: 1 }}
                  extra={
                    <Space>
                      <Button size="small" onClick={handleTestRun} loading={testing} icon={<CodeOutlined />}>
                        测试运行
                      </Button>
                    </Space>
                  }
                >
                  <Editor
                    height="100%"
                    defaultLanguage="javascript"
                    theme="vs-dark"
                    value={jsCode}
                    onChange={(v) => setJsCode(v || '')}
                    options={{
                      minimap: { enabled: false }, fontSize: 13, lineNumbers: 'on',
                      scrollBeyondLastLine: false, automaticLayout: true, tabSize: 2,
                    }}
                  />
                </Card>

                {/* 右：测试区 */}
                <div style={{ width: 380, display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <Card title="测试输入" size="small" style={{ flex: 1 }}>
                    <Input.TextArea
                      value={testInput}
                      onChange={e => setTestInput(e.target.value)}
                      style={{ fontFamily: 'monospace', fontSize: 12, height: '100%', resize: 'none' }}
                    />
                  </Card>
                  <Card
                    title="测试输出"
                    size="small"
                    style={{ flex: 1, borderColor: testError ? '#ff4d4f' : testOutput ? '#52c41a' : undefined }}
                  >
                    {testOutput && (
                      <pre style={{ margin: 0, fontSize: 12, maxHeight: '100%', overflow: 'auto', color: '#52c41a' }}>
                        {testOutput}
                      </pre>
                    )}
                    {testError && (
                      <pre style={{ margin: 0, fontSize: 12, maxHeight: '100%', overflow: 'auto', color: '#ff4d4f' }}>
                        {testError}
                      </pre>
                    )}
                    {!testOutput && !testError && !testing && (
                      <Text type="secondary" style={{ textAlign: 'center', display: 'block', padding: 40 }}>
                        点击「测试运行」查看结果<br />
                        <Text style={{ fontSize: 11 }}>后端 GraalVM 沙箱：50ms 超时、禁用 IO/网络</Text>
                      </Text>
                    )}
                  </Card>
                </div>
              </div>
            ),
          },
        ]}
      />
    </div>
  );
};

export default MappingEditor;