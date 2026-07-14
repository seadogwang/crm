import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Card, Tabs, Table, Button, Input, InputNumber, Select, Space, Tag, message, Modal, Popconfirm, Tree, Form, Spin } from 'antd';
import { PlusOutlined, SaveOutlined, ReloadOutlined, DeleteOutlined, EditOutlined, ArrowUpOutlined, ArrowDownOutlined, UnorderedListOutlined, ArrowLeftOutlined } from '@ant-design/icons';
import type { DataNode } from 'antd/es/tree';
import api from '../api';
import { useAppStore } from '../store';

const { TabPane } = Tabs;

// ==================== 公共组件：悬停编辑输入框 ====================
const HoverInput: React.FC<{ value: string; onChange: (v: string) => void; w?: number; placeholder?: string }> = ({ value, onChange, w, placeholder }) => {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value || '');
  if (editing) return <Input size="small" value={draft} autoFocus style={{ width: w }} placeholder={placeholder} onChange={e => setDraft(e.target.value)} onBlur={() => { onChange(draft); setEditing(false); }} onPressEnter={() => { onChange(draft); setEditing(false); }} />;
  return <span style={{ cursor: 'pointer', padding: '4px 8px', borderRadius: 4, display: 'inline-block', width: w, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', border: '1px solid transparent' }} onMouseEnter={e => { e.currentTarget.style.background = '#f5f5f5'; e.currentTarget.style.borderColor = '#d9d9d9'; }} onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.borderColor = 'transparent'; }} onClick={() => { setDraft(value || ''); setEditing(true); }}>{value || <span style={{ color: '#ccc' }}>{placeholder || '—'}</span>}</span>;
};

// ==================== 枚举值管理 ====================
const EnumManagement: React.FC = () => {
  const [defs, setDefs] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editDefModal, setEditDefModal] = useState<any>(null);
  const [enumItems, setEnumItems] = useState<any[]>([]);
  const [itemsModal, setItemsModal] = useState<string | null>(null);
  const [itemsLoading, setItemsLoading] = useState(false);
  const [addItemModal, setAddItemModal] = useState<any>(null);

  const loadDefs = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/master-data/definitions');
      setDefs((data?.data || []).filter((d: any) => d.dataType === 'ENUM'));
    } catch { setDefs([]); } finally { setLoading(false); }
  }, []);

  useEffect(() => { loadDefs(); }, []);

  const loadEnumItems = async (dataCode: string) => {
    setItemsLoading(true);
    try {
      const { data } = await api.get(`/master-data/${dataCode}/items`);
      setEnumItems(data?.data || []);
    } catch { setEnumItems([]); } finally { setItemsLoading(false); }
  };

  const handleSaveDef = async () => {
    if (!editDefModal) return;
    setSaving(true);
    try {
      if (editDefModal._isNew) {
        await api.post('/master-data/types', editDefModal);
      } else {
        await api.put(`/master-data/types/${editDefModal.dataCode}`, editDefModal);
      }
      message.success('已保存');
      setEditDefModal(null);
      loadDefs();
    } catch (e: any) { message.error(e?.response?.data?.message || '保存失败'); }
    finally { setSaving(false); }
  };

  const handleDeleteDef = async (dataCode: string) => {
    try {
      await api.delete(`/master-data/types/${dataCode}`);
      message.success('已删除');
      loadDefs();
    } catch (e: any) { message.error('删除失败'); }
  };

  const handleAddItem = async () => {
    if (!addItemModal || !addItemModal.enumCode) { message.warning('请输入枚举代码'); return; }
    try {
      await api.post(`/master-data/${itemsModal}/items`, addItemModal);
      message.success('已添加');
      setAddItemModal(null);
      loadEnumItems(itemsModal!);
    } catch (e: any) { message.error('添加失败'); }
  };

  const handleDeleteItem = async (itemId: string) => {
    try {
      await api.delete(`/master-data/${itemsModal}/items/${itemId}`);
      loadEnumItems(itemsModal!);
    } catch { message.error('删除失败'); }
  };

  const columns = [
    { title: '编码', dataIndex: 'dataCode', width: 100 },
    { title: '名称', dataIndex: 'dataName', width: 120, render: (v: string, r: any) => <HoverInput value={v} onChange={val => setDefs(prev => prev.map(d => d.dataCode === r.dataCode ? { ...d, dataName: val } : d))} w={100} /> },
    { title: '枚举数量', dataIndex: 'itemCount', width: 80, render: (v: number) => <span style={{ color: '#666' }}>{v ?? 0} 项</span> },
    { title: '状态', dataIndex: 'status', width: 70, render: (v: string, r: any) => <Select size="small" value={v || 'ACTIVE'} style={{ width: 80 }} onChange={val => setDefs(prev => prev.map(d => d.dataCode === r.dataCode ? { ...d, status: val } : d))} options={[{ label: '启用', value: 'ACTIVE' }, { label: '停用', value: 'INACTIVE' }]} /> },
    { title: '操作', width: 160, render: (_: any, r: any) => (
      <Space size={4}>
        <Button size="small" type="link" icon={<UnorderedListOutlined style={{ color: '#1a1a1a' }} />} style={{ padding: 0, color: '#1a1a1a' }} onClick={() => { setItemsModal(r.dataCode); loadEnumItems(r.dataCode); }} />
        <Button size="small" type="link" icon={<SaveOutlined style={{ color: '#1a1a1a' }} />} style={{ padding: 0, color: '#1a1a1a' }} onClick={() => api.put(`/master-data/types/${r.dataCode}`, r).then(() => message.success('已保存')).catch(() => {})} />
        <Popconfirm title="确定删除？" onConfirm={() => handleDeleteDef(r.dataCode)}><Button size="small" type="link" icon={<DeleteOutlined style={{ color: '#1a1a1a' }} />} style={{ padding: 0, color: '#1a1a1a' }} /></Popconfirm>
      </Space>
    )},
  ];

  return (
    <>
      <Card title="枚举值管理" size="small" extra={<Space><Button icon={<ReloadOutlined />} size="small" onClick={loadDefs}>刷新</Button><Button type="primary" icon={<PlusOutlined />} size="small" onClick={() => setEditDefModal({ dataCode: '', dataName: '', dataType: 'ENUM', status: 'ACTIVE', _isNew: true })}>新建枚举类型</Button></Space>}>
        <Table dataSource={defs} columns={columns} rowKey="dataCode" loading={loading} pagination={false} size="small" />
      </Card>

      {/* 枚举值编辑弹窗 */}
      <Modal title={`枚举值管理 - ${itemsModal}`} open={!!itemsModal} onCancel={() => setItemsModal(null)} footer={null} width={600}>
        <div style={{ marginBottom: 12, display: 'flex', gap: 8 }}>
          <Input size="small" placeholder="代码" style={{ width: 120 }} onChange={e => setAddItemModal({ ...addItemModal, enumCode: e.target.value })} />
          <Input size="small" placeholder="显示名称" style={{ width: 140 }} onChange={e => setAddItemModal({ ...addItemModal, enumLabel: e.target.value })} />
          <Input size="small" placeholder="值(可选)" style={{ width: 100 }} onChange={e => setAddItemModal({ ...addItemModal, enumValue: e.target.value })} />
          <Button size="small" type="primary" onClick={handleAddItem}>添加</Button>
        </div>
        <Table dataSource={enumItems} columns={[
          { title: '代码', dataIndex: 'enumCode', width: 100 },
          { title: '显示名称', dataIndex: 'enumLabel', width: 140 },
          { title: '值', dataIndex: 'enumValue', width: 80 },
          { title: '排序', dataIndex: 'sortOrder', width: 60 },
          { title: '状态', dataIndex: 'status', width: 70 },
          { title: '', width: 50, render: (_: any, r: any) => <Popconfirm title="删除？" onConfirm={() => handleDeleteItem(r.id)}><Button size="small" type="text" icon={<DeleteOutlined style={{ color: '#1a1a1a' }} />} /></Popconfirm> },
        ]} rowKey="id" loading={itemsLoading} pagination={false} size="small" />
      </Modal>
    </>
  );
};

