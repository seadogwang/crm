import React, { useState, useCallback, useRef, useEffect } from 'react';
import Editor, { OnMount } from '@monaco-editor/react';
import { Button, Card, Space, Select, Input, Tag, Alert, Collapse, message, Spin, Descriptions, Divider } from 'antd';
import {
  PlayCircleOutlined, CodeOutlined, FileTextOutlined,
  ThunderboltOutlined, CopyOutlined, ClearOutlined,
} from '@ant-design/icons';
import type { editor } from 'monaco-editor';
import type { TransformTestResult } from '../../types';
import { testTransform } from '../../api';

// ==================== 内置转换模板 ====================
const TRANSFORM_TEMPLATES: Record<string, { label: string; code: string }> = {
  'tmall-order': {
    label: '天猫 - 订单事件',
    code: `/**
 * 天猫订单事件 → 平台标准 EventFact
 * 输入: source (原始天猫 JSON)
 * 输出: { event_type, member_id, channel, payload }
 */
function transform(source) {
    return {
        event_type: "ORDER_PAID",
        member_id: source.user?.mobile || source.buyer_nick,
        channel: "TMALL",
        payload: {
            order_amount: (source.order?.total_fee || 0) / 100,  // 分 → 元
            external_order_id: source.order?.id || source.tid,
            item_count: source.items?.length || 0,
            pay_type: source.order?.pay_type || "ALIPAY",
            sku_code: source.items?.[0]?.sku,
        },
    };
}`,
  },
  'jd-order': {
    label: '京东 - 订单事件',
    code: `/**
 * 京东订单事件 → 平台标准 EventFact
 */
function transform(source) {
    return {
        event_type: "ORDER_PAID",
        member_id: source.user?.pin || source.buyer_id,
        channel: "JD",
        payload: {
            order_amount: (source.order?.total_price || 0),
            external_order_id: source.order?.order_id || source.jd_order_id,
            item_count: source.items?.length || 0,
            pay_type: source.order?.payment_type || "JDPAY",
        },
    };
}`,
  },
  'douyin-order': {
    label: '抖音 - 订单事件',
    code: `/**
 * 抖音订单事件 → 平台标准 EventFact
 */
function transform(source) {
    return {
        event_type: "ORDER_PAID",
        member_id: source.user?.open_id || source.buyer_open_id,
        channel: "DOUYIN",
        payload: {
            order_amount: (source.order?.total_amount || 0) / 100,
            external_order_id: source.order?.order_id,
            item_count: source.sku_list?.length || 0,
            shop_id: source.shop_id,
        },
    };
}`,
  },
  'enrollment': {
    label: '通用 - 入会事件',
    code: `function transform(source) {
    return {
        event_type: "ENROLLMENT",
        member_id: source.mobile || source.user_id,
        channel: source.channel || "UNKNOWN",
        payload: {
            mobile: source.mobile,
            enroll_time: source.enroll_time || new Date().toISOString(),
            source_channel: source.source_channel,
        },
    };
}`,
  },
};

// ==================== 主组件 ====================
export interface ScriptingWorkbenchProps {
  /** 当前渠道 */
  defaultChannel?: string;
  /** 持久化回调（保存脚本到后端） */
  onSaveScript?: (channel: string, code: string) => void;
}

const DEFAULT_INPUT_JSON = `{
  "order": {
    "id": "TM202605310001",
    "total_fee": 15000,
    "pay_type": "ALIPAY"
  },
  "user": {
    "mobile": "13800138000",
    "buyer_nick": "test_user"
  },
  "items": [
    { "sku": "SKU-001", "price": 10000, "qty": 1 },
    { "sku": "SKU-002", "price": 5000, "qty": 2 }
  ]
}`;

