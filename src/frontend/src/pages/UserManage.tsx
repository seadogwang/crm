import React, { useState, useEffect, useCallback } from 'react';
import { Table, Button, Space, Card, Typography, Modal, Form, Input, Select, Tag, message } from 'antd';
import { PlusOutlined, EditOutlined, KeyOutlined } from '@ant-design/icons';
import {
  listSystemUsers, createSystemUser, updateSystemUser, resetUserPassword,
  listSystemRoles, type SystemUserEntity, type SystemRoleEntity,
} from '../api/campaign';
import { useCampaignStyles, TitleWithDesc, CampaignCard } from './campaign/styles/campaign-ui-standard';

const { Title } = Typography;

const UserManage: React.FC = () => {
  const [users, setUsers] = useState<SystemUserEntity[]>([]);
  const [roles, setRoles] = useState<SystemRoleEntity[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<SystemUserEntity | null>(null);
  const [passwordModalOpen, setPasswordModalOpen] = useState(false);
  const [resetTargetId, setResetTargetId] = useState<string | null>(null);
  const [form] = Form.useForm();
  const [passwordForm] = Form.useForm();

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await listSystemUsers();
      setUsers(data || []);
    } catch (e: any) {
      setError(e.message || '加载失败');
      setUsers([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchRoles = useCallback(async () => {
    try {
      const data = await listSystemRoles();
      setRoles(data || []);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => { fetchUsers(); fetchRoles(); }, [fetchUsers, fetchRoles]);

  const handleSave = async (values: any) => {
    try {
      if (editingUser?.id) {
        await updateSystemUser(editingUser.id, values);
        message.success('用户已更新');
      } else {
        await createSystemUser(values);
        message.success('用户已创建');
      }
      setModalOpen(false);
      form.resetFields();
      setEditingUser(null);
      fetchUsers();
    } catch (e: any) {
      message.error(e.response?.data?.message || '保存失败');
    }
  };

  const handleEdit = (user: SystemUserEntity) => {
    setEditingUser(user);
    form.setFieldsValue({
      username: user.username,
      realName: user.realName,
      email: user.email,
      phone: user.phone,
      platformRole: user.platformRole,
      status: user.status,
      roleId: user.roleId,
    });
    setModalOpen(true);
  };

  const handleResetPassword = async (values: { password: string }) => {
    if (!resetTargetId) return;
    try {
      await resetUserPassword(resetTargetId, values.password);
      message.success('密码已重置');
      setPasswordModalOpen(false);
      passwordForm.resetFields();
      setResetTargetId(null);
    } catch (e: any) {
      message.error(e.response?.data?.message || '重置失败');
    }
  };

  const columns = [
    { title: '用户名', dataIndex: 'username', width: 120 },
    { title: '姓名', dataIndex: 'realName', width: 100 },
    { title: '邮箱', dataIndex: 'email', width: 180, ellipsis: true },
    { title: '电话', dataIndex: 'phone', width: 130 },
    {
      title: '平台角色', dataIndex: 'platformRole', width: 130,
      render: (v: string) => {
        const colorMap: Record<string, string> = {
          SUPER_ADMIN: 'red', TENANT_ADMIN: 'blue',
          STORE_MANAGER: 'green', FINANCE_AUDITOR: 'orange', OPERATOR: 'default',
        };
        return <Tag color={colorMap[v] || 'default'}>{v}</Tag>;
      },
    },
    {
      title: '状态', dataIndex: 'status', width: 80,
      render: (v: string) => <Tag color={v === 'ACTIVE' ? 'green' : 'red'}>{v}</Tag>,
    },
    {
      title: '最后登录', dataIndex: 'lastLoginAt', width: 150,
      render: (v: string) => v ? new Date(v).toLocaleString() : '-',
    },
    {
      title: '操作', width: 200,
      render: (_: any, record: SystemUserEntity) => (
        <Space>
          <Button size="small" icon={<EditOutlined />} onClick={() => handleEdit(record)}>编辑</Button>
          <Button size="small" icon={<KeyOutlined />} onClick={() => {
            setResetTargetId(record.id || null);
            setPasswordModalOpen(true);
          }}>重置密码</Button>
        </Space>
      ),
    },
  ];

  return (
    <div className="campaign-page" style={{ padding: 'var(--campaign-page-padding)', minHeight: 'calc(100vh - 64px)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
        <Title level={4} style={{ margin: 0 }}>用户管理</Title>
        <Button type="primary" icon={<PlusOutlined />}
          onClick={() => { setEditingUser(null); form.resetFields(); setModalOpen(true); }}>
          新建用户
        </Button>
      </div>

      <Table dataSource={users} columns={columns} loading={loading} rowKey="id" size="small"
        pagination={{ pageSize: 20 }} />

      {/* 创建/编辑用户 Modal */}
      <Modal
        title={editingUser ? '编辑用户' : '新建用户'}
        open={modalOpen}
        onCancel={() => { setModalOpen(false); setEditingUser(null); }}
        onOk={() => form.submit()}
        width={500}
      >
        <Form form={form} layout="vertical" onFinish={handleSave}>
          <Form.Item name="username" label="用户名" rules={[{ required: true }]}>
            <Input placeholder="登录用户名" disabled={!!editingUser} />
          </Form.Item>
          {!editingUser && (
            <Form.Item name="password" label="密码" rules={[{ required: true, min: 6 }]}>
              <Input.Password placeholder="至少6位" />
            </Form.Item>
          )}
          <Form.Item name="realName" label="姓名">
            <Input placeholder="真实姓名（显示用）" />
          </Form.Item>
          <Form.Item name="email" label="邮箱">
            <Input placeholder="email@example.com" />
          </Form.Item>
          <Form.Item name="phone" label="电话">
            <Input placeholder="手机号" />
          </Form.Item>
          <Form.Item name="platformRole" label="平台角色" initialValue="OPERATOR">
            <Select options={[
              { label: '超级管理员', value: 'SUPER_ADMIN' },
              { label: '租户管理员', value: 'TENANT_ADMIN' },
              { label: '门店店长', value: 'STORE_MANAGER' },
              { label: '财务审计员', value: 'FINANCE_AUDITOR' },
              { label: '运营人员', value: 'OPERATOR' },
            ]} />
          </Form.Item>
          <Form.Item name="status" label="状态" initialValue="ACTIVE">
            <Select options={[
              { label: '激活', value: 'ACTIVE' },
              { label: '禁用', value: 'DISABLED' },
            ]} />
          </Form.Item>
          <Form.Item name="roleId" label="分配角色">
            <Select allowClear placeholder="选择自定义角色（可选）" options={
              roles.map(r => ({ label: r.roleName, value: r.id }))
            } />
          </Form.Item>
        </Form>
      </Modal>

      {/* 重置密码 Modal */}
      <Modal
        title="重置密码"
        open={passwordModalOpen}
        onCancel={() => { setPasswordModalOpen(false); setResetTargetId(null); passwordForm.resetFields(); }}
        onOk={() => passwordForm.submit()}
        width={400}
      >
        <Form form={passwordForm} layout="vertical" onFinish={handleResetPassword}>
          <Form.Item name="password" label="新密码" rules={[{ required: true, min: 6 }]}>
            <Input.Password placeholder="至少6位" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default UserManage;
