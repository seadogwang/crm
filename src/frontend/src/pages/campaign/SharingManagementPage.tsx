import React, { useState, useCallback } from 'react';
import { Card, Table, Tag, Button, Space, message, Input, Select, Modal, Form } from 'antd';
import { ReloadOutlined, PlusOutlined, GlobalOutlined, SafetyCertificateOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import {
  getSharingPolicies, createSharingPolicy, checkGlobalBlacklist, addGlobalBlacklist,
  type SharingPolicyEntity,
} from '../../api/campaign';
import { useCampaignStyles } from './styles/campaign-ui-standard';

const SCOPE_TAG: Record<string, { color: string; label: string }> = {
  GLOBAL: { color: 'red', label: '全局' },
  SELECTIVE: { color: 'blue', label: '指定' },
  INHERITED: { color: 'purple', label: '继承' },
};

const SharingManagementPage: React.FC = () => {
  const styles = useCampaignStyles();
  const [programCode, setProgramCode] = useState('');
  const [policies, setPolicies] = useState<SharingPolicyEntity[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [blacklistCheck, setBlacklistCheck] = useState('');
  const [blacklistResult, setBlacklistResult] = useState<any>(null);

  // New policy form
  const [newScope, setNewScope] = useState('SELECTIVE');
  const [newTargets, setNewTargets] = useState('');
  const [newResource, setNewResource] = useState('ASSET');

  const loadData = useCallback(async () => {
    if (!programCode.trim()) return;
    setLoading(true);
    try {
      const data = await getSharingPolicies(programCode.trim());
      setPolicies(data || []);
    } catch { message.error('加载失败'); }
    finally { setLoading(false); }
  }, [programCode]);

  const handleCreate = async () => {
    if (!programCode.trim()) return;
    try {
      await createSharingPolicy({
        programCode: programCode.trim(),
        sharingScope: newScope,
        targetPrograms: newTargets.split(',').map(s => s.trim()).filter(Boolean),
        sharedResourceTypes: [newResource],
        enabled: true,
      });
      message.success('策略已创建');
      setModalOpen(false);
      loadData();
    } catch { message.error('创建失败'); }
  };

  const handleBlacklistCheck = async () => {
    if (!blacklistCheck.trim()) return;
    try {
      const r = await checkGlobalBlacklist(blacklistCheck.trim());
      setBlacklistResult(r);
      message.info(r.isBlacklisted ? '该用户已在全局黑名单中' : '该用户不在全局黑名单中');
    } catch { message.error('检查失败'); }
  };

  const handleAddBlacklist = async () => {
    if (!blacklistCheck.trim() || !programCode.trim()) return;
    try {
      await addGlobalBlacklist(blacklistCheck.trim(), programCode.trim(), '管理员手动添加');
      message.success('已添加全局黑名单');
      handleBlacklistCheck();
    } catch { message.error('添加失败'); }
  };

  const columns: ColumnsType<SharingPolicyEntity> = [
    { title: '资源类型', dataIndex: 'sharedResourceTypes', key: 'res', width: 160,
      render: (v: string[]) => v?.map(r => <Tag key={r}>{r}</Tag>) },
    { title: '共享范围', dataIndex: 'sharingScope', key: 'scope', width: 100,
      render: v => { const t = SCOPE_TAG[v] || { color: 'default', label: v }; return <Tag color={t.color}>{t.label}</Tag>; }},
    { title: '目标Program', dataIndex: 'targetPrograms', key: 'targets', width: 200,
      render: v => v?.join(', ') || '-' },
    { title: '权限', dataIndex: 'permissionType', key: 'perm', width: 100 },
    { title: '状态', dataIndex: 'enabled', key: 'status', width: 80,
      render: v => <Tag color={v ? 'green' : 'red'}>{v ? '启用' : '禁用'}</Tag> },
  ];

  return (
    <div style={styles.pageStyle}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h2 style={{ margin: 0 }}><GlobalOutlined style={{ marginRight: 8, color: '#7c3aed' }} />多品牌共享管理</h2>
        <Space>
          <Input.Search placeholder="Program Code" value={programCode} onChange={e => setProgramCode(e.target.value)}
            onSearch={loadData} style={{ width: 200 }} enterButton />
          <Button icon={<ReloadOutlined />} onClick={loadData}>刷新</Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setModalOpen(true)}>
            新增策略
          </Button>
        </Space>
      </div>

      <Card title="共享策略" size="small" style={{ marginBottom: 16 }}>
        <Table columns={columns} dataSource={policies} rowKey="id" loading={loading}
          pagination={false} size="small" />
      </Card>

      <Card title={<><SafetyCertificateOutlined /> 全局黑名单</>} size="small">
        <Space>
          <Input.Search placeholder="Member ID" value={blacklistCheck} onChange={e => setBlacklistCheck(e.target.value)}
            onSearch={handleBlacklistCheck} enterButton="检查" style={{ width: 280 }} />
          <Button danger onClick={handleAddBlacklist}>添加到全局黑名单</Button>
        </Space>
        {blacklistResult && (
          <div style={{ marginTop: 12 }}>
            <Tag color={blacklistResult.isBlacklisted ? 'red' : 'green'}>
              {blacklistResult.isBlacklisted ? '已在全局黑名单' : '未在黑名单'}
            </Tag>
          </div>
        )}
      </Card>

      <Modal open={modalOpen} title="新增共享策略" onCancel={() => setModalOpen(false)}
        onOk={handleCreate} okText="创建">
        <Form layout="vertical">
          <Form.Item label="共享范围">
            <Select value={newScope} onChange={setNewScope}
              options={[
                { label: '全局共享 (GLOBAL)', value: 'GLOBAL' },
                { label: '指定共享 (SELECTIVE)', value: 'SELECTIVE' },
              ]} />
          </Form.Item>
          <Form.Item label="目标 Program (逗号分隔)">
            <Input value={newTargets} onChange={e => setNewTargets(e.target.value)}
              placeholder="如: BRAND_B, BRAND_C" disabled={newScope === 'GLOBAL'} />
          </Form.Item>
          <Form.Item label="资源类型">
            <Select value={newResource} onChange={setNewResource}
              options={[
                { label: '素材 (ASSET)', value: 'ASSET' },
                { label: '黑名单 (BLACKLIST)', value: 'BLACKLIST' },
                { label: '退订偏好 (CONSENT)', value: 'CONSENT' },
                { label: '触发器 (TRIGGER)', value: 'TRIGGER' },
                { label: '模板 (TEMPLATE)', value: 'TEMPLATE' },
              ]} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default SharingManagementPage;
