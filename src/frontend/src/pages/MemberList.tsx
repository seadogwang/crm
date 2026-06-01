import React, { useState, useEffect, useCallback } from 'react';
import { Table, Button, Input, Space, Tag, message, Modal, Form, Select, InputNumber, Popconfirm } from 'antd';
import { PlusOutlined, SearchOutlined, EditOutlined, MergeCellsOutlined, StopOutlined } from '@ant-design/icons';
import axios from 'axios';

const PROG = sessionStorage.getItem('current_program_code') || 'PROG001';

const MemberList: React.FC = () => {
  const [members, setMembers] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [selectedMember, setSelectedMember] = useState<any>(null);
  const [form] = Form.useForm();

  const fetchMembers = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await axios.get(`/api/members/search?q=${search}`, {
        headers: { 'X-Program-Code': PROG },
      });
      setMembers(data?.data || []);
    } catch {
      setMembers([]);
    } finally { setLoading(false); }
  }, [search]);

  useEffect(() => { fetchMembers(); }, [fetchMembers]);

  const handleCreate = async (values: any) => {
    await axios.post('/api/members', {
      member_id: Date.now(),
      tier_code: values.tier_code || 'BASE',
      ext_attributes: values.ext_attributes ? JSON.parse(values.ext_attributes) : {},
    }, { headers: { 'X-Program-Code': PROG, 'X-Idempotency-Key': `create-${Date.now()}` } });
    message.success('会员创建成功');
    setCreateOpen(false); form.resetFields(); fetchMembers();
  };

  const handleDeactivate = async (memberId: number) => {
    await axios.put(`/api/members/${memberId}/deactivate`, {}, { headers: { 'X-Program-Code': PROG } });
    message.success('会员已禁用');
    fetchMembers();
  };

  const columns = [
    { title: '会员ID', dataIndex: 'member_id', key: 'member_id', width: 120 },
    { title: '等级', dataIndex: 'tier_code', key: 'tier', render: (v: string) => <Tag color="gold">{v || 'BASE'}</Tag> },
    { title: '状态', dataIndex: 'status', key: 'status', render: (v: string) => <Tag color={v === 'ENROLLED' ? 'green' : 'red'}>{v}</Tag> },
    {
      title: '扩展属性', dataIndex: 'ext_attributes', key: 'ext', width: 200,
      render: (v: any) => v ? JSON.stringify(v).substring(0, 50) + '...' : '-',
    },
    { title: '创建时间', dataIndex: 'created_at', key: 'time', width: 120 },
    {
      title: '操作', key: 'actions', width: 200,
      render: (_: any, record: any) => (
        <Space>
          <Button size="small" icon={<EditOutlined />} onClick={() => { setSelectedMember(record); setEditOpen(true); }}>
            编辑
          </Button>
          <Popconfirm title="确定禁用此会员?" onConfirm={() => handleDeactivate(record.member_id)}>
            <Button size="small" danger icon={<StopOutlined />}>禁用</Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div>
      <Space style={{ marginBottom: 16 }}>
        <Input.Search placeholder="搜索会员ID" value={search} onChange={e => setSearch(e.target.value)}
          onSearch={fetchMembers} style={{ width: 300 }} enterButton={<SearchOutlined />} />
        <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateOpen(true)}>新建会员</Button>
      </Space>

      <Table dataSource={members} columns={columns} loading={loading} rowKey="member_id"
        size="small" pagination={{ pageSize: 20 }} />

      <Modal title="新建会员" open={createOpen} onCancel={() => setCreateOpen(false)} onOk={() => form.submit()}>
        <Form form={form} layout="vertical" onFinish={handleCreate}>
          <Form.Item name="tier_code" label="初始等级"><Select options={['BASE','SILVER','GOLD','PLATINUM'].map(t=>({label:t,value:t}))} /></Form.Item>
          <Form.Item name="ext_attributes" label="扩展属性(JSON)"><Input.TextArea rows={4} placeholder='{"pet_name":"旺财","age":3}' /></Form.Item>
        </Form>
      </Modal>

      <Modal title="编辑会员" open={editOpen} onCancel={() => setEditOpen(false)} onOk={() => setEditOpen(false)}>
        {selectedMember && <pre>{JSON.stringify(selectedMember, null, 2)}</pre>}
      </Modal>
    </div>
  );
};

export default MemberList;