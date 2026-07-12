import React, { useState, useEffect } from 'react';
import { Select, Input, Radio, InputNumber, Cascader } from 'antd';
import api from '../api';

interface DynamicFieldProps {
  fieldKey: string; fieldDef: any; value: any;
  onChange: (key: string, value: any) => void;
  programCode?: string; mode?: 'edit' | 'view';
  formValues?: Record<string, any>;
}

const DynamicField: React.FC<DynamicFieldProps> = ({
  fieldKey, fieldDef, value, onChange, programCode = 'PROG001', mode = 'edit', formValues,
}) => {
  const masterData = fieldDef?.['x-master-data'];
  const [options, setOptions] = useState<{ label: string; value: string }[]>([]);
  const [cascadeOptions, setCascadeOptions] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!masterData?.dataCode) return;
    setLoading(true);
    if (masterData.dataType === 'HIERARCHY') {
      loadCascadeTree(masterData.dataCode);
    } else {
      api.get(`/master-data/${masterData.dataCode}/options`)
        .then(({ data }: any) => setOptions((data?.data || []).map((o: any) => ({ label: o.label || o.enum_label || o.code, value: o.code || o.enum_code }))))
        .catch(() => setOptions([])).finally(() => setLoading(false));
    }
  }, [masterData?.dataCode]);

  const loadCascadeTree = async (dataCode: string) => {
    const tree: any[] = [];
    try {
      const { data: l1 } = await api.get('/master-data/hierarchy/options', { params: { dataCode, level: 1 } });
      for (const o1 of (l1?.data?.options || [])) {
        const node: any = { label: o1.label, value: o1.code, children: [] };
        try {
          const { data: l2 } = await api.get('/master-data/hierarchy/options', { params: { dataCode, level: 2, parentCode: o1.code } });
          for (const o2 of (l2?.data?.options || [])) {
            const child: any = { label: o2.label, value: o2.code, children: [] };
            try {
              const { data: l3 } = await api.get('/master-data/hierarchy/options', { params: { dataCode, level: 3, parentCode: o2.code } });
              child.children = (l3?.data?.options || []).map((o3: any) => ({ label: o3.label, value: o3.code }));
            } catch {}
            node.children.push(child);
          }
        } catch {}
        tree.push(node);
      }
    } catch {}
    setCascadeOptions(tree);
    setLoading(false);
  };

  if (mode === 'view') {
    if (masterData) {
      const label = options.find(o => o.value === value)?.label || value;
      return <span>{label || '—'}</span>;
    }
    return <span>{value != null ? String(value) : '—'}</span>;
  }

  if (masterData?.dataType === 'HIERARCHY') {
    if (masterData.component === 'cascade-select') {
      return <Cascader size="small" style={{ width: '100%' }} value={value ? [value] : undefined}
        options={cascadeOptions} placeholder="请选择" changeOnSelect
        onChange={v => onChange(fieldKey, v ? v[v.length - 1] : undefined)} />;
    }
    const parentField = masterData.parentField;
    const parentValue = parentField && formValues ? formValues[parentField] : undefined;
    return <Select size="small" style={{ width: '100%' }} value={value || undefined}
      loading={loading} placeholder={parentValue ? '请选择' : '请先选择上级'}
      disabled={!parentValue && !!parentField}
      options={options} onChange={v => onChange(fieldKey, v)} showSearch optionFilterProp="label" />;
  }

  if (masterData) {
    const v = value != null ? String(value) : undefined;
    if (masterData.component === 'radio') {
      return <Radio.Group size="small" value={v} onChange={e => onChange(fieldKey, e.target.value)}>
        {options.map(o => <Radio key={o.value} value={o.value}>{o.label}</Radio>)}</Radio.Group>;
    }
    return <Select size="small" value={v} style={{ width: '100%' }} loading={loading}
      placeholder="请选择" options={options} onChange={v => onChange(fieldKey, v)}
      allowClear showSearch optionFilterProp="label" />;
  }

  const type = fieldDef?.type || 'string';
  if (type === 'number') return <InputNumber size="small" style={{ width: '100%' }} value={value != null ? Number(value) : undefined} onChange={v => onChange(fieldKey, v)} />;
  if (type === 'boolean') return <Select size="small" style={{ width: '100%' }} value={value != null ? String(value) : undefined} onChange={v => onChange(fieldKey, v)} options={[{ label: '是', value: 'true' }, { label: '否', value: 'false' }]} />;
  return <Input size="small" value={value != null ? String(value) : ''} onChange={e => onChange(fieldKey, e.target.value)} />;
};

export default DynamicField;