import React, { useState, useEffect, useCallback } from 'react';
import {
  Card, Table, Button, Space, Tag, Typography, Modal, Form, Input, Select,
  message, Tabs, Descriptions, Timeline, Result, Divider, Tooltip,
} from 'antd';
import {
  PlusOutlined, CheckCircleOutlined, CloseCircleOutlined,
  SendOutlined, HistoryOutlined, EyeOutlined, FileTextOutlined,
  SafetyCertificateOutlined,
} from '@ant-design/icons';
import { useAppStore } from '../../store';
import { useCampaignStyles, TitleWithDesc } from './styles/campaign-ui-standard';
import {
  listAssets, createAsset, updateAsset, getAsset,
  submitForApproval, approveAsset, rejectAsset,
  getPendingAssets, getApprovalHistory, validateContent,
  CampaignContentAsset, CampaignApprovalRecord,
} from '../../api/campaign';

const { Text, Title } = Typography;
const { TextArea } = Input;

const ContentManagementPage: React.FC = () => {
  const { currentProgramCode } = useAppStore();
  const s = useCampaignStyles();
  const [assets, setAssets] = useState<CampaignContentAsset[]>([]);
  const [loading, setLoading] = useState(false);
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [detailModalOpen, setDetailModalOpen] = useState(false);
  const [currentAsset, setCurrentAsset] = useState<CampaignContentAsset | null>(null);
  const [approvalHistory, setApprovalHistory] = useState<CampaignApprovalRecord[]>([]);
  const [actionLoading, setActionLoading] = useState(false);
  const [form] = Form.useForm();
  const [activeTab, setActiveTab] = useState('all');

  const fetchAssets = useCallback(async () => {
    setLoading(true);
    try {
      const data = await listAssets(currentProgramCode);
      setAssets(data || []);
    } catch { /* ignore */ } finally { setLoading(false); }
  }, []);

  const fetchPending = useCallback(async () => {
    try {
      return await getPendingAssets(currentProgramCode);
    } catch { return []; }
  }, []);

  useEffect(() => { fetchAssets(); }, [fetchAssets]);

  const handleCreate = async (values: any) => {
    setActionLoading(true);
    try {
      await createAsset({
        programCode: currentProgramCode,
        assetName: values.assetName,
        assetType: values.assetType,
        channel: values.channel,
        subjectLine: values.subjectLine,
        bodyText: values.bodyText,
        createdBy: 'user_001',
      });
      message.success('素材创建成功');
      setCreateModalOpen(false);
      form.resetFields();
      fetchAssets();
    } catch (err: any) {
      message.error(err?.response?.data?.message || '创建失败');
    } finally { setActionLoading(false); }
  };

  const handleViewDetail = async (assetId: string) => {
    try {
      const asset = await getAsset(assetId);
      setCurrentAsset(asset);
      const history = await getApprovalHistory(assetId);
      setApprovalHistory(history || []);
      setDetailModalOpen(true);
    } catch { message.error('加载失败'); }
  };

  const handleSubmitApproval = async (assetId: string) => {
    try {
      await submitForApproval(assetId, 'user_001', '请审批');
      message.success('已提交审批');
      fetchAssets();
      setDetailModalOpen(false);
    } catch (err: any) { message.error(err?.response?.data?.message || '提交失败'); }
  };

  const handleApprove = async (assetId: string) => {
    try {
      await approveAsset(assetId, 'approver_001', '审批通过');
      message.success('已审批通过');
      fetchAssets();
      setDetailModalOpen(false);
    } catch (err: any) { message.error(err?.response?.data?.message || '审批失败'); }
  };

  const handleReject = async (assetId: string) => {
    try {
      await rejectAsset(assetId, 'approver_001', '需要修改内容');
      message.success('已驳回');
      fetchAssets();
      setDetailModalOpen(false);
    } catch (err: any) { message.error(err?.response?.data?.message || '驳回失败'); }
  };

  const handleValidate = async (assetId: string) => {
    try {
      const result = await validateContent(assetId);
      if (result?.valid) { message.success('✅ 合规校验通过'); }
      else { message.warning(result?.message || '校验未通过'); }
    } catch { message.error('校验失败'); }
  };

  const statusColor: Record<string, string> = {
    DRAFT: 'default', PENDING_APPROVAL: 'orange', APPROVED: 'green', REJECTED: 'red',
  };
  const statusIcon: Record<string, React.ReactNode> = {
    APPROVED: <CheckCircleOutlined style={{ color: '#52c41a' }} />,
    REJECTED: <CloseCircleOutlined style={{ color: '#ff4d4f' }} />,
    SUBMITTED: <SendOutlined style={{ color: '#fa8c16' }} />,
  };

  const assetTypeLabel: Record<string, string> = {
    EMAIL_HTML: '邮件模板', SMS_TEXT: '短信内容', PUSH_JSON: '推送模板',
  };

  const columns = [
    { title: '素材名称', dataIndex: 'assetName', key: 'assetName', render: (n: string, r: CampaignContentAsset) => (
      <Space><FileTextOutlined /><Text strong>{n}</Text><Tag color={statusColor[r.status]}>{r.status}</Tag></Space>
    )},
    { title: '类型', dataIndex: 'assetType', key: 'assetType', render: (t: string) => assetTypeLabel[t] || t },
    { title: '渠道', dataIndex: 'channel', key: 'channel' },
    { title: '主题', dataIndex: 'subjectLine', key: 'subjectLine', ellipsis: true },
    { title: '创建时间', dataIndex: 'createdAt', key: 'createdAt', render: (t: string) => new Date(t).toLocaleString('zh-CN') },
    { title: '操作', key: 'action', width: 280, render: (_: any, r: CampaignContentAsset) => (
      <Space>
        <Button size="small" icon={<EyeOutlined />} onClick={() => handleViewDetail(r.id)}>查看</Button>
        {r.status === 'DRAFT' && (
          <Button size="small" type="primary" icon={<SendOutlined />}
            onClick={() => handleSubmitApproval(r.id)}>提交审批</Button>
        )}
        {r.status === 'PENDING_APPROVAL' && (
          <>
            <Tooltip title="审批通过"><Button size="small" type="primary" icon={<CheckCircleOutlined />}
              onClick={() => handleApprove(r.id)} /></Tooltip>
            <Tooltip title="驳回"><Button size="small" danger icon={<CloseCircleOutlined />}
              onClick={() => handleReject(r.id)} /></Tooltip>
          </>
        )}
        {r.status === 'APPROVED' && (
          <Button size="small" icon={<SafetyCertificateOutlined />}
            onClick={() => handleValidate(r.id)}>合规校验</Button>
        )}
      </Space>
    )},
  ];

  return (
    <div style={s.pageStyle}>
      <TitleWithDesc title="内容与合规管理" desc="素材管理 · 审批工作流 · 合规校验 · 个性化渲染" />

      <Card style={{ marginTop: 16 }}>
        <div style={{ marginBottom: 16 }}>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => { form.resetFields(); setCreateModalOpen(true); }}>
            新建素材
          </Button>
        </div>

        <Tabs activeKey={activeTab} onChange={setActiveTab} items={[
          { key: 'all', label: '全部素材', children: (
            <Table dataSource={assets} columns={columns} rowKey="id" loading={loading}
              pagination={{ pageSize: 10 }} />
          )},
          { key: 'pending', label: '待审批', children: (
            <PendingTable fetchPending={fetchPending} onView={handleViewDetail}
              onApprove={handleApprove} onReject={handleReject} />
          )},
          { key: 'approved', label: '已通过', children: (
            <Table dataSource={assets.filter(a => a.status === 'APPROVED')}
              columns={columns} rowKey="id" pagination={{ pageSize: 10 }} />
          )},
        ]} />
      </Card>

      {/* 新建素材弹窗 */}
      <Modal title="新建素材" open={createModalOpen} onCancel={() => setCreateModalOpen(false)}
        onOk={() => form.submit()} confirmLoading={actionLoading} okText="创建" width={600}>
        <Form form={form} layout="vertical" onFinish={handleCreate}>
          <Form.Item name="assetName" label="素材名称" rules={[{ required: true }]}>
            <Input placeholder="例如：618大促邮件模板" />
          </Form.Item>
          <Form.Item name="assetType" label="类型" rules={[{ required: true }]}>
            <Select options={[
              { label: '邮件模板 (EMAIL_HTML)', value: 'EMAIL_HTML' },
              { label: '短信内容 (SMS_TEXT)', value: 'SMS_TEXT' },
              { label: '推送模板 (PUSH_JSON)', value: 'PUSH_JSON' },
            ]} />
          </Form.Item>
          <Form.Item name="channel" label="渠道" rules={[{ required: true }]}>
            <Select options={[{ label: 'EMAIL', value: 'EMAIL' }, { label: 'SMS', value: 'SMS' }, { label: 'PUSH', value: 'PUSH' }]} />
          </Form.Item>
          <Form.Item name="subjectLine" label="主题行（邮件/推送标题）">
            <Input placeholder="主题行" />
          </Form.Item>
          <Form.Item name="bodyText" label="正文内容" rules={[{ required: true }]}>
            <TextArea rows={8} placeholder="支持模板变量: {{会员名}} {{积分}} {{优惠券码}}" />
          </Form.Item>
          <Text type="secondary">模板变量语法：<code>{'{{变量名}}'}</code> 将在发送时被替换</Text>
        </Form>
      </Modal>

      {/* 素材详情弹窗 */}
      <Modal title="素材详情" open={detailModalOpen} onCancel={() => setDetailModalOpen(false)}
        footer={null} width={700}>
        {currentAsset && (
          <Tabs items={[
            { key: 'detail', label: '素材内容', children: (
              <div>
                <Descriptions column={2} size="small">
                  <Descriptions.Item label="名称">{currentAsset.assetName}</Descriptions.Item>
                  <Descriptions.Item label="状态">
                    <Tag color={statusColor[currentAsset.status]}>{currentAsset.status}</Tag>
                  </Descriptions.Item>
                  <Descriptions.Item label="类型">{assetTypeLabel[currentAsset.assetType]}</Descriptions.Item>
                  <Descriptions.Item label="渠道">{currentAsset.channel}</Descriptions.Item>
                  {currentAsset.subjectLine && <Descriptions.Item label="主题" span={2}>{currentAsset.subjectLine}</Descriptions.Item>}
                </Descriptions>
                <Divider />
                <Text strong>正文内容：</Text>
                <div style={{ marginTop: 8, padding: 12, background: '#fafafa', borderRadius: 4, whiteSpace: 'pre-wrap', minHeight: 100 }}>
                  {currentAsset.bodyText}
                </div>
                {currentAsset.variableSchema && (
                  <div style={{ marginTop: 8 }}>
                    <Text type="secondary">模板变量：</Text>
                    <Space>{currentAsset.variableSchema}</Space>
                  </div>
                )}
              </div>
            )},
            { key: 'history', label: '审批历史', children: (
              <Timeline
                items={(approvalHistory || []).map((h: CampaignApprovalRecord) => ({
                  color: h.action === 'APPROVED' ? 'green' : h.action === 'REJECTED' ? 'red' : 'orange',
                  dot: statusIcon[h.action],
                  children: (
                    <div>
                      <Text strong>{h.action}</Text>
                      {h.approverId && <Text type="secondary"> — {h.approverId}</Text>}
                      {h.comment && <div><Text type="secondary">{h.comment}</Text></div>}
                      <div><Text type="secondary" style={{ fontSize: 12 }}>{new Date(h.createdAt).toLocaleString('zh-CN')}</Text></div>
                    </div>
                  ),
                }))}
              />
            )},
          ]} />
        )}
      </Modal>
    </div>
  );
};

