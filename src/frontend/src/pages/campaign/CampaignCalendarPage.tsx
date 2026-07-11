import React, { useState, useCallback, useMemo } from 'react';
import { Card, Table, Tag, Button, Space, Row, Col, Select, Input, Modal, Descriptions, message } from 'antd';
import { ReloadOutlined, CalendarOutlined, WarningOutlined, SearchOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import {
  getCalendarData, getCalendarConflicts, triggerConflictDetection, resolveConflict,
  type CalendarData, type CalendarDay, type ConflictRecordEntity,
} from '../../api/campaign';
import { useCampaignStyles } from './styles/campaign-ui-standard';

const CONFLICT_SEVERITY: Record<string, { color: string; label: string }> = {
  CRITICAL: { color: 'red', label: '🔴 严重' },
  WARNING: { color: 'orange', label: '🟡 警告' },
  INFO: { color: 'blue', label: '🔵 信息' },
};

const CONFLICT_TYPE: Record<string, string> = {
  AUDIENCE_OVERLAP: '受众重叠',
  CHANNEL_CAPACITY: '渠道超载',
  EVENT_FLOOD: '事件洪峰',
};

const STATUS_COLOR: Record<string, string> = {
  RUNNING: 'green', SCHEDULED: 'blue', DRAFT: 'default', COMPLETED: 'default',
};

const CampaignCalendarPage: React.FC = () => {
  const styles = useCampaignStyles();
  const [workspaceId, setWorkspaceId] = useState('');
  const [year, setYear] = useState(2026);
  const [month, setMonth] = useState(6);
  const [data, setData] = useState<CalendarData | null>(null);
  const [selectedDay, setSelectedDay] = useState<CalendarDay | null>(null);
  const [loading, setLoading] = useState(false);

  const loadData = useCallback(async () => {
    if (!workspaceId.trim()) return;
    setLoading(true);
    try {
      const d = await getCalendarData(workspaceId.trim(), year, month);
      setData(d);
    } catch { message.error('加载失败'); }
    finally { setLoading(false); }
  }, [workspaceId, year, month]);

  const handleDetect = async () => {
    if (!workspaceId.trim()) return;
    try {
      await triggerConflictDetection(workspaceId.trim());
      message.success('检测完成');
      loadData();
    } catch { message.error('检测失败'); }
  };

  const handleResolve = async (conflictId: string, action: string) => {
    try {
      await resolveConflict(conflictId, action);
      message.success('已处理');
      loadData();
    } catch { message.error('操作失败'); }
  };

  const selectedConflicts = data && selectedDay
    ? data.days.filter(d => d.date === selectedDay.date).flatMap(d => d.conflicts)
    : [];

  // Month names
  const months = ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月'];

  // Build calendar grid
  const daysInMonth = new Date(year, month, 0).getDate();
  const firstDow = new Date(year, month - 1, 1).getDay();
  const calendarCells = useMemo(() => {
    const cells: (CalendarDay | null)[] = [];
    for (let i = 0; i < firstDow; i++) cells.push(null);
    for (let d = 1; d <= daysInMonth; d++) {
      const ds = String(d).padStart(2, '0');
      const ms = String(month).padStart(2, '0');
      const date = `${year}-${ms}-${ds}`;
      const day = data?.days.find(dd => dd.date === date);
      cells.push(day || { date, campaigns: [], conflicts: [] });
    }
    return cells;
  }, [data, year, month, daysInMonth, firstDow]);

  const weekDays = ['日', '一', '二', '三', '四', '五', '六'];

  return (
    <div style={styles.pageStyle}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h2 style={{ margin: 0 }}><CalendarOutlined style={{ marginRight: 8, color: '#1890ff' }} />活动日历与冲突检测</h2>
        <Space>
          <Input placeholder="Workspace ID" value={workspaceId} onChange={e => setWorkspaceId(e.target.value)}
            style={{ width: 200 }} prefix={<SearchOutlined />} />
          <Select value={year} onChange={setYear} style={{ width: 80 }}>
            {[2025, 2026, 2027].map(y => <Select.Option key={y} value={y}>{y}</Select.Option>)}
          </Select>
          <Select value={month} onChange={setMonth} style={{ width: 70 }}>
            {months.map((m, i) => <Select.Option key={i + 1} value={i + 1}>{m}</Select.Option>)}
          </Select>
          <Button onClick={loadData} loading={loading} icon={<ReloadOutlined />}>加载</Button>
          <Button onClick={handleDetect}>检测冲突</Button>
        </Space>
      </div>

      {data && (
        <Row gutter={16}>
          <Col span={16}>
            {/* Calendar Grid */}
            <Card size="small" title={`${year}年${month}月 — ${data.totalConflicts} 个活跃冲突`}>
              <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
                <thead>
                  <tr>
                    {weekDays.map(d => (
                      <th key={d} style={{ padding: 8, border: '1px solid #f0f0f0', background: '#fafafa', textAlign: 'center' }}>{d}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {Array.from({ length: Math.ceil(calendarCells.length / 7) }).map((_, row) => (
                    <tr key={row}>
                      {calendarCells.slice(row * 7, row * 7 + 7).map((cell, col) => (
                        <td key={col} style={{
                          border: '1px solid #f0f0f0', padding: 4, height: 80, verticalAlign: 'top',
                          background: cell && selectedDay?.date === cell.date ? '#e6f7ff' : undefined,
                          cursor: cell?.campaigns?.length ? 'pointer' : undefined,
                        }} onClick={() => cell && setSelectedDay(cell)}>
                          {cell && (
                            <>
                              <div style={{ fontWeight: 500, fontSize: 12, color: '#8c8c8c' }}>
                                {new Date(cell.date + 'T00:00:00').getDate()}
                              </div>
                              {cell.campaigns.slice(0, 3).map(c => (
                                <div key={c.planId} style={{ fontSize: 11, marginBottom: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                  <Tag color={c.triggerType === 'EVENT_TRIGGERED' ? 'purple' : STATUS_COLOR[c.status]}
                                    style={{ fontSize: 10, padding: '0 4px', lineHeight: '16px' }}>
                                    {c.name}
                                  </Tag>
                                </div>
                              ))}
                              {cell.conflicts.length > 0 && (
                                <Tag color="red" style={{ fontSize: 10 }} icon={<WarningOutlined />}>
                                  {cell.conflicts.length}冲突
                                </Tag>
                              )}
                              {cell.campaigns.length > 3 && (
                                <div style={{ fontSize: 10, color: '#8c8c8c' }}>+{cell.campaigns.length - 3} more</div>
                              )}
                            </>
                          )}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          </Col>

          <Col span={8}>
            {/* Selected Day Detail */}
            {selectedDay && (
              <Card size="small" title={`${selectedDay.date} 详情`}>
                {selectedDay.campaigns.length > 0 ? (
                  <>
                    <div style={{ fontWeight: 500, marginBottom: 8 }}>运行中 Campaign ({selectedDay.campaigns.length})</div>
                    {selectedDay.campaigns.map(c => (
                      <Tag key={c.planId} color={STATUS_COLOR[c.status]} style={{ marginBottom: 4 }}>
                        {c.triggerType === 'EVENT_TRIGGERED' ? '⚡' : '●'} {c.name} ({c.estimatedVolume?.toLocaleString() || '-'})
                      </Tag>
                    ))}
                  </>
                ) : <div style={{ color: '#8c8c8c' }}>当日无 Campaign</div>}

                {selectedConflicts.length > 0 && (
                  <>
                    <div style={{ fontWeight: 500, marginTop: 12, marginBottom: 8 }}>
                      <WarningOutlined style={{ color: '#fa8c16' }} /> 冲突: {selectedConflicts.length}
                    </div>
                    {selectedConflicts.map((c, i) => {
                      const s = CONFLICT_SEVERITY[c.severity] || { color: 'default', label: c.severity };
                      return (
                        <Card key={i} size="small" style={{ marginBottom: 8 }}>
                          <Tag color={s.color}>{s.label}</Tag>
                          <span style={{ fontSize: 12 }}>{c.message}</span>
                          <div style={{ marginTop: 4 }}>
                            <Button size="small" onClick={() => handleResolve(c.conflictId, 'RESOLVED')}>解决</Button>
                            <Button size="small" style={{ marginLeft: 4 }} onClick={() => handleResolve(c.conflictId, 'IGNORED')}>忽略</Button>
                          </div>
                        </Card>
                      );
                    })}
                  </>
                )}
              </Card>
            )}
          </Col>
        </Row>
      )}

      {!data && !loading && (
        <Card><div style={{ textAlign: 'center', padding: 40, color: '#8c8c8c' }}>
          <CalendarOutlined style={{ fontSize: 48 }} /><p style={{ marginTop: 16 }}>输入 Workspace ID 查看活动日历</p>
        </div></Card>
      )}
    </div>
  );
};

export default CampaignCalendarPage;
