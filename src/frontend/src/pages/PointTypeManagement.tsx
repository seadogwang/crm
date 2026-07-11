import React, { useState, useEffect } from 'react';
import { Card, Table, Input, Button, Switch, Select, InputNumber, message, Spin, Tag } from 'antd';
import { PlusOutlined, SaveOutlined } from '@ant-design/icons';
import { useAppStore } from '../store';
import { getPointTypes, createPointType, updatePointType as updatePointTypeApi, deletePointType, type PointTypeDefinition } from '../api';

const CATEGORY_OPTIONS = [
  { label: '资产型 (ASSET)', value: 'ASSET' },
  { label: '贡献型 (CONTRIBUTION)', value: 'CONTRIBUTION' },
  { label: '记录型 (RECORD)', value: 'RECORD' },
];

const categoryDefaults: Record<string, Partial<PointTypeDefinition>> = {
  ASSET: { isRedeemable: true, isTierCalc: false, expiryMode: 'CALENDAR_YEARS', expiryValue: 1 },
  CONTRIBUTION: { isRedeemable: false, isTierCalc: true, expiryMode: 'FIXED_DAYS', expiryValue: 0 },
  RECORD: { isRedeemable: false, isTierCalc: false, expiryMode: 'FIXED_DAYS', expiryValue: 0 },
};

// hover 输入框
const HoverInput: React.FC<{ value: string; onChange: (v: string) => void; w?: number }> = ({ value, onChange, w }) => {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value || '');
  if (editing) return <Input size="small" value={draft} autoFocus style={{ width: w }} onChange={e => setDraft(e.target.value)} onBlur={() => { onChange(draft); setEditing(false); }} onPressEnter={() => { onChange(draft); setEditing(false); }} />;
  return <span style={{ cursor: 'pointer', padding: '4px 8px', borderRadius: 4, display: 'inline-block', width: w, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', border: '1px solid transparent' }} onMouseEnter={e => { e.currentTarget.style.background = '#f5f5f5'; e.currentTarget.style.borderColor = '#d9d9d9'; }} onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.borderColor = 'transparent'; }} onClick={() => { setDraft(value || ''); setEditing(true); }}>{value || <span style={{ color: '#ccc' }}>-</span>}</span>;
};

// hover 数字输入框
const HoverNumber: React.FC<{ value: number; onChange: (v: number) => void; w?: number }> = ({ value, onChange, w }) => {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value ?? 0);
  if (editing) return <InputNumber size="small" value={draft} autoFocus style={{ width: w }} onChange={v => setDraft(v ?? 0)} onBlur={() => { onChange(draft); setEditing(false); }} onPressEnter={() => { onChange(draft); setEditing(false); }} />;
  return <span style={{ cursor: 'pointer', padding: '4px 8px', borderRadius: 4, display: 'inline-block', width: w, border: '1px solid transparent' }} onMouseEnter={e => { e.currentTarget.style.background = '#f5f5f5'; e.currentTarget.style.borderColor = '#d9d9d9'; }} onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.borderColor = 'transparent'; }} onClick={() => { setDraft(value ?? 0); setEditing(true); }}>{value ?? 0}</span>;
};

// hover 下拉选择
const HoverSelect: React.FC<{ value: string; options: { label: string; value: string }[]; onChange: (v: string) => void; w?: number }> = ({ value, options, onChange, w }) => {
  const [editing, setEditing] = useState(false);
  const label = options.find(o => o.value === value)?.label || value || '-';
  if (editing) return <Select size="small" value={value || undefined} autoFocus style={{ width: w }} onChange={v => { onChange(v); setEditing(false); }} onBlur={() => setEditing(false)} options={options} />;
  return <span style={{ cursor: 'pointer', padding: '4px 8px', borderRadius: 4, display: 'inline-block', width: w, border: '1px solid transparent', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} onMouseEnter={e => { e.currentTarget.style.background = '#f5f5f5'; e.currentTarget.style.borderColor = '#d9d9d9'; }} onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.borderColor = 'transparent'; }} onClick={() => setEditing(true)}>{label}</span>;
};

