import React, { useState, useEffect, useCallback } from 'react';
import { Table, Button, Space, Card, Typography, Modal, Form, Input, Tree, message, Tag } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, SafetyCertificateOutlined } from '@ant-design/icons';
import {
  listSystemRoles, createSystemRole, updateSystemRole,
  listSystemPermissions, type SystemRoleEntity, type SystemPermissionEntity,
} from '../api/campaign';
import api from '../api';
import PageWrapper from '../components/PageWrapper';
import { useCampaignStyles, TitleWithDesc, CampaignCard } from './campaign/styles/campaign-ui-standard';

const { Title } = Typography;

interface PermissionNode {
  key: string;
  title: string;
  children?: PermissionNode[];
}

/** 将后端权限列表转为 Ant Design Tree 数据格式 */
function buildPermissionTree(perms: SystemPermissionEntity[]): PermissionNode[] {
  const moduleMap: Record<string, PermissionNode> = {};
  const moduleNames: Record<string, string> = {
    MEMBER: '会员管理', POINTS: '积分管理', RULE: '规则引擎',
    CHANNEL: '渠道集成', SCHEMA: 'Schema管理', AUDIT: '审计日志',
    TENANT: '系统设置',
  };
  for (const p of perms) {
    const mod = p.module || 'OTHER';
    if (!moduleMap[mod]) {
      moduleMap[mod] = { key: mod, title: moduleNames[mod] || mod, children: [] };
    }
    moduleMap[mod].children!.push({ key: p.permCode, title: p.permName || p.permCode });
  }
  return Object.values(moduleMap);
}

// 默认权限树（后端未就绪时使用）
const DEFAULT_PERMISSIONS: PermissionNode[] = [
  { key: 'MEMBER', title: '会员管理', children: [
    { key: 'MEMBER_READ', title: 'MEMBER_READ' }, { key: 'MEMBER_WRITE', title: 'MEMBER_WRITE' }, { key: 'MEMBER_DELETE', title: 'MEMBER_DELETE' },
  ]},
  { key: 'POINTS', title: '积分管理', children: [
    { key: 'POINTS_GRANT', title: 'POINTS_GRANT' }, { key: 'POINTS_REDEEM', title: 'POINTS_REDEEM' }, { key: 'POINTS_ADJUST', title: 'POINTS_ADJUST' },
  ]},
  { key: 'RULE', title: '规则引擎', children: [
    { key: 'RULE_READ', title: 'RULE_READ' }, { key: 'RULE_WRITE', title: 'RULE_WRITE' }, { key: 'RULE_PUBLISH', title: 'RULE_PUBLISH' },
  ]},
  { key: 'CHANNEL', title: '渠道集成', children: [
    { key: 'CHANNEL_READ', title: 'CHANNEL_READ' }, { key: 'CHANNEL_WRITE', title: 'CHANNEL_WRITE' },
  ]},
  { key: 'SCHEMA', title: 'Schema管理', children: [
    { key: 'SCHEMA_READ', title: 'SCHEMA_READ' }, { key: 'SCHEMA_WRITE', title: 'SCHEMA_WRITE' },
  ]},
  { key: 'AUDIT', title: '审计日志', children: [
    { key: 'AUDIT_READ', title: 'AUDIT_READ' }, { key: 'AUDIT_EXPORT', title: 'AUDIT_EXPORT' },
  ]},
  { key: 'TENANT', title: '系统设置', children: [
    { key: 'TENANT_READ', title: 'TENANT_READ' }, { key: 'TENANT_WRITE', title: 'TENANT_WRITE' },
  ]},
];

