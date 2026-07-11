# 统一实体建模与映射配置平台设计文档（三模块拆分版）
> **版本**：8.0\
> **关联主文档**：基于AI的下一代全渠道忠诚度管理SaaS平台 v7.3\
> **设计理念**：将“业务实体”、“API 实体”、“API↔业务实体映射”拆分为三个独立模块，降低用户学习成本和开发复杂度，按需使用 ChartDB，而非强行集成。
***
## 一、整体架构
### 1.1 模块划分
| 模块               | 功能                                | 是否使用 ChartDB | 说明                  |
| ---------------- | --------------------------------- | ------------ | ------------------- |
| **业务实体**         | 定义业务数据结构、字段、主键、实体间关系              | ✅ 全功能        | ER 图 + 属性面板，用于数据库建模 |
| **API 实体**       | 定义外部接口的请求/响应数据结构、HTTP 元数据         | ❌ 不使用        | 表格列表 + 表单，无画布       |
| **API ↔ 业务实体映射** | 配置 API 实体字段与业务实体字段的映射关系，支持转换函数/脚本 | ✅ 轻量使用       | 简化画布，仅展示两个实体及其字段连线  |
### 1.2 菜单结构
text
```
数据建模
  ├── 业务实体（原 Schema 编辑器增强，使用 ChartDB）
  ├── API 实体（新增，列表 + 表单）
  └── API 映射配置（新增，简化 ChartDB 画布）
```
### 1.3 数据存储复用
* **业务实体 & API 实体**：`program_schema` 表（通过 `entity_category` 区分）
* **实体关系**：`program_schema.entity_relations` JSONB
* **映射配置**：`channel_adapter_config.inbound_mappings` / `outbound_mappings` JSONB
* **API 操作元数据**：`api_operation_metadata` 表
***
## 二、业务实体模块（使用 ChartDB）
### 2.1 功能概述
* 创建/编辑/删除业务实体
* 使用数据库表风格编辑器定义字段（字段名、数据类型、长度、主键、允许空、默认值、备注）
* 通过拖拽连线配置实体间关系（1:1, 1:N）
* 删除实体时自动删除相关连线
### 2.2 ChartDB 改造点
| 改造点   | 说明                          |
| ----- | --------------------------- |
| 节点渲染  | 保持原生表样式，无需区分实体类型（因为只有业务实体）  |
| 连线    | 使用原生外键连线（实线），仅支持业务实体之间的外键关系 |
| 右侧面板  | 扩展为 Tabs 结构：基本信息、字段编辑器、关系列表 |
| 字段编辑器 | 数据库表风格表格，支持主键、允许空、默认值、备注等   |
### 2.3 右侧面板伪代码
```tsx
// BusinessEntityPanel.tsx
import { Tabs, Table, Input, Select, Switch, Button, Modal } from 'antd';
const BusinessEntityPanel = ({ node, onUpdate, onDelete }) => {
  const entity = node.data;
  const [activeTab, setActiveTab] = useState('basic');
  // 字段表格列定义
  const fieldColumns = [
    { title: '字段名', dataIndex: 'name', editable: true },
    { title: '数据类型', dataIndex: 'dataType', 
      render: (text, record, idx) => (
        <Select value={text} onChange={(v) => updateField(idx, 'dataType', v)}>
          <Select.Option value="VARCHAR">VARCHAR</Select.Option>
          <Select.Option value="INT">INT</Select.Option>
          <Select.Option value="DECIMAL">DECIMAL</Select.Option>
          <Select.Option value="DATETIME">DATETIME</Select.Option>
          <Select.Option value="BOOLEAN">BOOLEAN</Select.Option>
          <Select.Option value="TEXT">TEXT</Select.Option>
          <Select.Option value="JSON">JSON</Select.Option>
        </Select>
      )
    },
    { title: '长度', dataIndex: 'length', editable: true },
    { title: '主键', dataIndex: 'isPrimaryKey', 
      render: (val, record, idx) => <Switch checked={val} onChange={(v) => updateField(idx, 'isPrimaryKey', v)} />
    },
    { title: '允许空', dataIndex: 'nullable', 
      render: (val, record, idx) => <Switch checked={val} onChange={(v) => updateField(idx, 'nullable', v)} />
    },
    { title: '默认值', dataIndex: 'defaultValue', editable: true },
    { title: '备注', dataIndex: 'comment', editable: true },
    { title: '操作', render: (_, record, idx) => <Button danger size="small" onClick={() => removeField(idx)}>删除</Button> }
  ];
  const updateField = (index, key, value) => {
    const newFields = [...entity.fields];
    newFields[index][key] = value;
    onUpdate(node.id, { fields: newFields });
  };
  const addField = () => {
    const newField = { name: 'new_field', dataType: 'VARCHAR', length: 255, isPrimaryKey: false, nullable: true, defaultValue: null, comment: '' };
    onUpdate(node.id, { fields: [...entity.fields, newField] });
  };
  const handleDelete = () => {
    Modal.confirm({
      title: '确认删除',
      content: `确定要删除实体“${entity.entityName}”及其所有关联关系吗？`,
      onOk: () => onDelete(node.id)
    });
  };
  return (
    <Tabs activeKey={activeTab} onChange={setActiveTab}>
      <TabPane tab="基本信息" key="basic">
        <div><label>实体名称：</label><Input value={entity.entityName} onChange={e => onUpdate(node.id, { entityName: e.target.value })} /></div>
        <div><label>实体标识：</label><Input value={entity.entityType} disabled /></div>
        <div><label>描述：</label><Input.TextArea value={entity.description} onChange={e => onUpdate(node.id, { description: e.target.value })} /></div>
        <Button danger onClick={handleDelete}>删除实体</Button>
      </TabPane>
      <TabPane tab="字段编辑器" key="fields">
        <Table dataSource={entity.fields} columns={fieldColumns} rowKey="name" pagination={false} />
        <Button onClick={addField}>+ 添加字段</Button>
      </TabPane>
      <TabPane tab="关系" key="relations">
        <RelationsList entityId={node.id} />
      </TabPane>
    </Tabs>
  );
};
```
### 2.4 连线逻辑（原生 ChartDB 外键连线）
```tsx
// 连线创建校验（业务实体之间）
const handleConnect = (connection) => {
  const sourceNode = getNode(connection.source);
  const targetNode = getNode(connection.target);
  
  // 只有业务实体之间可以建立外键关系
  if (sourceNode.data.category !== 'BUSINESS' || targetNode.data.category !== 'BUSINESS') {
    message.error('只有业务实体之间可以建立关系');
    return;
  }
  
  const sourceField = connection.sourceHandle?.split('.')[1];
  const targetField = connection.targetHandle?.split('.')[1];
  if (!sourceField || !targetField) {
    message.error('请从字段拖拽连线');
    return;
  }
  
  // 弹出关系配置对话框
  openRelationModal({
    sourceEntity: sourceNode.id,
    targetEntity: targetNode.id,
    sourceField,
    targetField,
    cardinality: 'ONE_TO_MANY'
  });
};
```
### 2.5 关系配置对话框
```tsx
const RelationModal = ({ visible, onOk, onCancel, sourceEntity, targetEntity }) => {
  const [cardinality, setCardinality] = useState('ONE_TO_MANY');
  const [sourceField, setSourceField] = useState('');
  const [targetField, setTargetField] = useState('');
  
  const handleSave = () => {
    const relation = {
      sourceEntity,
      targetEntity,
      relationType: 'FOREIGN_KEY',
      cardinality,
      sourceField,
      targetField
    };
    // 保存到 program_schema.entity_relations
    saveRelation(relation);
    onOk();
  };
  
  return (
    <Modal title="配置关系" visible={visible} onOk={handleSave} onCancel={onCancel}>
      <Select value={cardinality} onChange={setCardinality}>
        <Select.Option value="ONE_TO_ONE">一对一</Select.Option>
        <Select.Option value="ONE_TO_MANY">一对多</Select.Option>
      </Select>
      <Select value={sourceField} onChange={setSourceField} placeholder="源字段">
        {sourceEntity.fields.map(f => <Select.Option key={f.name} value={f.name}>{f.name}</Select.Option>)}
      </Select>
      <Select value={targetField} onChange={setTargetField} placeholder="目标字段">
        {targetEntity.fields.map(f => <Select.Option key={f.name} value={f.name}>{f.name}</Select.Option>)}
      </Select>
    </Modal>
  );
};
```
***
## 三、API 实体模块（无需画布）
### 3.1 功能概述
* 列表展示所有 API 实体（支持按类型筛选：请求/响应）
* 创建/编辑/删除 API 实体
* 定义字段（字段名、数据类型、长度、必填、描述）
* 配置 API 元数据（HTTP 方法、路径、认证方式、关联操作）
* 删除时检查是否被映射引用
### 3.2 列表页
```tsx
// ApiEntityList.tsx
const ApiEntityList = () => {
  const [entities, setEntities] = useState([]);
  const [filter, setFilter] = useState('all'); // all, request, response
  
  const columns = [
    { title: '实体名称', dataIndex: 'entityType' },
    { title: '标识', dataIndex: 'entityName' },
    { title: '类型', dataIndex: 'entityCategory', 
      render: (v) => v === 'API_REQUEST' ? '请求' : '响应' 
    },
    { title: '关联操作', dataIndex: 'apiConfig', 
      render: (config) => config?.operationCode 
    },
    { title: 'HTTP 方法', dataIndex: 'apiConfig', 
      render: (config) => config?.httpMethod 
    },
    { title: '操作', render: (record) => (
      <Button onClick={() => openEditor(record)}>编辑</Button>
      <Button danger onClick={() => deleteEntity(record)}>删除</Button>
    )}
  ];
  
  return (
    <div>
      <div className="toolbar">
        <Select value={filter} onChange={setFilter}>
          <Select.Option value="all">全部</Select.Option>
          <Select.Option value="request">请求实体</Select.Option>
          <Select.Option value="response">响应实体</Select.Option>
        </Select>
        <Button type="primary" onClick={() => openEditor(null)}>新建 API 实体</Button>
      </div>
      <Table dataSource={entities} columns={columns} />
    </div>
  );
};
```
### 3.3 编辑表单
```tsx
// ApiEntityEditor.tsx
const ApiEntityEditor = ({ entity, onSave, onCancel }) => {
  const [form] = Form.useForm();
  
  // 字段表格列（简化版，不需要主键和允许空）
  const fieldColumns = [
    { title: '字段名', dataIndex: 'name', editable: true },
    { title: '数据类型', dataIndex: 'dataType',
      render: (text, record, idx) => (
        <Select value={text} onChange={(v) => updateField(idx, 'dataType', v)}>
          <Select.Option value="VARCHAR">VARCHAR</Select.Option>
          <Select.Option value="INT">INT</Select.Option>
          <Select.Option value="DECIMAL">DECIMAL</Select.Option>
          <Select.Option value="DATETIME">DATETIME</Select.Option>
          <Select.Option value="BOOLEAN">BOOLEAN</Select.Option>
          <Select.Option value="JSON">JSON</Select.Option>
        </Select>
      )
    },
    { title: '长度', dataIndex: 'length', editable: true },
    { title: '必填', dataIndex: 'required', render: (val, record, idx) => <Switch checked={val} onChange={(v) => updateField(idx, 'required', v)} /> },
    { title: '描述', dataIndex: 'description', editable: true },
    { title: '操作', render: (_, record, idx) => <Button danger size="small" onClick={() => removeField(idx)}>删除</Button> }
  ];
  
  return (
    <Form form={form} initialValues={entity}>
      <Form.Item label="实体名称" name="entityName"><Input /></Form.Item>
      <Form.Item label="实体标识" name="entityType"><Input disabled /></Form.Item>
      <Form.Item label="实体类型" name="entityCategory">
        <Select>
          <Select.Option value="API_REQUEST">请求实体</Select.Option>
          <Select.Option value="API_RESPONSE">响应实体</Select.Option>
        </Select>
      </Form.Item>
      <Form.Item label="描述" name="description"><Input.TextArea /></Form.Item>
      
      <div className="divider">API 配置</div>
      <Form.Item label="HTTP 方法" name={['apiConfig', 'httpMethod']}>
        <Select><Select.Option value="GET">GET</Select.Option><Select.Option value="POST">POST</Select.Option><Select.Option value="PUT">PUT</Select.Option><Select.Option value="DELETE">DELETE</Select.Option></Select>
      </Form.Item>
      <Form.Item label="请求路径" name={['apiConfig', 'httpPath']}><Input /></Form.Item>
      <Form.Item label="认证方式" name={['apiConfig', 'authType']}>
        <Select><Select.Option value="NONE">NONE</Select.Option><Select.Option value="BASIC">BASIC</Select.Option><Select.Option value="BEARER">BEARER</Select.Option><Select.Option value="HMAC_SHA256">HMAC_SHA256</Select.Option></Select>
      </Form.Item>
      <Form.Item label="认证配置" name={['apiConfig', 'authConfig']}><Input.TextArea rows={3} /></Form.Item>
      <Form.Item label="关联操作" name={['apiConfig', 'operationCode']}>
        <Select>{/* 从 api_operation_metadata 加载 */}</Select>
      </Form.Item>
      
      <div className="divider">字段列表</div>
      <Table dataSource={fields} columns={fieldColumns} rowKey="name" pagination={false} />
      <Button onClick={addField}>+ 添加字段</Button>
      
      <div className="actions">
        <Button onClick={onCancel}>取消</Button>
        <Button type="primary" onClick={handleSave}>保存</Button>
      </div>
    </Form>
  );
};
```
### 3.4 存储逻辑（Java 伪代码）
```java
@RestController
@RequestMapping("/api/entity")
public class ApiEntityController {
    @PostMapping("/api-schemas")
    public ApiResponse saveApiEntity(@RequestBody ApiEntityDto dto) {
        ProgramSchema entity = new ProgramSchema();
        entity.setProgramCode(dto.getProgramCode());
        entity.setEntityType(dto.getEntityType());
        entity.setEntityCategory(dto.getEntityCategory()); // API_REQUEST / API_RESPONSE
        entity.setFieldSchema(buildFieldSchema(dto.getFields()));
        entity.setApiConfig(dto.getApiConfig());
        entity.setStatus("ACTIVE");
        programSchemaRepo.save(entity);
        return ApiResponse.success();
    }
    
    @DeleteMapping("/api-schemas/{entityType}")
    public ApiResponse deleteApiEntity(@PathVariable String entityType) {
        // 检查是否被映射引用
        if (mappingRepo.existsByApiEntityType(entityType)) {
            throw new BusinessException("该 API 实体已被映射引用，无法删除");
        }
        programSchemaRepo.deleteByEntityType(entityType);
        return ApiResponse.success();
    }
}
```
***
## 四、API ↔ 业务实体映射模块（轻量 ChartDB）
### 4.1 功能概述
* 选择渠道和操作（如天猫 → orderCreate）
* 左侧显示 API 实体字段列表（只读），右侧显示业务实体字段列表（只读）
* 从 API 实体字段拖拽连线到业务实体字段（入站），或反向（出站）
* 每条连线代表一个字段映射
* 右侧面板配置映射类型和转换表达式
* 支持数组映射（子映射配置）
### 4.2 页面布局
text
```
┌─ API 映射配置 ──────────────────────────────────────────────────────────┐
│ 模式: [入站 ▼]  渠道: [天猫 ▼]  操作: [orderCreate ▼]  [加载]         │
├──────────────────────────────────────────────────────────────────────────┤
│ ┌─────────────────────┬─────────────────────────────────────────────────┐│
│ │ API 实体字段        │ 业务实体字段                                    ││
│ │ ┌─────────────────┐ │ ┌─────────────────────────────────────────────┐││
│ │ │ ▶ tid           │ │ │ ▶ orderId                                   │││
│ │ │   payment        │ │ │   memberId                                 │││
│ │ │   pay_time       │ │ │   totalAmount                              │││
│ │ │ ▶ orders         │ │ │   status                                   │││
│ │ │   └─ oid         │ │ │   createdAt                                │││
│ │ │   └─ price       │ │ │   paidAt                                   │││
│ │ │   └─ num         │ │ │ ▶ items                                    │││
│ │ └─────────────────┘ │ │   └─ sku                                    │││
│ │                      │ │   └─ quantity                               │││
│ │                      │ │   └─ price                                  │││
│ │                      │ │ └─────────────────────────────────────────────┘││
│ └─────────────────────┴─────────────────────────────────────────────────┘│
│                                                                          │
│ 已配置映射列表（选中连线时高亮）                                           │
│ ┌──────────┬────────────┬──────────────────────────────────────────────┐│
│ │ 源字段   │ 目标字段   │ 转换表达式                                   ││
│ ├──────────┼────────────┼──────────────────────────────────────────────┤│
│ │ tid      │ orderId    │ -                                            ││
│ │ payment  │ totalAmount│ parseFloat                                   ││
│ │ pay_time │ paidAt     │ toISOString                                  ││
│ │ orders   │ items      │ (数组映射，点击展开子映射)                    ││
│ └──────────┴────────────┴──────────────────────────────────────────────┘│
└──────────────────────────────────────────────────────────────────────────┘
```
### 4.3 ChartDB 轻量改造
* 只使用 ChartDB 的节点和连线能力，不需要关系配置
* 自定义节点只展示两个实体（API 实体和业务实体）
* 只支持从 API 实体字段连线到业务实体字段（入站），或反向（出站）
* 连线即字段映射
```tsx
// MappingCanvas.tsx
const MappingCanvas = ({ apiEntity, businessEntity, mode, onMappingChange }) => {
  // 构建两个实体节点
  const nodes = [
    {
      id: 'api-entity',
      type: 'apiEntityNode',
      position: { x: 50, y: 50 },
      data: { entity: apiEntity }
    },
    {
      id: 'business-entity',
      type: 'businessEntityNode',
      position: { x: 400, y: 50 },
      data: { entity: businessEntity }
    }
  ];
  
  // 只有映射连线，没有外键关系
  const handleConnect = (connection) => {
    const sourceField = connection.sourceHandle?.split('.')[1];
    const targetField = connection.targetHandle?.split('.')[1];
    if (!sourceField || !targetField) return;
    
    // 校验方向
    if (mode === 'inbound') {
      // 只能从 API 连到业务
      if (connection.source !== 'api-entity' || connection.target !== 'business-entity') {
        message.error('入站模式只能从 API 实体连到业务实体');
        return;
      }
    } else {
      // 只能从业务连到 API
      if (connection.source !== 'business-entity' || connection.target !== 'api-entity') {
        message.error('出站模式只能从业务实体连到 API 实体');
        return;
      }
    }
    
    const newEdge = {
      id: `${connection.source}-${connection.target}-${sourceField}-${targetField}`,
      source: connection.source,
      target: connection.target,
      sourceHandle: connection.sourceHandle,
      targetHandle: connection.targetHandle,
      data: {
        sourceField,
        targetField,
        mappingType: 'PATH',
        expression: null
      }
    };
    setEdges(prev => [...prev, newEdge]);
    setSelectedEdge(newEdge.id);
  };
  
  return (
    <div className="mapping-canvas">
      <ChartDB
        nodes={nodes}
        edges={edges}
        onConnect={handleConnect}
        onEdgeClick={(edge) => setSelectedEdge(edge.id)}
        nodeTypes={nodeTypes}
      />
      <MappingPanel edge={selectedEdge} onSave={saveMapping} />
    </div>
  );
};
```
### 4.4 映射配置面板
```tsx
// MappingPanel.tsx
const MappingPanel = ({ edge, onSave }) => {
  const [mappingType, setMappingType] = useState('PATH');
  const [expression, setExpression] = useState('');
  const [isArrayMapping, setIsArrayMapping] = useState(false);
  const [itemMappings, setItemMappings] = useState([]);
  
  const functionLibrary = ['parseFloat', 'toISOString', 'formatDate', 'concat', 'default', 'toNumber'];
  
  const handleSave = () => {
    const config = {
      source: edge.data.sourceField,
      target: edge.data.targetField,
      type: mappingType
    };
    if (mappingType === 'EXPRESSION') {
      config.expression = expression;
    } else if (mappingType === 'SCRIPT') {
      config.script = expression;
    } else if (isArrayMapping) {
      config.type = 'ARRAY_MAPPING';
      config.itemMapping = itemMappings;
    }
    onSave(config);
  };
  
  return (
    <div className="mapping-panel">
      <h4>映射配置</h4>
      <div>源字段：{edge?.data?.sourceField}</div>
      <div>目标字段：{edge?.data?.targetField}</div>
      <div>
        <label>映射类型：</label>
        <Select value={mappingType} onChange={setMappingType}>
          <Select.Option value="PATH">直接映射</Select.Option>
          <Select.Option value="EXPRESSION">基础函数</Select.Option>
          <Select.Option value="SCRIPT">自定义脚本</Select.Option>
        </Select>
      </div>
      {mappingType === 'EXPRESSION' && (
        <div>
          <Select placeholder="选择函数" onChange={setExpression}>
            {functionLibrary.map(fn => <Select.Option key={fn} value={fn}>{fn}</Select.Option>)}
          </Select>
        </div>
      )}
      {mappingType === 'SCRIPT' && (
        <MonacoEditor
          language="javascript"
          value={expression}
          onChange={setExpression}
          template={`function transform(value, context) {\n  // 自定义转换逻辑\n  return value;\n}`}
        />
      )}
      {edge?.data?.targetField === 'items' && (
        <div>
          <Button onClick={() => setIsArrayMapping(true)}>配置子映射</Button>
          {isArrayMapping && (
            <ArrayMappingEditor mappings={itemMappings} onChange={setItemMappings} />
          )}
        </div>
      )}
      <Button onClick={handleSave}>保存映射</Button>
    </div>
  );
};
```
### 4.5 存储逻辑（Java 伪代码）
```java
@RestController
@RequestMapping("/api/channels/{channel}")
public class MappingController {
    @GetMapping("/inbound-mappings/{operationCode}")
    public ApiResponse getInboundMappings(@PathVariable String channel, 
                                          @PathVariable String operationCode,
                                          @RequestParam String programCode) {
        ChannelAdapterConfig config = configRepo.findByProgramCodeAndChannel(programCode, channel);
        JSONObject mappings = config.getInboundMappings();
        JSONArray rules = mappings.getJSONArray(operationCode);
        return ApiResponse.success(rules);
    }
    
