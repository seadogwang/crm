import React, { useState } from 'react';
import { Card, Form, Input, InputNumber, Select, Button, message, Alert, Descriptions } from 'antd';
import { DollarOutlined, SendOutlined } from '@ant-design/icons';
import axios from 'axios';

const PROG = sessionStorage.getItem('current_program_code') || 'PROG001';

const PointsGrant: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [form] = Form.useForm();

  const handleGrant = async (values: any) => {
    setLoading(true);
    try {
      const { data } = await axios.post('/api/admin/points/grant', {
        member_id: values.member_id,
        account_type: values.account_type,
        points: values.points,
        rule_code: values.rule_code || 'MANUAL_GRANT',
      }, { headers: { 'X-Program-Code': PROG, 'X-Idempotency-Key': `grant-${Date.now()}` } });
      if (data.code === 'SUCCESS') {
        message.success(`成功发放 ${values.points} 积分`);
        setResult(data.data);
      } else {
        message.error(data.message);
      }
    } catch (e: any) { message.error(e.response?.data?.message || '发放失败'); }
    finally { setLoading(false); }
  };

  return (
    <Card title={<span><DollarOutlined /> 积分发放（瀑布流冲抵引擎）</span>} style={{ maxWidth: 600 }}>
      <Alert message="发分先补透支天窗，再还信用欠款，最后剩余积分入账 ACCRUAL" type="info" showIcon style={{ marginBottom: 16 }} />
      <Form form={form} layout="vertical" onFinish={handleGrant} initialValues={{ account_type: 'REWARD_POINTS' }}>
        <Form.Item name="member_id" label="会员 ID" rules={[{ required: true }]}><InputNumber style={{ width: 200 }} placeholder="8821" /></Form.Item>
        <Form.Item name="account_type" label="账户类型"><Select options={[{ label: '消费积分', value: 'REWARD_POINTS' }, { label: '等级成长值', value: 'TIER_POINTS' }]} /></Form.Item>
        <Form.Item name="points" label="发放积分" rules={[{ required: true }]}><InputNumber style={{ width: 200 }} min={0.0001} step={10} precision={4} /></Form.Item>
        <Form.Item name="rule_code" label="规则代码"><Input placeholder="MANUAL_GRANT" /></Form.Item>
        <Button type="primary" htmlType="submit" icon={<SendOutlined />} loading={loading}>发放积分</Button>
      </Form>
      {result && <Descriptions size="small" bordered style={{ marginTop: 16 }} column={1}>
        <Descriptions.Item label="总发放">{result.total_granted}</Descriptions.Item>
        <Descriptions.Item label="冲透支">{result.overdraft_repaid || 0}</Descriptions.Item>
        <Descriptions.Item label="还信用">{result.credit_repaid || 0}</Descriptions.Item>
        <Descriptions.Item label="净入账">{result.net_accrued || 0}</Descriptions.Item>
      </Descriptions>}
    </Card>
  );
};

export default PointsGrant;