// ==================== 层级树节点组件（内联编辑） ====================
const HierarchyNode: React.FC<{
  name: string; code: string; level: number; nodeId?: string;
  onAddChild: (parentCode: string, level: number) => void;
  onDelete: (nodeId: string) => void;
  onRenamed: () => void;
}> = ({ name, code, level, nodeId, onAddChild, onDelete, onRenamed }) => {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(name);
  return (
    <span style={{ fontSize: 13 }}>
      {editing ? (
        <Input size="small" value={draft} autoFocus style={{ width: 160, fontSize: 12 }}
          onClick={e => e.stopPropagation()}
          onChange={e => setDraft(e.target.value)}
          onBlur={async () => {
            if (draft && draft !== name && nodeId) {
              try { await api.put(`/master-data/hierarchy/nodes/${nodeId}`, { nodeName: draft }); } catch {}
            }
            setEditing(false); onRenamed();
          }}
          onPressEnter={(e: any) => e.target.blur()} />
      ) : (
        <span style={{ cursor: 'pointer' }} onClick={(e) => { e.stopPropagation(); setDraft(name); setEditing(true); }}>
          {name}
        </span>
      )}
      <span style={{ color: '#999', fontSize: 10, marginLeft: 4 }}>({code})</span>
      <Button size="small" type="link" icon={<PlusOutlined style={{ color: '#1a1a1a', fontSize: 11 }} />} style={{ padding: '0 4px', marginLeft: 4, color: '#1a1a1a' }}
        onClick={(e) => { e.stopPropagation(); onAddChild(code, level + 1); }} />
      {nodeId && (
        <Popconfirm title="删除此节点？" onConfirm={() => onDelete(nodeId!)}>
          <Button size="small" type="text" style={{ padding: '0 4px', fontSize: 11, color: '#1a1a1a' }} icon={<DeleteOutlined style={{ fontSize: 11, color: '#1a1a1a' }} />} />
        </Popconfirm>
      )}
    </span>
  );
};

