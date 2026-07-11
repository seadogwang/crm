import React, { useState, useCallback, useEffect } from 'react';
import {
  Card, Table, Button, Space, Tag, Modal, Form, Input, Select, DatePicker, Popconfirm, message, Tabs,
} from 'antd';
import { PlusOutlined, ReloadOutlined, StopOutlined, EyeOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import {
  getTermsVersions, createTermsVersion, deactivateTermsVersion, getTermsAcceptances,
  type TermsMaster, type TermsAcceptance,
} from '../../api/campaign';
import { useCampaignStyles } from './styles/campaign-ui-standard';
import dayjs from 'dayjs';

const TERMS_TYPE_OPTIONS = [
  { label: '俱乐部章程 (CHARTER)', value: 'CHARTER' },
  { label: '隐私政策 (PRIVACY_POLICY)', value: 'PRIVACY_POLICY' },
  { label: '服务条款 (TERMS_OF_SERVICE)', value: 'TERMS_OF_SERVICE' },
  { label: '数据处理协议 (DATA_PROCESSING)', value: 'DATA_PROCESSING' },
];

/**
 * 条款管理页面（管理员） — 条款版本 CRUD + 接受记录审计。
 */
const TermsManagementPage: React.FC = () => {
  const styles = useCampaignStyles();

  const [versions, setVersions] = useState<TermsMaster[]>([]);
  const [acceptances, setAcceptances] = useState<TermsAcceptance[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [auditFilter, setAuditFilter] = useState({ termsType: 'CHARTER', termsVersion: '' });
  const [form] = Form.useForm();

  const loadVersions = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getTermsVersions();
      setVersions(data || []);
    } catch {
      message.error('加载条款版本失败');
    } finally {
      setLoading(false);
    }
  }, []);

  const loadAcceptances = useCallback(async () => {
    if (!auditFilter.termsType || !auditFilter.termsVersion) return;
    setLoading(true);
    try {
      const data = await getTermsAcceptances(auditFilter.termsType, auditFilter.termsVersion);
      setAcceptances(data || []);
    } catch {
      message.error('加载接受记录失败');
    } finally {
      setLoading(false);
    }
  }, [auditFilter]);

  useEffect(() => { loadVersions(); }, [loadVersions]);

  const handleCreate = async () => {
    try {
      const values = await form.validateFields();
      const data: Partial<TermsMaster> = {
        programCode: values.programCode || 'PROG001',
        termsType: values.termsType,
        termsVersion: values.termsVersion,
        termsContent: values.termsContent,
        effectiveDate: values.effectiveDate.toISOString(),
        releasedBy: values.releasedBy,
      };
      await createTermsVersion(data);
      message.success('条款版本创建成功');
      setModalOpen(false);
      form.resetFields();
      loadVersions();
    } catch (e: any) {
      if (e?.errorFields) return; // form validation error
      message.error('创建失败: ' + (e?.message || '未知错误'));
    }
  };

  const handleDeactivate = async (id: string) => {
    try {
      await deactivateTermsVersion(id);
      message.success('已停用');
      loadVersions();
    } catch {
      message.error('停用失败');
    }
  };

  const versionColumns: ColumnsType<TermsMaster> = [
    { title: 'ID', dataIndex: 'id', key: 'id', width: 60 },
    {
      title: '条款类型', dataIndex: 'termsType', key: 'type', width: 160,
      render: (v: string) => {
        const opt = TERMS_TYPE_OPTIONS.find(o => o.value === v);
        return <Tag color="blue">{opt?.label || v}</Tag>;
      },
    },
    { title: '版本', dataIndex: 'termsVersion', key: 'version', width: 100 },
    {
      title: '生效日期', dataIndex: 'effectiveDate', key: 'effective', width: 140,
      render: (v: string) => v ? dayjs(v).format('YYYY-MM-DD HH:mm') : '-',
    },
    {
      title: '状态', dataIndex: 'isActive', key: 'active', width: 80,
      render: (v: boolean) => <Tag color={v ? 'green' : 'default'}>{v ? '生效中' : '已停用'}</Tag>,
    },
    { title: '发布人', dataIndex: 'releasedBy', key: 'by', width: 100 },
    {
      title: '发布时间', dataIndex: 'releasedAt', key: 'released', width: 140,
      render: (v: string) => v ? dayjs(v).format('YYYY-MM-DD HH:mm') : '-',
    },
    {
      title: '操作', key: 'actions', width: 120,
      render: (_, record) => (
        <Space>
          {record.isActive && (
            <Popconfirm title="确定停用此版本？" onConfirm={() => handleDeactivate(record.id!)}>
              <Button size="small" danger icon={<StopOutlined />}>停用</Button>
            </Popconfirm>
          )}
        </Space>
      ),
    },
  ];

  const acceptanceColumns: ColumnsType<TermsAcceptance> = [
    { title: '会员ID', dataIndex: 'memberId', key: 'member', width: 120 },
    { title: '条款类型', dataIndex: 'termsType', key: 'type', width: 120 },
    { title: '版本', dataIndex: 'termsVersion', key: 'version', width: 80 },
    {
      title: '接受状态', dataIndex: 'isAccepted', key: 'accepted', width: 90,
      render: (v: boolean) => <Tag color={v ? 'green' : 'red'}>{v ? '已接受' : '未接受'}</Tag>,
    },
    {
      title: '接受时间', dataIndex: 'acceptedAt', key: 'time', width: 160,
      render: (v: string) => v ? dayjs(v).format('YYYY-MM-DD HH:mm:ss') : '-',
    },
    { title: 'IP', dataIndex: 'acceptedIp', key: 'ip', width: 130 },
    { title: '来源', dataIndex: 'source', key: 'source', width: 100 },
    { title: 'User-Agent', dataIndex: 'userAgent', key: 'ua', ellipsis: true },
  ];

  const tabItems = [
    {
      key: 'versions',
      label: '条款版本',
      children: (
        <>
          <div style={{ marginBottom: 16, textAlign: 'right' }}>
            <Space>
              <Button type="primary" icon={<PlusOutlined />} onClick={() => setModalOpen(true)}>
                新建版本
              </Button>
              <Button icon={<ReloadOutlined />} onClick={loadVersions}>刷新</Button>
            </Space>
          </div>
          <Table
            columns={versionColumns}
            dataSource={versions}
            rowKey="id"
            loading={loading}
            pagination={{ pageSize: 10, showTotal: t => `共 ${t} 条` }}
            size="small"
          />
        </>
      ),
    },
    {
      key: 'acceptances',
      label: '接受记录',
      children: (
        <>
          <div style={{ marginBottom: 16 }}>
            <Space>
              <Select
                value={auditFilter.termsType}
                onChange={v => setAuditFilter(prev => ({ ...prev, termsType: v }))}
                options={TERMS_TYPE_OPTIONS}
                style={{ width: 200 }}
              />
              <Input
                placeholder="输入版本号（如 v1.0）"
                value={auditFilter.termsVersion}
                onChange={e => setAuditFilter(prev => ({ ...prev, termsVersion: e.target.value }))}
                style={{ width: 200 }}
              />
              <Button icon={<EyeOutlined />} onClick={loadAcceptances}>查询</Button>
            </Space>
          </div>
          <Table
            columns={acceptanceColumns}
            dataSource={acceptances}
            rowKey="id"
            loading={loading}
            pagination={{ pageSize: 10, showTotal: t => `共 ${t} 条` }}
            size="small"
          />
        </>
      ),
    },
  ];

  return (
    <div style={styles.pageStyle}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h2 style={{ margin: 0 }}>📋 条款与章程管理</h2>
      </div>

      <Card size="small">
        <Tabs items={tabItems} />
      </Card>

      <Modal
        title="新建条款版本"
        open={modalOpen}
        onOk={handleCreate}
        onCancel={() => { setModalOpen(false); form.resetFields(); }}
        width={640}
      >
        <Form form={form} layout="vertical">
          <Form.Item name="termsType" label="条款类型" rules={[{ required: true, message: '请选择条款类型' }]}>
            <Select options={TERMS_TYPE_OPTIONS} placeholder="选择条款类型" />
          </Form.Item>
          <Form.Item name="termsVersion" label="版本号" rules={[{ required: true, message: '请输入版本号' }]}>
            <Input placeholder="如 v1.0, v2.3" />
          </Form.Item>
          <Form.Item name="programCode" label="Program Code" initialValue="PROG001">
            <Input placeholder="PROG001" />
          </Form.Item>
          <Form.Item name="effectiveDate" label="生效日期" rules={[{ required: true, message: '请选择生效日期' }]}>
            <DatePicker showTime style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="releasedBy" label="发布人">
            <Input placeholder="发布人" />
          </Form.Item>
          <Form.Item name="termsContent" label="条款内容">
            <Input.TextArea rows={8} placeholder="条款内容（纯文本或HTML）" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default TermsManagementPage;