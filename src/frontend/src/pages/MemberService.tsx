import React, { useState, useCallback, useRef } from 'react';
import { Input, Button, Card, Tag, Space, Typography, Table, Tabs, Modal, Select, InputNumber, message, Empty, Spin, Progress, Row, Col } from 'antd';
import { SearchOutlined, CopyOutlined, EditOutlined, DollarOutlined, CrownOutlined, LockOutlined, MergeCellsOutlined, HistoryOutlined, ApiOutlined } from '@ant-design/icons';
import { useAppStore } from '../store';
import api from '../api';

const { Text, Title } = Typography;

// ==================== 类型 ====================

interface MemberVO {
  memberId: string; tierCode: string; status: string;
  schemaVersion: string; createdAt: string;
  extAttributes?: Record<string, any>;
  accounts?: AccountVO[]; recentTransactions?: TxVO[];
  recentTierLogs?: TierLogVO[]; channels?: ChannelVO[];
  tiers?: TierDefVO[]; fieldSchema?: any;
}

interface AccountVO { accountType: string; balance: number; totalAccrued?: number; totalRedeemed?: number; creditLimit?: number; creditUsed?: number; }
interface TxVO { id: number; transactionType: string; amount: number; remainingAmount?: number; description: string; orderId?: string; orderTime?: string; payTime?: string; createdAt: string; }
interface TierLogVO { id: number; fromTier?: string; toTier: string; changeReason: string; changedAt: string; }
interface ChannelVO { keyCombination: string; keyValue: string; }
interface OrderVO { orderId: string; orderTime: string; payTime: string; orderAmount: number; tradeStatus: string; orderDetail?: any; eventType: string; channel: string; eventTime: string; createdAt: string; }
interface TierDefVO { tierCode: string; tierName: string; minPoints: number; maxPoints: number; sequence: number; }

const TYPE_LABELS: Record<string, string> = { REWARD: '消费积分', TIER: '等级成长值', CREDIT: '授信积分' };
const STATUS_COLOR: Record<string, string> = { ENROLLED: 'green', FROZEN_REDEMPTION: 'red', MERGED: 'default', SUSPENDED: 'orange' };
const STATUS_LABEL: Record<string, string> = { ENROLLED: '正常', FROZEN_REDEMPTION: '已冻结', MERGED: '已合并', SUSPENDED: '已停用' };

// ==================== 子组件 ====================

