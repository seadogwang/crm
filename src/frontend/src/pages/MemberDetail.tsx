import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Card, Tabs, Tag, Descriptions, Button, Space, message, Table, Modal, Form,
  Input, Select, InputNumber, Popconfirm, Progress, Drawer, Typography, Row, Col,
} from 'antd';
import {
  ArrowLeftOutlined, StopOutlined, MergeCellsOutlined, DollarOutlined,
  PlusOutlined, HistoryOutlined, EditOutlined, CloseOutlined, SaveOutlined,
} from '@ant-design/icons';
import DynamicRenderer from '../components/DynamicRenderer/DynamicRenderer';
import LayoutRenderer from '../components/LayoutRenderer/LayoutRenderer';
import { useAppStore } from '../store';
import api from '../api';
import { useCampaignStyles, TitleWithDesc } from './campaign/styles/campaign-ui-standard';

const { Title, Text } = Typography;

// 手机号脱敏
function maskPhone(phone: string): string {
  if (!phone || phone.length < 7) return phone || '—';
  return phone.slice(0, 3) + '****' + phone.slice(-4);
}

// ==================== 会员详情主组件 ====================

const MemberDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const programCode = useAppStore(s => s.currentProgramCode);
  const memberId = Number(id);

  const [member, setMember] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState('basic');

  const [editOpen, setEditOpen] = useState(false);
  const [editForm] = Form.useForm();
  const [tiers, setTiers] = useState<any[]>([]);
  const [saving, setSaving] = useState(false);

  const fetchMember = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data } = await api.get(`/members/${memberId}`);
      setMember(data?.data || null);
      if (!data?.data) setError('会员不存在');
    } catch (e: any) {
      setError(e.response?.data?.message || '加载失败');
    } finally {
      setLoading(false);
    }
  }, [memberId]);

  useEffect(() => { fetchMember(); }, [fetchMember]);

  const handleDeactivate = async () => {
    try {
      await api.put(`/members/${memberId}/deactivate`);
      message.success('会员已停用');
      fetchMember();
    } catch (e: any) { message.error(e.response?.data?.message || '操作失败'); }
  };

  const openEditModal = async () => {
    try {
      const { data } = await api.get('/admin/tiers');
      const tierList = data?.data?.tiers || [];
      setTiers(tierList);
      const ext = member?.ext_attributes || {};
      // 过滤掉系统字段，方便用户编辑
      const userExt: Record<string, unknown> = {};
      if (ext && typeof ext === 'object') {
        for (const [k, v] of Object.entries(ext as Record<string, unknown>)) {
          if (!k.startsWith('_')) userExt[k] = v;
        }
      }
      editForm.setFieldsValue({
        tier_code: member?.tier_code || 'BASE',
        mobile: ext?.mobile || ext?.phone || '',
        ext_attributes: JSON.stringify(userExt, null, 2),
      });
      setEditOpen(true);
    } catch (e: any) {
      message.error('获取等级列表失败');
    }
  };

  const handleSave = async () => {
    try {
      const values = await editForm.validateFields();
      setSaving(true);
      // 1. 等级变更
      if (values.tier_code && values.tier_code !== member?.tier_code) {
        await api.post(`/members/${memberId}/tier/adjust`, { newTier: values.tier_code });
      }
      // 2. ext_attributes 变更
      let ext: Record<string, unknown> = {};
      try {
        if (values.ext_attributes) ext = JSON.parse(values.ext_attributes);
      } catch { /* keep empty */ }
      if (values.mobile) ext.mobile = values.mobile;
      // 保留系统字段
      if (member?.ext_attributes?._schema_version) {
        ext._schema_version = member.ext_attributes._schema_version;
      }
      await api.put(`/members/${memberId}`, { ext_attributes: ext });
      message.success('会员信息已更新');
      setEditOpen(false);
      fetchMember();
    } catch (e: any) {
      if (e.errorFields) return; // form validation error
      message.error(e.response?.data?.message || '保存失败');
    } finally {
      setSaving(false);
    }
  };

  if (!member && !loading) {
    return <div className="campaign-page" style={{ padding: 'var(--campaign-page-padding)' }}><Text type="danger">{error}</Text></div>;
  }

  const tabItems = [
    {
      key: 'basic',
      label: '基本信息',
      children: <BasicInfoTab member={member} onRefresh={fetchMember} />,
    },
    {
      key: 'accounts',
      label: '积分账户',
      children: <PointAccountsTab memberId={memberId} />,
    },
    {
      key: 'transactions',
      label: '交易流水',
      children: <TransactionTab memberId={memberId} />,
    },
    {
      key: 'channels',
      label: '渠道关联',
      children: <ChannelTab memberId={memberId} />,
    },
    {
      key: 'ext',
      label: '属性扩展',
      children: <ExtAttrTab memberId={memberId} programCode={programCode} />,
    },
  ];

  return (
    <div className="campaign-page" style={{ padding: 'var(--campaign-page-padding)', minHeight: 'calc(100vh - 64px)' }}>
      <div style={{ marginBottom: 12, display: 'flex', alignItems: 'center', gap: 12 }}>
        <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/members')}>返回列表</Button>
        <TitleWithDesc title={`会员详情 — ${memberId}`} desc="查看和管理会员的详细信息、积分账户、交易流水、渠道关联和属性扩展" />
      </div>

      {/* 顶部信息卡片 */}
      <Card style={{ marginBottom: 12 }}>
        <Row gutter={16} align="middle">
          <Col>
            <Title level={3} style={{ margin: 0 }}>#{memberId}</Title>
          </Col>
          <Col>
            <Tag color="gold" style={{ fontSize: 14 }}>{member?.tier_code || 'BASE'}</Tag>
          </Col>
          <Col>
            <Tag color={member?.status === 'ENROLLED' ? 'green' : 'red'}>
              {member?.status || '—'}
            </Tag>
          </Col>
          <Col>
            <Text type="secondary">注册渠道: {member?.enroll_channel || '—'}</Text>
          </Col>
          <Col>
            <Text type="secondary">手机: {maskPhone(member?.ext_attributes?.mobile || member?.phone)}</Text>
          </Col>
          <Col flex="auto" style={{ textAlign: 'right' }}>
            <Space>
              <Button type="primary" icon={<EditOutlined />} onClick={openEditModal}>修改信息</Button>
              <Popconfirm title="确定停用此会员?" onConfirm={handleDeactivate}>
                <Button danger icon={<StopOutlined />}>停用</Button>
              </Popconfirm>
              <Button icon={<MergeCellsOutlined />} onClick={() => message.info('合并功能开发中')}>合并</Button>
            </Space>
          </Col>
        </Row>
      </Card>

      {/* Tab 页签 */}
      <Card>
        <Tabs activeKey={activeTab} onChange={setActiveTab} items={tabItems} />
      </Card>

      {/* 修改信息弹窗 */}
      <Modal
        title="修改会员信息"
        open={editOpen}
        onCancel={() => setEditOpen(false)}
        onOk={() => editForm.submit()}
        confirmLoading={saving}
        width={560}
      >
        <Form form={editForm} layout="vertical" onFinish={handleSave}>
          <Form.Item name="tier_code" label="会员等级">
            <Select
              options={tiers.map((t: any) => ({ label: `${t.tierName || t.tierCode} (${t.tierCode})`, value: t.tierCode }))}
              placeholder="选择等级"
            />
          </Form.Item>
          <Form.Item name="mobile" label="手机号">
            <Input placeholder="13900000001" />
          </Form.Item>
          <Form.Item
            name="ext_attributes"
            label="扩展属性 (JSON)"
            rules={[{
              validator: (_, v) => {
                if (!v) return Promise.resolve();
                try { JSON.parse(v); return Promise.resolve(); }
                catch { return Promise.reject('JSON 格式不正确'); }
              },
            }]}
          >
            <Input.TextArea rows={8} placeholder='{"name":"张三","age":25}' />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

// ==================== Tab 1: 基本信息 ====================

const BasicInfoTab: React.FC<{ member: any; onRefresh: () => void }> = ({ member, onRefresh }) => {
  const [editing, setEditing] = useState(false);
  const [editData, setEditData] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  if (!member) return null;

  const extAttrs = member.ext_attributes || {};
  const extFields = Object.entries(extAttrs as Record<string, unknown>)
    .filter(([k]) => !k.startsWith('_'));

  const startEdit = () => {
    const data: Record<string, string> = {};
    extFields.forEach(([k, v]) => { data[k] = String(v ?? ''); });
    setEditData(data);
    setEditing(true);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      // 合并原始 ext_attributes，只更新修改的字段
      const updated = { ...extAttrs };
      for (const [k, v] of Object.entries(editData)) {
        updated[k] = v;
      }
      await api.put(`/members/${member.member_id}`, { ext_attributes: updated });
      message.success('已保存');
      setEditing(false);
      onRefresh();
    } catch (e: any) {
      message.error(e.response?.data?.message || '保存失败');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <div style={{ marginBottom: 12, display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
        {editing ? (
          <>
            <Button icon={<CloseOutlined />} onClick={() => setEditing(false)}>取消</Button>
            <Button type="primary" icon={<SaveOutlined />} onClick={handleSave} loading={saving}>保存</Button>
          </>
        ) : (
          <Button icon={<EditOutlined />} onClick={startEdit}>编辑</Button>
        )}
      </div>
      <Descriptions bordered size="small" column={2}>
        <Descriptions.Item label="会员ID">{member.member_id}</Descriptions.Item>
        <Descriptions.Item label="等级">{member.tier_code || 'BASE'}</Descriptions.Item>
        <Descriptions.Item label="状态">{member.status}</Descriptions.Item>
        <Descriptions.Item label="注册渠道">{member.enroll_channel || '—'}</Descriptions.Item>
        <Descriptions.Item label="创建时间">{member.created_at || '—'}</Descriptions.Item>
        <Descriptions.Item label="更新时间">{member.updated_at || '—'}</Descriptions.Item>
        {extFields.map(([k, v]) => (
          <Descriptions.Item key={k} label={k}>
            {editing ? (
              <Input size="small" value={editData[k] || ''}
                onChange={e => setEditData(prev => ({ ...prev, [k]: e.target.value }))} />
            ) : String(v)}
          </Descriptions.Item>
        ))}
      </Descriptions>
    </div>
  );
};

// ==================== Tab 2: 积分账户 ====================

const PointAccountsTab: React.FC<{ memberId: number }> = ({ memberId }) => {
  const [accounts, setAccounts] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [adjustOpen, setAdjustOpen] = useState(false);
  const [adjustForm] = Form.useForm();

  const fetchAccounts = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get(`/members/${memberId}/accounts`);
      setAccounts(data?.data || []);
    } catch { setAccounts([]); }
    finally { setLoading(false); }
  }, [memberId]);

  useEffect(() => { fetchAccounts(); }, [fetchAccounts]);

  const handleAdjust = async (values: any) => {
    try {
      await api.post(`/members/${memberId}/adjust-points`, {
        ...values,
        reason: values.reason || '手动调整',
      });
      message.success('积分调整成功');
      setAdjustOpen(false);
      adjustForm.resetFields();
      fetchAccounts();
    } catch (e: any) { message.error(e.response?.data?.message || '调整失败'); }
  };

  if (loading) return <Text type="secondary">加载中...</Text>;
  if (!accounts.length) return <Text type="secondary">暂无积分账户</Text>;

  return (
    <div>
      <Row gutter={16}>
        {accounts.map(acc => (
          <Col xs={24} sm={12} md={8} key={acc.account_type} style={{ marginBottom: 16 }}>
            <Card
              title={<Space><DollarOutlined />{acc.account_type || '积分账户'}</Space>}
              size="small"
              extra={
                <Button size="small" onClick={() => {
                  adjustForm.setFieldsValue({ account_type: acc.account_type });
                  setAdjustOpen(true);
                }}>调整积分</Button>
              }
            >
              <Title level={3} style={{ margin: 0 }}>{acc.balance?.toLocaleString() || 0}</Title>
              <Text type="secondary">可用余额</Text>

              {acc.credit_limit > 0 && (
                <div style={{ marginTop: 12 }}>
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    信用已用: {acc.credit_used || 0} / {acc.credit_limit}
                  </Text>
                  <Progress
                    percent={Math.round((acc.credit_used || 0) / acc.credit_limit * 100)}
                    size="small"
                    status={acc.credit_used >= acc.credit_limit ? 'exception' : 'active'}
                  />
                </div>
              )}

              <div style={{ marginTop: 8, fontSize: 12, color: '#999' }}>
                <div>累计获得: {acc.total_earned?.toLocaleString() || 0}</div>
                <div>累计消耗: {acc.total_spent?.toLocaleString() || 0}</div>
                <div>累计过期: {acc.total_expired?.toLocaleString() || 0}</div>
              </div>
            </Card>
          </Col>
        ))}
      </Row>

      {/* 调整积分弹窗 */}
      <Modal title="调整积分" open={adjustOpen} onCancel={() => setAdjustOpen(false)} onOk={() => adjustForm.submit()}>
        <Form form={adjustForm} layout="vertical" onFinish={handleAdjust}>
          <Form.Item name="account_type" label="账户类型" rules={[{ required: true }]}>
            <Select options={accounts.map(a => ({ label: a.account_type, value: a.account_type }))} />
          </Form.Item>
          <Form.Item name="type" label="调整类型" rules={[{ required: true }]}>
            <Select options={[{ label: '增加', value: 'ADD' }, { label: '扣减', value: 'DEDUCT' }]} />
          </Form.Item>
          <Form.Item name="amount" label="金额" rules={[{ required: true }]}>
            <InputNumber style={{ width: 200 }} min={0} precision={4} />
          </Form.Item>
          <Form.Item name="reason" label="原因" rules={[{ required: true, message: '请填写调整原因' }]}>
            <Input.TextArea rows={2} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

// ==================== Tab 3: 交易流水 ====================

const TransactionTab: React.FC<{ memberId: number }> = ({ memberId }) => {
  const [txs, setTxs] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedTx, setSelectedTx] = useState<any>(null);
  const [allocations, setAllocations] = useState<any[]>([]);

  const fetch = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get(`/members/${memberId}/transactions`);
      setTxs(data?.data || []);
    } catch { setTxs([]); }
    finally { setLoading(false); }
  }, [memberId]);

  useEffect(() => { fetch(); }, [fetch]);

  const handleViewAllocation = async (tx: any) => {
    setSelectedTx(tx);
    try {
      const { data } = await api.get(`/admin/points/redemption/${tx.id}/allocations`);
      setAllocations(data?.data || []);
    } catch { setAllocations([]); }
  };

  const typeColor: Record<string, string> = {
    ACCRUAL: 'green', REDEMPTION: 'red', EXPIRATION: 'orange', REPAYMENT: 'blue',
    CREDIT_REPAY: 'purple', OVERDRAFT: 'red', CASCADE_DEDUCT: 'magenta',
  };

  const columns = [
    { title: 'ID', dataIndex: 'id', width: 60 },
    { title: '类型', dataIndex: 'transaction_type', width: 100, render: (v: string) => <Tag color={typeColor[v] || 'default'}>{v}</Tag> },
    { title: '金额', dataIndex: 'amount', width: 100, render: (v: number) => <span style={{ color: v > 0 ? 'green' : 'red', fontWeight: 600 }}>{v}</span> },
    { title: '剩余', dataIndex: 'remaining_amount', width: 100 },
    { title: '状态', dataIndex: 'status', width: 80, render: (v: string) => <Tag>{v}</Tag> },
    { title: '过期时间', dataIndex: 'expires_at', width: 120 },
    { title: '规则', dataIndex: 'rule_code', width: 100 },
    { title: '时间', dataIndex: 'created_at', width: 120 },
    {
      title: '操作', width: 80,
      render: (_: any, r: any) => r.transaction_type === 'REDEMPTION' ? (
        <Button size="small" type="link" onClick={() => handleViewAllocation(r)}>溯源</Button>
      ) : null,
    },
  ];

  return (
    <div>
      <Table dataSource={txs} columns={columns} loading={loading} rowKey="id" size="small"
        pagination={{ pageSize: 20 }} scroll={{ x: 900 }} />

      {/* 溯源 Drawer */}
      <Drawer title={`核销溯源 — TX #${selectedTx?.id}`} open={!!selectedTx}
        onClose={() => setSelectedTx(null)} width={500}>
        <Descriptions bordered size="small" column={1} style={{ marginBottom: 16 }}>
          <Descriptions.Item label="核销金额">{selectedTx?.amount}</Descriptions.Item>
          <Descriptions.Item label="核销时间">{selectedTx?.created_at}</Descriptions.Item>
          <Descriptions.Item label="状态">{selectedTx?.status}</Descriptions.Item>
        </Descriptions>
        <Title level={5}>分摊明细</Title>
        <Table
          dataSource={allocations}
          columns={[
            { title: '来源批次ID', dataIndex: 'source_tx_id', width: 100 },
            { title: '分配金额', dataIndex: 'allocated_amount', width: 100 },
            { title: '批次过期时间', dataIndex: 'batch_expires_at', width: 120 },
          ]}
          rowKey="id" size="small" pagination={false}
        />
      </Drawer>
    </div>
  );
};

