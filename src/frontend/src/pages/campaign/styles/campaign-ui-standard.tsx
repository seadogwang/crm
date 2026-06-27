/**
 * Campaign UI Standard — 统一样式系统
 *
 * 使用方式：在页面组件中引入 useCampaignStyles
 * import { useCampaignStyles } from '../styles/campaign-ui-standard';
 */

import React from 'react';

// ==================== CSS Variables ====================
// 注入全局CSS变量（在App.tsx或Layout中调用一次）
export const CampaignStyleVariables = `
  :root {
    /* === Font Sizes === */
    --campaign-title-size: 24px;
    --campaign-subtitle-size: 16px;
    --campaign-body-size: 14px;
    --campaign-caption-size: 12px;
    --campaign-label-size: 13px;

    /* === Font Weights === */
    --campaign-title-weight: 600;
    --campaign-subtitle-weight: 500;
    --campaign-body-weight: 400;

    /* === Spacing === */
    --campaign-page-padding: 24px;
    --campaign-card-gap: 12px;
    --campaign-section-gap: 16px;
    --campaign-element-gap: 8px;
    --campaign-form-item-gap: 16px;

    /* === Card === */
    --campaign-card-radius: 8px;
    --campaign-card-shadow: 0 1px 3px rgba(0,0,0,0.08);

    /* === Input/Select Standard Widths === */
    --campaign-input-sm: 120px;
    --campaign-input-md: 200px;
    --campaign-input-lg: 320px;
    --campaign-input-full: 100%;

    /* === Table === */
    --campaign-table-row-height: 48px;
    --campaign-table-font-size: 14px;
    --campaign-table-header-bg: #fafafa;

    /* === Buttons === */
    --campaign-btn-radius: 6px;
    --campaign-btn-height: 32px;

    /* === Colors === */
    --campaign-primary: #1890ff;
    --campaign-success: #52c41a;
    --campaign-warning: #fa8c16;
    --campaign-danger: #ff4d4f;
    --campaign-text-primary: #262626;
    --campaign-text-secondary: #8c8c8c;
    --campaign-bg-light: #fafafa;
    --campaign-border: #f0f0f0;
  }

  /* === Global Campaign Page Styles === */
  .campaign-page {
    padding: var(--campaign-page-padding);
    min-height: calc(100vh - 64px);
  }

  .campaign-page .campaign-page-title {
    font-size: var(--campaign-title-size);
    font-weight: var(--campaign-title-weight);
    margin-bottom: 4px;
    line-height: 1.3;
  }

  .campaign-page .campaign-page-subtitle {
    font-size: var(--campaign-body-size);
    color: var(--campaign-text-secondary);
    margin-bottom: var(--campaign-section-gap);
  }

  /* === Card Standard === */
  .campaign-card {
    border-radius: var(--campaign-card-radius);
    box-shadow: var(--campaign-card-shadow);
    margin-bottom: var(--campaign-card-gap);
  }

  .campaign-card .ant-card-head {
    font-size: var(--campaign-subtitle-size);
    font-weight: var(--campaign-subtitle-weight);
    min-height: 40px;
  }

  /* === Table Standard === */
  .campaign-table .ant-table-thead > tr > th {
    font-size: var(--campaign-label-size);
    font-weight: 600;
    background: var(--campaign-table-header-bg);
    white-space: nowrap;
    padding: 10px 12px;
  }

  .campaign-table .ant-table-tbody > tr > td {
    font-size: var(--campaign-table-font-size);
    padding: 10px 12px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .campaign-table .ant-table-tbody > tr {
    height: var(--campaign-table-row-height);
  }

  /* === Form Standard === */
  .campaign-form .ant-form-item-label > label {
    font-size: var(--campaign-label-size);
    font-weight: 500;
  }

  .campaign-form .ant-input,
  .campaign-form .ant-input-number,
  .campaign-form .ant-select-selector {
    border-radius: var(--campaign-btn-radius);
  }

  .campaign-form .ant-input-number {
    width: var(--campaign-input-full);
  }

  /* === Filter Bar === */
  .campaign-filter-bar {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: var(--campaign-element-gap);
    padding: 8px 12px;
  }

  .campaign-filter-bar .ant-select {
    min-width: var(--campaign-input-sm);
  }

  /* === Toolbar === */
  .campaign-toolbar {
    display: flex;
    justify-content: space-between;
    align-items: center;
    flex-wrap: wrap;
    gap: var(--campaign-element-gap);
    margin-bottom: var(--campaign-card-gap);
  }

  /* === Statistic Cards === */
  .campaign-stats-row {
    display: flex;
    gap: var(--campaign-card-gap);
    margin-bottom: var(--campaign-card-gap);
  }

  .campaign-stats-row .ant-statistic-title {
    font-size: var(--campaign-caption-size);
  }

  .campaign-stats-row .ant-statistic-content {
    font-size: var(--campaign-title-size);
  }

  /* === Tabs === */
  .campaign-tabs .ant-tabs-tab {
    font-size: var(--campaign-body-size);
    padding: 8px 16px;
  }

  /* === Tag === */
  .campaign-tag {
    font-size: var(--campaign-caption-size);
    line-height: 18px;
  }

  /* === Modal === */
  .campaign-modal .ant-modal-header {
    padding: 16px 24px;
  }

  .campaign-modal .ant-modal-title {
    font-size: var(--campaign-subtitle-size);
    font-weight: var(--campaign-subtitle-weight);
  }

  /* === Drawer === */
  .campaign-drawer .ant-drawer-header {
    padding: 16px 24px;
  }

  .campaign-drawer .ant-drawer-title {
    font-size: var(--campaign-subtitle-size);
  }

  /* === Descriptive Text === */
  .campaign-desc {
    font-size: var(--campaign-body-size);
    color: var(--campaign-text-secondary);
  }

  .campaign-caption {
    font-size: var(--campaign-caption-size);
    color: var(--campaign-text-secondary);
  }
`;