const AccountCard: React.FC<{ acc: AccountVO; memberId: string; tiers?: TierDefVO[]; onViewDetail: (type: string) => void }> = ({ acc, memberId, tiers, onViewDetail }) => {
  const isCredit = acc.accountType === 'CREDIT';
  const isTier = acc.accountType === 'TIER';
  const currentTier = tiers?.find(t => {
    const points = acc.balance || 0;
    return points >= (t.minPoints || 0) && points <= (t.maxPoints || 99999999);
  });
  const nextTier = tiers?.find(t => (t.minPoints || 0) > (acc.balance || 0));

  return (
    <Card size="small" style={{ flex: 1, minWidth: 180 }} bodyStyle={{ padding: 16 }}>
      <Text strong style={{ fontSize: 13 }}>{TYPE_LABELS[acc.accountType] || acc.accountType}</Text>
      <div style={{ marginTop: 8 }}>
        {isCredit ? (
          <>
            <div><Text style={{ fontSize: 12, color: '#666' }}>额度: </Text><Text strong style={{ fontSize: 20 }}>{(acc.creditLimit || 0).toLocaleString()}</Text></div>
            <div><Text style={{ fontSize: 12, color: '#666' }}>已用: {(acc.creditUsed || 0).toLocaleString()}</Text></div>
            <div><Text style={{ fontSize: 12, color: '#666' }}>剩余: {((acc.creditLimit || 0) - (acc.creditUsed || 0)).toLocaleString()}</Text></div>
          </>
        ) : (
          <>
            <Text strong style={{ fontSize: 24 }}>{(acc.balance || 0).toLocaleString()}</Text>
            <div style={{ marginTop: 4 }}>
              <Text style={{ fontSize: 11, color: '#999' }}>累计: {(acc.totalAccrued || 0).toLocaleString()}</Text>
              <Text style={{ fontSize: 11, color: '#999', marginLeft: 12 }}>已兑: {(acc.totalRedeemed || 0).toLocaleString()}</Text>
            </div>
            {isTier && nextTier && (
              <div style={{ marginTop: 8 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#999', marginBottom: 2 }}>
                  <span>{currentTier?.tierName || '当前'}</span>
                  <span>{nextTier.tierName} ({(nextTier.minPoints || 0).toLocaleString()})</span>
                </div>
                <Progress percent={Math.min(100, Math.round(((acc.balance || 0) / (nextTier.minPoints || 1)) * 100))} size="small" showInfo={false} />
              </div>
            )}
          </>
        )}
      </div>
      <Button size="small" type="link" style={{ padding: 0, fontSize: 11, marginTop: 8 }}
        onClick={() => onViewDetail(acc.accountType)}>查看明细</Button>
    </Card>
  );
};

const AdjustPointsModal: React.FC<{ open: boolean; memberId: string; onClose: () => void; onDone: () => void }> = ({ open, memberId, onClose, onDone }) => {
  const [type, setType] = useState('REWARD');
  const [amount, setAmount] = useState(0);
  const [incr, setIncr] = useState(true);
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    if (!amount || !reason.trim()) { message.warning('请填写完整'); return; }
    setLoading(true);
    try {
      await api.post(`/members/${memberId}/points/adjust`, { accountType: type, amount, increase: incr, reason });
      message.success('调整成功');
      onDone();
      onClose();
    } catch (e: any) { message.error(e.message || '调整失败'); }
    finally { setLoading(false); }
  };

  return (
    <Modal open={open} onCancel={onClose} onOk={submit} title="调整积分" confirmLoading={loading} width={400}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div><Text style={{ fontSize: 12 }}>积分类型</Text>
          <Select value={type} onChange={setType} style={{ width: '100%' }} options={[
            { label: '消费积分', value: 'REWARD' }, { label: '成长值', value: 'TIER' }, { label: '授信积分', value: 'CREDIT' },
          ]} /></div>
        <div><Text style={{ fontSize: 12 }}>操作</Text>
          <Select value={incr ? 'add' : 'sub'} onChange={v => setIncr(v === 'add')} style={{ width: '100%' }} options={[
            { label: '增加', value: 'add' }, { label: '减少', value: 'sub' },
          ]} /></div>
        <div><Text style={{ fontSize: 12 }}>数量</Text><InputNumber min={1} value={amount} onChange={v => setAmount(v || 0)} style={{ width: '100%' }} /></div>
        <div><Text style={{ fontSize: 12 }}>原因 *</Text><Input value={reason} onChange={e => setReason(e.target.value)} placeholder="调整原因" /></div>
      </div>
    </Modal>
  );
};

const AdjustTierModal: React.FC<{ open: boolean; memberId: string; currentTier: string; tiers: TierDefVO[]; onClose: () => void; onDone: () => void }> = ({ open, memberId, currentTier, tiers, onClose, onDone }) => {
  const [newTier, setNewTier] = useState('');
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    if (!newTier || !reason.trim()) { message.warning('请填写完整'); return; }
    setLoading(true);
    try {
      await api.post(`/members/${memberId}/tier/adjust`, { newTier, reason });
      message.success('调整成功');
      onDone();
      onClose();
    } catch (e: any) { message.error(e.message || '调整失败'); }
    finally { setLoading(false); }
  };

  return (
    <Modal open={open} onCancel={onClose} onOk={submit} title="调整等级" confirmLoading={loading} width={400}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div><Text style={{ fontSize: 12 }}>当前等级</Text><Tag>{currentTier}</Tag></div>
        <div><Text style={{ fontSize: 12 }}>新等级</Text>
          <Select value={newTier} onChange={setNewTier} style={{ width: '100%' }}
            options={tiers.map(t => ({ label: `${t.tierName} (${t.tierCode})`, value: t.tierCode }))} /></div>
        <div><Text style={{ fontSize: 12 }}>原因 *</Text><Input value={reason} onChange={e => setReason(e.target.value)} placeholder="调整原因" /></div>
      </div>
    </Modal>
  );
};

// ==================== 主组件 ====================

