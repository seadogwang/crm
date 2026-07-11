import React, { useState, useEffect } from 'react';
import { Card, Table, Input, Button, Select, InputNumber, message, Spin, Space, Collapse, Tag, Descriptions } from 'antd';
import { PlusOutlined, SaveOutlined, FunctionOutlined, PlayCircleOutlined, ReloadOutlined } from '@ant-design/icons';
import { useAppStore } from '../store';
import {
  getVariables, createVariable, updateVariable as updateVariableApi, deleteVariable,
  getAvailablePointTypes, validateExpression, calculateVariable,
  type RuleVariableDefinition
} from '../api';

const programCode = 'PROG001';

const FUNCTIONS = [
  { key: 'sum', label: 'sum', desc: '发分累计' },
  { key: 'count', label: 'count', desc: '交易次数' },
  { key: 'balance', label: 'balance', desc: '当前余额' },
] as const;

// hover 输入框
const HoverInput: React.FC<{ value: string; onChange: (v: string) => void; w?: number; placeholder?: string }> = ({ value, onChange, w, placeholder }) => {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value || '');
  if (editing) return <Input size="small" value={draft} autoFocus style={{ width: w }} placeholder={placeholder} onChange={e => setDraft(e.target.value)} onBlur={() => { onChange(draft); setEditing(false); }} onPressEnter={() => { onChange(draft); setEditing(false); }} />;
  return <span style={{ cursor: 'pointer', padding: '4px 8px', borderRadius: 4, display: 'inline-block', width: w, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', border: '1px solid transparent' }} onMouseEnter={e => { e.currentTarget.style.background = '#f5f5f5'; e.currentTarget.style.borderColor = '#d9d9d9'; }} onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.borderColor = 'transparent'; }} onClick={() => { setDraft(value || ''); setEditing(true); }}>{value || <span style={{ color: '#ccc' }}>{placeholder || '-'}</span>}</span>;
};

// hover 下拉选择
const HoverSelect: React.FC<{ value: string; options: { label: string; value: string }[]; onChange: (v: string) => void; w?: number }> = ({ value, options, onChange, w }) => {
  const [editing, setEditing] = useState(false);
  const label = options.find(o => o.value === value)?.label || value || '-';
  if (editing) return <Select size="small" value={value || undefined} autoFocus style={{ width: w }} onChange={v => { onChange(v); setEditing(false); }} onBlur={() => setEditing(false)} options={options} />;
  return <span style={{ cursor: 'pointer', padding: '4px 8px', borderRadius: 4, display: 'inline-block', width: w, border: '1px solid transparent', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} onMouseEnter={e => { e.currentTarget.style.background = '#f5f5f5'; e.currentTarget.style.borderColor = '#d9d9d9'; }} onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.borderColor = 'transparent'; }} onClick={() => setEditing(true)}>{label}</span>;
};