const ScriptingWorkbench: React.FC<ScriptingWorkbenchProps> = ({ defaultChannel = 'TMALL', onSaveScript }) => {
  const [channel, setChannel] = useState(defaultChannel);
  const [inputJson, setInputJson] = useState(DEFAULT_INPUT_JSON);
  const [jsCode, setJsCode] = useState(TRANSFORM_TEMPLATES['tmall-order'].code);
  const [result, setResult] = useState<TransformTestResult | null>(null);
  const [testing, setTesting] = useState(false);
  const [templateKey, setTemplateKey] = useState('tmall-order');
  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null);

  // 切换模板
  const handleTemplateChange = useCallback((key: string) => {
    const tmpl = TRANSFORM_TEMPLATES[key];
    if (tmpl) {
      setTemplateKey(key);
      setJsCode(tmpl.code);
    }
  }, []);

  const handleEditorMount: OnMount = useCallback((editor) => {
    editorRef.current = editor;
  }, []);

  // 在线测试
  const handleTest = useCallback(async () => {
    // 校验输入 JSON
    try {
      JSON.parse(inputJson);
    } catch {
      message.error('输入 JSON 格式错误，请检查');
      return;
    }

    setTesting(true);
    setResult(null);
    try {
      const res = await testTransform({ channel, js_code: jsCode, source_json: inputJson });
      setResult(res);
      if (res.success) {
        message.success(`转换成功 (${res.execution_time_ms}ms)`);
      } else {
        message.error(res.error || '转换失败');
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : '请求失败';
      setResult({ success: false, error: msg });
    } finally {
      setTesting(false);
    }
  }, [channel, jsCode, inputJson]);

  const handleCopyResult = useCallback(() => {
    if (result?.result) {
      navigator.clipboard.writeText(JSON.stringify(result.result, null, 2));
      message.success('已复制到剪贴板');
    }
  }, [result]);

  return (
    <div style={{ display: 'flex', gap: 16, height: 'calc(100vh - 120px)', padding: 16 }}>
      {/* 左栏：原始 JSON 输入 */}
      <Card
        title={<Space><FileTextOutlined />原始第三方 JSON</Space>}
        size="small"
        style={{ width: 320, display: 'flex', flexDirection: 'column' }}
        extra={
          <Button size="small" icon={<ClearOutlined />} onClick={() => setInputJson(DEFAULT_INPUT_JSON)}>
            重置
          </Button>
        }
      >
        <Input.TextArea
          value={inputJson}
          onChange={(e) => setInputJson(e.target.value)}
          style={{
            flex: 1, fontFamily: 'monospace', fontSize: 12,
            background: '#1e1e1e', color: '#d4d4d4', border: 'none', resize: 'none',
          }}
          rows={25}
        />
      </Card>

      {/* 中栏：Monaco 编辑器 */}
      <Card
        title={<Space><CodeOutlined />转换脚本 (JavaScript)</Space>}
        size="small"
        style={{ flex: 1, display: 'flex', flexDirection: 'column' }}
        extra={
          <Space>
            <Select
              size="small"
              value={templateKey}
              onChange={handleTemplateChange}
              style={{ width: 180 }}
              options={Object.entries(TRANSFORM_TEMPLATES).map(([k, v]) => ({ label: v.label, value: k }))}
            />
            <Select
              size="small"
              value={channel}
              onChange={setChannel}
              style={{ width: 100 }}
              options={[
                { label: 'TMALL', value: 'TMALL' },
                { label: 'JD', value: 'JD' },
                { label: 'DOUYIN', value: 'DOUYIN' },
                { label: 'WECHAT', value: 'WECHAT_MINI' },
              ]}
            />
          </Space>
        }
      >
        <div style={{ flex: 1, border: '1px solid #d9d9d9', borderRadius: 4, overflow: 'hidden' }}>
          <Editor
            height="100%"
            defaultLanguage="javascript"
            theme="vs-dark"
            value={jsCode}
            onChange={(v) => setJsCode(v || '')}
            onMount={handleEditorMount}
            options={{
              minimap: { enabled: false },
              fontSize: 13,
              lineNumbers: 'on',
              scrollBeyondLastLine: false,
              automaticLayout: true,
              tabSize: 2,
            }}
          />
        </div>
        <div style={{ marginTop: 12, textAlign: 'right' }}>
          <Space>
            {onSaveScript && (
              <Button onClick={() => onSaveScript(channel, jsCode)}>保存脚本</Button>
            )}
            <Button
              type="primary"
              icon={<PlayCircleOutlined />}
              onClick={handleTest}
              loading={testing}
            >
              在线测试
            </Button>
          </Space>
        </div>
      </Card>

      {/* 右栏：测试结果 */}
      <Card
        title={<Space><ThunderboltOutlined />转换结果</Space>}
        size="small"
        style={{ width: 360, display: 'flex', flexDirection: 'column' }}
        extra={
          result?.result && (
            <Button size="small" icon={<CopyOutlined />} onClick={handleCopyResult}>
              复制
            </Button>
          )
        }
      >
        {testing && <Spin tip="沙箱执行中..." style={{ display: 'block', padding: 60 }} />}

        {!testing && !result && (
          <div style={{ textAlign: 'center', color: '#999', padding: 60 }}>
            <PlayCircleOutlined style={{ fontSize: 32 }} />
            <p>点击「在线测试」执行转换</p>
            <p style={{ fontSize: 12 }}>
              后端 GraalVM 沙箱限制：50ms 超时、禁用 IO/网络
            </p>
          </div>
        )}

        {result && result.success && result.result && (
          <div>
            <Alert type="success" message="转换成功" showIcon style={{ marginBottom: 12 }} />
            <Descriptions size="small" column={1}>
              <Descriptions.Item label="耗时">{result.execution_time_ms}ms</Descriptions.Item>
              <Descriptions.Item label="事件类型">
                <Tag color="blue">{result.result.event_type as string || 'N/A'}</Tag>
              </Descriptions.Item>
              <Descriptions.Item label="会员ID">
                {result.result.member_id as string || 'N/A'}
              </Descriptions.Item>
            </Descriptions>
            <Divider style={{ margin: '8px 0' }} />
            <pre style={{
              background: '#f6ffed', padding: 12, borderRadius: 4,
              fontSize: 12, maxHeight: 300, overflow: 'auto', border: '1px solid #b7eb8f',
            }}>
              {JSON.stringify(result.result, null, 2)}
            </pre>
          </div>
        )}

        {result && !result.success && (
          <div>
            <Alert type="error" message="转换失败" description={result.error} showIcon />
          </div>
        )}
      </Card>
    </div>
  );
};

export default ScriptingWorkbench;