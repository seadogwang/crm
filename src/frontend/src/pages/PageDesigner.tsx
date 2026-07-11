import React, { useState, useEffect, useCallback } from 'react';
import {
  Card, Button, Space, Typography, Select, Tag, Input, Switch,
  Empty, message, Spin, Modal, Tooltip, Divider, Drawer, Popover,
} from 'antd';
import {
  SaveOutlined, EyeOutlined, SendOutlined,
  HistoryOutlined, PlusOutlined, DeleteOutlined,
  UpOutlined, DownOutlined, AppstoreOutlined, BlockOutlined,
  FontSizeOutlined, FormOutlined, HolderOutlined, SearchOutlined,
  FileTextOutlined, NumberOutlined, CalendarOutlined, CheckSquareOutlined,
  FieldStringOutlined,
} from '@ant-design/icons';
import { useAppStore } from '../store';
import api from '../api';
import { useCampaignStyles, TitleWithDesc } from './campaign/styles/campaign-ui-standard';

const { Text, Title } = Typography;

// ==================== 类型 ====================

interface FieldDef {
  key: string;
  label: string;
  type: string;
  required: boolean;
  source: 'system' | 'extended';
}

interface LayoutField {
  id: string;
  field_key: string;
  label: string;
  component: string;
  span: number;
  required: boolean;
  readonly: boolean;
  hidden: boolean;
  placeholder?: string;
  helpText?: string;
  options?: { value: string; label: string }[];
}

interface LayoutSection {
  id: string;
  title: string;
  icon: string;
  collapsible: boolean;
  collapsed: boolean;
  columns: number;
  fields: LayoutField[];
}

interface LayoutConfig {
  version: string;
  sections: LayoutSection[];
  fieldConfigOverrides?: Record<string, any>;
}

// ==================== 常量 ====================

const MEMBER_SYSTEM_FIELDS: FieldDef[] = [
  { key: 'memberId', label: '会员ID', type: 'string', required: true, source: 'system' },
  { key: 'tierCode', label: '会员等级', type: 'string', required: true, source: 'system' },
  { key: 'status', label: '会员状态', type: 'string', required: true, source: 'system' },
  { key: 'createdAt', label: '注册时间', type: 'string', required: false, source: 'system' },
  { key: 'schemaVersion', label: 'Schema版本', type: 'string', required: false, source: 'system' },
];

const COMPONENT_TYPES = [
  { value: 'Input', label: '输入框' },
  { value: 'InputNumber', label: '数字输入' },
  { value: 'Select', label: '下拉选择' },
  { value: 'DatePicker', label: '日期选择' },
  { value: 'Text', label: '纯文本' },
  { value: 'Switch', label: '开关' },
  { value: 'Radio', label: '单选' },
  { value: 'TextArea', label: '文本域' },
];

const ENTITY_TYPES = [
  { value: 'MEMBER', label: '会员' },
  { value: 'ORDER', label: '订单' },
  { value: 'PRODUCT', label: '产品' },
];

const PAGE_TYPES = [
  { value: 'DETAIL', label: '详情页' },
  { value: 'EDIT', label: '编辑页' },
  { value: 'LIST', label: '列表页' },
];

const FIELD_TYPE_ICONS: Record<string, React.ReactNode> = {
  string: <FieldStringOutlined />,
  number: <NumberOutlined />,
  boolean: <CheckSquareOutlined />,
  DatePicker: <CalendarOutlined />,
  Input: <FormOutlined />,
  InputNumber: <NumberOutlined />,
  Select: <AppstoreOutlined />,
  Text: <FileTextOutlined />,
  Switch: <CheckSquareOutlined />,
};

// ==================== 子组件: 属性面板 (Drawer) ====================