// ==================== Tab 4: 渠道关联 ====================

const ChannelTab: React.FC<{ memberId: number }> = ({ memberId }) => {
  const [channels, setChannels] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [bindOpen, setBindOpen] = useState(false);
  const [bindForm] = Form.useForm();

  const fetch = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get(`/members/${memberId}/channels`);
      setChannels(data?.data || []);
    } catch { setChannels([]); }
    finally { setLoading(false); }
  }, [memberId]);

  useEffect(() => { fetch(); }, [fetch]);

  const handleBind = async (values: any) => {
    try {
      await api.post(`/members/${memberId}/channels`, values);
      message.success('绑定成功');
      setBindOpen(false);
      bindForm.resetFields();
      fetch();
    } catch (e: any) { message.error(e.response?.data?.message || '绑定失败'); }
  };

  const handleUnbind = async (channelId: string) => {
    try {
      await api.delete(`/members/${memberId}/channels/${channelId}`);
      message.success('已解绑');
      fetch();
    } catch (e: any) { message.error(e.response?.data?.message || '解绑失败'); }
  };

  const columns = [
    { title: '渠道', dataIndex: 'channel', width: 100, render: (v: string) => <Tag color="blue">{v}</Tag> },
    { title: 'OpenID', dataIndex: 'open_id', width: 200 },
    { title: '绑定时间', dataIndex: 'bound_at', width: 140 },
    { title: '状态', dataIndex: 'status', width: 80, render: (v: string) => <Tag color={v === 'ACTIVE' ? 'green' : 'default'}>{v}</Tag> },
    {
      title: '操作', width: 80,
      render: (_: any, r: any) => (
        <Popconfirm title="确定解绑?" onConfirm={() => handleUnbind(r.id)}>
          <Button size="small" danger>解绑</Button>
        </Popconfirm>
      ),
    },
  ];

  return (
    <div>
      <Button type="primary" icon={<PlusOutlined />} style={{ marginBottom: 16 }}
        onClick={() => setBindOpen(true)}>手动绑定渠道</Button>
      <Table dataSource={channels} columns={columns} loading={loading} rowKey="id" size="small" />

      <Modal title="绑定渠道" open={bindOpen} onCancel={() => setBindOpen(false)} onOk={() => bindForm.submit()}>
        <Form form={bindForm} layout="vertical" onFinish={handleBind}>
          <Form.Item name="channel" label="渠道" rules={[{ required: true }]}>
            <Select options={['TMALL', 'JD', 'DOUYIN', 'WECHAT_MINI'].map(c => ({ label: c, value: c }))} />
          </Form.Item>
          <Form.Item name="open_id" label="OpenID" rules={[{ required: true }]}>
            <Input placeholder="渠道方用户标识" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

// ==================== Tab 5: 属性扩展 ====================

const ExtAttrTab: React.FC<{ memberId: number; programCode: string }> = ({ memberId, programCode }) => {
  return (
    <DynamicRenderer
      programCode={programCode}
      memberId={memberId}
      mode="edit"
    />
  );
};

export default MemberDetail;