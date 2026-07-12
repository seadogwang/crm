import React, { useState, useCallback, useRef, useEffect } from 'react';
import { Input, Button, Card, Tag, Space, Typography, Table, Tabs, Modal, Select, InputNumber, message, Empty, Spin, Progress, Row, Col, ConfigProvider, AutoComplete, Popconfirm, Form } from 'antd';
import { SearchOutlined, CopyOutlined, EditOutlined, DollarOutlined, CrownOutlined, LockOutlined, MergeCellsOutlined, HistoryOutlined, ApiOutlined } from '@ant-design/icons';
import { useAppStore } from '../store';
import DynamicField from '../components/DynamicField';
import FieldLayoutEditor from '../components/FieldLayoutEditor';
import api from '../api';
import { useCampaignStyles, TitleWithDesc, CampaignCard } from './campaign/styles/campaign-ui-standard';

const { Text, Title } = Typography;

// ==================== 类型 ====================

interface MemberVO {
  memberId: string; tierCode: string; status: string;
  name?: string; gender?: string; birthday?: string;
  enroll_channel?: string;
  schemaVersion: string; createdAt: string;
  extAttributes?: Record<string, any>;
  accounts?: AccountVO[]; recentTransactions?: TxVO[];
  recentTierLogs?: TierLogVO[]; channels?: ChannelVO[];
  tiers?: TierDefVO[]; fieldSchema?: any;
}

interface AccountVO { accountType: string; typeName?: string; balance: number; totalAccrued?: number; totalRedeemed?: number; creditLimit?: number; creditUsed?: number; }
interface TxVO { id: number; transactionType: string; amount: number; remainingAmount?: number; description: string; orderId?: string; orderTime?: string; payTime?: string; createdAt: string; }
interface TierLogVO { id: number; fromTier?: string; toTier: string; changeReason: string; changedAt: string; }
interface ChannelVO { keyCombination: string; keyValue: string; }
interface OrderVO { orderId: string; orderTime: string; payTime: string; orderAmount: number; tradeStatus: string; eventType: string; channel: string; eventTime: string; createdAt: string; }
interface TierDefVO { tierCode: string; tierName: string; minPoints: number; maxPoints: number; sequence: number; }