const PropertyPanel: React.FC<{
  selectedField: LayoutField | null;
  selectedSection: LayoutSection | null;
  onFieldChange: (field: LayoutField) => void;
  onSectionChange: (section: LayoutSection) => void;
  onDeleteField: () => void;
  onDeleteSection: () => void;
}> = ({ selectedField, selectedSection, onFieldChange, onSectionChange, onDeleteField, onDeleteSection }) => {
  return (
    <div style={{ padding: '12px 16px' }}>
      {selectedField && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <Text style={{ fontSize: 12, color: '#666' }}>字段名</Text>
            <Input value={selectedField.field_key} disabled size="small" />
          </div>
          <div>
            <Text style={{ fontSize: 12, color: '#666' }}>显示标签</Text>
            <Input size="small" value={selectedField.label}
              onChange={e => onFieldChange({ ...selectedField, label: e.target.value })} />
          </div>
          <div>
            <Text style={{ fontSize: 12, color: '#666' }}>组件类型</Text>
            <Select size="small" style={{ width: '100%' }} value={selectedField.component}
              onChange={v => onFieldChange({ ...selectedField, component: v })}
              options={COMPONENT_TYPES} />
          </div>
          <div>
            <Text style={{ fontSize: 12, color: '#666' }}>占位列宽</Text>
            <Select size="small" style={{ width: '100%' }} value={selectedField.span}
              onChange={v => onFieldChange({ ...selectedField, span: v })}
              options={[1, 2, 3, 4].map(n => ({ value: n, label: `${n}列` }))} />
          </div>
          <div style={{ display: 'flex', gap: 16 }}>
            <Space><Text style={{ fontSize: 12 }}>必填</Text>
              <Switch size="small" checked={selectedField.required}
                onChange={v => onFieldChange({ ...selectedField, required: v })} /></Space>
            <Space><Text style={{ fontSize: 12 }}>只读</Text>
              <Switch size="small" checked={selectedField.readonly}
                onChange={v => onFieldChange({ ...selectedField, readonly: v })} /></Space>
          </div>
          <Space><Text style={{ fontSize: 12 }}>隐藏</Text>
            <Switch size="small" checked={selectedField.hidden}
              onChange={v => onFieldChange({ ...selectedField, hidden: v })} /></Space>
          <div>
            <Text style={{ fontSize: 12, color: '#666' }}>占位文本</Text>
            <Input size="small" value={selectedField.placeholder || ''}
              onChange={e => onFieldChange({ ...selectedField, placeholder: e.target.value })} />
          </div>
          <div>
            <Text style={{ fontSize: 12, color: '#666' }}>帮助文本</Text>
            <Input size="small" value={selectedField.helpText || ''}
              onChange={e => onFieldChange({ ...selectedField, helpText: e.target.value })} />
          </div>
          <Divider style={{ margin: '4px 0' }} />
          <Button danger size="small" icon={<DeleteOutlined />} onClick={onDeleteField}>删除字段</Button>
        </div>
      )}
      {selectedSection && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <Text style={{ fontSize: 12, color: '#666' }}>分组标题</Text>
            <Input size="small" value={selectedSection.title}
              onChange={e => onSectionChange({ ...selectedSection, title: e.target.value })} />
          </div>
          <div>
            <Text style={{ fontSize: 12, color: '#666' }}>列数</Text>
            <Select size="small" style={{ width: '100%' }} value={selectedSection.columns}
              onChange={v => onSectionChange({ ...selectedSection, columns: v })}
              options={[1, 2, 3, 4].map(n => ({ value: n, label: `${n}列` }))} />
          </div>
          <Space><Text style={{ fontSize: 12 }}>可折叠</Text>
            <Switch size="small" checked={selectedSection.collapsible}
              onChange={v => onSectionChange({ ...selectedSection, collapsible: v })} /></Space>
          <Space><Text style={{ fontSize: 12 }}>默认折叠</Text>
            <Switch size="small" checked={selectedSection.collapsed}
              onChange={v => onSectionChange({ ...selectedSection, collapsed: v })} /></Space>
          <Divider style={{ margin: '4px 0' }} />
          <Button danger size="small" icon={<DeleteOutlined />} onClick={onDeleteSection}>删除分组</Button>
        </div>
      )}
    </div>
  );
};

// ==================== 子组件: 字段选择栏 ====================

