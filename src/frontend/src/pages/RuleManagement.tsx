import React, { useState } from 'react';
import { Card, Form, Input, InputNumber, Button, Table, Tag, message, Space, Popconfirm } from 'antd';
import { PlusOutlined, DeleteOutlined, SaveOutlined, ThunderboltOutlined } from '@ant-design/icons';
import axios from 'axios';

const PROG = sessionStorage.getItem('current_program_code') || 'PROG001';

const RuleManagement: React.FC = () => {
  const [rules, setRules] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [prompt, setPrompt] = useState('');
  const [aiResult, setAiResult] = useState<any>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [form] = Form.useForm();

  const fetchRules = async () => {
    setLoading(true);
    try {
      const { data } = await axios.get('/api/admin/rules', { headers: { 'X-Program-Code': PROG } });
      setRules(data?.data || []);
    } catch { setRules([]); } finally { setLoading(false); }
  };

  React.useEffect(() => { fetchRules(); }, []);

  const handleCreate = async (values: any) => {
    await axios.post('/api/admin/rules', values, { headers: { 'X-Program-Code': PROG } });
    message.success('规则已创建'); form.resetFields(); fetchRules();
  };

  const handleAiGenerate = async () => {
    if (!prompt.trim()) { message.warning('请输入规则描述'); return; }
    setAiLoading(true);
    try {
      const { data } = await axios.post('/api/admin/rules/generate', { prompt }, { headers: { 'X-Program-Code': PROG } });
      setAiResult(data.data);
      message.success('AI 规则生成完成');
    } catch (e: any) { message.error(e.message); }
    finally { setAiLoading(false); }
  };

  const columns = [
    { title: '代码', dataIndex: 'rule_code', width: 100 }, { title: '名称', dataIndex: 'rule_name', width: 120 },
    { title: '类型', dataIndex: 'rule_type', width: 80, render: (v: string) => <Tag>{v}</Tag> },
    { title: '议程组', dataIndex: 'agenda_group', width: 80 },
    { title: '版本', dataIndex: 'version', width: 50 },
    { title: '状态', dataIndex: 'status', width: 80, render: (v: string) => <Tag color={v === 'ACTIVE' ? 'green' : 'default'}>{v}</Tag> },
    { title: 'DRL 内容', dataIndex: 'drl_content', width: 200, ellipsis: true, render: (v: string) => <span style={{ fontSize: 11, color: '#666' }}>{v?.substring(0, 80)}</span> },
  ];

  return (
    <div>
      <Card title="新建规则" size="small" style={{ marginBottom: 16 }}>
        <Form form={form} layout="inline" onFinish={handleCreate}>
          <Form.Item name="rule_code" rules={[{ required: true }]}><Input placeholder="规则代码" /></Form.Item>
          <Form.Item name="rule_name"><Input placeholder="规则名称" /></Form.Item>
          <Form.Item name="drl_content" rules={[{ required: true }]}><Input.TextArea placeholder="DRL 内容..." rows={2} style={{ width: 400 }} /></Form.Item>
          <Form.Item><Button type="primary" htmlType="submit" icon={<PlusOutlined />}>创建</Button></Form.Item>
        </Form>
      </Card>

      <Card title="🤖 AI 生成规则" size="small" style={{ marginBottom: 16, background: '#f6ffed' }}>
        <Space direction="vertical" style={{ width: '100%' }}>
          <Input.TextArea value={prompt} onChange={e => setPrompt(e.target.value)}
            placeholder="用自然语言描述规则，例如：用户如果在周末购买了苹果手机且金额大于5000，额外送100分" rows={2} />
          <Button icon={<ThunderboltOutlined />} onClick={handleAiGenerate} loading={aiLoading}>AI 生成规则</Button>
          {aiResult && <pre style={{ background: '#1e1e1e', color: '#d4d4d4', padding: 12, borderRadius: 4, fontSize: 12, maxHeight: 200, overflow: 'auto' }}>{JSON.stringify(aiResult, null, 2)}</pre>}
        </Space>
      </Card>

      <Card title="规则列表" extra={<Button icon={<SaveOutlined />} onClick={fetchRules}>刷新</Button>}>
        <Table dataSource={rules} columns={columns} loading={loading} rowKey="id" size="small" pagination={{ pageSize: 20 }} />
      </Card>
    </div>
  );
};

export default RuleManagement;