// ==================== 层级数据管理 ====================
const HierarchyManagement: React.FC = () => {
  const [defs, setDefs] = useState<any[]>([]);
  const [treeData, setTreeData] = useState<DataNode[]>([]);
  const [selectedCode, setSelectedCode] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [nodeForm, setNodeForm] = useState<any>({ nodeCode: '', nodeName: '', parentCode: '', nodeLevel: 1 });
  const [createDefModal, setCreateDefModal] = useState(false);
  const [newDefCode, setNewDefCode] = useState('');

  const loadDefs = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/master-data/definitions');
      setDefs((data?.data || []).filter((d: any) => d.dataType === 'HIERARCHY'));
    } catch { setDefs([]); } finally { setLoading(false); }
  }, []);

  useEffect(() => { loadDefs(); }, []);

  const handleCreateDef = async () => {
    if (!newDefCode.trim()) { message.warning('请输入层级类型编码'); return; }
    try {
      await api.post('/master-data/types', { dataCode: newDefCode.toUpperCase(), dataName: newDefCode.toUpperCase(), dataType: 'HIERARCHY', status: 'ACTIVE' });
      message.success('层级类型已创建');
      setCreateDefModal(false);
      setNewDefCode('');
      loadDefs();
    } catch (e: any) { message.error(e?.response?.data?.message || '创建失败'); }
  };

  const loadTree = async (dataCode: string) => {
    try {
      const { data } = await api.get('/master-data/hierarchy/nodes', { params: { dataCode } });
      const nodes: any[] = data?.data || [];
      const roots = nodes.filter((n: any) => !n.parentCode);
      const buildTree = (parentNodes: any[]): DataNode[] =>
        parentNodes.map((n: any) => ({
          key: n.nodeCode,
          title: `${n.nodeName} (${n.nodeCode})`,
          children: buildTree(nodes.filter((c: any) => c.parentCode === n.nodeCode)),
          isLeaf: !nodes.some((c: any) => c.parentCode === n.nodeCode),
        }));
      setTreeData(buildTree(roots));
      setSelectedCode(dataCode);
    } catch { setTreeData([]); }
  };

  const [allNodes, setAllNodes] = useState<any[]>([]);
  const loadAllNodes = async (dataCode: string) => {
    try {
      const { data } = await api.get('/master-data/hierarchy/nodes', { params: { dataCode } });
      setAllNodes(data?.data || []);
    } catch { setAllNodes([]); }
  };

  const handleAddNode = async () => {
    if (!nodeForm.nodeCode) { message.warning('请输入节点代码'); return; }
    try {
      await api.post('/master-data/hierarchy/nodes', { ...nodeForm, dataCode: selectedCode });
      message.success('已添加');
      setAddModalOpen(false);
      setNodeForm({ nodeCode: '', nodeName: '', parentCode: '', nodeLevel: 1 });
      loadTree(selectedCode!);
    } catch (e: any) { message.error(e?.response?.data?.message || '添加失败'); }
  };

  const handleDeleteNode = async (nodeId: string) => {
    try {
      await api.delete(`/master-data/hierarchy/nodes/${nodeId}`);
      loadTree(selectedCode!);
    } catch { message.error('删除失败'); }
  };

  return (
    <Card title="层级数据管理" size="small" extra={<Space><Button icon={<PlusOutlined />} size="small" onClick={() => setCreateDefModal(true)}>新建层级类型</Button><Button icon={<ReloadOutlined />} size="small" onClick={loadDefs}>刷新</Button></Space>}>
      {!selectedCode ? (
        <Table dataSource={defs} columns={[
          { title: '编码', dataIndex: 'dataCode', width: 100 },
          { title: '名称', dataIndex: 'dataName', width: 120 },
          { title: '节点数', dataIndex: 'itemCount', width: 80, render: (v: number) => `${v ?? 0} 项` },
          { title: '操作', width: 60, render: (_: any, r: any) => <Button size="small" type="link" icon={<UnorderedListOutlined style={{ color: '#1a1a1a' }} />} style={{ color: '#1a1a1a' }} onClick={() => { loadTree(r.dataCode); loadAllNodes(r.dataCode); }} /> },
        ]} rowKey="dataCode" loading={loading} pagination={false} size="small" />
      ) : (
        <div>
          <div style={{ marginBottom: 12, display: 'flex', gap: 8, alignItems: 'center' }}>
            <span style={{ fontWeight: 600, flex: 1 }}>{selectedCode} 节点管理</span>
            <Button size="small" type="primary" icon={<PlusOutlined />} onClick={() => { setNodeForm({ nodeCode: '', nodeName: '', parentCode: '', nodeLevel: 1 }); setAddModalOpen(true); }} />
            <Button size="small" icon={<ArrowLeftOutlined style={{ color: '#1a1a1a' }} />} style={{ color: '#1a1a1a' }} onClick={() => setSelectedCode(null)} />
          </div>
          <Tree
            treeData={treeData}
            defaultExpandAll
            titleRender={(node: any) => {
              const n = allNodes.find((nd: any) => nd.nodeCode === node.key);
              return <HierarchyNode name={n?.nodeName || node.key} code={node.key}
                level={n?.nodeLevel || 0} nodeId={n?.id}
                onAddChild={(pc, lvl) => { setNodeForm({ nodeCode: '', nodeName: '', parentCode: pc, nodeLevel: lvl }); setAddModalOpen(true); }}
                onDelete={(id) => handleDeleteNode(id)}
                onRenamed={() => loadTree(selectedCode!)}
              />;
            }}
          />

          <Modal title="添加节点" open={addModalOpen} onCancel={() => { setAddModalOpen(false); setNodeForm({ nodeCode: '', nodeName: '', parentCode: '', nodeLevel: 1 }); }} onOk={handleAddNode} width={400}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div><span style={{ fontSize: 12, color: '#666' }}>父节点：</span><Input size="small" value={nodeForm.parentCode || '(根节点)'} disabled style={{ width: 200 }} /></div>
              <div><span style={{ fontSize: 12, color: '#666' }}>节点代码：</span><Input size="small" placeholder="如 440100" value={nodeForm.nodeCode} onChange={e => setNodeForm({ ...nodeForm, nodeCode: e.target.value })} style={{ width: 200 }} /></div>
              <div><span style={{ fontSize: 12, color: '#666' }}>节点名称：</span><Input size="small" placeholder="如 广州市" value={nodeForm.nodeName} onChange={e => setNodeForm({ ...nodeForm, nodeName: e.target.value })} style={{ width: 200 }} /></div>
            </div>
          </Modal>
        </div>
      )}

      <Modal title="新建层级类型" open={createDefModal} onCancel={() => { setCreateDefModal(false); setNewDefCode(''); }} onOk={handleCreateDef} width={400}>
        <div><span style={{ fontSize: 12, color: '#666' }}>类型编码：</span><Input size="small" placeholder="如 REGION" value={newDefCode} onChange={e => setNewDefCode(e.target.value.toUpperCase())} style={{ width: 200 }} /></div>
      </Modal>
    </Card>
  );
};