const FieldBar: React.FC<{
  fields: FieldDef[];
  search: string;
  onSearchChange: (v: string) => void;
  onClose: () => void;
}> = ({ fields, search, onSearchChange, onClose }) => {
  const filtered = search
    ? fields.filter(f => f.label.toLowerCase().includes(search.toLowerCase()) || f.key.toLowerCase().includes(search.toLowerCase()))
    : fields;

  const systemFields = filtered.filter(f => f.source === 'system');
  const extFields = filtered.filter(f => f.source === 'extended');

  return (
    <div style={{
      background: '#fff', border: '1px solid #e8e8e8', borderRadius: 8,
      marginBottom: 12, boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
    }}>
      {/* 搜索栏 */}
      <div style={{
        padding: '8px 12px', borderBottom: '1px solid #f0f0f0',
        display: 'flex', alignItems: 'center', gap: 8,
      }}>
        <Input size="small" prefix={<SearchOutlined />} placeholder="搜索字段..."
          value={search} onChange={e => onSearchChange(e.target.value)}
          allowClear style={{ width: 200 }} />
        <Text type="secondary" style={{ fontSize: 12 }}>
          共 {fields.length} 个字段，拖拽到下方分组即可添加
        </Text>
        <div style={{ flex: 1 }} />
        <Button size="small" type="text" onClick={onClose}>收起 ✕</Button>
      </div>

      {/* 字段列表 — 多列 flex wrap */}
      <div style={{ padding: '8px 12px', maxHeight: 180, overflow: 'auto' }}>
        {systemFields.length > 0 && (
          <div style={{ marginBottom: 4 }}>
            <Text style={{ fontSize: 11, color: '#999' }}>系统字段</Text>
          </div>
        )}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
          {systemFields.map(f => (
            <FieldChip key={f.key} field={f} />
          ))}
        </div>
        {extFields.length > 0 && (
          <div style={{ marginBottom: 4 }}>
            <Text style={{ fontSize: 11, color: '#999' }}>扩展属性 (program_schema)</Text>
          </div>
        )}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {extFields.map(f => (
            <FieldChip key={f.key} field={f} />
          ))}
        </div>
        {filtered.length === 0 && (
          <Text type="secondary" style={{ fontSize: 12 }}>无匹配字段</Text>
        )}
      </div>
    </div>
  );
};

/** 单个字段标签 */
const FieldChip: React.FC<{ field: FieldDef }> = ({ field }) => (
  <div
    draggable
    onDragStart={(e) => {
      e.dataTransfer.setData('application/json', JSON.stringify(field));
      e.dataTransfer.effectAllowed = 'copy';
    }}
    style={{
      padding: '4px 10px',
      cursor: 'grab',
      borderRadius: 4,
      border: `1px solid ${field.source === 'system' ? '#bae0ff' : '#d3adf7'}`,
      background: field.source === 'system' ? '#e6f7ff' : '#f9f0ff',
      fontSize: 12,
      display: 'flex',
      alignItems: 'center',
      gap: 4,
      whiteSpace: 'nowrap',
      transition: 'all 0.15s',
      userSelect: 'none',
    }}
    onMouseEnter={e => {
      (e.currentTarget as HTMLElement).style.transform = 'scale(1.05)';
      (e.currentTarget as HTMLElement).style.boxShadow = '0 2px 4px rgba(0,0,0,0.12)';
    }}
    onMouseLeave={e => {
      (e.currentTarget as HTMLElement).style.transform = 'scale(1)';
      (e.currentTarget as HTMLElement).style.boxShadow = 'none';
    }}
  >
    {field.required && <span style={{ color: '#faad14', fontSize: 10 }}>●</span>}
    <span>{field.label}</span>
  </div>
);

// ==================== 子组件: 画布 ====================