const programCode = 'PROG001';

const PointTypeManagement: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [pointTypes, setPointTypes] = useState<PointTypeDefinition[]>([]);
  const [originalTypes, setOriginalTypes] = useState<PointTypeDefinition[]>([]);

  const loadData = async () => {
    setLoading(true);
    try {
      const data = await getPointTypes(programCode);
      const safeData = (data || []).map((pt: any) => ({
        ...pt,
        typeCode: pt.typeCode || '',
        typeName: pt.typeName || '',
        pointCategory: pt.pointCategory || 'ASSET',
        isRedeemable: pt.isRedeemable ?? true,
        isTierCalc: pt.isTierCalc ?? false,
        isTransferable: pt.isTransferable ?? false,
        allowNegative: pt.allowNegative ?? false,
        allowRepay: pt.allowRepay ?? false,
        expiryMode: pt.expiryMode || 'FIXED_DAYS',
        expiryValue: pt.expiryValue ?? 0,
        isVisible: pt.isVisible ?? true,
        sortOrder: pt.sortOrder ?? 0,
      }));
      setPointTypes(safeData);
      setOriginalTypes(JSON.parse(JSON.stringify(safeData)));
    } catch (e) {
      message.error('加载积分类型失败');
      setPointTypes([]);
      setOriginalTypes([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadData(); }, []);

  const updateField = (idx: number, field: string, value: any) => {
    setPointTypes(prev => prev.map((pt, i) => {
      if (i !== idx) return pt;
      const updated = { ...pt, [field]: value };
      if (field === 'pointCategory') {
        const defaults = categoryDefaults[value];
        if (defaults) Object.assign(updated, defaults);
      }
      if (field === 'isTierCalc' && value === true) {
        updated.expiryMode = 'NONE';
        updated.expiryValue = 0;
      }
      return updated;
    }));
  };

  const handleSave = async () => {
    const emptyCode = pointTypes.find(pt => !pt.typeCode || pt.typeCode.trim() === '');
    if (emptyCode) {
      message.warning('请填写所有积分类型的编码后再保存');
      return;
    }
    setSaving(true);
    try {
      for (const pt of pointTypes) {
        const original = originalTypes.find(o => o.typeCode === pt.typeCode);
        if (!original) {
          await createPointType({ ...pt, programCode });
        } else {
          await updatePointTypeApi(pt.typeCode, programCode, { ...pt, programCode });
        }
      }
      for (const orig of originalTypes) {
        if (!pointTypes.find(p => p.typeCode === orig.typeCode)) {
          try { await deletePointType(orig.typeCode, programCode); } catch { /* 可能被引用 */ }
        }
      }
      message.success('积分类型已保存');
      await loadData();
    } catch (e: any) {
      message.error(e?.response?.data?.message || '保存失败');
      // 保存失败时刷新数据以恢复状态
      try { await loadData(); } catch {}
    } finally {
      setSaving(false);
    }
  };

  const columns = [
    {
      title: '类型编码', dataIndex: 'typeCode', width: 130,
      render: (v: string, _: any, idx: number) => (
        <HoverInput value={v || ''} onChange={val => updateField(idx, 'typeCode', val)} w={110} />
      ),
    },
    {
      title: '名称', dataIndex: 'typeName', width: 110,
      render: (v: string, _: any, idx: number) => (
        <HoverInput value={v || ''} onChange={val => updateField(idx, 'typeName', val)} w={90} />
      ),
    },
    {
      title: '分类', dataIndex: 'pointCategory', width: 190,
      render: (v: string, _: any, idx: number) => (
        <HoverSelect value={v || 'ASSET'} onChange={val => updateField(idx, 'pointCategory', val)} w={180} options={CATEGORY_OPTIONS} />
      ),
    },
    {
      title: '可兑换', dataIndex: 'isRedeemable', width: 60,
      render: (v: boolean, _: any, idx: number) => (
        <Switch size="small" checked={!!v} onChange={c => updateField(idx, 'isRedeemable', c)} />
      ),
    },
    {
      title: '算等级', dataIndex: 'isTierCalc', width: 60,
      render: (v: boolean, _: any, idx: number) => (
        <Switch size="small" checked={!!v} onChange={c => updateField(idx, 'isTierCalc', c)} />
      ),
    },
    {
      title: '允许负分', dataIndex: 'allowNegative', width: 70,
      render: (v: boolean, _: any, idx: number) => (
        <Switch size="small" checked={!!v} onChange={c => updateField(idx, 'allowNegative', c)} />
      ),
    },
    {
      title: '可冲抵', dataIndex: 'allowRepay', width: 60,
      render: (v: boolean, _: any, idx: number) => (
        <Switch size="small" checked={!!v} onChange={c => updateField(idx, 'allowRepay', c)} />
      ),
    },
    {
      title: '过期模式', dataIndex: 'expiryMode', width: 100,
      render: (v: string, r: PointTypeDefinition, idx: number) => (
        r.isTierCalc ? <span style={{ color: '#ccc', padding: '4px 8px' }}>-</span> :
        <HoverSelect value={v || 'FIXED_DAYS'} onChange={val => updateField(idx, 'expiryMode', val)} w={90}
          options={[
            { label: '固定天数', value: 'FIXED_DAYS' },
            { label: '自然月', value: 'CALENDAR_MONTHS' },
            { label: '自然年', value: 'CALENDAR_YEARS' },
            { label: '永不过期', value: 'NONE' },
          ]} />
      ),
    },
    {
      title: '过期值', dataIndex: 'expiryValue', width: 65,
      render: (v: number, r: PointTypeDefinition, idx: number) => (
        r.isTierCalc ? <span style={{ color: '#ccc', padding: '4px 8px' }}>-</span> :
        <HoverNumber value={v ?? 0} onChange={val => updateField(idx, 'expiryValue', val)} w={50} />
      ),
    },
    {
      title: '可见', dataIndex: 'isVisible', width: 50,
      render: (v: boolean, _: any, idx: number) => (
        <Switch size="small" checked={v !== false} onChange={c => updateField(idx, 'isVisible', c)} />
      ),
    },
    {
      title: '', width: 36,
      render: (_: any, __: any, idx: number) => (
        <span style={{ cursor: 'pointer', display: 'inline-flex', alignItems: 'center' }}
          onClick={() => setPointTypes(prev => prev.filter((_, i) => i !== idx))}>
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
      title="积分类型配置"
      extra={<Button type="primary" icon={<SaveOutlined />} onClick={handleSave} loading={saving}>保存</Button>}
    >
      <style>{`.ant-input:focus, .ant-input-number:focus, .ant-input-focused, .ant-input-number-focused { box-shadow: none !important; border-color: #d9d9d9 !important; } .ant-select-focused .ant-select-selector { box-shadow: none !important; border-color: #d9d9d9 !important; }`}</style>
      {loading ? <Spin /> : (
        <Table
          dataSource={pointTypes}
          columns={columns}
          rowKey={(_, idx) => String(idx)}
          pagination={false}
          size="small"
          scroll={{ x: 1100 }}
          footer={() => (
            <Button size="small" type="text" icon={<PlusOutlined />} block
              onClick={() => setPointTypes(prev => [...prev, {
                programCode, typeCode: '', typeName: '新积分类型',
                pointCategory: 'ASSET', isRedeemable: true, isTierCalc: false,
                isTransferable: false, allowNegative: false, allowRepay: false,
                expiryMode: 'CALENDAR_YEARS', expiryValue: 1, isVisible: true, sortOrder: prev.length,
              } as PointTypeDefinition])}
            >添加积分类型</Button>
          )}
        />
      )}
    </Card>
  );
};

export default PointTypeManagement;