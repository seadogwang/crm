import React, { useState, useRef, useEffect } from 'react';
import { flushSync } from 'react-dom';
import { Card, Input, Button, Select, Tag, message, Space, Typography, Spin, Tooltip } from 'antd';
import { RobotOutlined, UserOutlined, SendOutlined, PlusOutlined, BulbOutlined, CheckCircleOutlined } from '@ant-design/icons';
import { useAppStore } from '../store';
import api from '../api';
import ClarificationForm from './ClarificationForm';

const { Text, Title } = Typography;

interface ChatMessage {
  speaker: 'USER' | 'AI';
  content: string;
  suggestions?: string[];
  context?: Record<string, string>;
  formSchema?: any; // V2: 表单 schema
}

const AIRuleAssistant: React.FC = () => {
  const PROG = useAppStore(s => s.currentProgramCode);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [ruleType, setRuleType] = useState('积分累积规则');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [rulePreview, setRulePreview] = useState<any>(null);
  const [status, setStatus] = useState<string>('');
  const [formSchema, setFormSchema] = useState<any>(null);
  const [formSubmitting, setFormSubmitting] = useState(false);
  const [answers, setAnswers] = useState<Record<string, string>>({}); // V3
  const [currentQuestion, setCurrentQuestion] = useState<any>(null); // V3
  const chatEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<any>(null);

  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages, formSchema]);

  const startSession = async () => {
    setLoading(true);
    try {
      const { data } = await api.post('/rules/ai/start', { ruleType });
      setSessionId(data.data.sessionId);
      setMessages([{
        speaker: 'AI',
        content: data.data.message || '您好！请描述您想配置的规则，我会帮您生成配置表单。',
        suggestions: data.data.suggestions,
      }]);
      setRulePreview(null);
      setStatus('');
      setFormSchema(null);
    } catch (e: any) {
      message.error('启动失败');
    } finally { setLoading(false); }
  };

  const handleSend = async () => {
    if (!input.trim()) return;
    const msg = input.trim();
    setInput('');
    if (!sessionId) {
      // 新会话：先创建 session，再发送流式消息
      setLoading(true);
      try {
        const { data } = await api.post('/rules/ai/start', { ruleType });
        const sid = data.data.sessionId;
        setSessionId(sid);
        setMessages([{
          speaker: 'AI',
          content: data.data.message || '您好！请描述您想配置的规则。',
          suggestions: data.data.suggestions,
        }]);
        setFormSchema(null);
        setRulePreview(null);
        setStatus('');
        setLoading(false);
        // 发送第一条消息（流式）
        sendStreamMessage(sid, msg);
      } catch (e: any) {
        message.error('启动失败');
        setLoading(false);
      }
    } else {
      sendStreamMessage(sessionId, msg);
    }
  };

  const sendStreamMessage = (sid: string, userMsg: string) => {
    setMessages(prev => [...prev, { speaker: 'USER', content: userMsg }]);
    setLoading(true);
    setRulePreview(null);
    setMessages(prev => [...prev, { speaker: 'AI' as const, content: '' }]);

    (async () => {
      try {
        const programCode = sessionStorage.getItem('current_program_code') || 'PROG001';
        const response = await fetch('/api/rules/ai/clarify', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Program-Code': programCode,
            'X-Trace-Id': crypto.randomUUID?.() || Date.now().toString(36),
          },
          body: JSON.stringify({ sessionId: sid, message: userMsg }),
        });

        if (!response.ok) throw new Error('HTTP ' + response.status);

        const reader = response.body?.getReader();
        if (!reader) throw new Error('No readable stream');

        const decoder = new TextDecoder();
        let buffer = '';
        let currentEvent = '';
        let currentData = '';

        const processEvent = (event: string, data: string) => {
          if (event === 'text' && data) {
            requestAnimationFrame(() => {
              flushSync(() => {
                setMessages(prev => {
                  const updated = [...prev];
                  const lastIdx = updated.length - 1;
                  if (lastIdx >= 0 && updated[lastIdx].speaker === 'AI') {
                    updated[lastIdx] = { ...updated[lastIdx], content: updated[lastIdx].content + data };
                  }
                  return updated;
                });
              });
            });
          } else if (event === 'done' && data) {
            try {
              const result = JSON.parse(data);
              flushSync(() => {
                setStatus(result.status || '');
                setMessages(prev => {
                  const updated = [...prev];
                  const lastIdx = updated.length - 1;
                  if (lastIdx >= 0 && updated[lastIdx].speaker === 'AI') {
                    updated[lastIdx] = {
                      ...updated[lastIdx],
                      content: result.message || updated[lastIdx].content,
                      suggestions: result.suggestions,
                      context: result.context,
                    };
                  }
                  return updated;
                });
              });
              // V3: 处理 question 事件
              if (result.question) {
                setCurrentQuestion(result.question);
              } else {
                setCurrentQuestion(null);
              }
              // V3: CLARIFIED → 显示 formSchema
              if (result.status === 'CLARIFIED' && result.formSchema) {
                setFormSchema(result.formSchema);
              }
              if (result.status === 'READY' && result.rulePreview) {
                flushSync(() => { setRulePreview(result.rulePreview); });
              }
            } catch (e) { /* ignore */ }
          } else if (event === 'error') {
            message.error(data || '流式输出异常');
          }
        };

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });

          while (buffer.includes('\n\n')) {
            const eventEnd = buffer.indexOf('\n\n');
            const block = buffer.substring(0, eventEnd);
            buffer = buffer.substring(eventEnd + 2);

            const lines = block.split('\n');
            for (const line of lines) {
              if (line.startsWith('event:')) {
                currentEvent = line.substring(6).trim();
              } else if (line.startsWith('data:')) {
                const chunk = line.substring(5);
                currentData = currentData ? currentData + '\n' + chunk : chunk;
              }
            }
            processEvent(currentEvent, currentData);
            currentEvent = '';
            currentData = '';
          }
        }
      } catch (e: any) {
        message.error('发送失败: ' + (e.message || '未知错误'));
        setMessages(prev => prev.filter(m => m.content !== '' || m.speaker === 'USER'));
      } finally {
        setLoading(false);
      }
    })();
  };

  const handleAnswerQuestion = async (answerValue: string, answerLabel: string) => {
    if (!sessionId || !currentQuestion) return;
    const q = currentQuestion;
    // 记录答案
    const newAnswers = { ...answers, [q.id]: answerValue };
    setAnswers(newAnswers);
    // 显示用户选择
    setMessages(prev => [...prev, { speaker: 'USER', content: answerLabel }]);
    setCurrentQuestion(null);
    setLoading(true);
    setMessages(prev => [...prev, { speaker: 'AI' as const, content: '' }]);

    try {
      const programCode = sessionStorage.getItem('current_program_code') || 'PROG001';
      const response = await fetch('/api/rules/ai/clarify', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Program-Code': programCode,
          'X-Trace-Id': crypto.randomUUID?.() || Date.now().toString(36),
        },
        body: JSON.stringify({ sessionId, message: answerLabel }),
      });

      if (!response.ok) throw new Error('HTTP ' + response.status);
      const reader = response.body?.getReader();
      if (!reader) throw new Error('No readable stream');
      const decoder = new TextDecoder();
      let buffer = '', currentEvent = '', currentData = '';

      const processEvent = (event: string, data: string) => {
        if (event === 'text' && data) {
          requestAnimationFrame(() => {
            flushSync(() => {
              setMessages(prev => {
                const updated = [...prev];
                const lastIdx = updated.length - 1;
                if (lastIdx >= 0 && updated[lastIdx].speaker === 'AI') {
                  updated[lastIdx] = { ...updated[lastIdx], content: updated[lastIdx].content + data };
                }
                return updated;
              });
            });
          });
        } else if (event === 'done' && data) {
          try {
            const result = JSON.parse(data);
            flushSync(() => {
              setStatus(result.status || '');
              setMessages(prev => {
                const updated = [...prev];
                const lastIdx = updated.length - 1;
                if (lastIdx >= 0 && updated[lastIdx].speaker === 'AI') {
                  updated[lastIdx] = {
                    ...updated[lastIdx],
                    content: result.message || updated[lastIdx].content,
                  };
                }
                return updated;
              });
            });
            if (result.question) {
              setCurrentQuestion(result.question);
            }
            if (result.status === 'CLARIFIED' && result.formSchema) {
              setFormSchema(result.formSchema);
            }
            if (result.status === 'READY' && result.rulePreview) {
              flushSync(() => { setRulePreview(result.rulePreview); });
            }
          } catch (e) { /* ignore */ }
        }
      };

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        while (buffer.includes('\n\n')) {
          const eventEnd = buffer.indexOf('\n\n');
          const block = buffer.substring(0, eventEnd);
          buffer = buffer.substring(eventEnd + 2);
          const lines = block.split('\n');
          for (const line of lines) {
            if (line.startsWith('event:')) currentEvent = line.substring(6).trim();
            else if (line.startsWith('data:')) {
              const chunk = line.substring(5);
              currentData = currentData ? currentData + '\n' + chunk : chunk;
            }
          }
          processEvent(currentEvent, currentData);
          currentEvent = ''; currentData = '';
        }
      }
    } catch (e: any) {
      message.error('发送失败: ' + (e.message || ''));
    } finally { setLoading(false); }
  };

  const handleFormSubmit = async (formData: Record<string, any>) => {
    if (!sessionId) return;
    setFormSubmitting(true);
    try {
      const { data } = await api.post('/rules/ai/submit-form', { sessionId, formData });
      if (data.data?.status === 'READY' && data.data?.rulePreview) {
        setRulePreview(data.data.rulePreview);
        setStatus('READY');
        setFormSchema(null);
        setMessages(prev => [...prev, {
          speaker: 'AI',
          content: '✅ 规则已生成，请在右侧预览确认后保存或发布。',
        }]);
      } else {
        message.error(data.message || '规则生成失败');
      }
    } catch (e: any) {
      message.error('提交失败');
    } finally { setFormSubmitting(false); }
  };

  const handleSave = async (publish: boolean) => {
    if (!sessionId) return;
    try {
      const { data } = await api.post('/rules/ai/save', { sessionId, publish });
      message.success(publish ? '规则已发布' : '已保存为草稿');
      setRulePreview(null);
      setSessionId(null);
      setMessages([]);
      setFormSchema(null);
    } catch (e: any) {
      message.error('保存失败');
    }
  };

  const handleNewSession = () => {
    setSessionId(null);
    setMessages([]);
    setRulePreview(null);
    setStatus('');
    setInput('');
  };

  return (
    <div style={{ display: 'flex', gap: 16, height: 'calc(100vh - 56px - 32px - 48px)', overflow: 'hidden' }}>
      {/* 左侧对话区 */}
      <Card
        title={<Space><RobotOutlined />AI 规则助手</Space>}
        extra={
          <Space>
            <Select value={ruleType} onChange={v => { setRuleType(v); handleNewSession(); }}
              options={[
                { label: '积分累积规则', value: '积分累积规则' },
                { label: '等级规则', value: '等级规则' },
              ]}
              style={{ width: 140 }} size="small"
            />
            {sessionId && <Tag color="green">● 对话中</Tag>}
            <Button size="small" onClick={handleNewSession}>清空</Button>
          </Space>
        }
        style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}
        styles={{ body: { flex: 1, display: 'flex', flexDirection: 'column', padding: 12, overflow: 'hidden' } }}
      >
        {!sessionId ? (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16 }}>
            <RobotOutlined style={{ fontSize: 48, color: '#1a1a1a' }} />
            <Text type="secondary">描述您的规则需求，AI 将生成配置表单</Text>
            <div style={{ display: 'flex', gap: 8, width: '100%', maxWidth: 500 }}>
              <Input
                ref={inputRef}
                value={input}
                onChange={e => setInput(e.target.value)}
                onPressEnter={handleSend}
                placeholder="例如：618活动，指定商品双倍积分..."
                size="middle"
              />
              <Button type="primary" icon={<SendOutlined />} onClick={handleSend} loading={loading}>
                发送
              </Button>
            </div>
          </div>
        ) : (
          <>
            <div style={{ flex: 1, overflow: 'auto', marginBottom: 12 }}>
              {messages.map((msg, i) => (
                <div key={i}>
                  <div style={{
                    display: 'flex', gap: 8, marginBottom: 4,
                    justifyContent: msg.speaker === 'USER' ? 'flex-end' : 'flex-start',
                  }}>
                    {msg.speaker === 'AI' && (
                      <div style={{ width: 32, height: 32, borderRadius: '50%', background: '#1a1a1a', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <RobotOutlined style={{ color: '#fff', fontSize: 16 }} />
                      </div>
                    )}
                    <div style={{
                      maxWidth: '70%', padding: '8px 14px', borderRadius: 12,
                      background: msg.speaker === 'USER' ? '#1a1a1a' : '#f5f5f5',
                      color: msg.speaker === 'USER' ? '#fff' : '#1a1a1a',
                      fontSize: 14, lineHeight: 1.6, whiteSpace: 'pre-wrap',
                    }}>
                      {msg.content}
                    </div>
                    {msg.speaker === 'USER' && (
                      <div style={{ width: 32, height: 32, borderRadius: '50%', background: '#e0e0e0', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <UserOutlined style={{ color: '#666', fontSize: 16 }} />
                      </div>
                    )}
                  </div>

                  {/* context 区域：展示已理解内容 */}
                  {msg.context && (
                    <div style={{ marginLeft: 40, marginBottom: 8, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      {Object.entries(msg.context).map(([key, val]) => (
                        <Tag key={key} icon={<BulbOutlined />} color="blue" style={{ fontSize: 12, padding: '2px 8px' }}>
                          {key}：{val}
                        </Tag>
                      ))}
                    </div>
                  )}

                  {/* suggestions 区域：可点击的建议选项 */}
                  {msg.suggestions && msg.suggestions.length > 0 && (
                    <div style={{ marginLeft: 40, marginBottom: 12, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      {msg.suggestions.map((s, si) => (
                        <Button
                          key={si}
                          size="small"
                          type="dashed"
                          icon={<CheckCircleOutlined />}
                          onClick={() => {
                            setInput(s);
                            inputRef.current?.focus();
                          }}
                          style={{ fontSize: 12, borderRadius: 12 }}
                        >
                          {s}
                        </Button>
                      ))}
                    </div>
                  )}
                </div>
              ))}
              {loading && <Spin size="small" />}
              {/* V3: 问题选项按钮 */}
              {currentQuestion && !rulePreview && (
                <div style={{ marginTop: 8, marginLeft: 40, display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <Text type="secondary" style={{ fontSize: 12 }}>{currentQuestion.text}</Text>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {currentQuestion.options?.map((opt: any) => (
                      <Button
                        key={opt.value}
                        size="small"
                        type="default"
                        onClick={() => handleAnswerQuestion(opt.value, opt.label)}
                        disabled={loading}
                        style={{ borderRadius: 12 }}
                      >
                        {opt.label}
                      </Button>
                    ))}
                  </div>
                </div>
              )}
              {/* V2: 表单渲染 */}
              {formSchema && !rulePreview && (
                <div style={{ marginTop: 8 }}>
                  <ClarificationForm
                    schema={formSchema}
                    onSubmit={handleFormSubmit}
                    loading={formSubmitting}
                  />
                </div>
              )}
              <div ref={chatEndRef} />
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <Input
                ref={inputRef}
                value={input}
                onChange={e => setInput(e.target.value)}
                onPressEnter={handleSend}
                placeholder="描述您的规则需求..."
                disabled={loading}
              />
              <Button type="primary" icon={<SendOutlined />} onClick={handleSend} loading={loading}>
                发送
              </Button>
            </div>
          </>
        )}
      </Card>

      {/* 右侧规则预览 */}
      {rulePreview && (
        <Card
          title={<Space><Tag color="blue">规则预览</Tag>{status === 'READY' && <Tag color="green">就绪</Tag>}</Space>}
          style={{ width: 380, overflow: 'auto' }}
          bodyStyle={{ padding: 12 }}
        >
          <div style={{ marginBottom: 12 }}>
            <Text strong>规则名称</Text>
            <div style={{ fontSize: 14, marginBottom: 8 }}>{rulePreview.ruleName}</div>
          </div>
          <div style={{ marginBottom: 12 }}>
            <Text strong>描述</Text>
            <div style={{ fontSize: 13, color: '#666' }}>{rulePreview.description}</div>
          </div>
          {rulePreview.conditions?.length > 0 && (
            <div style={{ marginBottom: 12 }}>
              <Text strong>触发条件</Text>
              <ul style={{ margin: '4px 0', paddingLeft: 20, fontSize: 13 }}>
                {rulePreview.conditions.map((c: any, i: number) => (
                  <li key={i}>{c.displayText || `${c.field} ${c.operator} ${c.value}`}</li>
                ))}
              </ul>
            </div>
          )}
          {rulePreview.actions?.length > 0 && (
            <div style={{ marginBottom: 12 }}>
              <Text strong>奖励动作</Text>
              <ul style={{ margin: '4px 0', paddingLeft: 20, fontSize: 13 }}>
                {rulePreview.actions.map((a: any, i: number) => (
                  <li key={i}>{a.displayText || `${a.type}: ${a.pointType} x${a.amount}`}</li>
                ))}
              </ul>
            </div>
          )}
          {rulePreview.drlContent && (
            <div style={{ marginBottom: 12 }}>
              <Text strong>DRL 代码</Text>
              <pre style={{
                background: '#1a1a1a', color: '#e0e0e0', padding: 12, borderRadius: 8,
                fontSize: 12, maxHeight: 200, overflow: 'auto', marginTop: 4,
              }}>
                {rulePreview.drlContent}
              </pre>
            </div>
          )}
          <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
            <Button onClick={() => handleSave(false)} style={{ flex: 1 }}>保存草稿</Button>
            <Button type="primary" onClick={() => handleSave(true)} style={{ flex: 1 }}>发布</Button>
          </div>
        </Card>
      )}
    </div>
  );
};

export default AIRuleAssistant;