const TYPE_LABELS: Record<string, string> = { REWARD: '消费积分', TIER: '等级成长值', CREDIT: '授信积分' };
const STATUS_COLOR: Record<string, string> = { ENROLLED: 'green', SUSPENDED: 'red', MERGED: 'default', DEACTIVATED: 'orange' };

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
      <Text strong style={{ fontSize: 13 }}>{acc.typeName || acc.accountType}</Text>
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

    // 检查是否降级
    const currentSeq = tiers.find(t => t.tierCode === currentTier)?.sequence ?? 0;
    const newSeq = tiers.find(t => t.tierCode === newTier)?.sequence ?? 0;
    if (newSeq < currentSeq) {
      Modal.confirm({
        title: '新等级低于当前等级，是否确认降级？',
        okText: '确认降级',
        cancelText: '取消',
        onOk: doSubmit,
      });
      return;
    }
    doSubmit();
  };

  const doSubmit = async () => {
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

const OrderDetail: React.FC<{ memberId: string; orderId: string }> = ({ memberId, orderId }) => {
  const [detail, setDetail] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    setLoading(true);
    api.get(`/members/${memberId}/orders/detail`, { params: { orderId } })
      .then(({ data }: any) => { if (data?.code === 'SUCCESS') setDetail(data.data); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [memberId, orderId]);

  if (loading) return <Spin size="small" style={{ margin: 16 }} />;
  if (!detail || !detail.extAttributes?.items) return <Text type="secondary" style={{ fontSize: 11, padding: 16 }}>暂无明细</Text>;

  const items = detail.extAttributes.items || [];
  const total = detail.extAttributes.total_amount || detail.orderAmount;

  return (
    <div style={{ padding: '8px 16px', background: '#fafafa' }}>
      <table style={{ fontSize: 11, borderCollapse: 'collapse' }}>
        <thead><tr style={{ borderBottom: '2px solid #e0e0e0' }}>
          <th style={{ padding: '4px 6px', textAlign: 'left', color: '#666', width: 80 }}>商品编号</th>
          <th style={{ padding: '4px 6px', textAlign: 'left', color: '#666' }}>商品名称</th>
          <th style={{ padding: '4px 6px', textAlign: 'right', color: '#666', width: 60 }}>单价</th>
          <th style={{ padding: '4px 6px', textAlign: 'right', color: '#666', width: 40 }}>数量</th>
          <th style={{ padding: '4px 6px', textAlign: 'right', color: '#666', width: 70 }}>小计</th>
        </tr></thead>
        <tbody>
          {items.map((item: any, i: number) => (
            <tr key={i} style={{ borderBottom: '1px solid #f0f0f0' }}>
              <td style={{ padding: '3px 6px', fontFamily: 'monospace' }}>{item.sku_id || '-'}</td>
              <td style={{ padding: '3px 6px' }}>{item.title || '-'}</td>
              <td style={{ padding: '3px 6px', textAlign: 'right' }}>{(item.price || 0).toLocaleString()}</td>
              <td style={{ padding: '3px 6px', textAlign: 'right' }}>{item.qty || 1}</td>
              <td style={{ padding: '3px 6px', textAlign: 'right', fontWeight: 500 }}>{((item.price || 0) * (item.qty || 1)).toLocaleString()}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {total && <div style={{ marginTop: 8, textAlign: 'right' }}><Text style={{ fontSize: 11 }}>合计: <Text strong style={{ fontSize: 13 }}>{total.toLocaleString()}</Text></Text></div>}
    </div>
  );
};

const MemberService: React.FC = () => {
  const programCode = useAppStore(s => s.currentProgramCode);
  const s = useCampaignStyles();
  // 枚举缓存
  const [enumCache, setEnumCache] = useState<Record<string, string>>({});
  const enumName = (type: string, code: string) => enumCache[`${type}:${code}`] || code;

  useEffect(() => {
    api.get('/admin/cache/enums').then(({ data }: any) => {
      if (data?.code === 'SUCCESS' && data.data?.enums) {
        const map: Record<string, string> = {};
        Object.entries(data.data.enums).forEach(([type, items]: [string, any]) => {
          items.forEach((item: any) => { map[`${type}:${item.code}`] = item.name; });
        });
        setEnumCache(map);
      }
    }).catch(() => {});
  }, []);

  const [keyword, setKeyword] = useState('');
  const [loading, setLoading] = useState(false);
  const [member, setMember] = useState<MemberVO | null>(null);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState('transactions');

  // 最近查询
  const RECENT_KEY = 'member_service_recent_searches';
  const [recentSearches, setRecentSearches] = useState<string[]>([]);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(RECENT_KEY);
      if (stored) setRecentSearches(JSON.parse(stored));
    } catch {}
  }, []);

  const saveRecent = (kw: string) => {
    const updated = [kw, ...recentSearches.filter(s => s !== kw)].slice(0, 10);
    setRecentSearches(updated);
    try { localStorage.setItem(RECENT_KEY, JSON.stringify(updated)); } catch {}
  };

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
  const [editInfoModal, setEditInfoModal] = useState(false);
  const [editBirthday, setEditBirthday] = useState(false);
  const [birthdayValue, setBirthdayValue] = useState('');
  const [editMobile, setEditMobile] = useState(false);
  const [mobileValue, setMobileValue] = useState('');
  const [layoutMode, setLayoutMode] = useState(false);
  const [memberLayout, setMemberLayout] = useState<any>(null);
  const [editInfoForm] = Form.useForm();
  const [editInfoSaving, setEditInfoSaving] = useState(false);
  const [editInfoFields, setEditInfoFields] = useState<string[]>([]);

  const performSearch = async (kw: string) => {
    const trimmed = kw.trim();
    if (!trimmed) return;
    setKeyword(trimmed);
    saveRecent(trimmed);
    setLoading(true); setError(''); setMember(null);
    try {
      const { data } = await api.get('/members/search', { params: { keyword: trimmed } });
      if (data?.code === 'SUCCESS' && data.data) {
        const memberData = data.data;
        setMember(memberData);
        fetchOrders(0, memberData);
        fetchTransactions(0, memberData);
        fetchTierLogs(0, memberData);
        // 加载布局配置
        api.get('/members/layout', { params: { programCode: 'PROG001' } }).then(({ data: d }) => {
          if (d?.data?.sections) setMemberLayout(d.data);
        }).catch(() => setMemberLayout(null));
      } else {
        setError('未找到会员');
      }
    } catch (e: any) { setError(e.message || '查询失败'); }
    finally { setLoading(false); }
  };

  const search = useCallback(() => performSearch(keyword), [keyword]);

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

  const openEditInfoModal = () => {
    if (!member) return;
    const ext = member.extAttributes || {};

    // 从 schema 中获取所有定义的字段名（properties 的 key）
    const schemaProperties = member.fieldSchema?.properties;
    let fields: string[];
    if (schemaProperties && typeof schemaProperties === 'object') {
      fields = Object.keys(schemaProperties).filter(k => !k.startsWith('_'));
    } else {
      // 无 schema 时回退：只展示已有值的字段
      fields = Object.keys(ext).filter(k => !k.startsWith('_'));
    }

    // 预填已有值
    const fieldValues: Record<string, unknown> = {};
    for (const f of fields) {
      fieldValues[f] = (ext as Record<string, unknown>)[f] ?? '';
    }

    setEditInfoFields(fields);
    editInfoForm.setFieldsValue(fieldValues);
    setEditInfoModal(true);
  };

  const handleEditInfoSave = async () => {
    if (!member) return;
    try {
      const values = await editInfoForm.validateFields();
      setEditInfoSaving(true);
      // 收集所有 ext_attributes 字段
      const ext: Record<string, unknown> = {};
      for (const field of editInfoFields) {
        const v = values[field];
        if (v !== undefined && v !== '') {
          ext[field] = v;
        }
      }
      // 保留系统字段
      if (member.extAttributes?._schema_version) {
        ext._schema_version = member.extAttributes._schema_version;
      }
      await api.put(`/members/${member.memberId}`, { ext_attributes: ext });
      message.success('会员信息已更新');
      setEditInfoModal(false);
      refresh();
    } catch (e: any) {
      if (e.errorFields) return;
      message.error(e.response?.data?.message || '保存失败');
    } finally {
      setEditInfoSaving(false);
    }
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
        const s = enumCache[`order_status:${v}`] ? { label: enumName('order_status', v), color: v === 'TRADE_FINISHED' ? 'green' : v?.includes('CLOSED') ? 'default' : v?.includes('WAIT') ? 'orange' : 'blue' } : { label: v, color: 'default' };
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
    { title: '渠道', dataIndex: 'channel', width: 80, render: (v: string) => <Tag>{v}</Tag> },
    { title: '用户ID', dataIndex: 'channelUserId', width: 150 },
    { title: '昵称', dataIndex: 'channelNickname', width: 120 },
    { title: '状态', dataIndex: 'status', width: 80, render: (v: string) => <Tag color={v === 'ACTIVE' ? 'green' : 'default'}>{v === 'ACTIVE' ? '已绑定' : '已解绑'}</Tag> },
    { title: '授权时间', dataIndex: 'authorizedAt', width: 160, render: (v: string) => v ? new Date(v).toLocaleString('zh-CN') : '—' },
  ];

  const [channelBindings, setChannelBindings] = useState<any[]>([]);
  const [channelBindingsLoading, setChannelBindingsLoading] = useState(false);

  useEffect(() => {
    if (member) {
      setChannelBindingsLoading(true);
      api.get(`/members/${member.memberId}/channel-bindings`)
        .then(({ data }) => setChannelBindings(data?.data || []))
        .catch(() => setChannelBindings([]))
        .finally(() => setChannelBindingsLoading(false));
    }
  }, [member]);

  return (
    <div className="campaign-page" style={s.pageStyle}>
      <style>{`
        .member-search-input .ant-input:focus {
          border-color: #1a1a1a !important;
          box-shadow: none !important;
        }
        .member-search-input .ant-input:hover {
          border-color: #1a1a1a !important;
        }
      `}</style>

      <TitleWithDesc title="会员服务" desc="查询会员信息、管理积分账户、调整等级、查看交易流水" />

      {/* 搜索栏 */}
      <CampaignCard>
        <Space>
          <AutoComplete
              options={recentSearches.length > 0
                ? [{ label: <span style={{ fontSize: 12, color: '#999' }}>最近查询</span>, options: recentSearches.map(s => ({ value: s, label: s })) }]
                : []}
              value={keyword}
              onChange={setKeyword}
              onSelect={(v) => performSearch(v)}
              style={{ width: 320 }}
            >
              <Input.Search
                placeholder="输入手机号或会员ID"
                onSearch={(v) => performSearch(v)}
                enterButton={<><SearchOutlined /> 查询</>}
                loading={loading}
                className="member-search-input"
              />
            </AutoComplete>
        </Space>
      </CampaignCard>

      {loading && <Spin style={{ display: 'block', margin: '40px auto' }} />}

      {error && !member && <Empty description={error} style={{ marginTop: 40 }}>
        <Button onClick={search}>重新查询</Button>
      </Empty>}

      {layoutMode && member && (
        <FieldLayoutEditor
          member={member}
          onSave={(layout) => { setMemberLayout(layout); setLayoutMode(false); }}
          onCancel={() => setLayoutMode(false)}
        />
      )}

      {!layoutMode && member && (
        <>
          {/* 会员摘要卡片 */}
          <Card style={{ marginBottom: 12 }} bodyStyle={{ padding: 20 }}>
            <Row gutter={24}>
              <Col span={18}>
                <Space direction="vertical" size={4}>
                  <Space size={12} wrap>
                    <Text strong style={{ fontSize: 16 }}>会员ID: {member.memberId}</Text>
                    <Tag color={STATUS_COLOR[member.status] || 'default'}>{enumName('member_status', member.status)}</Tag>
                    <Button size="small" type="text" icon={<CopyOutlined />}
                      onClick={() => { navigator.clipboard.writeText(String(member.memberId)); message.success('已复制'); }} />
                  </Space>
                  <Space size={16} wrap>
                    <Text style={{ fontSize: 13 }}>姓名: {member.name || member.extAttributes?.name || '—'}</Text>
                    <Text style={{ fontSize: 13 }}>性别: {member.gender || member.extAttributes?.gender || '—'}</Text>
                    <Text style={{ fontSize: 13 }}>生日: {member.birthday || member.extAttributes?.birthday || '—'}</Text>
                    <Text style={{ fontSize: 13 }}>手机: {member.extAttributes?.mobile || '—'}</Text>
                    <Text style={{ fontSize: 13 }}>入会渠道: {member.enroll_channel || '—'}</Text>
                  </Space>
                  <Text style={{ fontSize: 12, color: '#999' }}>注册时间: {member.createdAt?.substring(0, 10)}</Text>
                </Space>
              </Col>
              <Col span={6} style={{ textAlign: 'right' }}>
                <div><Tag color="gold" style={{ fontSize: 16, padding: '4px 16px', marginTop: 4 }}>{member.tierCode || '—'}</Tag></div>
              </Col>
            </Row>
            <div style={{ marginTop: 16, display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <Button size="small" icon={<EditOutlined />} onClick={openEditInfoModal}>信息修改</Button>
              <Button size="small" onClick={() => { setBirthdayValue(member.birthday || ''); setEditBirthday(true); }}>修改生日</Button>
              <Button size="small" onClick={() => { setMobileValue(member.extAttributes?.mobile || ''); setEditMobile(true); }}>修改手机</Button>
              <Button size="small" onClick={() => setLayoutMode(true)}>字段排版</Button>
              <Button size="small" icon={<DollarOutlined />} onClick={() => setPtsModal(true)}>调整积分</Button>
              <Button size="small" icon={<CrownOutlined />} onClick={() => setTierModal(true)}>调整等级</Button>
              {member.status !== 'SUSPENDED' ? (
                <Popconfirm
                  title="冻结后会员将无法使用积分兑换，是否继续？"
                  onConfirm={handleFreeze}
                  okText="确认冻结"
                  cancelText="取消"
                >
                  <Button size="small" icon={<LockOutlined />} danger>冻结账户</Button>
                </Popconfirm>
              ) : (
                <Button size="small" icon={<LockOutlined />} disabled>已冻结</Button>
              )}
              <Button size="small" icon={<MergeCellsOutlined />}>合并会员</Button>
            </div>
          </Card>

          {/* 积分账户卡片 */}
          <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
            {member.accounts?.map((a: AccountVO) => (
              <AccountCard key={a.accountType} acc={a} memberId={member.memberId}
                tiers={member.tiers} onViewDetail={() => {}} />
            ))}
          </div>

          {/* Tabs */}
          <CampaignCard bodyStyle={{ padding: 0 }}>
            <Tabs activeKey={activeTab} onChange={setActiveTab} style={{ padding: '0 16px' }}
              items={[
                {
                  key: 'orders', label: <Space><HistoryOutlined />交易流水</Space>,
                  children: (
                    <Table className="campaign-table" dataSource={orderData} columns={orderColumns} rowKey="orderId" size="small"
                      loading={orderLoading} pagination={false} scroll={{ x: 'max-content' }}
                      expandable={{
                        rowExpandable: () => true,
                        expandedRowRender: (r: OrderVO) => <OrderDetail memberId={member.memberId} orderId={r.orderId} />,
                      }}
                      locale={{ emptyText: '暂无交易记录' }} />
                  ),
                },
                {
                  key: 'transactions', label: <Space><HistoryOutlined />积分流水</Space>,
                  children: (
                    <Table className="campaign-table" dataSource={txData} columns={pointsColumns} rowKey="id" size="small"
                      loading={txLoading} pagination={{
                        total: txTotal, current: txPage + 1, pageSize: 20,
                        onChange: (p) => fetchTransactions(p - 1, member),
                      }} scroll={{ x: 'max-content' }}
                      locale={{ emptyText: '暂无交易记录' }} />
                  ),
                },
                {
                  key: 'tier-logs', label: <Space><CrownOutlined />等级变更日志</Space>,
                  children: (
                    <Table className="campaign-table" dataSource={tierData} columns={tierColumns} rowKey="id" size="small"
                      pagination={{
                        total: tierTotal, pageSize: 20,
                        onChange: (p) => fetchTierLogs(p - 1),
                      }} scroll={{ x: 'max-content' }}
                      locale={{ emptyText: '暂无等级变更' }} />
                  ),
                },
                {
                  key: 'channels', label: <Space><ApiOutlined />渠道绑定</Space>,
                  children: (
                    <Table className="campaign-table" dataSource={channelBindings} columns={channelColumns}
                      rowKey="channel" size="small"
                      loading={channelBindingsLoading}
                      pagination={false} scroll={{ x: 'max-content' }}
                      locale={{ emptyText: '暂无渠道绑定' }} />
                  ),
                },
              ]}
            />
          </CampaignCard>
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
          {/* 信息修改弹窗 */}
          <Modal
            title="修改会员信息"
            open={editInfoModal}
            onCancel={() => setEditInfoModal(false)}
            onOk={() => editInfoForm.submit()}
            confirmLoading={editInfoSaving}
            width={560}
          >
            <Form form={editInfoForm} layout="vertical" onFinish={handleEditInfoSave}>
              {editInfoFields.map(field => {
                const fieldDef = member?.fieldSchema?.properties?.[field] || {};
                return (
                  <Form.Item key={field} name={field} label={field}>
                    <DynamicField fieldKey={field} fieldDef={fieldDef} value={editInfoForm.getFieldValue(field)}
                      onChange={(k, v) => editInfoForm.setFieldsValue({ [k]: v })} />
                  </Form.Item>
                );
              })}
              {editInfoFields.length === 0 && (
                <Text type="secondary">暂无扩展属性字段</Text>
              )}
            </Form>
          </Modal>
          {/* 修改生日弹窗 */}
          <Modal title="修改生日" open={editBirthday} onCancel={() => setEditBirthday(false)} onOk={async () => {
            try {
              await api.put(`/members/${member.memberId}`, { birthday: birthdayValue });
              message.success('生日已更新'); setEditBirthday(false); refresh();
            } catch (e: any) { message.error(e?.response?.data?.message || '操作失败'); }
          }}>
            <Input placeholder="如 1990-01-01" value={birthdayValue} onChange={e => setBirthdayValue(e.target.value)} />
          </Modal>
          {/* 修改手机弹窗 */}
          <Modal title="修改手机号码" open={editMobile} onCancel={() => setEditMobile(false)} onOk={async () => {
            try {
              await api.put(`/members/${member.memberId}`, { ext_attributes: { ...member.extAttributes, mobile: mobileValue } });
              message.success('手机号已更新'); setEditMobile(false); refresh();
            } catch (e: any) { message.error(e?.response?.data?.message || '操作失败'); }
          }}>
            <Input placeholder="请输入手机号" value={mobileValue} onChange={e => setMobileValue(e.target.value)} />
          </Modal>
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