// ==================== 标签管理 ====================
const TagManagement: React.FC = () => {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/master-data/tags');
      setItems(data?.data || []);
    } catch { setItems([]); } finally { setLoading(false); }
  }, []);

  useEffect(() => { loadData(); }, []);

  const handleSave = async () => {
    for (const item of items) {
      if (!item.id && item.tagCode) {
        try {
          await api.post('/master-data/tags', item);
        } catch {}
      }
    }
    message.success('已保存');
    loadData();
  };

  const updateField = (idx: number, field: string, value: any) => {
    setItems(prev => prev.map((item, i) => i !== idx ? item : { ...item, [field]: value }));
  };

  const columns = [
    { title: '标签编码', dataIndex: 'tagCode', width: 120, render: (v: string, _: any, idx: number) => <HoverInput value={v} onChange={val => updateField(idx, 'tagCode', val)} w={100} /> },
    { title: '标签名称', dataIndex: 'tagName', width: 120, render: (v: string, _: any, idx: number) => <HoverInput value={v} onChange={val => updateField(idx, 'tagName', val)} w={100} /> },
    { title: '标签组', dataIndex: 'tagGroup', width: 100, render: (v: string, _: any, idx: number) => <HoverInput value={v} onChange={val => updateField(idx, 'tagGroup', val)} w={80} /> },
    { title: '颜色', dataIndex: 'tagColor', width: 80, render: (v: string, _: any, idx: number) => <Select size="small" value={v || 'blue'} style={{ width: 70 }} onChange={val => updateField(idx, 'tagColor', val)} options={['red','blue','green','orange','purple','cyan'].map(c => ({ label: c, value: c }))} /> },
    { title: '', width: 40, render: (_: any, __: any, idx: number) => (
      <span style={{ cursor: 'pointer', display: 'inline-flex' }} onClick={() => setItems(prev => prev.filter((_, i) => i !== idx))}>
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none"><circle cx="10" cy="10" r="9" stroke="#1a1a1a" strokeWidth="1.5" fill="white"/><path d="M6.5 6.5L13.5 13.5M13.5 6.5L6.5 13.5" stroke="#1a1a1a" strokeWidth="1.5" strokeLinecap="round"/></svg>
      </span>) },
  ];

  return (
    <Card title="标签管理" size="small" extra={<Space><Button icon={<ReloadOutlined />} size="small" onClick={loadData}>刷新</Button><Button type="primary" icon={<SaveOutlined />} size="small" onClick={handleSave}>保存</Button></Space>}>
      <Table dataSource={items} columns={columns} rowKey={(_, idx) => String(idx)} loading={loading} pagination={false} size="small"
        footer={() => <Button size="small" type="text" icon={<PlusOutlined />} block onClick={() => setItems([...items, { tagCode: '', tagName: '', tagGroup: '', tagColor: 'blue' }])}>添加标签</Button>} />
    </Card>
  );
};