/** 待审批 Tab 子组件 */
const PendingTable: React.FC<{
  fetchPending: () => Promise<any[]>;
  onView: (id: string) => void;
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
}> = ({ fetchPending, onView, onApprove, onReject }) => {
  const [items, setItems] = useState<CampaignContentAsset[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    fetchPending().then(data => setItems(data || [])).finally(() => setLoading(false));
  }, [fetchPending]);

  const columns = [
    { title: '素材', dataIndex: 'assetName', key: 'assetName', render: (n: string) => <Text strong>{n}</Text> },
    { title: '类型', dataIndex: 'assetType', key: 'assetType' },
    { title: '提交时间', dataIndex: 'updatedAt', key: 'updatedAt', render: (t: string) => new Date(t).toLocaleString('zh-CN') },
    { title: '操作', key: 'action', render: (_: any, r: CampaignContentAsset) => (
      <Space>
        <Button size="small" icon={<EyeOutlined />} onClick={() => onView(r.id)}>查看</Button>
        <Button size="small" type="primary" icon={<CheckCircleOutlined />}
          onClick={() => onApprove(r.id)}>通过</Button>
        <Button size="small" danger icon={<CloseCircleOutlined />}
          onClick={() => onReject(r.id)}>驳回</Button>
      </Space>
    )},
  ];

  return <Table dataSource={items} columns={columns} rowKey="id" loading={loading} pagination={false} />;
};

export default ContentManagementPage;
