import React, { useState } from 'react';
import { Card, Form, InputNumber, Select, Button, message, Alert, Descriptions } from 'antd';
import { ThunderboltOutlined, SendOutlined } from '@ant-design/icons';
import axios from 'axios';

const PROG = sessionStorage.getItem('current_program_code') || 'PROG001';

const PointsRedeem: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [form] = Form.useForm();

  const handleRedeem = async (values: any) => {
    setLoading(true);
    try {
      const { data } = await axios.post('/api/admin/points/redeem', {
        member_id: values.member_id, account_type: values.account_type, points: values.points,
      }, { headers: { 'X-Program-Code': PROG, 'X-Idempotency-Key': `redeem-${Date.now()}` } });
      if (data.code === 'SUCCESS') { message.success(`成功核销 ${values.points} 积分`); setResult(data.data); }
      else message.error(data.message);
    } catch (e: any) { message.error(e.response?.data?.message || '核销失败'); }
    finally { setLoading(false); }
  };

  return (
    <Card title={<span><ThunderboltOutlined /> 积分核销（FIFO 引擎）</span>} style={{ maxWidth: 600 }}>
      <Alert message="FIFO 先进先出：先过期先消耗。生成 RedemptionAllocation 分摊明细。" type="info" showIcon style={{ marginBottom: 16 }} />
      <Form form={form} layout="vertical" onFinish={handleRedeem} initialValues={{ account_type: 'REWARD_POINTS' }}>
        <Form.Item name="member_id" label="会员 ID" rules={[{ required: true }]}><InputNumber style={{ width: 200 }} /></Form.Item>
        <Form.Item name="account_type" label="账户类型"><Select options={[{ label: '消费积分', value: 'REWARD_POINTS' }]} /></Form.Item>
        <Form.Item name="points" label="核销积分" rules={[{ required: true }]}><InputNumber style={{ width: 200 }} min={0.0001} step={10} precision={4} /></Form.Item>
        <Button type="primary" danger htmlType="submit" icon={<SendOutlined />} loading={loading}>核销积分</Button>
      </Form>
      {result && <Descriptions size="small" bordered style={{ marginTop: 16 }} column={1}>
        <Descriptions.Item label="核销总额">{result.total_redeemed}</Descriptions.Item>
        <Descriptions.Item label="涉及批次">{result.batch_count}</Descriptions.Item>
      </Descriptions>}
    </Card>
  );
};

export default PointsRedeem;