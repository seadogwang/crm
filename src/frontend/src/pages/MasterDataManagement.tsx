import React, { useState } from 'react';
import { Card, Tabs, Table, Button, Input, Select, Space, Tag, message, Modal, Form, InputNumber } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, ReloadOutlined, ImportOutlined } from '@ant-design/icons';
import { useAppStore } from '../store';

const { TabPane } = Tabs;

// ==================== 枚举值管理 ====================
const EnumManagement: React.FC = () => {
  const [types, setTypes] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  const columns = [
    { title: '代码', dataIndex: 'dataCode', width: 120 },
    { title: '名称', dataIndex: 'dataName', width: 120 },
    { title: '枚举数量', dataIndex: 'itemCount', width: 80 },
    {
      title: '状态', dataIndex: 'status', width: 70,
      render: (v: string) => <Tag color={v === 'ACTIVE' ? 'green' : 'default'}>{v === 'ACTIVE' ? '启用' : '停用'}</Tag>,
    },
    {
      title: '操作', width: 120,
      render: () => (
        <Space>
          <Button size="small" type="link" icon={<EditOutlined />}>编辑</Button>
          <Button size="small" type="link" danger icon={<DeleteOutlined />}>删除</Button>
        </Space>
      ),
    },
  ];

  return (
    <Card
      title="枚举值管理"
      extra={<Button type="primary" icon={<PlusOutlined />}>新建枚举类型</Button>}
    >
      <Table dataSource={types} columns={columns} rowKey="dataCode" loading={loading}
        pagination={false} size="middle"
        locale={{ emptyText: '暂无枚举类型，点击"新建枚举类型"添加' }} />
    </Card>
  );
};

// ==================== 层级数据管理 ====================
const HierarchyManagement: React.FC = () => (
  <Card title="层级数据管理" extra={<Button type="primary" icon={<PlusOutlined />}>新建层级类型</Button>}>
    <Table dataSource={[]} columns={[
      { title: '代码', dataIndex: 'dataCode', width: 120 },
      { title: '名称', dataIndex: 'dataName', width: 120 },
      { title: '节点数', dataIndex: 'nodeCount', width: 80 },
      { title: '层级', dataIndex: 'maxLevel', width: 60 },
      { title: '操作', width: 120, render: () => <Space><Button size="small" type="link" icon={<EditOutlined />}>编辑</Button><Button size="small" type="link" danger icon={<DeleteOutlined />}>删除</Button></Space> },
    ]} rowKey="dataCode" pagination={false} size="middle"
      locale={{ emptyText: '暂无层级数据，点击"新建层级类型"添加' }} />
  </Card>
);

// ==================== 映射表管理 ====================
const MappingManagement: React.FC = () => (
  <Card title="映射表管理" extra={<Space><Button icon={<ImportOutlined />}>导入</Button><Button type="primary" icon={<PlusOutlined />}>新建映射表</Button></Space>}>
    <Table dataSource={[]} columns={[
      { title: '代码', dataIndex: 'dataCode', width: 120 },
      { title: '名称', dataIndex: 'dataName', width: 120 },
      { title: '映射数量', dataIndex: 'itemCount', width: 80 },
      { title: '操作', width: 120, render: () => <Space><Button size="small" type="link" icon={<EditOutlined />}>编辑</Button><Button size="small" type="link" danger icon={<DeleteOutlined />}>删除</Button></Space> },
    ]} rowKey="dataCode" pagination={false} size="middle"
      locale={{ emptyText: '暂无映射表，点击"新建映射表"添加' }} />
  </Card>
);

// ==================== 标签管理 ====================
const TagManagement: React.FC = () => (
  <Card title="标签管理" extra={<Button type="primary" icon={<PlusOutlined />}>新建标签</Button>}>
    <Table dataSource={[]} columns={[
      { title: '标签代码', dataIndex: 'tagCode', width: 120 },
      { title: '标签名称', dataIndex: 'tagName', width: 120 },
      { title: '标签组', dataIndex: 'tagGroup', width: 100 },
      { title: '颜色', dataIndex: 'tagColor', width: 60, render: (v: string) => <Tag color={v}>{v}</Tag> },
      { title: '操作', width: 120, render: () => <Space><Button size="small" type="link" icon={<EditOutlined />}>编辑</Button><Button size="small" type="link" danger icon={<DeleteOutlined />}>删除</Button></Space> },
    ]} rowKey="tagCode" pagination={false} size="middle"
      locale={{ emptyText: '暂无标签，点击"新建标签"添加' }} />
  </Card>
);

// ==================== 主页面 ====================
const MasterDataManagement: React.FC = () => {
  return (
    <Card title="主数据管理" bodyStyle={{ padding: 0 }}>
      <Tabs defaultActiveKey="enum" tabPosition="top" style={{ padding: '0 16px' }}>
        <TabPane tab="枚举值管理" key="enum"><EnumManagement /></TabPane>
        <TabPane tab="层级数据管理" key="hierarchy"><HierarchyManagement /></TabPane>
        <TabPane tab="映射表管理" key="mapping"><MappingManagement /></TabPane>
        <TabPane tab="标签管理" key="tag"><TagManagement /></TabPane>
      </Tabs>
    </Card>
  );
};

export default MasterDataManagement;