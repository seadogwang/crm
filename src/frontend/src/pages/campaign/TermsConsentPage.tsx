import React, { useState, useEffect, useCallback } from 'react';
import { Card, Button, Checkbox, Spin, message, Result, Descriptions, Tag } from 'antd';
import { FileTextOutlined, CheckCircleOutlined } from '@ant-design/icons';
import { getActiveTerms, acceptTerms, checkTermsAccepted, type TermsMaster } from '../../api/campaign';
import dayjs from 'dayjs';

const renderTermsText = (content?: string) => {
  if (!content) return '';
  const doc = new DOMParser().parseFromString(content, 'text/html');
  return doc.body.textContent || '';
};

/**
 * 条款同意页面（会员端） — 展示当前生效条款并允许会员接受。
 *
 * <p>独立页面（无 AppShell 包裹），当会员登录后未接受最新章程时被重定向到此页面。
 * 接受后重定向回原始页面。
 */
const TermsConsentPage: React.FC = () => {
  const [terms, setTerms] = useState<TermsMaster | null>(null);
  const [agreed, setAgreed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [accepted, setAccepted] = useState(false);

  const redirectUrl = new URLSearchParams(window.location.search).get('redirect') || '/dashboard';
  // Note: memberId would come from auth context in a real app; using a placeholder
  const memberId = sessionStorage.getItem('current_member_id') || '';

  const loadTerms = useCallback(async () => {
    setLoading(true);
    try {
      const active = await getActiveTerms('CHARTER');
      setTerms(active);

      // Check if already accepted
      if (memberId && active) {
        try {
          const result = await checkTermsAccepted(memberId, 'CHARTER');
          if (result.accepted) {
            setAccepted(true);
          }
        } catch { /* ignore */ }
      }
    } catch {
      message.error('加载条款内容失败');
    } finally {
      setLoading(false);
    }
  }, [memberId]);

  useEffect(() => { loadTerms(); }, [loadTerms]);

  const handleAccept = async () => {
    if (!agreed || !memberId) return;
    setSubmitting(true);
    try {
      await acceptTerms({
        memberId,
        termsType: 'CHARTER',
        source: 'WEB_APP',
      });
      message.success('您已同意最新章程');
      setAccepted(true);
      // Redirect after a short delay
      setTimeout(() => {
        window.location.href = redirectUrl;
      }, 1500);
    } catch {
      message.error('提交失败，请重试');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
        <Spin size="large" />
      </div>
    );
  }

  if (accepted) {
    return (
      <div style={{ maxWidth: 640, margin: '100px auto', padding: 24 }}>
        <Result
          icon={<CheckCircleOutlined style={{ color: '#52c41a' }} />}
          title="您已同意最新章程"
          subTitle="即将跳转回原页面..."
          extra={
            <Button type="primary" href={redirectUrl}>
              立即返回
            </Button>
          }
        />
      </div>
    );
  }

  if (!terms) {
    return (
      <div style={{ maxWidth: 640, margin: '100px auto', padding: 24 }}>
        <Result
          icon={<FileTextOutlined />}
          title="暂无生效的章程"
          subTitle="当前没有需要您同意的条款"
          extra={
            <Button type="primary" href={redirectUrl}>
              返回首页
            </Button>
          }
        />
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 720, margin: '40px auto', padding: 24 }}>
      <Card
        title={
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <FileTextOutlined style={{ fontSize: 20 }} />
            <span>俱乐部章程</span>
            <Tag color="blue">版本 {terms.termsVersion}</Tag>
          </div>
        }
        extra={
          <Descriptions size="small" column={1}>
            <Descriptions.Item label="生效日期">
              {terms.effectiveDate ? dayjs(terms.effectiveDate).format('YYYY-MM-DD HH:mm') : '-'}
            </Descriptions.Item>
          </Descriptions>
        }
      >
        {/* Terms Content */}
        <div
          style={{
            maxHeight: 400,
            overflow: 'auto',
            padding: '16px 20px',
            background: '#fafafa',
            borderRadius: 8,
            border: '1px solid #f0f0f0',
            marginBottom: 24,
            lineHeight: 1.8,
            fontSize: 14,
            whiteSpace: 'pre-wrap',
          }}
        >
          {terms.termsContent ? (
            <div>{renderTermsText(terms.termsContent)}</div>
          ) : (
            <div style={{ color: '#8c8c8c', textAlign: 'center', padding: 40 }}>
              <p>暂无条款详细内容</p>
              <p style={{ fontSize: 12 }}>请仔细阅读并同意《俱乐部章程》以继续使用会员服务。</p>
            </div>
          )}
        </div>

        {/* Agreement Checkbox */}
        <div style={{
          padding: '16px 20px',
          background: '#e6f7ff',
          borderRadius: 8,
          border: '1px solid #91d5ff',
          marginBottom: 24,
        }}>
          <Checkbox
            checked={agreed}
            onChange={e => setAgreed(e.target.checked)}
            style={{ fontSize: 14 }}
          >
            我已阅读并同意《俱乐部章程》版本 {terms.termsVersion}
          </Checkbox>
        </div>

        {/* Action Buttons */}
        <div style={{ textAlign: 'center' }}>
          <Button
            type="primary"
            size="large"
            disabled={!agreed}
            loading={submitting}
            onClick={handleAccept}
            style={{ minWidth: 200 }}
          >
            同意并继续
          </Button>
          <div style={{ marginTop: 12, color: '#8c8c8c', fontSize: 12 }}>
            如果您不同意章程，将无法继续使用会员服务
          </div>
        </div>
      </Card>
    </div>
  );
};

export default TermsConsentPage;
