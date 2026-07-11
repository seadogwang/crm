import React from 'react';
import { Typography } from 'antd';
import { useCampaignStyles } from './campaign/styles/campaign-ui-standard';
import EntityDesigner from './EntityDesigner';

const { Title } = Typography;

const DesignerPage: React.FC = () => {
  const s = useCampaignStyles();

  return (
    <div className="campaign-page" style={{ ...s.pageStyle, display: 'flex', flexDirection: 'column', height: 'calc(100vh - 64px)' }}>
      <div style={{ padding: '8px 16px', borderBottom: '1px solid #f0f0f0', background: '#fff' }}>
        <Title level={5} style={{ margin: 0 }}>实体设计</Title>
      </div>
      <div style={{ flex: 1, overflow: 'hidden' }}>
        <EntityDesigner />
      </div>
    </div>
  );
};

export default DesignerPage;