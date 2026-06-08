import React, { useState, useCallback } from 'react';
import { Input, Select, Button, Typography, Space, Tag, Table, message, Alert } from 'antd';
import { PlusOutlined, DeleteOutlined, PlayCircleOutlined, SaveOutlined, CodeOutlined, TableOutlined } from '@ant-design/icons';
import Editor from '@monaco-editor/react';
import { testChannelTransform } from '../api';

const { Text } = Typography;

// ==================== 沙箱脚本执行(已迁移至服务端) ====================

// 前端不再使用 new Function() 执行脚本，改为调用后端 API
// 后端 AdminController.testChannelTransform 通过 GraalVM 沙箱安全执行

// ==================== 数据模型 ====================

interface Channel {
  key: string; name: string; configured: boolean; mappingMode: 'VISUAL' | 'SCRIPT';
}

interface FieldMapping {
  id: string; source: string; target: string; type: 'AUTO' | 'MANUAL';
}

const defaultChannels: Channel[] = [
  { key: 'TMALL', name: '天猫', configured: true, mappingMode: 'SCRIPT' },
  { key: 'JD', name: '京东', configured: true, mappingMode: 'SCRIPT' },
  { key: 'DOUYIN', name: '抖音', configured: true, mappingMode: 'VISUAL' },
  { key: 'WECHAT', name: '微信', configured: true, mappingMode: 'VISUAL' },
  { key: 'POS', name: 'POS', configured: false, mappingMode: 'VISUAL' },
];

const defaultMappings: Record<string, FieldMapping[]> = {
  TMALL: [
    { id: '1', source: 'tradeNo', target: 'idempotent_key', type: 'AUTO' },
    { id: '2', source: 'tradeTime', target: 'event_time', type: 'AUTO' },
    { id: '3', source: 'channelType', target: 'channel', type: 'AUTO' },
    { id: '4', source: 'totalPrice', target: 'payload.order_info.amounts.total_price', type: 'MANUAL' },
  ],
};

const defaultScripts: Record<string, string> = {
  TMALL: `function transform(source, context) {
  // 路径映射表自动处理等值映射
  const base = applyFieldMappings(source);

  // 补充特殊枚举转换逻辑
  base.event_type = mapOrderType(source.orderType);
  base.payload.order_info = base.payload.order_info || {};
  base.payload.order_info.amounts = base.payload.order_info.amounts || {};
  base.payload.order_info.amounts.trade_price = source.tradePrice;
  base.payload.order_info.products = source.products;

  return base;
}

function mapOrderType(type) {
  const MAP = { 1: 'ORDER', 2: 'REFUND', 3: 'PRESALE' };
  return MAP[type] || 'CUSTOM';
}`,
};

const defaultPreviewInput: Record<string, string> = {
  TMALL: JSON.stringify({
    tradeNo: 'TM20240601001',
    tradeTime: '2024-06-01T10:30:00',
    channelType: 'TMALL',
    orderType: 1,
    totalPrice: 299.00,
    tradePrice: 279.00,
    products: [
      { commodity_code: 'SKU001', commodity_name: '测试商品A', price: 199.00, quant: 1 },
      { commodity_code: 'SKU002', commodity_name: '测试商品B', price: 100.00, quant: 1 },
    ],
  }, null, 2),
};

// ==================== 主组件 ====================

