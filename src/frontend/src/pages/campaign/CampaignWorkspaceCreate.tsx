import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Card, Button, Space, Typography, Form, Input, Select, InputNumber, message, Tag,
} from 'antd';
import {
  ArrowLeftOutlined, SaveOutlined,
} from '@ant-design/icons';
import { createWorkspace } from '../../api/campaign';
import { useAppStore } from '../../store';
import { useCampaignStyles } from './styles/campaign-ui-standard';

const { Text, Title } = Typography;

const CampaignWorkspaceCreate: React.FC = () => {
  const navigate = useNavigate();
  const { currentProgramCode } = useAppStore();
  const s = useCampaignStyles();
  const [loading, setLoading] = useState(false);
  const [form] = Form.useForm();

  const handleSubmit = async (values: any) => {
    setLoading(true);
    try {
      const result = await createWorkspace({
        name: values.name,
        programCode: currentProgramCode,
        description: values.description,
        config: {
          timezone: values.timezone || 'Asia/Shanghai',
          defaultBudget: values.defaultBudget || 0,
        },
      });
      message.success('工作区创建成功');
      navigate(`/campaign/workspace/${result.id}`);
    } catch (err: any) {
      message.error('创建失败: ' + (err?.response?.data?.message || err.message));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={s.pageStyle}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
        <h4 className="campaign-page-title" style={{ ...s.titleStyle, margin: 0 }}>新建工作区</h4>
        <Button type="text" icon={<ArrowLeftOutlined />} onClick={() => navigate('/campaign/workspaces')}>
          返回
        </Button>
      </div>
      <p className="campaign-page-subtitle" style={{ ...s.subtitleStyle, marginBottom: 16 }}>创建一个新的营销工作区，作为营销活动的战略规划容器</p>

      <Card>
        <Form form={form} layout="vertical" onFinish={handleSubmit}
          initialValues={{ timezone: 'Asia/Shanghai' }}>
          <Form.Item name="name" label="工作区名称" rules={[{ required: true, message: '请输入工作区名称' }]}>
            <Input placeholder="例如：618大促、Q3会员运营" size="large" />
          </Form.Item>


          <Form.Item name="description" label="描述">
            <Input.TextArea rows={4} placeholder="描述工作区的用途和目标" />
          </Form.Item>

          <Form.Item name="timezone" label="时区">
            <Select
              options={[
                { label: 'Asia/Shanghai (UTC+8)', value: 'Asia/Shanghai' },
                { label: 'America/New_York (UTC-5)', value: 'America/New_York' },
                { label: 'Europe/London (UTC+0)', value: 'Europe/London' },
                { label: 'Asia/Tokyo (UTC+9)', value: 'Asia/Tokyo' },
              ]}
            />
          </Form.Item>

          <Form.Item name="defaultBudget" label="默认预算（元）">
            <InputNumber style={{ width: '100%' }} min={0} step={10000} prefix="¥" placeholder="0" />
          </Form.Item>

          <Form.Item style={{ marginTop: 32 }}>
            <Space>
              <Button type="primary" htmlType="submit" icon={<SaveOutlined />} loading={loading} size="large">
                创建工作区
              </Button>
              <Button onClick={() => navigate('/campaign/workspaces')} size="large">
                取消
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </Card>
    </div>
  );
};

export default CampaignWorkspaceCreate;