const RoleManage: React.FC = () => {
  const [roles, setRoles] = useState<SystemRoleEntity[]>([]);
  const [permissions, setPermissions] = useState<SystemPermissionEntity[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingRole, setEditingRole] = useState<SystemRoleEntity | null>(null);
  const [checkedKeys, setCheckedKeys] = useState<string[]>([]);
  const [form] = Form.useForm();

  const fetchRoles = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await listSystemRoles();
      setRoles(data || []);
    } catch (e: any) { setError(e.message || '加载失败'); setRoles([]); }
    finally { setLoading(false); }
  }, []);

  const fetchPermissions = useCallback(async () => {
    try {
      const data = await listSystemPermissions();
      setPermissions(data || []);
    } catch { /* use DEFAULT_PERMISSIONS */ }
  }, []);

  useEffect(() => { fetchRoles(); fetchPermissions(); }, [fetchRoles, fetchPermissions]);

  // 动态权限树
  const permissionTree = permissions.length > 0
    ? buildPermissionTree(permissions)
    : DEFAULT_PERMISSIONS;

  const handleSave = async (values: any) => {
    try {
      const payload = {
        ...values,
        permissionIds: checkedKeys,
      };
      if (editingRole?.id) {
        await updateSystemRole(String(editingRole.id), payload);
      } else {
        await createSystemRole(payload);
      }
      message.success(editingRole ? '角色已更新' : '角色已创建');
      setModalOpen(false);
      form.resetFields();
      setCheckedKeys([]);
      setEditingRole(null);
      fetchRoles();
    } catch (e: any) { message.error(e.response?.data?.message || '保存失败'); }
  };

  const handleEdit = (role: SystemRoleEntity) => {
    setEditingRole(role);
    form.setFieldsValue({
      roleName: role.roleName,
      roleCode: role.roleCode,
      description: role.description,
    });
    setCheckedKeys(role.permissionIds || []);
    setModalOpen(true);
  };

  const handleDelete = async (roleId: string) => {
    try {
      await api.delete(`/admin/system/role/${roleId}`);
      message.success('角色已删除');
      fetchRoles();
    } catch (e: any) { message.error(e.response?.data?.message || '删除失败'); }
  };

  const columns = [
    { title: '角色名', dataIndex: 'roleName', width: 150 },
    { title: '角色编码', dataIndex: 'roleCode', width: 130 },
    { title: '描述', dataIndex: 'description', ellipsis: true },
    {
      title: '权限数', dataIndex: 'permissionIds', width: 80,
      render: (v: string[]) => <Tag>{v?.length || 0}</Tag>,
    },
    { title: '创建时间', dataIndex: 'createdAt', width: 140 },
    {
      title: '操作', width: 150,
      render: (_: any, record: SystemRoleEntity) => (
        <Space>
          <Button size="small" icon={<EditOutlined />} onClick={() => handleEdit(record)}>编辑</Button>
          <Button size="small" danger icon={<DeleteOutlined />} onClick={() => handleDelete(String(record.id))}>删除</Button>
        </Space>
      ),
    },
  ];

  return (
    <PageWrapper loading={loading} error={error} onRetry={fetchRoles}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
        <Title level={4} style={{ margin: 0 }}>角色权限管理</Title>
        <Button type="primary" icon={<PlusOutlined />}
          onClick={() => { setEditingRole(null); form.resetFields(); setCheckedKeys([]); setModalOpen(true); }}>
          新建角色
        </Button>
      </div>

      <Table dataSource={roles} columns={columns} loading={loading} rowKey="id" size="small"
        pagination={{ pageSize: 20 }} />

      <Modal
        title={editingRole ? '编辑角色' : '新建角色'}
        open={modalOpen}
        onCancel={() => { setModalOpen(false); setEditingRole(null); }}
        onOk={() => form.submit()}
        width={500}
      >
        <Form form={form} layout="vertical" onFinish={handleSave}>
          <Form.Item name="roleName" label="角色名称" rules={[{ required: true }]}>
            <Input placeholder="如：运营管理员" />
          </Form.Item>
          <Form.Item name="roleCode" label="角色编码" rules={[{ required: true }]}>
            <Input placeholder="如：OPERATOR_ADMIN" disabled={!!editingRole} />
          </Form.Item>
          <Form.Item name="description" label="描述">
            <Input.TextArea rows={2} />
          </Form.Item>
          <Form.Item label="权限分配">
            <Tree
              checkable
              defaultExpandAll
              checkedKeys={checkedKeys}
              onCheck={(keys) => setCheckedKeys(keys as string[])}
              treeData={permissionTree}
            />
          </Form.Item>
        </Form>
      </Modal>
    </PageWrapper>
  );
};

export default RoleManage;