// ==================== 主数据记录管理（动态表单） ====================
const RecordManagement: React.FC = () => {
  const [entityTypes, setEntityTypes] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedEntity, setSelectedEntity] = useState<any | null>(null);
  const [records, setRecords] = useState<any[]>([]);
  const [recordsLoading, setRecordsLoading] = useState(false);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editForm] = Form.useForm();
  const [editRecord, setEditRecord] = useState<any>(null);
  const [saving, setSaving] = useState(false);

  const loadEntityTypes = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/master-data/records/entity-types');
      setEntityTypes(data?.data || []);
    } catch { setEntityTypes([]); } finally { setLoading(false); }
  }, []);

  useEffect(() => { loadEntityTypes(); }, []);

  const loadRecords = async (entityType: string) => {
    setRecordsLoading(true);
    try {
      const { data } = await api.get(`/master-data/records/${entityType}`);
      setRecords(data?.data || []);
    } catch { setRecords([]); } finally { setRecordsLoading(false); }
  };

  const enterEntity = async (et: any) => {
    setSelectedEntity(et);
    loadRecords(et.entityType);
  };

  const openCreate = () => {
    setEditRecord(null);
    editForm.resetFields();
    setEditModalOpen(true);
  };

  const openEdit = (record: any) => {
    setEditRecord(record);
    const values: any = {};
    if (selectedEntity?.fields) {
      for (const f of selectedEntity.fields) {
        values[f.field] = record[f.field] ?? undefined;
      }
    }
    editForm.setFieldsValue(values);
    setEditModalOpen(true);
  };

  const handleSave = async () => {
    try {
      const values = await editForm.validateFields();
      setSaving(true);
      if (editRecord) {
        await api.put(`/master-data/records/${selectedEntity!.entityType}/${editRecord._id}`, values);
      } else {
        await api.post(`/master-data/records/${selectedEntity!.entityType}`, values);
      }
      message.success('已保存');
      setEditModalOpen(false);
      loadRecords(selectedEntity!.entityType);
    } catch { /* validation failed */ }
    finally { setSaving(false); }
  };

  const handleDelete = async (recordId: string) => {
    try {
      await api.delete(`/master-data/records/${selectedEntity!.entityType}/${recordId}`);
      message.success('已删除');
      loadRecords(selectedEntity!.entityType);
    } catch { message.error('删除失败'); }
  };

  // 动态表格列
  const tableColumns = useMemo(() => {
    if (!selectedEntity?.fields) return [];
    const cols: any[] = [];
    const visibleFields = selectedEntity.fields.filter((f: any) => f.showInUI !== false);
    for (const f of visibleFields) {
      cols.push({
        title: f.label || f.field,
        dataIndex: f.field,
        ellipsis: true,
        width: 120,
        render: (v: any) => {
          if (v === null || v === undefined) return <span style={{ color: '#d9d9d9' }}>—</span>;
          if (Array.isArray(v)) return `${v.length} 项`;
          if (typeof v === 'boolean') return v ? '是' : '否';
          return String(v);
        },
      });
    }
    cols.push({
      title: '', width: 100,
      render: (_: any, r: any) => (
        <Space size={4}>
          <Button size="small" type="link" icon={<EditOutlined style={{ color: '#1a1a1a' }} />} style={{ padding: 0, color: '#1a1a1a' }} onClick={() => openEdit(r)} />
          <Popconfirm title="确定删除？" onConfirm={() => handleDelete(r._id)}>
            <Button size="small" type="link" icon={<DeleteOutlined style={{ color: '#1a1a1a' }} />} style={{ padding: 0, color: '#1a1a1a' }} />
          </Popconfirm>
        </Space>
      ),
    });
    return cols;
  }, [selectedEntity]);

  // 动态表单字段（按 group 分组，grid 布局）
  const renderFormFields = () => {
    if (!selectedEntity?.fields) return null;
    const groups: Record<string, any[]> = { '': [] };
    for (const f of selectedEntity.fields) {
      const g = f.group || '';
      if (!groups[g]) groups[g] = [];
      groups[g].push(f);
    }
    return Object.entries(groups).map(([groupName, fields]) => (
      <div key={groupName} style={{ marginBottom: 16 }}>
        {groupName && <div style={{ fontSize: 12, fontWeight: 600, color: '#666', marginBottom: 8, paddingBottom: 4, borderBottom: '1px solid #f0f0f0' }}>{groupName}</div>}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px' }}>
          {fields.map((f: any) => (
            <div key={f.field} style={{ gridColumn: `span ${f.colSpan || 2}` }}>
              <Form.Item name={f.field} label={f.label || f.field} style={{ marginBottom: 10 }}>
                <FieldEditor fieldDef={f.def} masterData={f.masterData} />
              </Form.Item>
            </div>
          ))}
        </div>
      </div>
    ));
  };

  if (!selectedEntity) {
    return (
      <Card title="主数据维护" size="small" extra={<Button icon={<ReloadOutlined />} size="small" onClick={loadEntityTypes}>刷新</Button>}>
        {loading ? <Spin /> : entityTypes.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 40, color: '#999' }}>
            <p>暂无业务实体类型</p>
            <p style={{ fontSize: 12 }}>请先在「实体设计器」中创建 entity_category='BUSINESS' 的实体并发布</p>
          </div>
        ) : (
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            {entityTypes.map((et: any) => (
              <Card key={et.entityType} hoverable size="small" style={{ width: 200 }}
                onClick={() => enterEntity(et)}>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 18, fontWeight: 600 }}>{et.entityType}</div>
                  <div style={{ fontSize: 12, color: '#999', marginTop: 4 }}>{et.description || ''}</div>
                  <div style={{ fontSize: 11, color: '#666', marginTop: 8 }}>{et.itemCount ?? 0} 条记录</div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </Card>
    );
  }

  return (
    <Card title={`${selectedEntity.entityType} - 数据维护`} size="small"
      extra={<Space><Button size="small" type="primary" icon={<PlusOutlined />} onClick={openCreate} /><Button size="small" icon={<ArrowLeftOutlined style={{ color: '#1a1a1a' }} />} style={{ color: '#1a1a1a' }} onClick={() => setSelectedEntity(null)} /></Space>}>
      <Table dataSource={records} columns={tableColumns} rowKey="_id" loading={recordsLoading}
        pagination={{ pageSize: 50, showTotal: (t) => `共 ${t} 条` }} size="small" scroll={{ x: 'max-content' }} />

      <Modal title={editRecord ? '编辑' : '新增'} open={editModalOpen}
        onCancel={() => setEditModalOpen(false)} onOk={handleSave} confirmLoading={saving}
        width={640}>
        <Form form={editForm} layout="vertical" style={{ maxHeight: 500, overflow: 'auto' }}>
          {renderFormFields()}
        </Form>
      </Modal>
    </Card>
  );
};