const MemberService: React.FC = () => {
  const programCode = useAppStore(s => s.currentProgramCode);
  const [keyword, setKeyword] = useState('');
  const [loading, setLoading] = useState(false);
  const [member, setMember] = useState<MemberVO | null>(null);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState('transactions');

  // 交易流水
  const [orderData, setOrderData] = useState<OrderVO[]>([]);
  const [orderTotal, setOrderTotal] = useState(0);
  const [orderLoading, setOrderLoading] = useState(false);

  // 积分流水
  const [txData, setTxData] = useState<TxVO[]>([]);
  const [txTotal, setTxTotal] = useState(0);
  const [txPage, setTxPage] = useState(0);
  const [txTypeFilter, setTxTypeFilter] = useState('');
  const [txLoading, setTxLoading] = useState(false);
  const [allocDrawer, setAllocDrawer] = useState<{ open: boolean; data: any[] }>({ open: false, data: [] });
  const fetchReqId = useRef(0);

  // 等级日志
  const [tierData, setTierData] = useState<TierLogVO[]>([]);
  const [tierTotal, setTierTotal] = useState(0);

  // 模态框
  const [ptsModal, setPtsModal] = useState(false);
  const [tierModal, setTierModal] = useState(false);

  const search = useCallback(async () => {
    if (!keyword.trim()) return;
    setLoading(true); setError(''); setMember(null);
    try {
      const { data } = await api.get('/members/search', { params: { keyword: keyword.trim() } });
      if (data?.code === 'SUCCESS' && data.data) {
        const memberData = data.data;
        setMember(memberData);
        fetchOrders(0, memberData);
        fetchTransactions(0, memberData);
        fetchTierLogs(0, memberData);
      } else {
        setError('未找到会员');
      }
    } catch (e: any) { setError(e.message || '查询失败'); }
    finally { setLoading(false); }
  }, [keyword]);

  const fetchOrders = async (page: number, memberData: MemberVO) => {
    if (!memberData) return;
    setOrderLoading(true);
    try {
      const { data } = await api.get(`/members/${memberData.memberId}/orders`, { params: { page, size: 20 } });
      if (data?.code === 'SUCCESS') {
        setOrderData(data.data.data || []);
        setOrderTotal(data.data.total || 0);
      }
    } catch (e: any) { /* ignore */ }
    finally { setOrderLoading(false); }
  };

  const fetchTransactions = async (page: number, memberDataOrType?: MemberVO | string, type?: string) => {
    const memberData = typeof memberDataOrType === 'object' && memberDataOrType !== null
      ? memberDataOrType : member;
    if (!memberData) return;
    // 忽略 stale 请求
    const reqId = ++fetchReqId.current;

    // 只有显式传入 type 参数时才设置类型过滤器
    const filterParam = typeof type === 'string' ? type : undefined;

    setTxLoading(true);
    try {
      const url = `/members/${memberData.memberId}/transactions`;
      const { data } = await api.get(url, {
        params: { page, size: 20, typeFilter: filterParam || undefined },
      });
      // 忽略过期响应
      if (reqId !== fetchReqId.current) return;
      if (data?.code === 'SUCCESS') {
        setTxData(data.data.data || []);
        setTxTotal(data.data.total || 0);
        setTxPage(page);
      }
    } catch (e: any) { /* ignore */ }
    finally { setTxLoading(false); }
  };

  const fetchTierLogs = async (page: number, memberDataOrType?: MemberVO | string, type?: string) => {
    const memberData = typeof memberDataOrType === 'object' ? memberDataOrType : member;
    if (!memberData) return;
    try {
      const { data } = await api.get(`/members/${memberData.memberId}/tier-logs`, { params: { page, size: 20 } });
      if (data?.code === 'SUCCESS') {
        setTierData(data.data.data || []);
        setTierTotal(data.data.total || 0);
      }
    } catch (e: any) { /* ignore */ }
  };

  const fetchAllocation = async (txId: number) => {
    if (!member) return;
    try {
      const { data } = await api.get(`/members/${member.memberId}/transactions/${txId}/allocation`);
      if (data?.code === 'SUCCESS') {
        setAllocDrawer({ open: true, data: data.data || [] });
      }
    } catch (e: any) { message.error('获取溯源失败'); }
  };

  const handleFreeze = async () => {
    if (!member) return;
    try {
      await api.post(`/members/${member.memberId}/freeze`);
      message.success('已冻结');
      search();
    } catch (e: any) { message.error('冻结失败'); }
  };

  const refresh = () => search();

  function txTypeDesc(type: string): string {
    const map: Record<string, string> = {
      ACCRUAL: '订单奖励积分', REDEMPTION: '积分兑换', EXPIRATION: '积分过期',
      REPAYMENT: '透支还款', CREDIT_REPAY: '信用还款', CREDIT_DRAWDOWN: '信用提取',
      OVERDRAFT: '透支', MANUAL_ADJUST: '人工调整',
    };
    return map[type] || type;
  }

  const STATUS_MAP: Record<string, { label: string; color: string }> = {
    TRADE_FINISHED: { label: '交易成功', color: 'green' },
    WAIT_BUYER_PAY: { label: '待付款', color: 'orange' },
    WAIT_SELLER_SEND_GOODS: { label: '待发货', color: 'blue' },
    WAIT_BUYER_CONFIRM_GOODS: { label: '待收货', color: 'cyan' },
    TRADE_CLOSED: { label: '已关闭', color: 'default' },
    TRADE_CLOSED_BY_TAOBAO: { label: '已关闭', color: 'default' },
  };

  const orderColumns = [
    { title: '交易号', dataIndex: 'orderId', width: 200, ellipsis: true,
      render: (v: string) => v ? <span style={{ fontFamily: 'monospace', fontSize: 11 }}>{v}</span> : '-' },
    { title: '下单时间', dataIndex: 'orderTime', width: 150, render: (v: string) => v?.substring(0, 19) || '-' },
    { title: '支付时间', dataIndex: 'payTime', width: 150, render: (v: string) => v?.substring(0, 19) || '-' },
    { title: '金额', dataIndex: 'orderAmount', width: 100,
      render: (v: number) => <span style={{ color: v > 0 ? '#52c41a' : '#ff4d4f' }}>{v > 0 ? '+' : ''}{(v || 0).toLocaleString()}</span> },
    { title: '状态', dataIndex: 'tradeStatus', width: 90,
      render: (v: string) => {
        const s = STATUS_MAP[v] || { label: v, color: 'default' };
        return <Tag color={s.color} style={{ fontSize: 10 }}>{s.label}</Tag>;
      }},
    { title: '渠道', dataIndex: 'channel', width: 60 },
  ];

  const pointsColumns = [
    { title: '时间', dataIndex: 'createdAt', width: 160, render: (v: string) => v?.substring(0, 19) },
    { title: '流水号', dataIndex: 'orderId', width: 180, ellipsis: true,
      render: (v: string) => v ? <span style={{ fontFamily: 'monospace', fontSize: 11 }}>{v}</span> : '-' },
    { title: '类型', dataIndex: 'description', width: 90 },
    { title: '变动积分', dataIndex: 'amount', width: 110,
      render: (v: number) => <span style={{ color: v > 0 ? '#52c41a' : v < 0 ? '#ff4d4f' : '#999', fontWeight: 500 }}>
        {v > 0 ? '+' : ''}{(v || 0).toLocaleString()}</span> },
    { title: '余额', dataIndex: 'remainingAmount', width: 100,
      render: (v: number) => v != null ? v.toLocaleString() : '-' },
    {
      title: '', width: 50,
      render: (_: any, r: TxVO) => <Button size="small" type="link" style={{ fontSize: 11 }} onClick={() => fetchAllocation(r.id)}>溯源</Button>,
    },
  ];

  const tierColumns = [
    { title: '时间', dataIndex: 'changedAt', width: 170, render: (v: string) => v?.substring(0, 19) },
    { title: '变更', width: 180,
      render: (_: any, r: TierLogVO) => <span>{r.fromTier || '-'} <span style={{ color: '#1677ff' }}>→</span> {r.toTier}</span> },
    { title: '原因', dataIndex: 'changeReason', width: 140 },
  ];

  const channelColumns = [
    { title: '标识类型', dataIndex: 'keyCombination', width: 150 },
    { title: '标识值', dataIndex: 'keyValue', width: 200 },
  ];

  return (
    <div style={{ background: '#fff', minHeight: 'calc(100vh - 120px)', padding: 24, maxWidth: 1200, margin: '0 auto' }}>
      {/* 搜索栏 */}
      <Card size="small" style={{ marginBottom: 16 }} bodyStyle={{ padding: 16 }}>
        <Space>
          <Input.Search
            placeholder="输入手机号或会员ID"
            value={keyword} onChange={e => setKeyword(e.target.value)}
            onSearch={search} enterButton={<><SearchOutlined /> 查询</>}
            style={{ width: 320 }} size="middle" loading={loading}
          />
        </Space>
      </Card>

      {loading && <Spin style={{ display: 'block', margin: '40px auto' }} />}

      {error && !member && <Empty description={error} style={{ marginTop: 40 }}>
        <Button onClick={search}>重新查询</Button>
      </Empty>}

      {member && (
        <>
          {/* 会员摘要卡片 */}
          <Card style={{ marginBottom: 16 }} bodyStyle={{ padding: 20 }}>
            <Row gutter={24}>
              <Col span={12}>
                <Space direction="vertical" size={4}>
                  <Space><Text strong style={{ fontSize: 16 }}>会员ID: {member.memberId}</Text>
                    <Button size="small" type="text" icon={<CopyOutlined />}
                      onClick={() => { navigator.clipboard.writeText(String(member.memberId)); message.success('已复制'); }} />
                  </Space>
                  <Tag color={STATUS_COLOR[member.status] || 'default'}>{STATUS_LABEL[member.status] || member.status}</Tag>
                  <Text style={{ fontSize: 13, color: '#666' }}>等级: <Tag color="gold">{member.tierCode}</Tag></Text>
                  <Text style={{ fontSize: 12, color: '#999' }}>注册时间: {member.createdAt?.substring(0, 10)}</Text>
                </Space>
              </Col>
              <Col span={12} style={{ textAlign: 'right' }}>
                <Text strong style={{ fontSize: 28 }}>
                  {member.accounts?.reduce((s: number, a: AccountVO) => s + (a.accountType !== 'CREDIT' ? (a.balance || 0) : 0), 0).toLocaleString()}
                </Text>
                <div><Text style={{ fontSize: 12, color: '#999' }}>积分总余额</Text></div>
                {member.accounts?.find((a: AccountVO) => a.accountType === 'CREDIT')?.creditLimit && (
                  <div><Text style={{ fontSize: 12, color: '#999' }}>
                    信用: {member.accounts.find((a: AccountVO) => a.accountType === 'CREDIT')?.creditLimit?.toLocaleString()}
                  </Text></div>
                )}
              </Col>
            </Row>
            <div style={{ marginTop: 16, display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <Button size="small" icon={<EditOutlined />}>信息修改</Button>
              <Button size="small" icon={<DollarOutlined />} onClick={() => setPtsModal(true)}>调整积分</Button>
              <Button size="small" icon={<CrownOutlined />} onClick={() => setTierModal(true)}>调整等级</Button>
              <Button size="small" icon={<LockOutlined />} danger={member.status !== 'FROZEN_REDEMPTION'}
                onClick={handleFreeze}>{member.status === 'FROZEN_REDEMPTION' ? '已冻结' : '冻结账户'}</Button>
              <Button size="small" icon={<MergeCellsOutlined />}>合并会员</Button>
            </div>
          </Card>

          {/* 积分账户卡片 */}
          <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
            {member.accounts?.map((a: AccountVO) => (
              <AccountCard key={a.accountType} acc={a} memberId={member.memberId}
                tiers={member.tiers} onViewDetail={() => setActiveTab('transactions')} />
            ))}
          </div>

          {/* Tabs */}
          <Card bodyStyle={{ padding: 0 }}>
            <Tabs activeKey={activeTab} onChange={setActiveTab} style={{ padding: '0 16px' }}
              items={[
                {
                  key: 'orders', label: <Space><HistoryOutlined />交易流水</Space>,
                  children: (
                    <Table dataSource={orderData} columns={orderColumns} rowKey="orderId" size="small"
                      loading={orderLoading} pagination={false} scroll={{ x: 800 }}
                      expandable={{
                        expandedRowRender: (r: OrderVO) => r.orderDetail ? (
                          <div style={{ padding: '8px 16px', background: '#fafafa' }}>
                            <table style={{ width: '100%', fontSize: 11, borderCollapse: 'collapse' }}>
                              <thead><tr style={{ borderBottom: '2px solid #e0e0e0' }}>
                                <th style={{ padding: '6px 8px', textAlign: 'left', color: '#666' }}>商品编号</th>
                                <th style={{ padding: '6px 8px', textAlign: 'left', color: '#666' }}>商品名称</th>
                                <th style={{ padding: '6px 8px', textAlign: 'right', color: '#666' }}>单价</th>
                                <th style={{ padding: '6px 8px', textAlign: 'right', color: '#666' }}>数量</th>
                                <th style={{ padding: '6px 8px', textAlign: 'right', color: '#666' }}>小计</th>
                              </tr></thead>
                              <tbody>
                                {(r.orderDetail.items || []).map((item: any, i: number) => (
                                  <tr key={i} style={{ borderBottom: '1px solid #f0f0f0' }}>
                                    <td style={{ padding: '6px 8px', fontFamily: 'monospace' }}>{item.sku_id || '-'}</td>
                                    <td style={{ padding: '6px 8px' }}>{item.title || '-'}</td>
                                    <td style={{ padding: '6px 8px', textAlign: 'right' }}>{(item.price || 0).toLocaleString()}</td>
                                    <td style={{ padding: '6px 8px', textAlign: 'right' }}>{item.qty || item.quantity || 1}</td>
                                    <td style={{ padding: '6px 8px', textAlign: 'right', fontWeight: 500 }}>{((item.price || 0) * (item.qty || 1)).toLocaleString()}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                            {r.orderDetail.total_amount && <div style={{ marginTop: 8, textAlign: 'right' }}><Text style={{ fontSize: 11 }}>合计: <Text strong style={{ fontSize: 13 }}>{r.orderDetail.total_amount.toLocaleString()}</Text></Text></div>}
                          </div>
                        ) : <Text type="secondary" style={{ fontSize: 11 }}>暂无明细</Text>,
                      }}
                      locale={{ emptyText: '暂无交易记录' }} />
                  ),
                },
                {
                  key: 'transactions', label: <Space><HistoryOutlined />积分流水</Space>,
                  children: (
                    <Table dataSource={txData} columns={pointsColumns} rowKey="id" size="small"
                      loading={txLoading} pagination={{
                        total: txTotal, current: txPage + 1, pageSize: 20,
                        onChange: (p) => fetchTransactions(p - 1, member),
                      }} scroll={{ x: 600 }}
                      locale={{ emptyText: '暂无交易记录' }} />
                  ),
                },
                {
                  key: 'tier-logs', label: <Space><CrownOutlined />等级变更日志</Space>,
                  children: (
                    <Table dataSource={tierData} columns={tierColumns} rowKey="id" size="small"
                      pagination={{
                        total: tierTotal, pageSize: 20,
                        onChange: (p) => fetchTierLogs(p - 1),
                      }} scroll={{ x: 500 }}
                      locale={{ emptyText: '暂无等级变更' }} />
                  ),
                },
                {
                  key: 'channels', label: <Space><ApiOutlined />渠道绑定</Space>,
                  children: (
                    <Table dataSource={member.channels || []} columns={channelColumns}
                      rowKey={(r, i) => r.keyCombination + i} size="small"
                      pagination={false} scroll={{ x: 400 }}
                      locale={{ emptyText: '暂无渠道绑定' }} />
                  ),
                },
              ]}
            />
          </Card>
        </>
      )}

      {/* 弹窗 */}
      {member && (
        <>
          <AdjustPointsModal open={ptsModal} memberId={member.memberId}
            onClose={() => setPtsModal(false)} onDone={refresh} />
          <AdjustTierModal open={tierModal} memberId={member.memberId}
            currentTier={member.tierCode} tiers={member.tiers || []}
            onClose={() => setTierModal(false)} onDone={refresh} />
        </>
      )}

      {/* 溯源 Drawer */}
      <Modal open={allocDrawer.open} onCancel={() => setAllocDrawer({ open: false, data: [] })}
        footer={null} title="积分溯源" width={600}>
        <Table dataSource={allocDrawer.data} rowKey="batchId" size="small" pagination={false}
          columns={[
            { title: '批次ID', dataIndex: 'batchId' },
            { title: '原始积分', dataIndex: 'originalAmount', render: (v: number) => v?.toLocaleString() },
            { title: '本次消耗', dataIndex: 'allocatedAmount', render: (v: number) => v?.toLocaleString() },
            { title: '批次剩余', dataIndex: 'remainingAmount', render: (v: number) => v?.toLocaleString() },
          ]} />
      </Modal>
    </div>
  );
};

export default MemberService;