// ==================== React Hook ====================

export function useCampaignStyles() {
  return {
    // Page
    pageStyle: {
      padding: 'var(--campaign-page-padding)',
      minHeight: 'calc(100vh - 64px)',
    } as React.CSSProperties,

    // Title
    titleStyle: {
      fontSize: 'var(--campaign-title-size)',
      fontWeight: 600,
      marginBottom: 4,
      lineHeight: 1.3,
    } as React.CSSProperties,

    subtitleStyle: {
      fontSize: 'var(--campaign-body-size)',
      color: 'var(--campaign-text-secondary)',
      marginBottom: 'var(--campaign-section-gap)',
    } as React.CSSProperties,

    // Card
    cardProps: {
      size: 'small' as const,
      style: { marginBottom: 12 },
      bodyStyle: { padding: 12 },
    },

    // Table
    tableProps: {
      size: 'small' as const,
      pagination: { pageSize: 20, showSizeChanger: true, showTotal: (t: number) => `共 ${t} 条` },
      scroll: { x: 'max-content' as const },
    },

    // Filter bar
    filterBarStyle: {
      display: 'flex', alignItems: 'center', flexWrap: 'wrap' as const,
      gap: 8, padding: '8px 12px',
    } as React.CSSProperties,

    // Toolbar
    toolbarStyle: {
      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      flexWrap: 'wrap' as const, gap: 8, marginBottom: 12,
    } as React.CSSProperties,

    // Input widths
    inputSm: { width: 120 },
    inputMd: { width: 200 },
    inputLg: { width: 320 },

    // Standard column widths
    colId: { width: 80, ellipsis: true },
    colName: { width: 200, ellipsis: true },
    colDate: { width: 160, ellipsis: true },
    colStatus: { width: 100, ellipsis: true },
    colAction: { width: 120, ellipsis: true },
    colNumber: { width: 100, ellipsis: true },
  };
}

// ==================== Standard Page Template ====================

