import React, { useState, useEffect, useMemo } from 'react';
import { Card, Form, Input, InputNumber, Select, Button, Switch, message, Spin, Space, Typography, Alert, Divider, AutoComplete } from 'antd';
import { SaveOutlined, RobotOutlined, ApiOutlined, KeyOutlined } from '@ant-design/icons';
import { useAppStore } from '../store';
import api from '../api';

const { Text } = Typography;

/** 提供商预设 */
const PROVIDER_PRESETS: Record<string, { name: string; defaultUrl: string; defaultModel: string; models: string[] }> = {
  DEEPSEEK:     { name: 'DeepSeek',     defaultUrl: 'https://api.deepseek.com/v1/chat/completions',                                 defaultModel: 'deepseek-chat',  models: ['deepseek-chat', 'deepseek-coder'] },
  BAILIAN:      { name: '阿里百炼',      defaultUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions',          defaultModel: 'qwen-plus',     models: ['deepseek-v4-pro', 'qwen-plus', 'qwen-max', 'qwen-turbo', 'qwen2.5-72b-instruct', 'qwen2.5-32b-instruct', 'qwen2.5-14b-instruct', 'qwen2.5-7b-instruct'] },
};

const LlmConfig: React.FC = () => {
  const PROG = useAppStore(s => s.currentProgramCode);
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [hasConfig, setHasConfig] = useState(false);
  const [currentProvider, setCurrentProvider] = useState('DEEPSEEK');
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);

  useEffect(() => {
    fetchConfig();
  }, [PROG]);

  const fetchConfig = async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/admin/llm-config');
      const d = data?.data;
      if (d?.hasConfig) {
        setHasConfig(true);
        setCurrentProvider(d.provider);
        form.setFieldsValue({
          enabled: d.enabled,
          provider: d.provider,
          apiUrl: d.apiUrl,
          apiKey: d.apiKeyMasked || '',
          model: d.model,
          temperature: d.temperature,
          maxTokens: d.maxTokens,
        });
      } else {
        setHasConfig(false);
        // 默认值
        const defaultProvider = 'DEEPSEEK';
        form.setFieldsValue({
          enabled: false,
          provider: defaultProvider,
          apiUrl: PROVIDER_PRESETS[defaultProvider].defaultUrl,
          model: PROVIDER_PRESETS[defaultProvider].defaultModel,
          temperature: 0.1,
          maxTokens: 4096,
        });
      }
    } catch (e: any) {
      message.error(e?.response?.data?.message || '加载配置失败');
    } finally {
      setLoading(false);
    }
  };

  const handleProviderChange = (provider: string) => {
    setCurrentProvider(provider);
    const preset = PROVIDER_PRESETS[provider];
    if (!preset) return;
    // 仅当用户未手动修改 URL 时才自动填充
    const currentUrl = form.getFieldValue('apiUrl');
    const shouldSetDefault = !currentUrl || currentUrl === '' ||
      Object.values(PROVIDER_PRESETS).some(p => p.defaultUrl === currentUrl);
    if (shouldSetDefault) {
      form.setFieldsValue({
        apiUrl: preset.defaultUrl,
        model: preset.defaultModel,
      });
    } else {
      // 只更新 model
      form.setFieldsValue({ model: preset.defaultModel });
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const values = await form.validateFields();
      await api.put('/admin/llm-config', values);
      message.success('大模型配置已保存');
      await fetchConfig(); // 刷新掩码 key
    } catch (e: any) {
      if (e?.errorFields) {
        // Ant Design 表单验证错误
        return;
      }
      message.error(e?.response?.data?.message || '保存失败');
    } finally {
      setSaving(false);
    }
  };

  const handleTestConnection = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const values = await form.validateFields();
      const { data } = await api.post('/admin/llm-config/test', values);
      const d = data?.data;
      if (d?.success) {
        setTestResult({
          success: true,
          message: `连接成功 (${d.elapsedMs}ms) — 模型响应: "${d.response}"`,
        });
      } else {
        setTestResult({
          success: false,
          message: d?.error || '连接失败',
        });
      }
    } catch (e: any) {
      if (e?.errorFields) return;
      setTestResult({ success: false, message: e?.response?.data?.message || '请求失败' });
    } finally {
      setTesting(false);
    }
  };

  const modelOptions = useMemo(() => {
    const preset = PROVIDER_PRESETS[currentProvider];
    return preset ? preset.models.map(m => ({ label: m, value: m })) : [];
  }, [currentProvider]);

  return (
    <Card
        title={
          <Space>
            <RobotOutlined style={{ fontSize: 20 }} />
            <span style={{ fontSize: 16, fontWeight: 600 }}>大模型配置</span>
          </Space>
        }
        extra={
          <Space>
            <Button icon={<ApiOutlined />} loading={testing} onClick={handleTestConnection}>
              测试连接
            </Button>
            <Button type="primary" icon={<SaveOutlined />} loading={saving} onClick={handleSave}>
              保存
            </Button>
          </Space>
        }
        style={{ borderRadius: 8 }}
      >
        <Spin spinning={loading}>
          {hasConfig && (
            <Alert type="info" message="当前 program 已配置大模型。修改后保存即可生效。" showIcon style={{ marginBottom: 16 }} />
          )}
          <Form form={form} layout="vertical" size="middle">
            <Form.Item name="enabled" label="启用大模型" valuePropName="checked">
              <Switch checkedChildren="启用" unCheckedChildren="禁用" />
            </Form.Item>
            <Divider plain>连接配置</Divider>
            <Form.Item name="provider" label="LLM 提供商" rules={[{ required: true, message: '请选择 LLM 提供商' }]}>
              <Select onChange={handleProviderChange} placeholder="选择 LLM 提供商">
                {Object.entries(PROVIDER_PRESETS).map(([key, p]) => (
                  <Select.Option key={key} value={key}>
                    <Space><ApiOutlined />{p.name}</Space>
                  </Select.Option>
                ))}
              </Select>
            </Form.Item>
            <Form.Item name="apiUrl" label="API URL"
              rules={[{ required: true, message: '请输入 API URL' }, { type: 'url', message: '请输入有效的 URL', warningOnly: true }]}>
              <Input placeholder="https://api.deepseek.com/v1/chat/completions" />
            </Form.Item>
            <Form.Item name="apiKey" label="API Key" extra={hasConfig ? '留空则不修改已保存的密钥' : undefined}>
              <Input.Password placeholder={hasConfig ? '已配置密钥，输入新值替换' : '请输入 API Key'} autoComplete="off" prefix={<KeyOutlined />} />
            </Form.Item>
            <Divider plain>模型参数</Divider>
            <Form.Item name="model" label="模型" rules={[{ required: true, message: '请输入模型名称' }]}>
              <AutoComplete key={currentProvider} placeholder="输入或选择模型名称" options={modelOptions} />
            </Form.Item>
            <Form.Item name="temperature" label="Temperature（创造性）" rules={[{ required: true }]}>
              <InputNumber min={0} max={2} step={0.1} style={{ width: 240 }} addonAfter="值越小越精确" />
            </Form.Item>
            <Form.Item name="maxTokens" label="最大 Token 数">
              <InputNumber min={1} max={128000} step={1} style={{ width: 240 }} addonAfter="tokens" />
            </Form.Item>
          </Form>
          {testResult && (
            <Alert type={testResult.success ? 'success' : 'error'}
              message={testResult.success ? '连接测试通过' : '连接测试失败'}
              description={testResult.message} showIcon closable
              onClose={() => setTestResult(null)} style={{ marginBottom: 8 }} />
          )}
          {!hasConfig && (
            <Alert type="warning" message="当前未配置大模型"
              description="AI 规则生成将使用模拟模式运行。填写上方信息并保存后，即可使用真实 LLM 生成规则。" showIcon style={{ marginTop: 8 }} />
          )}
        </Spin>
      </Card>
  );
};

export default LlmConfig;