const MappingConfig: React.FC = () => {
  const [channels] = useState<Channel[]>(defaultChannels);
  const [selectedChannel, setSelectedChannel] = useState('TMALL');
  const [mappingMode, setMappingMode] = useState<'VISUAL' | 'SCRIPT'>('VISUAL');
  const [mappings, setMappings] = useState(defaultMappings);
  const [scripts, setScripts] = useState(defaultScripts);
  const [previewInput, setPreviewInput] = useState(defaultPreviewInput);
  const [previewOutput, setPreviewOutput] = useState('');
  const [previewError, setPreviewError] = useState('');
  const [previewLoading, setPreviewLoading] = useState(false);

  const channel = channels.find(c => c.key === selectedChannel);
  const currentMappings = mappings[selectedChannel] || [];
  const currentScript = scripts[selectedChannel] || '';
  const currentInput = previewInput[selectedChannel] || '';

  const addMapping = useCallback(() => {
    setMappings(prev => ({
      ...prev, [selectedChannel]: [...(prev[selectedChannel] || []), { id: `m_${Date.now()}`, source: '', target: '', type: 'MANUAL' }],
    }));
  }, [selectedChannel]);

  const updateMapping = useCallback((id: string, field: keyof FieldMapping, value: any) => {
    setMappings(prev => ({
      ...prev, [selectedChannel]: (prev[selectedChannel] || []).map(m => m.id === id ? { ...m, [field]: value } : m),
    }));
  }, [selectedChannel]);

  const deleteMapping = useCallback((id: string) => {
    setMappings(prev => ({
      ...prev, [selectedChannel]: (prev[selectedChannel] || []).filter(m => m.id !== id),
    }));
  }, [selectedChannel]);

  const handleTest = useCallback(async () => {
    setPreviewLoading(true);
    setPreviewError('');
    try {
      const result = await testChannelTransform(currentInput, currentMappings, currentScript);
      if (result && result.result) {
        setPreviewError('');
        setPreviewOutput(JSON.stringify(result.result, null, 2));
      } else {
        setPreviewError('服务端返回空结果');
        setPreviewOutput('');
      }
    } catch (e: any) {
      setPreviewError(e.response?.data?.message || e.message || '请求失败');
      setPreviewOutput('');
    }
    setPreviewLoading(false);
  }, [currentInput, currentMappings, currentScript]);

  const handleSave = () => message.success('映射配置已保存');
  const handleScriptChange = (v?: string) => setScripts(prev => ({ ...prev, [selectedChannel]: v || '' }));
  const handleInputChange = (v?: string) => setPreviewInput(prev => ({ ...prev, [selectedChannel]: v || '' }));

  const columns = [
    { title: '源字段', dataIndex: 'source', width: 160,
      render: (v: string, r: FieldMapping) => (
        <Input size="small" value={v} onChange={e => updateMapping(r.id, 'source', e.target.value)}
          placeholder="tradeNo" style={{ fontFamily: 'monospace', fontSize: 11 }} />),
    },
    { title: '→', width: 36, align: 'center' as const, render: () => <span style={{ color: '#1677ff' }}>→</span> },
    { title: '目标路径', dataIndex: 'target',
      render: (v: string, r: FieldMapping) => (
        <Input size="small" value={v} onChange={e => updateMapping(r.id, 'target', e.target.value)}
          placeholder="idempotent_key (多层用 . 分隔)" style={{ fontFamily: 'monospace', fontSize: 11 }} />),
    },
    { title: '', dataIndex: 'type', width: 64,
      render: (v: string) => <Tag color={v === 'AUTO' ? 'green' : 'blue'} style={{ fontSize: 10 }}>{v === 'AUTO' ? '自动' : '手动'}</Tag> },
    { title: '', width: 32,
      render: (_: any, r: FieldMapping) => (
        <Button size="small" type="text" danger icon={<DeleteOutlined />} onClick={() => deleteMapping(r.id)} />),
    },
  ];

  return (
    <div style={{ display: 'flex', flex: 1, minHeight: 'calc(100vh - 120px)', background: '#fff' }}>
      {/* 左侧渠道列表 */}
      <div style={{ width: 180, borderRight: '1px solid #f0f0f0', padding: '12px 8px', flexShrink: 0 }}>
        <Text strong style={{ fontSize: 12, display: 'block', marginBottom: 10 }}>渠道列表</Text>
        {channels.map(c => (
          <div key={c.key} onClick={() => setSelectedChannel(c.key)} style={{
            display: 'flex', alignItems: 'center', gap: 6, padding: '7px 8px', cursor: 'pointer',
            borderRadius: 5, fontSize: 12, marginBottom: 2,
            background: selectedChannel === c.key ? '#f0f5ff' : 'transparent',
            transition: 'background 0.15s',
          }}>
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: c.configured ? '#52c41a' : '#d9d9d9', flexShrink: 0 }} />
            <span style={{ flex: 1 }}>{c.name}</span>
            <Tag color={c.mappingMode === 'SCRIPT' ? 'purple' : 'blue'} style={{ fontSize: 9, lineHeight: '15px' }}>{c.mappingMode === 'SCRIPT' ? 'Script' : 'Visual'}</Tag>
          </div>
        ))}
        <Button size="small" icon={<PlusOutlined />} block style={{ marginTop: 6, fontSize: 11 }}>新增渠道</Button>
      </div>

      {/* 右侧主区域 */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {/* 顶部栏 */}
        <div style={{ padding: '10px 16px', borderBottom: '1px solid #f0f0f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Space>
            <Text strong style={{ fontSize: 13 }}>{channel?.name} → TransactionEvent</Text>
          </Space>
          <Space>
            <Button size="small" onClick={handleSave} icon={<SaveOutlined />} style={{ fontSize: 11 }}>保存</Button>
            <Button size="small" type="primary" onClick={handleTest} loading={previewLoading}
              icon={<PlayCircleOutlined />} style={{ fontSize: 11 }}>测试映射</Button>
          </Space>
        </div>

        {/* 映射配置区 */}
        <div style={{ flex: 1, overflow: 'auto', padding: '12px 16px', display: 'flex', flexDirection: 'column' }}>
          {/* 模式切换 */}
          <Space style={{ marginBottom: 12 }}>
            <Button size="small" type={mappingMode === 'VISUAL' ? 'primary' : 'default'} icon={<TableOutlined />}
              onClick={() => setMappingMode('VISUAL')} style={{ fontSize: 11 }}>路径映射表</Button>
            <Button size="small" type={mappingMode === 'SCRIPT' ? 'primary' : 'default'} icon={<CodeOutlined />}
              onClick={() => setMappingMode('SCRIPT')} style={{ fontSize: 11 }}>脚本补充</Button>
          </Space>

          {mappingMode === 'VISUAL' ? (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                <Text strong style={{ fontSize: 12 }}>路径映射表</Text>
                <Button size="small" icon={<PlusOutlined />} onClick={addMapping} style={{ fontSize: 11 }}>添加映射</Button>
              </div>
              <Table dataSource={currentMappings} columns={columns} rowKey="id" size="small" pagination={false}
                locale={{ emptyText: '点击"添加映射"配置字段映射' }}
                style={{ marginBottom: 16 }} />
            </div>
          ) : (
            <div style={{ marginBottom: 16 }}>
              <Text strong style={{ fontSize: 12, display: 'block', marginBottom: 4 }}>映射脚本</Text>
              <Text type="secondary" style={{ fontSize: 10, display: 'block', marginBottom: 8 }}>
                函数签名: function transform(source, context): 使用 applyFieldMappings(source) 获取路径映射结果，补充特殊逻辑后返回
              </Text>
              <Editor height="240px" language="javascript" value={currentScript} onChange={handleScriptChange}
                theme="vs" options={{ fontSize: 12, minimap: { enabled: false }, scrollBeyondLastLine: false, tabSize: 2 }} />
            </div>
          )}

          {/* 错误 */}
          {previewError && (
            <Alert type="error" message="执行错误" description={previewError} closable showIcon
              style={{ marginBottom: 12 }} onClose={() => setPreviewError('')} />
          )}

          {/* 预览区 */}
          <div style={{ display: 'flex', gap: 12, flex: 1, minHeight: 200 }}>
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                <Text strong style={{ fontSize: 12 }}>输入 JSON (source)</Text>
                <Button size="small" type="link" style={{ fontSize: 10, padding: 0 }} onClick={() => {
                  try { const formatted = JSON.stringify(JSON.parse(currentInput), null, 2); setPreviewInput(prev => ({ ...prev, [selectedChannel]: formatted })); } catch {}
                }}>格式化</Button>
              </div>
              <div style={{ flex: 1, border: '1px solid #e0e0e0', borderRadius: 6, overflow: 'hidden' }}>
                <Editor height="100%" language="json" value={currentInput} onChange={handleInputChange}
                  theme="vs" options={{ fontSize: 11, minimap: { enabled: false }, scrollBeyondLastLine: false, lineNumbers: 'off' }} />
              </div>
            </div>
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
              <Text strong style={{ fontSize: 12, marginBottom: 4 }}>转换结果 (target)</Text>
              <div style={{ flex: 1, border: '1px solid #e0e0e0', borderRadius: 6, overflow: 'hidden', background: previewOutput ? '#fff' : '#fafafa' }}>
                {previewOutput ? (
                  <Editor height="100%" language="json" value={previewOutput} theme="vs"
                    options={{ fontSize: 11, minimap: { enabled: false }, readOnly: true, scrollBeyondLastLine: false, lineNumbers: 'off' }} />
                ) : (
                  <div style={{ padding: 24, textAlign: 'center', color: '#ccc', fontSize: 13 }}>
                    点击"测试映射"查看转换结果
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* 底部流程 */}
        <div style={{ padding: '6px 16px', borderTop: '1px solid #f0f0f0', background: '#fafafa' }}>
          <Text type="secondary" style={{ fontSize: 10 }}>
            API → 映射转换 → One-ID → Drools → 积分/等级
          </Text>
        </div>
      </div>
    </div>
  );
};

export default MappingConfig;