    @PutMapping("/inbound-mappings/{operationCode}")
    public ApiResponse saveInboundMappings(@PathVariable String channel,
                                           @PathVariable String operationCode,
                                           @RequestParam String programCode,
                                           @RequestBody List<MappingRule> rules) {
        ChannelAdapterConfig config = configRepo.findByProgramCodeAndChannel(programCode, channel);
        JSONObject mappings = config.getInboundMappings();
        if (mappings == null) mappings = new JSONObject();
        mappings.put(operationCode, rules);
        config.setInboundMappings(mappings);
        configRepo.save(config);
        return ApiResponse.success();
    }
}
```
### 4.6 脚本生成器（Java 伪代码）
```java
public class InboundScriptGenerator {
    public String generate(String channel, String operationCode, JSONArray mappings) {
        StringBuilder script = new StringBuilder();
        script.append("function transform(source, context) {\n");
        script.append("    const event = {\n");
        script.append("        event_type: \"").append(determineEventType(operationCode)).append("\",\n");
        script.append("        channel: \"").append(channel).append("\",\n");
        script.append("        idempotent_key: extractIdempotentKey(source),\n");
        script.append("        event_time: new Date().toISOString(),\n");
        script.append("        payload: {}\n");
        script.append("    };\n");
        
        for (Object obj : mappings) {
            JSONObject mapping = (JSONObject) obj;
            String target = mapping.getString("target");
            String type = mapping.getString("type");
            if ("PATH".equals(type)) {
                script.append("    event.payload.").append(target).append(" = getValueByPath(source, \"").append(mapping.getString("source")).append("\");\n");
            } else if ("EXPRESSION".equals(type)) {
                String expr = mapping.getString("expression");
                script.append("    event.payload.").append(target).append(" = ").append(expr).append("(getValueByPath(source, \"").append(mapping.getString("source")).append("\"));\n");
            } else if ("ARRAY_MAPPING".equals(type)) {
                JSONArray itemMappings = mapping.getJSONArray("itemMapping");
                script.append("    event.payload.").append(target).append(" = getValueByPath(source, \"").append(mapping.getString("source")).append("\").map(item => ({\n");
                for (Object sub : itemMappings) {
                    JSONObject subMap = (JSONObject) sub;
                    script.append("        ").append(subMap.getString("target")).append(": ").append(subMap.getString("expression")).append("(item.").append(subMap.getString("source")).append("),\n");
                }
                script.append("    }));\n");
            } else if ("SCRIPT".equals(type)) {
                String scriptCode = mapping.getString("script");
                script.append("    event.payload.").append(target).append(" = (function(value) { ").append(scriptCode).append(" })(getValueByPath(source, \"").append(mapping.getString("source")).append("\"));\n");
            }
        }
        script.append("    return event;\n");
        script.append("}\n");
        return script.toString();
    }
}
```
***
## 五、开发实施步骤
| 步骤 | 模块          | 内容                                                                                                              |
| -- | ----------- | --------------------------------------------------------------------------------------------------------------- |
| 1  | 基础设施        | 数据库扩展（`program_schema` 增加 `entity_category`，`channel_adapter_config` 增加 `inbound_mappings`/`outbound_mappings`） |
| 2  | API 实体      | 实现 CRUD 接口和前端列表+表单                                                                                              |
| 3  | 业务实体        | 改造 ChartDB 右侧面板，实现字段编辑器和关系配置                                                                                    |
| 4  | API 映射      | 实现轻量 ChartDB 画布 + 映射配置面板                                                                                        |
| 5  | 脚本生成        | 实现入站/出站脚本生成器                                                                                                    |
| 6  | LiteFlow 集成 | 标准化组件读取映射配置并执行脚本                                                                                                |
***
## 六、总结
本设计将原有复杂的三合一方案拆分为三个独立模块：
1. **业务实体**：使用 ChartDB 全功能 ER 图，专注数据库建模
2. **API 实体**：无需画布，专注接口数据结构定义
3. **API ↔ 业务实体映射**：使用 ChartDB 轻量画布，专注字段映射关系配置
这种拆分降低了用户学习成本，减少了 ChartDB 改造的复杂度，各模块职责清晰、独立迭代。开发人员可依据本文档逐步实施。