// ==================== 字段编辑器 ====================
const FieldEditor: React.FC<{ fieldDef: any; masterData: any }> = ({ fieldDef, masterData }) => {
  const [options, setOptions] = useState<any[]>([]);
  useEffect(() => {
    if (masterData?.dataCode && masterData.dataType !== 'HIERARCHY') {
      api.get(`/master-data/${masterData.dataCode}/options`).then(({ data }) => {
        setOptions(data?.data || []);
      }).catch(() => {});
    }
  }, [masterData?.dataCode]);

  if (masterData) {
    if (masterData.dataType === 'HIERARCHY') {
      return <Select size="small" mode={masterData.multi ? 'multiple' : undefined}
        placeholder="请选择" showSearch optionFilterProp="label"
        onFocus={() => {
          api.get('/master-data/hierarchy/options', { params: { dataCode: masterData.dataCode, level: masterData.level || 1 } })
            .then(({ data }) => setOptions(data?.data || [])).catch(() => {});
        }}
        options={options} />;
    }
    return <Select size="small" showSearch optionFilterProp="label"
      placeholder="请选择"
      options={options} />;
  }

  // 根据字段类型渲染
  const dbType = fieldDef?.['x-db-metadata']?.dataType || 'VARCHAR';
  if (dbType === 'INT' || dbType === 'BIGINT' || dbType === 'DECIMAL') {
    return <InputNumber size="small" style={{ width: '100%' }} placeholder="请输入" />;
  }
  if (dbType === 'BOOLEAN') {
    return <Select size="small" options={[{ label: '是', value: true }, { label: '否', value: false }]} />;
  }
  return <Input size="small" placeholder="请输入" />;
};

// ==================== 主页面 ====================
const MasterDataManagement: React.FC = () => (
  <Tabs defaultActiveKey="enum" style={{ padding: 16 }}>
    <TabPane tab="枚举值管理" key="enum"><EnumManagement /></TabPane>
    <TabPane tab="层级数据管理" key="hierarchy"><HierarchyManagement /></TabPane>
    <TabPane tab="主数据维护" key="records"><RecordManagement /></TabPane>
    <TabPane tab="标签管理" key="tag"><TagManagement /></TabPane>
  </Tabs>
);

export default MasterDataManagement;