// 表达式编辑器（hover 显示 textarea）
const HoverExpression: React.FC<{ value: string; onChange: (v: string) => void; w?: number }> = ({ value, onChange, w }) => {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value || '');
  if (editing) return <Input.TextArea size="small" value={draft} autoFocus style={{ width: w || 260, fontFamily: 'monospace', fontSize: 12 }} rows={2} onChange={e => setDraft(e.target.value)} onBlur={() => { onChange(draft); setEditing(false); }} />;
  return <span style={{ cursor: 'pointer', padding: '4px 8px', borderRadius: 4, display: 'inline-block', width: w || 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', border: '1px solid transparent', fontFamily: 'monospace', fontSize: 12 }} onMouseEnter={e => { e.currentTarget.style.background = '#f5f5f5'; e.currentTarget.style.borderColor = '#d9d9d9'; }} onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.borderColor = 'transparent'; }} onClick={() => { setDraft(value || ''); setEditing(true); }}>{value || <span style={{ color: '#ccc' }}>点击编辑表达式</span>}</span>;
};

const VariableManagement: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [variables, setVariables] = useState<RuleVariableDefinition[]>([]);
  const [originalVars, setOriginalVars] = useState<RuleVariableDefinition[]>([]);
  const [availableTypes, setAvailableTypes] = useState<{ typeCode: string; typeName: string }[]>([]);

  // 预览计算
  const [previewMemberId, setPreviewMemberId] = useState<number | null>(null);
  const [previewVarCode, setPreviewVarCode] = useState<string>('');
  const [previewResult, setPreviewResult] = useState<{ value: number; details: Record<string, number> } | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  const loadData = async () => {
    setLoading(true);
    try {
      const [vars, types] = await Promise.all([
        getVariables(programCode),
        getAvailablePointTypes(programCode),
      ]);
      const safeVars = (vars || []).map((v: any) => ({
        ...v,
        varCode: v.varCode || '',
        varName: v.varName || '',
        varType: v.varType || 'DECIMAL',
        expression: v.expression || '',
        description: v.description || '',
      }));
      setVariables(safeVars);
      setOriginalVars(JSON.parse(JSON.stringify(safeVars)));
      setAvailableTypes(types || []);
    } catch (e) {
      message.error('加载变量列表失败');
      setVariables([]);
      setOriginalVars([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadData(); }, []);

  const updateField = (idx: number, field: string, value: any) => {
    setVariables(prev => prev.map((v, i) => i !== idx ? v : { ...v, [field]: value }));
  };

  const handleSave = async () => {
    const emptyCode = variables.find(v => !v.varCode || v.varCode.trim() === '');
    if (emptyCode) { message.warning('请填写所有变量的编码后再保存'); return; }
    const emptyExpr = variables.find(v => !v.expression || v.expression.trim() === '');
    if (emptyExpr) { message.warning('请填写所有变量的表达式后再保存'); return; }

    setSaving(true);
    try {
      for (const v of variables) {
        const original = originalVars.find(o => o.varCode === v.varCode);
        if (!original) {
          await createVariable({ ...v, programCode });
        } else {
          await updateVariableApi(v.varCode, programCode, { ...v, programCode });
        }
      }
      for (const orig of originalVars) {
        if (!variables.find(v => v.varCode === orig.varCode)) {
          try { await deleteVariable(orig.varCode, programCode); } catch {}
        }
      }
      message.success('变量已保存');
      await loadData();
    } catch (e: any) {
      message.error(e?.response?.data?.message || '保存失败');
      try { await loadData(); } catch {}
    } finally {
      setSaving(false);
    }
  };

  const handlePreview = async () => {
    if (!previewMemberId || !previewVarCode) {
      message.warning('请输入测试会员 ID 并选择变量');
      return;
    }
    setPreviewLoading(true);
    try {
      const result = await calculateVariable(programCode, previewVarCode, previewMemberId);
      setPreviewResult({ value: result.value, details: result.details });
    } catch (e: any) {
      message.error(e?.response?.data?.message || '计算失败');
    } finally {
      setPreviewLoading(false);
    }
  };

  // 插入函数到指定行的表达式
  const insertFunction = (idx: number, funcName: string) => {
    const current = variables[idx]?.expression || '';
    updateField(idx, 'expression', current + `${funcName}('')`);
  };
  const insertType = (idx: number, typeCode: string) => {
    let current = variables[idx]?.expression || '';
    const lastEmpty = current.lastIndexOf("''");
    if (lastEmpty >= 0) {
      current = current.substring(0, lastEmpty + 1) + typeCode + current.substring(lastEmpty + 2);
    } else {
      current += `sum('${typeCode}')`;
    }
    updateField(idx, 'expression', current);
  };

  // 扩展行渲染
  const expandedRowRender = (record: RuleVariableDefinition, idx: number) => (
    <div style={{ padding: '8px 0' }}>
      <Space size={4} wrap>
        <span style={{ fontSize: 12, color: '#888' }}>函数:</span>
        {FUNCTIONS.map(f => (
          <Button key={f.key} size="small" icon={<FunctionOutlined />}
            onClick={() => insertFunction(idx, f.key)} title={f.desc}>{f.label}</Button>
        ))}
        <span style={{ fontSize: 12, color: '#888', margin: '0 4px' }}>|</span>
        <span style={{ fontSize: 12, color: '#888' }}>类型:</span>
        {availableTypes.map(t => (
          <Button key={t.typeCode} size="small"
            onClick={() => insertType(idx, t.typeCode)} title={t.typeName}>{t.typeCode}</Button>
        ))}
        {availableTypes.length === 0 && <span style={{ fontSize: 12, color: '#ccc' }}>暂无积分类型</span>}
      </Space>
    </div>
  );

  const columns = [
    {
      title: '变量编码', dataIndex: 'varCode', width: 130,
      render: (v: string, _: any, idx: number) => (
        <HoverInput value={v || ''} onChange={val => updateField(idx, 'varCode', val)} w={110} placeholder="如 total_act" />
      ),
    },
    {
      title: '名称', dataIndex: 'varName', width: 120,
      render: (v: string, _: any, idx: number) => (
        <HoverInput value={v || ''} onChange={val => updateField(idx, 'varName', val)} w={100} placeholder="如 活动总积分" />
      ),
    },
    {
      title: '类型', dataIndex: 'varType', width: 90,
      render: (v: string, _: any, idx: number) => (
        <HoverSelect value={v || 'DECIMAL'} onChange={val => updateField(idx, 'varType', val)} w={80}
          options={[
            { label: 'DECIMAL', value: 'DECIMAL' },
            { label: 'INTEGER', value: 'INTEGER' },
            { label: 'BOOLEAN', value: 'BOOLEAN' },
          ]} />
      ),
    },
    {
      title: '表达式', dataIndex: 'expression', width: 280,
      render: (v: string, _: any, idx: number) => (
        <HoverExpression value={v || ''} onChange={val => updateField(idx, 'expression', val)} w={260} />
      ),
    },
    {
      title: '描述', dataIndex: 'description', width: 150,
      render: (v: string, _: any, idx: number) => (
        <HoverInput value={v || ''} onChange={val => updateField(idx, 'description', val)} w={130} placeholder="变量说明" />
      ),
    },
    {
      title: '', width: 36,
      render: (_: any, __: any, idx: number) => (
        <span style={{ cursor: 'pointer', display: 'inline-flex', alignItems: 'center' }}
          onClick={() => setVariables(prev => prev.filter((_, i) => i !== idx))}>
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
            <circle cx="10" cy="10" r="9" stroke="#1a1a1a" strokeWidth="1.5" fill="white" />
            <path d="M6.5 6.5L13.5 13.5M13.5 6.5L6.5 13.5" stroke="#1a1a1a" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </span>
      ),
    },
  ];

  return (
    <Card
      title="变量管理"
      extra={
        <Space>
          <Button icon={<ReloadOutlined />} onClick={loadData}>刷新</Button>
          <Button type="primary" icon={<SaveOutlined />} onClick={handleSave} loading={saving}>保存</Button>
        </Space>
      }
    >
      <style>{`.ant-input:focus, .ant-input-number:focus, .ant-input-focused, .ant-input-number-focused { box-shadow: none !important; border-color: #d9d9d9 !important; } .ant-select-focused .ant-select-selector { box-shadow: none !important; border-color: #d9d9d9 !important; }`}</style>

      {/* 预览计算 */}
      <Collapse size="small" ghost style={{ marginBottom: 12 }}
        items={[{
          key: 'preview', label: <span style={{ fontSize: 13 }}><PlayCircleOutlined /> 预览计算</span>,
          children: (
            <Space size={8} wrap>
              <span>会员 ID:</span>
              <InputNumber size="small" placeholder="会员 ID" value={previewMemberId} onChange={v => setPreviewMemberId(v)} style={{ width: 130 }} />
              <span>变量:</span>
              <Select size="small" placeholder="选择变量" value={previewVarCode || undefined} style={{ width: 180 }}
                options={variables.filter(v => v.varCode).map(v => ({ label: `${v.varName} (${v.varCode})`, value: v.varCode }))}
                onChange={v => setPreviewVarCode(v)} />
              <Button size="small" icon={<PlayCircleOutlined />} onClick={handlePreview} loading={previewLoading}>计算</Button>
              {previewResult && (
                <span>
                  <Tag color="blue">结果: <strong>{previewResult.value}</strong></Tag>
                  {Object.entries(previewResult.details).map(([k, v]) => (
                    <Tag key={k} style={{ fontSize: 11 }}>{k}: {v}</Tag>
                  ))}
                </span>
              )}
            </Space>
          ),
        }]}
      />

      {loading ? <Spin /> : (
        <Table
          dataSource={variables}
          columns={columns}
          rowKey={(_, idx) => String(idx)}
          pagination={false}
          size="small"
          scroll={{ x: 900 }}
          expandable={{
            expandedRowRender: (record, idx) => expandedRowRender(record, idx),
            rowExpandable: () => true,
            expandIcon: ({ expanded, onExpand, record }) => (
              <span style={{ cursor: 'pointer', padding: '0 4px', fontSize: 12, color: '#1677ff' }}
                onClick={e => onExpand(record, e)}>
                {expanded ? '▼ 收起' : '▶ 辅助'}
              </span>
            ),
          }}
          footer={() => (
            <Button size="small" type="text" icon={<PlusOutlined />} block
              onClick={() => setVariables(prev => [...prev, {
                programCode, varCode: '', varName: '新变量',
                varType: 'DECIMAL', expression: '', description: '',
              } as RuleVariableDefinition])}
            >添加变量</Button>
          )}
        />
      )}
    </Card>
  );
};

export default VariableManagement;