const Canvas: React.FC<{
  sections: LayoutSection[];
  selectedFieldId: string | null;
  selectedSectionId: string | null;
  onSelectField: (fieldId: string, sectionId: string) => void;
  onSelectSection: (sectionId: string) => void;
  onMoveField: (sectionId: string, fromIdx: number, toIdx: number) => void;
  onMoveSection: (fromIdx: number, toIdx: number) => void;
  onDropField: (sectionId: string, field: FieldDef) => void;
  onAddSection: () => void;
}> = ({
  sections, selectedFieldId, selectedSectionId,
  onSelectField, onSelectSection, onMoveField, onMoveSection, onDropField, onAddSection,
}) => {
  if (sections.length === 0) {
    return (
      <div
        style={{
          flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
          minHeight: 400, border: '2px dashed #d9d9d9', borderRadius: 8,
          background: '#fafafa',
        }}
        onDragOver={e => e.preventDefault()}
        onDrop={e => {
          e.preventDefault();
          try {
            JSON.parse(e.dataTransfer.getData('application/json'));
            onAddSection();
          } catch {}
        }}
      >
        <div style={{ textAlign: 'center', color: '#999' }}>
          <div style={{ fontSize: 48, marginBottom: 8 }}>📥</div>
          <Text>从上方字段栏拖拽字段到此区域</Text>
          <br />
          <Button type="link" onClick={onAddSection}>或点击工具栏「分组」创建新分组</Button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ flex: 1, overflow: 'auto' }}>
      {sections.map((section, sectionIdx) => (
        <div
          key={section.id}
          style={{
            marginBottom: 12,
            border: selectedSectionId === section.id ? '2px solid #1677ff' : '1px solid #e8e8e8',
            borderRadius: 8, background: '#fff',
          }}
        >
          <div
            onClick={() => onSelectSection(section.id)}
            style={{
              padding: '10px 16px',
              background: selectedSectionId === section.id ? '#e6f4ff' : '#fafafa',
              borderBottom: '1px solid #e8e8e8',
              borderRadius: '8px 8px 0 0',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              cursor: 'pointer',
            }}
          >
            <Space>
              <HolderOutlined style={{ color: '#999', cursor: 'grab' }} />
              <Text strong>{section.title}</Text>
              <Tag>{section.columns}列</Tag>
              {section.collapsible && <Tag color="blue">可折叠</Tag>}
            </Space>
            <Space size={4}>
              <Tooltip title="上移"><Button type="text" size="small" icon={<UpOutlined />}
                disabled={sectionIdx === 0}
                onClick={e => { e.stopPropagation(); onMoveSection(sectionIdx, sectionIdx - 1); }} /></Tooltip>
              <Tooltip title="下移"><Button type="text" size="small" icon={<DownOutlined />}
                disabled={sectionIdx === sections.length - 1}
                onClick={e => { e.stopPropagation(); onMoveSection(sectionIdx, sectionIdx + 1); }} /></Tooltip>
            </Space>
          </div>

          <div
            style={{ padding: '8px 12px', minHeight: 60 }}
            onDragOver={e => { e.preventDefault(); e.stopPropagation(); }}
            onDrop={e => {
              e.preventDefault(); e.stopPropagation();
              try {
                const field: FieldDef = JSON.parse(e.dataTransfer.getData('application/json'));
                onDropField(section.id, field);
              } catch {}
            }}
          >
            <div style={{ display: 'grid', gridTemplateColumns: `repeat(${section.columns}, 1fr)`, gap: 8 }}>
              {section.fields.map((field, fieldIdx) => (
                <div
                  key={field.id}
                  draggable
                  onDragStart={e => {
                    e.dataTransfer.setData('application/field-move', JSON.stringify({ sectionId: section.id, fieldIdx }));
                    e.dataTransfer.effectAllowed = 'move';
                    e.stopPropagation();
                  }}
                  onDragOver={e => { e.preventDefault(); e.stopPropagation(); }}
                  onDrop={e => {
                    e.preventDefault(); e.stopPropagation();
                    try {
                      const data = JSON.parse(e.dataTransfer.getData('application/field-move'));
                      if (data.sectionId === section.id) onMoveField(section.id, data.fieldIdx, fieldIdx);
                    } catch {}
                  }}
                  onClick={(e) => { e.stopPropagation(); onSelectField(field.id, section.id); }}
                  style={{
                    padding: '8px 12px',
                    border: selectedFieldId === field.id ? '2px solid #1677ff' : '1px solid #e8e8e8',
                    borderRadius: 6, cursor: 'pointer',
                    background: selectedFieldId === field.id ? '#e6f4ff' : '#fff',
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    fontSize: 13, transition: 'all 0.15s',
                    gridColumn: `span ${field.span}`,
                  }}
                >
                  <Space size={4}>
                    <HolderOutlined style={{ color: '#ccc', fontSize: 12 }} />
                    <span>{field.label}</span>
                  </Space>
                  <Space size={2}>
                    {field.required && <Tag color="red" style={{ fontSize: 10, margin: 0 }}>必填</Tag>}
                    {field.readonly && <Tag style={{ fontSize: 10, margin: 0 }}>只读</Tag>}
                    <Tag style={{ fontSize: 10, margin: 0 }} color="geekblue">{field.component}</Tag>
                  </Space>
                </div>
              ))}
            </div>
            {section.fields.length === 0 && (
              <div style={{ textAlign: 'center', color: '#bbb', padding: '20px 0', fontSize: 13 }}>
                拖拽字段到此处
              </div>
            )}
          </div>
        </div>
      ))}
      <Button type="dashed" block icon={<PlusOutlined />} onClick={onAddSection} style={{ marginTop: 8 }}>
        添加分组
      </Button>
    </div>
  );
};

// ==================== 主组件: 页面设计器 ====================

