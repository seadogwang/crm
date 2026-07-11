import React, { useState, useCallback } from 'react';
import { Card, Table, Tag, Button, Space, Descriptions, Switch, message, Spin, Input, Row, Col, Popconfirm, Modal, Timeline } from 'antd';
import { SearchOutlined, ReloadOutlined, DeleteOutlined, CheckCircleOutlined, CloseCircleOutlined, WarningOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import {
  getUserConsent, updateUserConsent, getConsentChangeLogs,
  checkCanSend, submitGdprDelete,
  type UserConsent, type ConsentChangeLog, type SendCheckResult,
} from '../../api/campaign';
import { useCampaignStyles } from './styles/campaign-ui-standard';

const CHANNEL_OPTIONS = ['EMAIL', 'SMS', 'PUSH'] as const;

const CATEGORY_OPTIONS = ['服装', '美妆', '3C', '家电', '食品', '母婴', '运动户外', '图书'];

/**
 * 用户偏好管理页面 — 查询/编辑用户营销偏好、退订管理、GDPR。
 */
const ConsentManagementPage: React.FC = () => {
  const styles = useCampaignStyles();

  const [memberId, setMemberId] = useState('');
  const [consent, setConsent] = useState<UserConsent | null>(null);
  const [logs, setLogs] = useState<ConsentChangeLog[]>([]);
  const [checkResult, setCheckResult] = useState<SendCheckResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<'prefs' | 'logs' | 'gdpr'>('prefs');

  const handleSearch = useCallback(async () => {
    if (!memberId.trim()) {
      message.warning('请输入会员ID');
      return;
    }
    setLoading(true);
    try {
      const [c, l] = await Promise.all([
        getUserConsent(memberId.trim()),
        getConsentChangeLogs(memberId.trim()),
      ]);
      setConsent(c);
      setLogs(l || []);
      if (!c) {
        message.info('该用户尚无偏好记录，使用默认设置');
      }
    } catch {
      message.error('查询失败');
    } finally {
      setLoading(false);
    }
  }, [memberId]);

  const handleCheck = async (channel: string) => {
    if (!memberId.trim()) return;
    const r = await checkCanSend(memberId.trim(), channel);
    setCheckResult(r);
    Modal.info({
      title: `发送检查 — ${channel}`,
      content: (
        <Descriptions column={1} size="small">
          <Descriptions.Item label="是否允许">
            <Tag color={r.allowed ? 'green' : 'red'}>{r.allowed ? '允许' : '阻止'}</Tag>
          </Descriptions.Item>
          <Descriptions.Item label="状态码">{r.code}</Descriptions.Item>
          <Descriptions.Item label="详情">{r.message}</Descriptions.Item>
        </Descriptions>
      ),
    });
  };

  const handleSave = async () => {
    if (!consent) return;
    setSaving(true);
    try {
      await updateUserConsent(consent.memberId, {
        channelOptIns: {
          EMAIL: consent.emailOptIn,
          SMS: consent.smsOptIn,
          PUSH: consent.pushOptIn,
        },
        quietHours: {
          enabled: consent.quietHoursEnabled,
          start: consent.quietHoursStart,
          end: consent.quietHoursEnd,
          timezone: consent.timezone,
        },
        globalUnsubscribe: consent.globalUnsubscribe,
        source: 'WEB_UI',
      });
      message.success('偏好已保存');
    } catch {
      message.error('保存失败');
    } finally {
      setSaving(false);
    }
  };

  const handleGdprDelete = async () => {
    if (!consent) return;
    try {
      const result = await submitGdprDelete(consent.memberId, consent.programCode, '管理员发起数据删除');
      message.success(`GDPR删除请求已提交: ${result.requestId}`);
    } catch {
      message.error('提交失败');
    }
  };

  const toggleChannel = (channel: string, checked: boolean) => {
    if (!consent) return;
    setConsent({ ...consent, [`${channel.toLowerCase()}OptIn`]: checked } as any);
  };

  const logColumns: ColumnsType<ConsentChangeLog> = [
    { title: '时间', dataIndex: 'createdAt', key: 'time', width: 180,
      render: (v: string) => v ? new Date(v).toLocaleString() : '-' },
    { title: '字段', dataIndex: 'fieldChanged', key: 'field', width: 160 },
    { title: '旧值', dataIndex: 'oldValue', key: 'old', ellipsis: true },
    { title: '新值', dataIndex: 'newValue', key: 'new', ellipsis: true },
    { title: '来源', dataIndex: 'source', key: 'source', width: 100,
      render: (v: string) => <Tag>{v}</Tag> },
    { title: '操作人', dataIndex: 'operatedBy', key: 'op', width: 100 },
  ];

  return (
    <div style={styles.pageStyle}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h2 style={{ margin: 0 }}>🔒 用户偏好与退订管理</h2>
        <Space>
          <Input.Search
            placeholder="输入会员ID"
            value={memberId}
            onChange={e => setMemberId(e.target.value)}
            onSearch={handleSearch}
            style={{ width: 280 }}
            enterButton={<SearchOutlined />}
          />
          <Button icon={<ReloadOutlined />} onClick={handleSearch}>刷新</Button>
        </Space>
      </div>

      {loading && <div style={{ textAlign: 'center', padding: 60 }}><Spin size="large" /></div>}

      {consent && !loading && (
        <>
          {/* Status Overview */}
          <Row gutter={16} style={{ marginBottom: 16 }}>
            <Col span={6}>
              <Card size="small">
                <div style={{ textAlign: 'center' }}>
                  {consent.globalUnsubscribe ? (
                    <CloseCircleOutlined style={{ fontSize: 24, color: '#ff4d4f' }} />
                  ) : (
                    <CheckCircleOutlined style={{ fontSize: 24, color: '#52c41a' }} />
                  )}
                  <div style={{ marginTop: 4, fontWeight: 500 }}>
                    {consent.globalUnsubscribe ? '已全局退订' : '可接收营销'}
                  </div>
                </div>
              </Card>
            </Col>
            {CHANNEL_OPTIONS.map(ch => {
              const optIn = ch === 'EMAIL' ? consent.emailOptIn :
                           ch === 'SMS' ? consent.smsOptIn : consent.pushOptIn;
              return (
                <Col span={6} key={ch}>
                  <Card size="small">
                    <div style={{ textAlign: 'center' }}>
                      <Tag color={optIn ? 'green' : 'red'}>{ch}</Tag>
                      <div style={{ marginTop: 4, fontWeight: 500 }}>
                        {optIn ? '✅ 已订阅' : '❌ 已退订'}
                      </div>
                    </div>
                  </Card>
                </Col>
              );
            })}
          </Row>

          {/* Channel Preferences */}
          <Card title="渠道偏好" size="small" style={{ marginBottom: 16 }}
            extra={
              <Space>
                <Button size="small" onClick={() => handleCheck('EMAIL')}>测试EMAIL</Button>
                <Button size="small" onClick={() => handleCheck('SMS')}>测试SMS</Button>
                <Button size="small" onClick={() => handleCheck('PUSH')}>测试PUSH</Button>
              </Space>
            }>
            <Space direction="vertical" style={{ width: '100%' }}>
              {CHANNEL_OPTIONS.map(ch => {
                const optIn = ch === 'EMAIL' ? consent.emailOptIn :
                             ch === 'SMS' ? consent.smsOptIn : consent.pushOptIn;
                return (
                  <Row key={ch} align="middle" style={{ padding: '4px 0' }}>
                    <Col span={8}>
                      <strong>{ch === 'EMAIL' ? '📧 邮箱' : ch === 'SMS' ? '📱 短信' : '🔔 推送'}</strong>
                    </Col>
                    <Col span={8}>
                      <Switch checked={optIn} onChange={v => toggleChannel(ch, v)} disabled={consent.globalUnsubscribe} />
                      <span style={{ marginLeft: 8 }}>{optIn ? '已订阅' : '已退订'}</span>
                    </Col>
                    <Col span={8}>
                      {!optIn && consent[`${ch.toLowerCase()}OptOutAt` as keyof UserConsent]
                        ? `退订于: ${new Date(consent[`${ch.toLowerCase()}OptOutAt` as keyof UserConsent] as string).toLocaleDateString()}`
                        : null}
                    </Col>
                  </Row>
                );
              })}
            </Space>
          </Card>

          {/* Category Preferences */}
          <Card title="品类偏好" size="small" style={{ marginBottom: 16 }}>
            <Space wrap>
              {CATEGORY_OPTIONS.map(cat => {
                const prefs = consent.categoryPreferences;
                let checked = true;
                try {
                  const parsed = JSON.parse(typeof prefs === 'string' ? prefs : '{}');
                  if (parsed.excluded?.includes(cat)) checked = false;
                } catch {}
                return (
                  <Tag.CheckableTag
                    key={cat}
                    checked={checked}
                    onChange={v => {
                      const parsed = JSON.parse(typeof consent.categoryPreferences === 'string' ? consent.categoryPreferences : '{"included":[],"excluded":[]}');
                      if (v) {
                        parsed.excluded = parsed.excluded.filter((c: string) => c !== cat);
                      } else {
                        if (!parsed.excluded.includes(cat)) parsed.excluded.push(cat);
                      }
                      setConsent({ ...consent, categoryPreferences: JSON.stringify(parsed) });
                    }}
                  >
                    {checked ? `✅ ${cat}` : `❌ ${cat}`}
                  </Tag.CheckableTag>
                );
              })}
            </Space>
          </Card>

          {/* Quiet Hours */}
          <Card title="静默时段" size="small" style={{ marginBottom: 16 }}>
            <Space>
              <Switch
                checked={consent.quietHoursEnabled}
                onChange={v => setConsent({ ...consent, quietHoursEnabled: v })}
              />
              <span>{consent.quietHoursEnabled ? '已启用' : '已停用'}</span>
              {consent.quietHoursEnabled && (
                <>
                  <span>{consent.quietHoursStart || '22:00'}</span>
                  <span>~</span>
                  <span>{consent.quietHoursEnd || '08:00'}</span>
                  <span>时区: {consent.timezone || 'Asia/Shanghai'}</span>
                </>
              )}
            </Space>
          </Card>

          {/* Global Unsubscribe */}
          <Card title="全局退订" size="small" style={{ marginBottom: 16 }}>
            <Space direction="vertical">
              {consent.globalUnsubscribe ? (
                <>
                  <Tag color="red" icon={<WarningOutlined />}>已全局退订</Tag>
                  <Descriptions size="small" column={2}>
                    <Descriptions.Item label="退订原因">{consent.unsubscribeReason || '-'}</Descriptions.Item>
                    <Descriptions.Item label="退订渠道">{consent.unsubscribeChannel || '-'}</Descriptions.Item>
                    <Descriptions.Item label="退订时间">
                      {consent.unsubscribeAt ? new Date(consent.unsubscribeAt).toLocaleString() : '-'}
                    </Descriptions.Item>
                  </Descriptions>
                  <Button type="primary" onClick={() => setConsent({ ...consent, globalUnsubscribe: false })}>
                    重新订阅所有渠道
                  </Button>
                </>
              ) : (
                <Popconfirm title="确定全局退订？将阻止所有渠道的营销消息" onConfirm={() => setConsent({ ...consent, globalUnsubscribe: true })}>
                  <Button danger>一键全局退订</Button>
                </Popconfirm>
              )}
            </Space>
          </Card>

          {/* GDPR */}
          <Card title="GDPR 数据管理" size="small" style={{ marginBottom: 16 }}>
            <Space>
              <Popconfirm title="确定提交数据删除请求？此操作不可逆" onConfirm={handleGdprDelete}>
                <Button danger icon={<DeleteOutlined />}>提交 GDPR 删除请求</Button>
              </Popconfirm>
              <span style={{ color: '#8c8c8c', fontSize: 12 }}>
                根据 GDPR 法规，用户有权要求删除其所有个人数据
              </span>
            </Space>
          </Card>

          {/* Save */}
          <div style={{ textAlign: 'right', marginBottom: 16 }}>
            <Button type="primary" size="large" loading={saving} onClick={handleSave}>
              💾 保存偏好
            </Button>
          </div>

          {/* Change Log */}
          <Card title="偏好变更记录">
            <Table
              columns={logColumns}
              dataSource={logs}
              rowKey="id"
              pagination={{ pageSize: 10, showTotal: t => `共 ${t} 条` }}
              size="small"
            />
          </Card>
        </>
      )}

      {!consent && !loading && (
        <Card>
          <div style={{ textAlign: 'center', padding: 40, color: '#8c8c8c' }}>
            <SearchOutlined style={{ fontSize: 48 }} />
            <p style={{ marginTop: 16 }}>输入会员ID查看和管理营销偏好</p>
          </div>
        </Card>
      )}
    </div>
  );
};

export default ConsentManagementPage;
