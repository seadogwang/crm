import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Card, Table, Button, Space, Tag, Input, Modal, message, Typography, Tooltip,
} from 'antd';
import {
  PlusOutlined, SearchOutlined, RightOutlined, EditOutlined,
  InboxOutlined, HistoryOutlined,
} from '@ant-design/icons';
import {
  listWorkspaces, archiveWorkspace, CampaignWorkspace,
} from '../../api/campaign';
import { useAppStore } from '../../store';
import { useCampaignStyles, TitleWithDesc } from './styles/campaign-ui-standard';

const { Text, Title } = Typography;

const CampaignWorkspaceList: React.FC = () => {
  const navigate = useNavigate();
  const { currentProgramCode } = useAppStore();
  const [workspaces, setWorkspaces] = useState<CampaignWorkspace[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchText, setSearchText] = useState('');
  const s = useCampaignStyles();

  const fetchWorkspaces = useCallback(async () => {
    setLoading(true);
    try {
      const data = await listWorkspaces();
      setWorkspaces(data || []);
    } catch (err: any) {
      message.error('加载工作区列表失败: ' + (err?.response?.data?.message || err.message));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchWorkspaces();
  }, [fetchWorkspaces]);

  const handleArchive = async (workspace: CampaignWorkspace) => {
    Modal.confirm({
      title: '确认归档',
      content: `确定要归档工作区「${workspace.name}」吗？`,
      okText: '确认归档',
      cancelText: '取消',
      onOk: async () => {
        try {
          await archiveWorkspace(workspace.id);
          message.success('归档成功');
          fetchWorkspaces();
        } catch (err: any) {
          message.error('归档失败: ' + (err?.response?.data?.message || err.message));
        }
      },
    });
  };

  const getStatusTag = (status: string) => {
    const map: Record<string, { color: string; text: string }> = {
      ACTIVE: { color: 'green', text: '● ACTIVE' },
      ARCHIVED: { color: 'default', text: '○ ARCHIVED' },
      LOCKED: { color: 'orange', text: '● LOCKED' },
    };
    const s = map[status] || { color: 'default', text: status };
    return <Tag color={s.color}>{s.text}</Tag>;
  };

  const filtered = workspaces
    .filter(w => w.programCode === currentProgramCode)
    .filter(w => !searchText || w.name.toLowerCase().includes(searchText.toLowerCase()));

  const columns = [
    {
      title: '工作区',
      dataIndex: 'name',
      key: 'name',
      render: (name: string, record: CampaignWorkspace) => (
        <Text strong>{name}</Text>
      ),
    },
    {
      title: '当前目标',
      key: 'activeGoal',
      width: 150,
      render: (_: any, record: CampaignWorkspace) => (
        <Text type={record.activeGoalId ? undefined : 'secondary'}>
          {record.activeGoalId ? '已设置' : '未设置'}
        </Text>
      ),
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 120,
      render: (status: string) => getStatusTag(status),
    },
    {
      title: '创建时间',
      dataIndex: 'createdAt',
      key: 'createdAt',
      width: 180,
      render: (t: string) => new Date(t).toLocaleString('zh-CN'),
    },
    {
      title: '操作',
      key: 'action',
      width: 200,
      render: (_: any, record: CampaignWorkspace) => (
        <Space>
          <Button type="primary" size="small" icon={<RightOutlined />}
            onClick={() => navigate(`/campaign/workspace/${record.id}`)}>
            进入
          </Button>
          {record.status === 'ACTIVE' && (
            <>
              <Tooltip title="归档">
                <Button size="small" icon={<InboxOutlined />}
                  onClick={() => handleArchive(record)} />
              </Tooltip>
            </>
          )}
          <Tooltip title="快照">
            <Button size="small" icon={<HistoryOutlined />} />
          </Tooltip>
        </Space>
      ),
    },
  ];

  return (
    <div style={s.pageStyle}>
      <TitleWithDesc title="营销工作区" desc="管理营销活动的战略规划与执行" />

      <div style={{ ...s.toolbarStyle, marginTop: 12 }}>
        <Input
          placeholder="搜索工作区..."
          prefix={<SearchOutlined />}
          value={searchText}
          onChange={e => setSearchText(e.target.value)}
          style={s.inputLg}
          allowClear
        />
        <Button type="primary" icon={<PlusOutlined />} onClick={() => navigate('/campaign/workspaces/new')}>
          新建工作区
        </Button>
      </div>

      <Table
        className="campaign-table"
        dataSource={filtered}
        columns={columns}
        rowKey="id"
        loading={loading}
        {...s.tableProps}
      />
    </div>
  );
};

export default CampaignWorkspaceList;