const PageDesigner: React.FC = () => {
  const programCode = useAppStore(s => s.currentProgramCode);
  const s = useCampaignStyles();

  const [entityType, setEntityType] = useState('MEMBER');
  const [pageType, setPageType] = useState('DETAIL');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [layoutId, setLayoutId] = useState<string | null>(null);
  const [layoutVersion, setLayoutVersion] = useState(1);
  const [layoutStatus, setLayoutStatus] = useState('DRAFT');
  const [sections, setSections] = useState<LayoutSection[]>([]);
  const [fieldConfigOverrides, setFieldConfigOverrides] = useState<Record<string, any>>({});

  const [availableFields, setAvailableFields] = useState<FieldDef[]>([]);
  const [fieldSearch, setFieldSearch] = useState('');
  const [showFieldBar, setShowFieldBar] = useState(true);
  const [entityPopoverOpen, setEntityPopoverOpen] = useState(false);

  const [selectedFieldId, setSelectedFieldId] = useState<string | null>(null);
  const [selectedSectionId, setSelectedSectionId] = useState<string | null>(null);

  const [historyOpen, setHistoryOpen] = useState(false);
  const [history, setHistory] = useState<any[]>([]);
  const [previewOpen, setPreviewOpen] = useState(false);

  // ==================== 加载数据 ====================

  const fetchLayout = useCallback(async () => {
    setLoading(true);
    try {
      const schemaRes = await api.get(`/schemas/${entityType}`);
      const schemaData = schemaRes?.data?.data?.schema;
      const fields: FieldDef[] = [];

      if (entityType === 'MEMBER') {
        fields.push(...MEMBER_SYSTEM_FIELDS);
      }

      if (schemaData?.properties) {
        for (const [key, def] of Object.entries(schemaData.properties) as [string, any][]) {
          if (key.startsWith('_')) continue;
          if (MEMBER_SYSTEM_FIELDS.some(sf => sf.key === key)) continue;
          fields.push({
            key, label: def.title || key, type: def.type || 'string',
            required: schemaData.required?.includes(key) || false, source: 'extended',
          });
        }
      }
      setAvailableFields(fields);

      try {
        const layoutRes = await api.get(`/layout/${programCode}/${entityType}/${pageType}`);
        const layoutData = layoutRes?.data?.data;
        if (layoutData?.layoutConfig) {
          setLayoutId(layoutData.id);
          setLayoutVersion(layoutData.version);
          setLayoutStatus(layoutData.status);
          setSections(layoutData.layoutConfig.sections || []);
          setFieldConfigOverrides(layoutData.layoutConfig.fieldConfigOverrides || {});
        }
      } catch {
        try {
          const defaultRes = await api.post(`/layout/default/${programCode}/${entityType}/${pageType}`);
          const defaultData = defaultRes?.data?.data;
          if (defaultData?.layoutConfig) {
            setLayoutId(defaultData.id);
            setLayoutVersion(defaultData.version);
            setLayoutStatus(defaultData.status);
            setSections(defaultData.layoutConfig.sections || []);
          }
        } catch {
          setSections([{ id: 'section_basic', title: '基本信息', icon: 'AppstoreOutlined',
            collapsible: true, collapsed: false, columns: 2, fields: [] }]);
        }
      }
    } catch (e: any) {
      message.error('加载失败: ' + (e.message || '未知错误'));
    } finally {
      setLoading(false);
    }
  }, [programCode, entityType, pageType]);

  useEffect(() => { fetchLayout(); }, [fetchLayout]);

  // ==================== 选中状态 ====================

  const selectedField = (() => {
    if (!selectedFieldId || !selectedSectionId) return null;
    const section = sections.find(s => s.id === selectedSectionId);
    return section?.fields.find(f => f.id === selectedFieldId) || null;
  })();

  const selectedSection = selectedSectionId ? sections.find(s => s.id === selectedSectionId) || null : null;

  const handleSelectField = (fieldId: string, sectionId: string) => {
    setSelectedFieldId(fieldId); setSelectedSectionId(sectionId);
  };

  const handleSelectSection = (sectionId: string) => {
    setSelectedSectionId(sectionId); setSelectedFieldId(null);
  };

  // ==================== 字段操作 ====================

  const handleDropField = (sectionId: string, field: FieldDef) => {
    const newField: LayoutField = {
      id: `field_${field.key}_${Date.now()}`,
      field_key: field.key, label: field.label,
      component: inferComponent(field.key, field.type),
      span: 1, required: field.required, readonly: false, hidden: false,
    };
    setSections(prev => prev.map(s =>
      s.id === sectionId ? { ...s, fields: [...s.fields, newField] } : s));
  };

  const handleFieldChange = (updated: LayoutField) => {
    setSections(prev => prev.map(s =>
      s.id === selectedSectionId ? { ...s, fields: s.fields.map(f => f.id === updated.id ? updated : f) } : s));
  };

  const handleSectionChange = (updated: LayoutSection) => {
    setSections(prev => prev.map(s => s.id === updated.id ? updated : s));
  };

  const handleDeleteField = () => {
    if (!selectedFieldId || !selectedSectionId) return;
    setSections(prev => prev.map(s =>
      s.id === selectedSectionId ? { ...s, fields: s.fields.filter(f => f.id !== selectedFieldId) } : s));
    setSelectedFieldId(null);
  };

  const handleDeleteSection = () => {
    if (!selectedSectionId) return;
    setSections(prev => prev.filter(s => s.id !== selectedSectionId));
    setSelectedSectionId(null); setSelectedFieldId(null);
  };

  const handleMoveField = (sectionId: string, fromIdx: number, toIdx: number) => {
    setSections(prev => prev.map(s => {
      if (s.id !== sectionId) return s;
      const newFields = [...s.fields];
      const [moved] = newFields.splice(fromIdx, 1);
      newFields.splice(toIdx, 0, moved);
      return { ...s, fields: newFields };
    }));
  };

  const handleMoveSection = (fromIdx: number, toIdx: number) => {
    const newSections = [...sections];
    const [moved] = newSections.splice(fromIdx, 1);
    newSections.splice(toIdx, 0, moved);
    setSections(newSections);
  };

  const handleAddSection = () => {
    setSections(prev => [...prev, {
      id: `section_${Date.now()}`, title: `新分组 ${prev.length + 1}`,
      icon: 'AppstoreOutlined', collapsible: true, collapsed: false, columns: 2, fields: [],
    }]);
  };

  const handleAddDivider = () => {
    const targetId = selectedSectionId || sections[0]?.id;
    if (!targetId) return;
    const newField: LayoutField = {
      id: `__divider__${Date.now()}`, field_key: '__divider__' + Date.now(),
      label: '分割线', component: 'Divider', span: 2, required: false, readonly: true, hidden: false,
    };
    setSections(prev => prev.map(s =>
      s.id === targetId ? { ...s, fields: [...s.fields, newField] } : s));
  };

  const handleAddTitle = () => {
    const targetId = selectedSectionId || sections[0]?.id;
    if (!targetId) return;
    const newField: LayoutField = {
      id: `__title__${Date.now()}`, field_key: '__title__' + Date.now(),
      label: '新标题', component: 'Title', span: 2, required: false, readonly: true, hidden: false,
    };
    setSections(prev => prev.map(s =>
      s.id === targetId ? { ...s, fields: [...s.fields, newField] } : s));
  };

  // ==================== 保存/发布 ====================

  const buildLayoutConfig = (): LayoutConfig => ({
    version: '1.0', sections, fieldConfigOverrides,
  });

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await api.post('/layout', {
        programCode, entityType, pageType,
        layoutConfig: buildLayoutConfig(), fieldConfig: fieldConfigOverrides,
      });
      const data = res?.data?.data;
      if (data) {
        setLayoutId(data.id); setLayoutVersion(data.version); setLayoutStatus(data.status);
      }
      message.success('草稿已保存');
    } catch (e: any) {
      message.error('保存失败: ' + (e.response?.data?.message || e.message));
    } finally { setSaving(false); }
  };

  const handlePublish = async () => {
    if (!layoutId) { await handleSave(); return; }
    setSaving(true);
    try {
      const res = await api.post(`/layout/${layoutId}/publish`);
      if (res?.data?.data) setLayoutStatus(res.data.data.status);
      message.success('已发布');
    } catch (e: any) {
      message.error('发布失败: ' + (e.response?.data?.message || e.message));
    } finally { setSaving(false); }
  };

  const handleRollback = async (version: number) => {
    try {
      await api.post(`/layout/${programCode}/${entityType}/${pageType}/rollback/${version}`);
      message.success('回滚成功');
      setHistoryOpen(false); fetchLayout();
    } catch (e: any) {
      message.error('回滚失败: ' + (e.response?.data?.message || e.message));
    }
  };

  const handleLoadHistory = async () => {
    try {
      const res = await api.get(`/layout/${programCode}/${entityType}/${pageType}/history`);
      setHistory(res?.data?.data || []); setHistoryOpen(true);
    } catch { message.error('加载历史失败'); }
  };

  const handleEntityChange = (v: string) => {
    setEntityType(v); setSelectedFieldId(null); setSelectedSectionId(null);
    setEntityPopoverOpen(false);
  };

  const handlePageTypeChange = (v: string) => {
    setPageType(v); setSelectedFieldId(null); setSelectedSectionId(null);
  };

  // ==================== 渲染 ====================

  if (loading) {
    return <div className="campaign-page" style={s.pageStyle}>
      <Spin style={{ display: 'block', margin: '100px auto' }} />
    </div>;
  }

  return (
    <div className="campaign-page" style={{ ...s.pageStyle, display: 'flex', flexDirection: 'column', height: 'calc(100vh - 64px)' }}>
      <style>{`
        .page-designer-canvas { flex: 1; overflow: auto; padding: 0 16px 16px; background: #f5f5f5; }
        .floating-toolbar { display: flex; align-items: center; gap: 4px; padding: 6px 10px;
          background: #fff; border: 1px solid #e8e8e8; border-radius: 8px;
          box-shadow: 0 2px 8px rgba(0,0,0,0.08); }
        .floating-toolbar .ant-btn { border: none; background: transparent; }
        .floating-toolbar .ant-btn:hover { background: #f0f0f0; }
      `}</style>

      {/* 顶部栏 */}
      <div style={{
        padding: '8px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        background: '#fff', borderBottom: '1px solid #e8e8e8', flexShrink: 0,
      }}>
        <Space>
          <TitleWithDesc title="页面设计器" desc="拖拽字段到分组，配置页面布局" />
        </Space>
        <Space>
          <Select value={pageType} onChange={handlePageTypeChange}
            options={PAGE_TYPES} style={{ width: 100 }} size="small" />
          <Tag>v{layoutVersion}</Tag>
          <Tag color={layoutStatus === 'PUBLISHED' ? 'green' : 'orange'}>
            ● {layoutStatus === 'PUBLISHED' ? '已发布' : '草稿'}
          </Tag>
          <Divider type="vertical" />
          <Button icon={<SaveOutlined />} onClick={handleSave} loading={saving}>保存草稿</Button>
          <Button icon={<EyeOutlined />} onClick={() => setPreviewOpen(true)}>预览</Button>
          <Button type="primary" icon={<SendOutlined />} onClick={handlePublish} loading={saving}>发布</Button>
          <Button icon={<HistoryOutlined />} onClick={handleLoadHistory}>历史版本</Button>
        </Space>
      </div>

      {/* 工具栏 + 字段栏 */}
      <div style={{ padding: '12px 16px 0', background: '#f5f5f5', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {/* 浮动工具栏 */}
          <div className="floating-toolbar">
            <Popover
              open={entityPopoverOpen}
              onOpenChange={setEntityPopoverOpen}
              trigger="click"
              placement="bottomLeft"
              content={
                <div style={{ width: 200 }}>
                  <Text type="secondary" style={{ fontSize: 11, display: 'block', marginBottom: 8 }}>选择实体类型</Text>
                  {ENTITY_TYPES.map(e => (
                    <div
                      key={e.value}
                      onClick={() => handleEntityChange(e.value)}
                      style={{
                        padding: '8px 12px', cursor: 'pointer', borderRadius: 6,
                        background: entityType === e.value ? '#e6f4ff' : 'transparent',
                        fontWeight: entityType === e.value ? 600 : 400,
                        marginBottom: 4,
                      }}
                    >
                      {e.label}
                    </div>
                  ))}
                </div>
              }
            >
              <Tooltip title="选择实体">
                <Button icon={<AppstoreOutlined />}>
                  {ENTITY_TYPES.find(e => e.value === entityType)?.label || '实体'}
                </Button>
              </Tooltip>
            </Popover>
            <Divider type="vertical" style={{ margin: '0 4px' }} />
            <Tooltip title="添加分组">
              <Button icon={<PlusOutlined />} onClick={handleAddSection} />
            </Tooltip>
            <Tooltip title="添加分割线">
              <Button icon={<BlockOutlined />} onClick={handleAddDivider} />
            </Tooltip>
            <Tooltip title="添加标题">
              <Button icon={<FontSizeOutlined />} onClick={handleAddTitle} />
            </Tooltip>
            <Divider type="vertical" style={{ margin: '0 4px' }} />
            <Tooltip title={showFieldBar ? '隐藏字段栏' : '显示字段栏'}>
              <Button
                icon={<AppstoreOutlined />}
                type={showFieldBar ? 'primary' : 'text'}
                onClick={() => setShowFieldBar(!showFieldBar)}
              >
                字段
              </Button>
            </Tooltip>
          </div>

          <div style={{ fontSize: 12, color: '#999' }}>
            {availableFields.length} 个字段可用
          </div>
        </div>

        {/* 字段选择栏 */}
        {showFieldBar && (
          <div style={{ marginTop: 8 }}>
            <FieldBar
              fields={availableFields}
              search={fieldSearch}
              onSearchChange={setFieldSearch}
              onClose={() => setShowFieldBar(false)}
            />
          </div>
        )}
      </div>

      {/* 画布 */}
      <div className="page-designer-canvas">
        <Canvas
          sections={sections}
          selectedFieldId={selectedFieldId}
          selectedSectionId={selectedSectionId}
          onSelectField={handleSelectField}
          onSelectSection={handleSelectSection}
          onMoveField={handleMoveField}
          onMoveSection={handleMoveSection}
          onDropField={handleDropField}
          onAddSection={handleAddSection}
        />

        {/* 属性抽屉 */}
        <Drawer
          title={selectedField ? `字段 — ${selectedField.label}` : '分组设置'}
          open={!!(selectedField || selectedSection)}
          onClose={() => { setSelectedFieldId(null); setSelectedSectionId(null); }}
          width={300} mask={false}
          getContainer={false}
          styles={{ wrapper: { position: 'absolute' }, body: { padding: 0 } }}
        >
          <PropertyPanel
            selectedField={selectedField}
            selectedSection={selectedSection}
            onFieldChange={handleFieldChange}
            onSectionChange={handleSectionChange}
            onDeleteField={handleDeleteField}
            onDeleteSection={handleDeleteSection}
          />
        </Drawer>
      </div>

      {/* 预览弹窗 */}
      <Modal title="布局预览" open={previewOpen} onCancel={() => setPreviewOpen(false)} footer={null} width={800}>
        <div style={{ maxHeight: 500, overflow: 'auto' }}>
          {sections.map(section => (
            <Card key={section.id} title={section.title} size="small" style={{ marginBottom: 12 }}>
              <div style={{ display: 'grid', gridTemplateColumns: `repeat(${section.columns}, 1fr)`, gap: 8 }}>
                {section.fields.map(field => (
                  <div key={field.id} style={{
                    padding: '8px 12px', border: '1px solid #e8e8e8', borderRadius: 6,
                    fontSize: 13, gridColumn: `span ${field.span}`,
                  }}>
                    <div style={{ fontSize: 11, color: '#999', marginBottom: 4 }}>
                      {field.label} {field.required && <span style={{ color: 'red' }}>*</span>}
                    </div>
                    <div style={{ height: 32, background: '#f5f5f5', borderRadius: 4,
                      display: 'flex', alignItems: 'center', padding: '0 8px', color: '#bbb', fontSize: 12 }}>
                      {field.readonly ? '（只读）' : field.placeholder || `请输入${field.label}`}
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          ))}
        </div>
      </Modal>

      {/* 历史版本弹窗 */}
      <Modal title="版本历史" open={historyOpen} onCancel={() => setHistoryOpen(false)} footer={null} width={600}>
        {history.map((h: any) => (
          <Card key={h.id} size="small" style={{ marginBottom: 8 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <Space>
                <Tag color={h.status === 'PUBLISHED' ? 'green' : 'orange'}>
                  {h.status === 'PUBLISHED' ? '已发布' : '草稿'}
                </Tag>
                <Text>v{h.version}</Text>
                <Text type="secondary" style={{ fontSize: 12 }}>{h.createdAt?.substring(0, 19)}</Text>
              </Space>
              <Button size="small" onClick={() => handleRollback(h.version)}>回滚</Button>
            </div>
          </Card>
        ))}
        {history.length === 0 && <Empty description="暂无历史版本" />}
      </Modal>
    </div>
  );
};

// ==================== 辅助函数 ====================

function inferComponent(key: string, type: string): string {
  const lower = key.toLowerCase();
  if (lower.includes('date') || lower.includes('birthday') || lower.includes('time')) return 'DatePicker';
  if (lower.includes('gender') || lower.includes('sex')) return 'Select';
  if (lower.includes('amount') || lower.includes('price') || lower.includes('age')
    || lower.includes('size') || lower.includes('number')) return 'InputNumber';
  if (lower.includes('status') || lower.includes('flag') || lower.includes('switch')) return 'Switch';
  if (lower.includes('id') || lower.includes('code')) return 'Text';
  if (type === 'number' || type === 'integer') return 'InputNumber';
  if (type === 'boolean') return 'Switch';
  return 'Input';
}

export default PageDesigner;