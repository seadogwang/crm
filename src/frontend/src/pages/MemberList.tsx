import React, { useState, useEffect, useCallback } from 'react';
import { Table, Button, Input, Space, Tag, message, Modal, Form, Select, Popconfirm } from 'antd';
import { PlusOutlined, SearchOutlined, EditOutlined, StopOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { useAppStore } from '../store';
import api from '../api';
import { useCampaignStyles, TitleWithDesc, CampaignCard } from './campaign/styles/campaign-ui-standard';

const MemberList: React.FC = () => {
  const PROG = useAppStore(s => s.currentProgramCode);
  const navigate = useNavigate();
  const s = useCampaignStyles();
  const [members, setMembers] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [form] = Form.useForm();

  const fetchMembers = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get(`/members/search?keyword=${search || ''}`);
      if (data?.data) {
        const member = data.data;
        setMembers(Array.isArray(member) ? member : (member.memberId ? [member] : []));
      } else {
        setMembers([]);
      }
    } catch (e: any) {
      console.error('[MemberList] 加载失败:', e);
      setMembers([]);
    } finally { setLoading(false); }
  }, [search]);

  useEffect(() => { fetchMembers(); }, [fetchMembers]);

  const handleCreate = async (values: any) => {
    try {
      let ext = {};
      try { if (values.ext_attributes) ext = JSON.parse(values.ext_attributes); } catch {}
      if (values.mobile) ext = { ...ext, mobile: values.mobile };
      await api.post('/members', {
        tier_code: values.tier_code || 'BASE',
        ext_attributes: ext,
      }, { headers: { 'X-Idempotency-Key': `create-${Date.now()}` } });
      message.success('会员创建成功');
      setCreateOpen(false); form.resetFields(); fetchMembers();
    } catch (e: any) { message.error(e.response?.data?.message || '创建失败'); }
  };

  const handleFreeze = async (memberId: number) => {
    try {
      await api.post(`/members/${memberId}/freeze`);
      message.success('会员已冻结');
      fetchMembers();
    } catch (e: any) { message.error(e.response?.data?.message || '操作失败'); }
  };

  const columns = [
    { title: '会员ID', dataIndex: 'memberId', key: 'memberId', width: 120, ellipsis: true },
    { title: '等级', dataIndex: 'tierCode', key: 'tier', width: 100, render: (v: string) => <Tag color="gold">{v || 'BASE'}</Tag> },
    { title: '状态', dataIndex: 'status', key: 'status', width: 90, render: (v: string) => {
      const colors: Record<string, string> = { ENROLLED: 'green', SUSPENDED: 'red', MERGED: 'default', DEACTIVATED: 'orange' };
      return <Tag color={colors[v] || 'default'}>{v}</Tag>;
    }},
    { title: '创建时间', dataIndex: 'createdAt', key: 'time', width: 160, ellipsis: true },
    {
      title: '操作', key: 'actions', width: 200,
      render: (_: any, record: any) => (
        <Space>
          <Button type="primary" size="small" icon={<EditOutlined />}
            onClick={() => navigate(`/members/${record.memberId}`)}>
            详情
          </Button>
          {record.status === 'ENROLLED' && (
            <Popconfirm title="确定冻结此会员?" onConfirm={() => handleFreeze(record.memberId)}>
              <Button size="small" danger icon={<StopOutlined />}>冻结</Button>
            </Popconfirm>
          )}
        </Space>
      ),
    },
  ];

  return (
    <div className="campaign-page" style={s.pageStyle}>
      <TitleWithDesc title="会员管理" desc="管理会员信息、会员等级、积分账户" />

      <div style={s.toolbarStyle}>
        <Input.Search placeholder="搜索会员ID/手机号" value={search} onChange={e => setSearch(e.target.value)}
          onSearch={fetchMembers} style={s.inputLg} enterButton={<SearchOutlined />} />
        <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateOpen(true)}>新建会员</Button>
      </div>

      <CampaignCard>
        <Table className="campaign-table" dataSource={members} columns={columns} loading={loading}
          rowKey="memberId" size="small" pagination={{ pageSize: 20, showSizeChanger: true, showTotal: (t: number) => `共 ${t} 条` }}
          scroll={{ x: 'max-content' }} />
      </CampaignCard>

      <Modal title="新建会员" className="campaign-modal" open={createOpen} onCancel={() => setCreateOpen(false)} onOk={() => form.submit()}>
        <Form form={form} layout="vertical" onFinish={handleCreate} className="campaign-form">
          <Form.Item name="mobile" label="手机号"><Input placeholder="13900000001" /></Form.Item>
          <Form.Item name="tier_code" label="初始等级" initialValue="BASE">
            <Select options={['BASE','SILVER','GOLD','PLATINUM'].map(t=>({label:t,value:t}))} />
          </Form.Item>
          <Form.Item name="ext_attributes" label="扩展属性(JSON)">
            <Input.TextArea rows={4} placeholder='{"name":"张三","age":25}' />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default MemberList;