/**
 * Campaign 标准页面模板
 *
 * 固定布局规则：
 * ┌──────────────────────────────────────────────────┐
 * │  ← 4px 顶部间距（紧贴导航栏）                      │
 * │                                                   │
 * │  标题(h4,24px) [状态Tag]           [返回] <- 右    │
 * │  (描述隐藏，鼠标悬停标题时弹出tooltip)              │
 * │                                                   │
 * │  ┌─ 卡片 ──────────────────────────────────────┐  │
 * │  │  [Tab1] [Tab2] [Tab3]                       │  │
 * │  │                              [新建按钮] ->右  │  │
 * │  │  ┌─ 表格 ────────────────────────────────┐  │  │
 * │  │  │ 列头(13px,bold) 列头 列头 列头 ...    │  │  │
 * │  │  │ 数据(14px)  nowrap+ellipsis           │  │  │
 * │  │  └──────────────────────────────────────┘  │  │
 * │  └────────────────────────────────────────────┘  │
 * │                                                   │
 * │  ← 24px 左右边距 →                                │
 * └──────────────────────────────────────────────────┘
 *
 * 标题: 24px bold, 主视觉焦点
 * 返回: 页面右侧, type="text"
 * 描述: 隐藏, 鼠标悬停标题时弹出白底圆角tooltip
 * 卡片: 间距12px, 内边距12px
 * 表格: 14px, nowrap+ellipsis, 表头13px bold
 * 操作按钮: 表格右上方
 */
export const CampaignPageLayout: React.FC<{
  title: string;
  subtitle?: string;
  toolbar?: React.ReactNode;
  filterBar?: React.ReactNode;
  stats?: React.ReactNode;
  children: React.ReactNode;
}> = ({ title, subtitle, toolbar, filterBar, stats, children }) => {
  return (
    <div className="campaign-page">
      <h4 className="campaign-page-title">{title}</h4>
      {subtitle && <p className="campaign-page-subtitle">{subtitle}</p>}
      {stats && <div>{stats}</div>}
      {toolbar && <div className="campaign-toolbar">{toolbar}</div>}
      {filterBar && <div className="campaign-filter-bar">{filterBar}</div>}
      {children}
    </div>
  );
};

// ==================== Standard Card Component ====================

export const CampaignCard: React.FC<{
  title?: string;
  children: React.ReactNode;
  style?: React.CSSProperties;
  bodyStyle?: React.CSSProperties;
}> = ({ title, children, style, bodyStyle }) => {
  return (
    <div className="campaign-card" style={{
      background: '#fff', borderRadius: 'var(--campaign-card-radius)',
      boxShadow: 'var(--campaign-card-shadow)', marginBottom: 'var(--campaign-card-gap)',
      ...style,
    }}>
      {title && (
        <div style={{
          padding: '10px 16px', borderBottom: '1px solid var(--campaign-border)',
          fontSize: 'var(--campaign-subtitle-size)', fontWeight: 'var(--campaign-subtitle-weight)',
        }}>{title}</div>
      )}
      <div style={{ padding: 12, ...bodyStyle }}>{children}</div>
    </div>
  );
};

// ==================== Description Tooltip ====================

/**
 * 标题悬停提示组件
 * 用法: <TitleWithDesc title="标题" desc="描述文字" />
 */
export const TitleWithDesc: React.FC<{
  title: string;
  desc?: string;
  tag?: React.ReactNode;
}> = ({ title, desc, tag }) => {
  const [show, setShow] = React.useState(false);
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, position: 'relative', marginBottom: 12 }}
      onMouseEnter={() => desc && setShow(true)}
      onMouseLeave={() => setShow(false)}>
      <h4 className="campaign-page-title" style={{
        fontSize: 'var(--campaign-title-size)', fontWeight: 600,
        margin: 0, lineHeight: 1.3, cursor: desc ? 'help' : 'default',
      }}>{title}</h4>
      {tag}
      {desc && show && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, marginTop: 10,
          background: '#fff', borderRadius: 8,
          padding: '10px 14px',
          boxShadow: '0 6px 20px rgba(0,0,0,0.10), 0 1px 4px rgba(0,0,0,0.06)',
          zIndex: 1000, maxWidth: 340,
          fontSize: 13, color: '#555', lineHeight: 1.6,
          border: '1px solid #e8e8e8',
        }}>
          <div style={{
            position: 'absolute', top: -5, left: 20,
            width: 10, height: 10,
            background: '#fff', borderLeft: '1px solid #e8e8e8', borderTop: '1px solid #e8e8e8',
            transform: 'rotate(45deg)',
          }} />
          {desc}
        </div>
      )}
    </div>
  );
};