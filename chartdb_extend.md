# 统一实体建模与映射配置平台设计文档（基于 ChartDB 原生界面扩展）
> **版本**：6.0
> **关联主文档**：基于AI的下一代全渠道忠诚度管理SaaS平台 v7.3
> **设计原则**：
>
> * 完全尊重 ChartDB 现有数据库建模界面与操作习惯（左侧表列表、中央画布、右侧属性面板）。
>
> * 只进行**最小必要扩展**：新增实体类型（业务实体、API 请求/响应实体）、新增连线类型（入站/出站映射）、扩展右侧属性面板以支持字段映射配置和 API 元数据。
>
> * 不重新实现 ChartDB 已有的实体创建、关系连线、字段编辑等基础功能。
***
## 一、设计目标
1. **统一实体管理**：在一个画布中管理**业务实体**（对应数据库表）、**API请求实体**、**API响应实体**，通过节点样式和分组区分。
2. **配置业务实体**：利用 ChartDB 原生的表编辑器定义字段名、类型、长度、主键、默认值、备注等。
3. **配置实体关系**：利用 ChartDB 原生的外键连线功能表达业务实体之间的关联（1:1, 1:N）。
4. **配置 API 实体**：为 API 实体增加额外的元数据（HTTP 方法、路径、认证方式、关联操作等）。
5. **配置字段级映射**：通过拖拽连线建立 API 实体到业务实体（入站）或业务实体到 API 实体（出站）的字段映射，支持直接映射、基础函数转换、自定义脚本，支持一对多数组映射。
6. **配置存储与代码生成**：所有配置持久化到数据库，并自动生成 GraalVM 脚本供 LiteFlow 标准化组件使用。
***
## 二、ChartDB 原生界面回顾与扩展原则
### 2.1 原生界面布局（根据用户截图）
* **左侧边栏**：过滤器、表列表（Table）、DBML、Custom Types、Visuals。
* **中央画布**：ER 图，显示表节点及表之间的关系连线。
* **右侧/底部属性面板**：点击表或字段时显示详细信息，可编辑字段名、类型、主键等。
* **顶部工具栏**：Actions, Edit, View, Backup, Help。
### 2.2 原生支持的能力
* 从左侧拖拽表到画布创建节点。
* 在节点上编辑字段（添加、删除、修改类型、主键等）。
* 创建表之间的外键连线（实线），表示数据库关系。
* 导出 DBML、SQL DDL。
### 2.3 扩展原则
* **不破坏原有功能**：数据库建模功能继续可用。
* **通过“实体类别”扩展节点类型**：表节点默认视为业务实体，新增 API 请求/响应实体作为虚拟节点（不产生真实表）。
* **通过“连线类型”扩展映射能力**：新增入站映射（虚线）和出站映射（点线），与原有外键连线并行。
* **通过“自定义属性面板”扩展配置**：当选中不同类别实体或映射连线时，在属性面板中显示额外配置选项。
***
## 三、扩展改造点详解
### 3.1 节点分类与样式
| 实体类别                     | 图标/边框          | 说明               |
| ------------------------ | -------------- | ---------------- |
| 业务实体 (BUSINESS)          | 蓝色实线边框，表图标     | 对应数据库表，可使用原生表编辑器 |
| API 请求实体 (API_REQUEST)  | 绿色虚线边框，带“请求”徽章 | 虚拟实体，不创建数据库表     |
| API 响应实体 (API_RESPONSE) | 橙色虚线边框，带“响应”徽章 | 虚拟实体，不创建数据库表     |
**实现方式**：在 ChartDB 的自定义节点渲染函数中，根据节点 `data.entityCategory` 返回不同样式和徽章。
### 3.2 左侧表列表扩展
* **原生**：只列出数据库中的真实表（业务实体）。
* **扩展**：在左侧增加“API 请求实体”和“API 响应实体”两个分组，从后端 `program_schema` 表加载实体，支持拖拽到画布。
* **交互**：用户可点击分组标题旁的“+”按钮创建新的 API 实体（弹出模态框输入名称）。
### 3.3 连线类型与约束
| 连线类型                     | 样式   | 源节点类别    | 目标节点类别   | 说明     |
| ------------------------ | ---- | -------- | -------- | ------ |
| 业务关系 (FOREIGN_KEY)      | 蓝色实线 | 业务实体     | 业务实体     | 原生外键关系 |
| 入站映射 (INBOUND_MAPPING)  | 绿色虚线 | API 响应实体 | 业务实体     | 数据接入映射 |
| 出站映射 (OUTBOUND_MAPPING) | 橙色点线 | 业务实体     | API 请求实体 | 数据输出映射 |
**实现方式**：在 `onConnect` 回调中检查源和目标节点的类别，根据上表决定连线类型并创建。不允许其他方向连线。
**字段级连线**：每个字段左右两侧显示小圆点（Handle），支持从源字段拖拽到目标字段，创建字段对映射。连线时自动记录源字段名和目标字段名。
### 3.4 右侧属性面板扩展
ChartDB 支持自定义属性面板组件。我们将根据选中对象的类型动态渲染不同内容。
#### 3.4.1 选中业务实体节点时
* **保留原生字段编辑器**（表格形式）
* **额外增加 Tab**：
  * **基本信息**：实体名称（可改）、实体标识、描述。
  * **字段编辑器**（复用原生）。
  * **API 映射关系**：列出该实体参与的所有入站/出站映射连线，快速跳转。
#### 3.4.2 选中 API 实体节点时
* **基本信息**：实体名称、实体标识、描述、实体类别（API_REQUEST / API_RESPONSE）。
* **字段编辑器**：与业务实体相同的表格编辑器，定义字段名、类型、长度等。
* **API 配置**（新增 Tab）：
  * HTTP 方法（GET/POST/PUT/DELETE）
  * 请求路径（如 `/trade/simple/get`）
  * 认证方式（NONE, BASIC, BEARER, HMAC_SHA256）
  * 认证配置（JSON 格式，如 `{"appKey":"","appSecret":""}`）
  * 关联操作（选择该 API 实体对应的操作代码，如 `orderCreate`）
  * 分页配置（类型、页码参数名等）
#### 3.4.3 选中映射连线时
* **映射编辑器**：
  * **源字段**（只读）
  * **目标字段**（只读）
  * **映射类型**：下拉选择
    * 直接映射
    * 基础函数映射
    * 自定义脚本
  * **转换表达式**：
    * 直接映射：无表达式
    * 基础函数：从内置函数库选择（`parseFloat`, `toISOString`, `formatDate`, `concat`, `default` 等），可嵌套
    * 自定义脚本：Monaco 编辑器，函数签名 `function transform(value, context) { return ... }`
  * **一对多数组映射**（当目标字段为数组类型时）：
    * 显示“配置子映射”按钮，打开模态框定义数组内元素的字段映射。
### 3.5 保存与发布
* **保存**：右侧面板的任何修改实时或通过“保存”按钮提交后端（更新 `program_schema` 或 `channel_adapter_config`）。
* **发布**：顶部工具栏增加“发布”按钮，将当前渠道的映射配置生成为 GraalVM 脚本，并更新 LiteFlow 配置中心（Nacos）。
***
## 四、数据模型（后端存储）
### 4.1 实体存储（复用 `program_schema` 表）
```sql
-- 已有 program_code, entity_type, version, field_schema, entity_relations, api_config, status
-- 新增 entity_category 字段
ALTER TABLE program_schema ADD COLUMN entity_category VARCHAR(20) DEFAULT 'SYSTEM';
COMMENT ON COLUMN program_schema.entity_category IS 'SYSTEM / BUSINESS / API_REQUEST / API_RESPONSE';
```
**`field_schema` 扩展示例（业务实体）**：
```json
{
  "type": "object",
  "properties": {
    "orderId": {
      "type": "string",
      "x-db-metadata": {
        "dataType": "VARCHAR",
        "length": 32,
        "primaryKey": true,
        "nullable": false
      }
    }
  }
}
```
**API 实体额外 `api_config` 示例**：
```json
{
  "httpMethod": "GET",
  "httpPath": "/trade/simple/get",
  "authType": "HMAC_SHA256",
  "authConfig": { "appKey": "", "appSecret": "" },
  "operationCode": "orderCreate",
  "pagination": { "type": "NONE" }
}
```
### 4.2 实体关系与映射存储（复用 `entity_relations` 和 `channel_adapter_config`）
* **业务关系**：存入 `program_schema.entity_relations` JSONB。
* **映射关系**：存入 `channel_adapter_config.inbound_mappings` / `outbound_mappings` JSONB，以 `operationCode` 为键。
示例（入站映射）：
```json
{
  "orderCreate": [
    { "source": "tid", "target": "orderId", "type": "PATH" },
    { "source": "payment", "target": "totalAmount", "type": "EXPRESSION", "expression": "parseFloat" },
    { "source": "orders", "target": "items", "type": "ARRAY_MAPPING", "itemMapping": [
        { "source": "oid", "target": "orderItemId", "type": "PATH" },
        { "source": "num", "target": "quantity", "type": "EXPRESSION", "expression": "toNumber" }
    ] }
  ]
}
```
### 4.3 API 操作元数据表（独立）
```sql
CREATE TABLE api_operation_metadata (
    id BIGSERIAL PRIMARY KEY,
    program_code VARCHAR(32) NOT NULL,
    channel VARCHAR(50) NOT NULL,
    operation_code VARCHAR(64) NOT NULL,
    operation_name VARCHAR(128) NOT NULL,
    direction VARCHAR(10) NOT NULL, -- INBOUND / OUTBOUND
    target_business_entity VARCHAR(64),
    source_business_entity VARCHAR(64),
    api_entity_type VARCHAR(64),
    http_method VARCHAR(10),
    http_path VARCHAR(256),
    auth_type VARCHAR(32),
    auth_config JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(program_code, channel, operation_code)
);
```
***
## 五、前端实现概述
### 5.1 集成 ChartDB 组件
ChartDB 提供 React 组件 `ChartDB`，我们可以将其嵌入管理后台页面。通过 `onNodeClick`, `onEdgeClick` 等回调获取选中对象，然后在自定义属性面板中渲染扩展内容。
### 5.2 自定义节点渲染
```tsx
// 注册自定义节点类型
const nodeTypes = {
  table: CustomTableNode,  // 扩展默认表节点
  api_request: ApiRequestNode,
  api_response: ApiResponseNode,
};
```
在 `CustomTableNode` 中，根据节点数据的 `entityCategory` 区分业务实体或 API 实体，调整样式。
### 5.3 自定义连线渲染
```tsx
const edgeTypes = {
  foreignKey: ForeignKeyEdge,   // 原有实线
  inbound: InboundMappingEdge,  // 虚线
  outbound: OutboundMappingEdge, // 点线
};
```
### 5.4 自定义属性面板
ChartDB 允许通过 `propertyPanel` 属性传入自定义组件。我们根据当前选中项的类型（节点/连线）及类别渲染不同内容。
```tsx
<ChartDB
  nodes={nodes}
  edges={edges}
  onConnect={handleConnect}
  propertyPanel={({ selectedItem }) => {
    if (selectedItem.type === 'node') {
      if (selectedItem.data.entityCategory === 'BUSINESS')
        return <BusinessEntityPanel node={selectedItem} />;
      else
        return <ApiEntityPanel node={selectedItem} />;
    } else if (selectedItem.type === 'edge') {
      return <MappingEdgePanel edge={selectedItem} />;
    }
    return null;
  }}
/>
```
### 5.5 关键交互伪代码
#### 创建新 API 实体
```ts
const createApiEntity = async (category: 'API_REQUEST' | 'API_RESPONSE', name: string) => {
  const newEntity = {
    programCode: currentProgram,
    entityType: name,
    entityCategory: category,
    version: 'v1',
    fieldSchema: { type: 'object', properties: {} },
    apiConfig: { httpMethod: 'GET', httpPath: '', authType: 'NONE' }
  };
  const saved = await axios.post('/api/entity/schemas', newEntity);
  // 添加到画布节点
  addNode({ id: saved.id, type: category === 'API_REQUEST' ? 'api_request' : 'api_response', position: { x: 100, y: 100 }, data: saved });
};
```
#### 处理字段级连线
```ts
const handleConnect = (connection) => {
  const sourceNode = nodes.find(n => n.id === connection.source);
  const targetNode = nodes.find(n => n.id === connection.target);
  const sourceField = connection.sourceHandle.split('.')[1];
  const targetField = connection.targetHandle.split('.')[1];
  let relationType = null;
  if (sourceNode.data.entityCategory === 'API_RESPONSE' && targetNode.data.entityCategory === 'BUSINESS')
    relationType = 'INBOUND_MAPPING';
  else if (sourceNode.data.entityCategory === 'BUSINESS' && targetNode.data.entityCategory === 'API_REQUEST')
    relationType = 'OUTBOUND_MAPPING';
  else if (sourceNode.data.entityCategory === 'BUSINESS' && targetNode.data.entityCategory === 'BUSINESS')
    relationType = 'FOREIGN_KEY';
  else return;
  const newEdge = {
    id: `${connection.source}-${connection.target}-${sourceField}-${targetField}`,
    source: connection.source,
    target: connection.target,
    sourceHandle: connection.sourceHandle,
    targetHandle: connection.targetHandle,
    type: relationType.toLowerCase(),
    data: {
      relationType,
      sourceField,
      targetField,
      mappingConfig: { type: 'PATH' }
    }
  };
  addEdge(newEdge);
};
```
#### 映射面板保存
```ts
const saveMapping = async (edge, mappingConfig) => {
  const { sourceNode, targetNode } = getNodesFromEdge(edge);
  const operationCode = determineOperationCode(sourceNode, targetNode);
  const direction = edge.data.relationType === 'INBOUND_MAPPING' ? 'inbound' : 'outbound';
  await axios.put(`/api/channels/${currentChannel}/${direction}-mappings/${operationCode}`, {
    mappings: [mappingConfig]  // 实际需合并到现有映射列表
  });
};
```
***
## 六、后端伪代码
### 6.1 入站脚本生成器
```java
public String generateInboundScript(String channel, String operationCode, JSONArray mappings) {
    StringBuilder script = new StringBuilder();
    script.append("function transform(source, context) {n");
    script.append("    const event = { event_type: 'ORDER', channel: '").append(channel).append("', idempotent_key: source.tid, event_time: new Date().toISOString(), payload: {} };n");
    for (Object obj : mappings) {
        JSONObject mapping = (JSONObject) obj;
        String target = mapping.getString("target");
        String type = mapping.getString("type");
        if ("PATH".equals(type)) {
            script.append("    event.payload.").append(target).append(" = getValueByPath(source, "").append(mapping.getString("source")).append("");n");
        } else if ("EXPRESSION".equals(type)) {
            script.append("    event.payload.").append(target).append(" = ").append(mapping.getString("expression")).append("(getValueByPath(source, "").append(mapping.getString("source")).append(""));n");
        } else if ("ARRAY_MAPPING".equals(type)) {
            script.append("    event.payload.").append(target).append(" = getValueByPath(source, "").append(mapping.getString("source")).append("").map(item => ({n");
            for (Object sub : mapping.getJSONArray("itemMapping")) {
                JSONObject subMap = (JSONObject) sub;
                script.append("        ").append(subMap.getString("target")).append(": ").append(subMap.getString("expression")).append("(item.").append(subMap.getString("source")).append("),n");
            }
            script.append("    }));n");
        } else if ("SCRIPT".equals(type)) {
            script.append("    event.payload.").append(target).append(" = (function(value) { ").append(mapping.getString("script")).append(" })(getValueByPath(source, "").append(mapping.getString("source")).append(""));n");
        }
    }
    script.append("    return event;n");
    script.append("}n");
    return script.toString();
}
```
### 6.2 标准化组件集成
```java
@Component("standardizeCmp")
public class StandardizeComponent extends BaseLiteflowComponent {
    @Override
    protected void doProcess(EventContext ctx) {
        String programCode = ctx.getProgramCode();
        String channel = ctx.getChannel();
        String rawPayload = ctx.getRawPayload();
        String operationCode = extractOperationCode(rawPayload);
        ChannelAdapterConfig config = configRepo.findByProgramCodeAndChannel(programCode, channel);
        JSONArray mappings = config.getInboundMappings().getJSONArray(operationCode);
        String script = scriptCache.get(programCode, channel, operationCode);
        if (script == null) {
            script = scriptGenerator.generateInboundScript(channel, operationCode, mappings);
            scriptCache.put(programCode, channel, operationCode, script);
        }
        TransactionEvent event = graalvmExecutor.execute(script, rawPayload);
        ctx.setTransactionEvent(event);
    }
}
```
***
## 七、开发步骤
1. **搭建 ChartDB 开发环境**：在管理后台中嵌入 ChartDB React 组件。
2. **实现自定义节点**：区分业务实体、API 请求、API 响应。
3. **实现自定义连线**：支持三种连线类型，并实现方向校验。
4. **实现自定义属性面板**：根据选中对象动态显示表单（字段编辑器、API 配置、映射编辑器）。
5. **实现左侧实体分组**：从后端加载 API 实体列表，支持拖拽。
6. **完成后端 API**：实体 CRUD、映射保存、脚本生成、测试接口。
7. **集成 LiteFlow**：使标准化组件读取映射配置并执行脚本。
8. **测试**：使用天猫订单接入场景验证完整流程。
***
## 八、总结
本文档详细阐述了如何基于 **ChartDB 原生数据库建模界面** 进行最小扩展，实现忠诚度平台所需的业务实体、API 实体管理和字段级映射配置。核心改造包括：
* 新增实体类型（API 请求/响应）并在左侧列表和画布节点中区分。
* 新增连线类型（入站/出站映射），支持字段级拖拽。
* 扩展右侧属性面板，为 API 实体增加 HTTP 元数据，为映射连线提供表达式/脚本配置。
* 所有配置存储复用现有表结构，并生成 GraalVM 脚本供 LiteFlow 使用。
本设计完全尊重 ChartDB 原有操作习惯，避免重复造轮子，同时满足平台对灵活数据接入和输出的需求。开发人员可依据本文档实施。
==============================
补充设计
在 ChartDB 的架构基础上，我们来深入探讨业务实体管理、API 实体管理这两个核心模块，以及如何改造 ChartDB 以满足忠诚度平台的需求。
### 核心数据结构
要支撑业务实体和 API 实体的管理，我们需要在 ChartDB 现有表结构上增加新的字段类型。
#### `program_schema` 表扩展
这是存储所有实体元数据的核心。我们需要增加一个 `entity_category` 字段来明确区分实体类型。
```sql
-- 在 program_schema 表中增加分类字段
ALTER TABLE program_schema ADD COLUMN entity_category VARCHAR(20) DEFAULT 'SYSTEM';
COMMENT ON COLUMN program_schema.entity_category IS 'SYSTEM / BUSINESS / API_REQUEST / API_RESPONSE';
-- 示例数据：一个业务实体和一个API请求实体
INSERT INTO program_schema (program_code, entity_type, entity_category, version, field_schema, api_config, status)
VALUES
    ('BRAND_A', 'Order', 'BUSINESS', 'v1', 
     '{ "type": "object", "properties": { "orderId": { "type": "string", "primaryKey": true } } }'::jsonb, 
     '{}'::jsonb, 
     'ACTIVE'),
    ('BRAND_A', 'OrderCreateReq', 'API_REQUEST', 'v1',
     '{ "type": "object", "properties": { "userId": { "type": "string" } } }'::jsonb, 
     '{ "httpMethod": "POST", "httpPath": "/api/order/create", "authType": "BEARER" }'::jsonb, 
     'ACTIVE');
```
***
### 一、业务实体管理
业务实体是我们最终需要落库的数据实体。它的核心任务是定义清晰、严格的表结构。
#### 1.1 属性定义
我们采用数据库表风格的编辑器来定义字段，所有配置都保存在 `field_schema` 字段中。这种编辑器能更直观地表达字段的数据库属性。
| 字段名        | 数据类型    | 长度/精度  | 主键 | 允许空 | 默认值  | 描述     |
| ---------- | ------- | ------ | -- | --- | ---- | ------ |
| id         | VARCHAR | 36     | ✅  | ❌   | -    | 订单唯一ID |
| member_id | VARCHAR | 36     | ❌  | ❌   | -    | 关联会员ID |
| amount     | DECIMAL | (10,2) | ❌  | ✅   | 0.00 | 订单总金额  |
***
### 二、API 实体管理
API 实体用于定义外部系统的请求或响应格式，它不产生数据库表。
#### 2.1 属性定义
API 实体的字段编辑器与业务实体相同，但后端不会为其生成 DDL。其核心元数据保存在 `api_config` 字段中：
| 配置项     | 说明                                                                |
| ------- | ----------------------------------------------------------------- |
| 关联操作    | 选择该 API 实体对应的操作代码（如 `orderCreate`），从 `api_operation_metadata` 表读取 |
| HTTP 方法 | GET, POST, PUT, DELETE                                            |
| 请求路径    | 如 `/trade/simple/get`                                             |
| 认证方式    | NONE, BASIC, BEARER, HMAC_SHA256                                 |
| 分页类型    | NONE, PAGE_NUMBER, CURSOR                                        |
> 注意：`api_operation_metadata` 是独立的操作元数据表，它定义了具体接口的业务信息，并关联了对应的 API 实体。
***
### 三、ChartDB 改造方案（核心）
本方案的核心思想是**复用 ChartDB 的画布和基础交互，仅通过扩展其核心组件和注入自定义 UI，来支持忠诚度平台的特定需求**，而不是另起炉灶。
#### 3.1 扩展点概览
| 扩展点       | 原生 ChartDB 能力 | 扩展方式                                                                                                   |
| --------- | ------------- | ------------------------------------------------------------------------------------------------------ |
| **节点渲染**  | 统一的数据库表样式     | 在自定义节点组件中，根据 `entityCategory` 渲染不同样式、颜色、标签和图标。                                                         |
| **字段级连线** | 表级连线          | 为节点上的每个字段创建独立的 Handle 连线端点。                                                                            |
| **连线类型**  | 仅支持外键关系       | 扩展 `relationType` 枚举（`FOREIGN_KEY`, `INBOUND_MAPPING`, `OUTBOUND_MAPPING`），并通过自定义边组件，根据类型渲染不同线型、颜色和箭头。 |
| **属性面板**  | 展示表结构和简单编辑    | 根据选中的是节点还是连线，动态加载不同的自定义 UI 组件。                                                                         |
#### 3.2 核心交互与组件改造
##### 3.2.1 自定义节点渲染
为了让用户能直观区分不同类型的实体（业务、API请求、API响应），我们需要扩展节点组件。每个节点内部的**每个字段都会渲染单独的连线锚点（Handle）**，这是实现字段级映射的基础。
```tsx
// CustomEntityNode.tsx
// 根据实体类别，返回不同的节点样式和徽章
const getNodeStyle = (category: string) => { ... };
export const CustomEntityNode = ({ data }: { data: EntityNodeData }) => {
  // 遍历 data.fields，为每个字段渲染名称、类型以及连线所用的 Handle
  return (
    <div style={{ ...getNodeStyle(data.category) }}>
      <div>{data.name}</div>
      <div>{data.category === 'API_REQUEST' && <Tag>请求</Tag>}</div>
      <div>
        {data.fields.map(field => (
          <div key={field.name}>
            <span>{field.name} ({field.type})</span>
            <Handle type="source" position={Position.Right} id={`${data.id}.${field.name}`} />
            <Handle type="target" position={Position.Left} id={`${data.id}.${field.name}`} />
          </div>
        ))}
      </div>
    </div>
  );
};
```
##### 3.2.2 自定义连线与校验
在用户创建连线时，我们需要通过 `onConnect` 回调进行合法性校验，确保连线的方向正确。例如，只允许从 `API_RESPONSE` 实体连线到 `BUSINESS` 实体。
```tsx
// UnifiedEntityModeling.tsx
const handleConnect = (connection) => {
  const sourceNode = getNode(connection.source);
  const targetNode = getNode(connection.target);
  const sourceField = connection.sourceHandle.split('.')[1];
  const targetField = connection.targetHandle.split('.')[1];
  // 校验实体类别和连线方向
  if (sourceNode.category === 'API_RESPONSE' && targetNode.category === 'BUSINESS') {
    // 创建入站映射连线（虚线）
    addEdge({ ..., type: 'inbound', data: { sourceField, targetField } });
  } else if (sourceNode.category === 'BUSINESS' && targetNode.category === 'BUSINESS') {
    // 创建业务关系连线（实线）
    addEdge({ ..., type: 'foreignKey', data: { sourceField, targetField } });
  } else {
    alert('不支持的连线方向');
  }
};
```
##### 3.2.3 自定义属性面板
这是实现复杂配置的关键。当用户点击画布中的不同元素时，右侧面板会动态切换内容，以加载相应的配置 UI。
```tsx
// UnifiedEntityModeling.tsx
<ChartDB propertyPanel={({ selectedItem }) => {
  if (selectedItem.type === 'node') {
    // 1. 获取实体数据
    const entity = getEntity(selectedItem.id);
    // 2. 根据实体类别返回不同的组件
    if (entity.category === 'BUSINESS') {
      // 显示业务实体配置的 UI：基本信息 + 字段表格（可增删字段、设置主键类型等）
      return <BusinessEntityPanel entity={entity} />;
    } else if (entity.category.startsWith('API_')) {
      // 显示 API 实体配置的 UI：基本信息 + 字段表格 + API 配置表单（HTTP方法、认证方式等）
      return <ApiEntityPanel entity={entity} />;
    }
  } else if (selectedItem.type === 'edge') {
    // 3. 显示字段映射配置的 UI：源/目标字段选择、内置函数列表、Monaco脚本编辑器等
    return <MappingPanel edge={selectedItem} />;
  }
  return null;
}} />
```
| 组件                    | 功能                                             |
| --------------------- | ---------------------------------------------- |
| `BusinessEntityPanel` | 用于管理业务实体，包含字段表格编辑器（支持增删字段、设置主键和类型）。            |
| `ApiEntityPanel`      | 用于管理 API 实体，包含字段编辑器和一个专门配置 HTTP 方法、路径、认证方式的表单。 |
| `MappingPanel`        | 用于配置字段级映射关系，支持源/目标字段选择、内置函数、以及 Monaco 脚本编辑器。   |
通过以上细致的模块划分和改造，我们可以充分利用 ChartDB 优秀的可视化基础，构建出强大且易于使用的忠诚度平台元数据管理中心。
===============================
细节补充
# 统一实体建模与映射配置平台设计文档（基于 ChartDB 完整版）
> **版本**：7.0
> **关联主文档**：基于AI的下一代全渠道忠诚度管理SaaS平台 v7.3
> **设计原则**：
>
> * **完全尊重 ChartDB 原有界面与操作习惯**（左侧表列表、中央画布、右侧属性面板）。
>
> * **仅扩展必要功能**：实体分类（业务/API请求/API响应）、连线类型（入站/出站映射）、右侧面板动态切换（节点属性/映射配置）。
>
> * **所有配置内嵌于画布工作区**，不使用弹窗（Modal），均通过右侧面板或底部抽屉完成。
>
> * **字段级映射**通过拖拽连线 + 右侧面板配置，支持直接映射、基础函数、自定义脚本、一对多数组映射。
>
> * **数据存储**复用 `program_schema` 和 `channel_adapter_config` 表。
***
## 一、设计目标
1. **统一实体管理**：在 ER 图画布上同时管理业务实体、API 请求实体、API 响应实体，通过节点样式和颜色区分。
2. **业务实体配置**：利用数据库表风格的属性编辑器定义字段（字段名、数据类型、长度、主键、允许空、默认值、备注）。
3. **API 实体配置**：与业务实体类似，额外提供 HTTP 方法、路径、认证方式、关联操作等元数据。
4. **实体关系配置**：通过外键连线（实线）配置业务实体间的关系（1:1, 1:N）。
5. **API↔业务实体映射**：
   * **入站映射**：从 API 响应实体字段拖拽连线到业务实体字段，配置字段转换（直接映射、基础函数、脚本）。
   * **出站映射**：从业务实体字段拖拽连线到 API 请求实体字段。
   * 支持一对多数组映射（如 API 返回的订单列表 → 业务订单明细）。
6. **配置驱动**：所有配置存储到数据库，运行时生成 GraalVM 脚本供 LiteFlow 标准化组件使用。
***
## 二、ChartDB 扩展改造细节
### 2.1 整体架构
* **前端**：React + TypeScript + `@chartdb/react` + Ant Design + Monaco Editor。
* **后端**：Java Spring Boot，复用 `program_schema`、`channel_adapter_config` 表。
### 2.2 扩展示意图
text
```
┌─────────────────────────────────────────────────────────────────────────┐
│ 顶部工具栏：模式(入站/出站) | 渠道选择 | 保存 | 发布 | 导入/导出          │
├─────────────────────────────────────────────────────────────────────────┤
│ ┌─────────────────────────────────────────────────────────────────────┐ │
│ │                         ChartDB 画布                                │ │
│ │  ┌──────────┐ (虚线)    ┌──────────┐                               │ │
│ │  │TmallResp │ ─ ─ ─ →  │  Order   │                               │ │
│ │  │(API响应) │           │ (业务)   │                               │ │
│ │  └──────────┘           └────┬─────┘                               │ │
│ │                              │ (实线)                               │ │
│ │                              ▼                                      │ │
│ │                       ┌──────────┐                                 │ │
│ │                       │ OrderItem│                                 │ │
│ │                       │ (业务)   │                                 │ │
│ │                       └──────────┘                                 │ │
│ │  ┌──────────┐ (点线)    ┌──────────┐                               │ │
│ │  │ PointTx  │ ─ ─ →     │PointsReq │                               │ │
│ │  │ (业务)   │           │(API请求) │                               │ │
│ │  └──────────┘           └──────────┘                               │ │
│ └─────────────────────────────────────────────────────────────────────┘ │
│                                                                          │
│ ┌─────────────────────────────────────────────────────────────────────┐ │
│ │ 右侧面板（根据选中项动态切换）                                       │ │
│ │   - 选中节点 → 实体属性编辑器（字段表格 + API配置）                  │ │
│ │   - 选中连线 → 映射配置编辑器（源/目标字段、转换表达式）              │ │
│ └─────────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────────┘
```
### 2.3 需要扩展的 ChartDB 能力
| 原生功能   | 扩展需求                | 实现方式                                                                                            |
| ------ | ------------------- | ----------------------------------------------------------------------------------------------- |
| 节点样式统一 | 区分业务实体、API请求、API响应  | 自定义节点组件，根据 `entityCategory` 返回不同背景色、边框样式，并显示标签                                                  |
| 字段级连线  | 每个字段暴露独立 Handle     | 在节点组件内遍历 `fields`，为每个字段渲染 `Handle`（左右各一个）                                                       |
| 连线类型   | 增加入站映射（虚线）和出站映射（点线） | 扩展边类型枚举，自定义边组件，根据 `relationType` 渲染不同线型和颜色                                                      |
| 连线约束   | 只允许合法方向             | 在 `onConnect` 中校验源/目标节点类别： • API响应 → 业务实体（入站） • 业务实体 → API请求（出站） • 业务实体 ↔ 业务实体（外键）              |
| 右侧面板   | 根据选中对象展示不同 UI       | 使用 ChartDB 的 `propertyPanel` 自定义组件，动态返回 `BusinessEntityPanel`, `ApiEntityPanel`, `MappingPanel` |
| 映射配置界面 | ChartDB 无此功能，需完全自研  | 右侧面板中显示字段映射表格，支持拖拽添加、表达式/脚本编辑、子映射嵌套                                                             |
### 2.4 自定义节点实现（字段级 Handle）
tsx
```
// CustomEntityNode.tsx
import { Handle, Position } from 'reactflow';
import { Tag } from 'antd';
const getNodeStyle = (category: string) => {
  switch (category) {
    case 'BUSINESS':
      return { backgroundColor: '#e6f7ff', border: '2px solid #1890ff' };
    case 'API_REQUEST':
      return { backgroundColor: '#f6ffed', border: '2px dashed #52c41a' };
    case 'API_RESPONSE':
      return { backgroundColor: '#fff7e6', border: '2px dashed #fa8c16' };
    default:
      return { backgroundColor: '#fafafa', border: '1px solid #d9d9d9' };
  }
};
export const CustomEntityNode = ({ data }: { data: EntityNodeData }) => {
  const { entityName, entityCategory, fields, description } = data;
  return (
    <div style={{ padding: 10, borderRadius: 8, width: 280, ...getNodeStyle(entityCategory) }}>
      <div style={{ fontWeight: 'bold', marginBottom: 8 }}>
        {entityName}
        {entityCategory === 'API_REQUEST' && <Tag color="green" style={{ marginLeft: 8 }}>请求</Tag>}
        {entityCategory === 'API_RESPONSE' && <Tag color="orange" style={{ marginLeft: 8 }}>响应</Tag>}
      </div>
      <div style={{ fontSize: 12, color: '#666', marginBottom: 12 }}>{description}</div>
      <div style={{ borderTop: '1px solid #eee', paddingTop: 8 }}>
        {fields.map((field) => (
          <div key={field.name} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4, alignItems: 'center' }}>
            <span style={{ fontFamily: 'monospace' }}>
              {field.name}
              {field.isPrimaryKey && <span style={{ color: '#faad14' }}> 🔑</span>}
            </span>
            <span style={{ color: '#999' }}>{field.dataType}{field.length ? `(${field.length})` : ''}</span>
            <div style={{ display: 'flex', gap: 4 }}>
              <Handle type="target" position={Position.Left} id={`${entityName}.${field.name}`} style={{ background: '#555', width: 8, height: 8 }} />
              <Handle type="source" position={Position.Right} id={`${entityName}.${field.name}`} style={{ background: '#555', width: 8, height: 8 }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
```
### 2.5 自定义连线类型与渲染
typescript
```
// edgeTypes.ts
export const edgeTypes = {
  foreignKey: (props: EdgeProps) => <CustomEdge {...props} stroke="#1890ff" strokeDasharray="none" />,
  inbound: (props: EdgeProps) => <CustomEdge {...props} stroke="#52c41a" strokeDasharray="5,5" />,
  outbound: (props: EdgeProps) => <CustomEdge {...props} stroke="#fa8c16" strokeDasharray="2,4" />,
};
```
tsx
```
// CustomEdge.tsx
export const CustomEdge = ({ id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, style, markerEnd, data }) => {
  const [edgePath] = getBezierPath({ sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition });
  const strokeColor = data?.stroke || '#1890ff';
  const strokeDasharray = data?.strokeDasharray || 'none';
  return (
    <>
      <path id={id} style={{ ...style, stroke: strokeColor, strokeDasharray }} className="react-flow__edge-path" d={edgePath} markerEnd={markerEnd} />
      {data?.mappingRule && (
        <text>
          <textPath href={`#${id}`} startOffset="50%" textAnchor="middle" fill="#333" fontSize="10">
            {data.mappingRule.expression || '映射'}
          </textPath>
        </text>
      )}
    </>
  );
};
```
### 2.6 连线创建与校验（字段级）
tsx
```
const handleConnect = (connection: Connection) => {
  const sourceNode = nodes.find(n => n.id === connection.source);
  const targetNode = nodes.find(n => n.id === connection.target);
  if (!sourceNode || !targetNode) return;
  // 提取字段名（Handle id 格式: entityName.fieldName）
  const sourceField = connection.sourceHandle?.split('.')[1];
  const targetField = connection.targetHandle?.split('.')[1];
  if (!sourceField || !targetField) {
    message.error('请从字段 Handle 拖拽连线');
    return;
  }
  const sourceCategory = sourceNode.data.entityCategory;
  const targetCategory = targetNode.data.entityCategory;
  let relationType = null;
  if (sourceCategory === 'API_RESPONSE' && targetCategory === 'BUSINESS') {
    relationType = 'inbound';
  } else if (sourceCategory === 'BUSINESS' && targetCategory === 'API_REQUEST') {
    relationType = 'outbound';
  } else if (sourceCategory === 'BUSINESS' && targetCategory === 'BUSINESS') {
    relationType = 'foreignKey';
  } else {
    message.error('不支持的连线方向');
    return;
  }
  const newEdge = {
    id: `${connection.source}-${connection.target}-${sourceField}-${targetField}`,
    source: connection.source,
    target: connection.target,
    sourceHandle: connection.sourceHandle,
    targetHandle: connection.targetHandle,
    type: relationType,
    data: {
      relationType,
      sourceField,
      targetField,
      mappingRule: { source: sourceField, target: targetField, type: 'PATH' }
    }
  };
  setEdges(prev => [...prev, newEdge]);
  setSelectedItem({ type: 'edge', id: newEdge.id }); // 自动打开右侧映射面板
};
```
***
## 三、实体配置（业务实体与 API 实体）
### 3.1 实体创建
* 画布左上角悬浮工具栏提供按钮：“业务实体”、“API请求”、“API响应”。
* 点击后鼠标变为十字，在画布空白处单击创建新节点（自动生成唯一 ID、默认名称、空字段列表）。
* 节点选中后右侧面板编辑属性。
### 3.2 右侧面板设计（节点属性编辑器）
右侧面板使用 `Tabs` 组件，根据实体类别动态显示选项卡。
#### 3.2.1 基本信息 Tab（所有实体）
* 实体名称（可编辑）
* 实体标识（只读，自动生成）
* 实体类别（只读，创建时确定）
* 描述（文本域）
#### 3.2.2 字段编辑器 Tab（数据库表风格）
使用可编辑表格（`antd.Table` + 行内编辑器）管理字段：
| 字段名     | 数据类型    | 长度/精度 | 主键  | 允许空 | 默认值 | 备注  | 操作 |
| ------- | ------- | ----- | --- | --- | --- | --- | -- |
| orderId | VARCHAR | 32    | ✓   | ✗   | -   | 订单号 | 删除 |
| ...     | ...     | ...   | ... | ... | ... | ... | 删除 |
* 数据类型下拉：`VARCHAR`, `INT`, `DECIMAL`, `DATETIME`, `BOOLEAN`, `TEXT`, `JSON`。
* 主键、允许空使用 `Switch`。
* 长度/精度：VARCHAR 显示长度输入框，DECIMAL 显示 `总位数,小数位数`。
* 支持“添加字段”按钮新增行，支持粘贴 Excel 数据批量导入。
**存储**：每个字段的完整元数据保存到节点 `data.fields`，并同步生成 JSON Schema 存入 `program_schema.field_schema`（使用 `x-db-metadata` 扩展字段）。
#### 3.2.3 API 配置 Tab（仅 API 实体显示）
| 配置项     | 控件       | 说明                                       |
| ------- | -------- | ---------------------------------------- |
| 关联操作    | 下拉选择     | 从 `api_operation_metadata` 表读取操作代码       |
| HTTP 方法 | 下拉       | GET, POST, PUT, DELETE                   |
| 请求路径    | 文本输入     | 如 `/trade/simple/get`                    |
| 认证方式    | 下拉       | NONE, BASIC, BEARER, HMAC_SHA256        |
| 认证配置    | JSON 编辑器 | 存储具体密钥（如 `{"appKey":"","appSecret":""}`） |
| 分页类型    | 下拉       | NONE, PAGE_NUMBER, CURSOR               |
这些元数据存储到 `program_schema.api_config` JSONB 字段。
#### 3.2.4 关系 Tab
显示该实体参与的所有关系（从全局 edges 中筛选），提供“删除关系”按钮。
### 3.3 实体删除
在基本信息 Tab 底部放置“删除实体”按钮，确认后移除节点及其所有相关连线。
***
## 四、API ↔ 业务实体映射配置（字段级转换）
### 4.1 映射连线创建
* 用户通过顶部工具栏选择“入站”或“出站”模式。
* 从 API 响应实体的字段拖拽连线到业务实体的字段（入站），或从业务实体字段拖拽到 API 请求实体字段（出站）。
* 松开后自动创建对应类型的连线，并自动选中该连线，右侧面板显示映射配置编辑器。
### 4.2 映射配置界面（右侧面板）
映射配置编辑器位于右侧面板，不使用弹窗。界面分为三部分：
* **头部**：显示源实体、目标实体、源字段、目标字段（只读）。
* **映射类型选择**：下拉选择（直接映射 / 基础函数 / 自定义脚本）。
* **表达式/脚本编辑区**：根据类型显示不同控件。
  * **直接映射**：无额外输入。
  * **基础函数**：提供常用函数库下拉（`parseFloat`, `toISOString`, `formatDate`, `concat`, `default`, `toNumber` 等），可嵌套。
  * **自定义脚本**：使用 Monaco 编辑器编写 JavaScript 函数，模板 `function transform(value, context) { ... }`。
* **数组映射特殊处理**：当目标字段类型为 `array` 时，显示“配置子映射”按钮，点击后在右侧面板下方展开子映射表格（或替换当前表格），定义数组元素内部的字段映射关系。子映射同样支持直接映射、函数、脚本。
**布局示例**：
text
```
┌─ 映射配置（连线：TmallOrderResp.tid → Order.orderId） ─────────────┐
│ 映射类型： [直接映射 ▼]                                             │
│ （直接映射时无表达式）                                               │
├─────────────────────────────────────────────────────────────────────┤
│ 若选择“基础函数”：                                                   │
│   函数： [parseFloat ▼]  参数： [payment]                            │
├─────────────────────────────────────────────────────────────────────┤
│ 若选择“自定义脚本”：                                                 │
│   ┌─────────────────────────────────────────────────────────────┐   │
│   │ function transform(value, context) {                        │   │
│   │   return parseFloat(value) * 100;                           │   │
│   │ }                                                           │   │
│   └─────────────────────────────────────────────────────────────┘   │
├─────────────────────────────────────────────────────────────────────┤
│ 数组映射（当目标为数组时）：                                         │
│   [ 配置子映射 ]                                                    │
│   子映射表格（展开后）：                                             │
│   ┌──────────┬──────────┬─────────────────────────────────────┐   │
│   │ 源字段   │ 目标字段 │ 转换表达式                           │   │
│   ├──────────┼──────────┼─────────────────────────────────────┤   │
│   │ oid      │ itemId   │ -                                    │   │
│   │ num      │ quantity │ toNumber                             │   │
│   └──────────┴──────────┴─────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────┘
```
### 4.3 存储 JSON 格式
映射配置存储到 `channel_adapter_config.inbound_mappings` 或 `outbound_mappings`，以 `operationCode` 为键。每条映射规则的结构：
```json
{
  "orderCreate": [
    {
      "source": "tid",
      "target": "orderId",
      "type": "PATH"
    },
    {
      "source": "payment",
      "target": "totalAmount",
      "type": "EXPRESSION",
      "expression": "parseFloat"
    },
    {
      "source": "orders",
      "target": "items",
      "type": "ARRAY_MAPPING",
      "itemMapping": [
        { "source": "oid", "target": "orderItemId", "type": "PATH" },
        { "source": "num", "target": "quantity", "type": "EXPRESSION", "expression": "toNumber" }
      ]
    },
    {
      "source": "pay_time",
      "target": "paidAt",
      "type": "SCRIPT",
      "script": "function transform(value, context) { return new Date(value).toISOString(); }"
    }
  ]
}
```
### 4.4 内置函数库
| 函数名                            | 说明      | 示例                                    |
| ------------------------------ | ------- | ------------------------------------- |
| `toString`                     | 转字符串    | `toString(value)`                     |
| `toNumber`                     | 转数字     | `toNumber(value)`                     |
| `parseFloat`                   | 解析浮点数   | `parseFloat(payment)`                 |
| `toISOString`                  | 日期转 ISO | `toISOString(pay_time)`               |
| `formatDate(value, format)`    | 日期格式化   | `formatDate(createdAt, 'yyyy-MM-dd')` |
| `concat(sep, ...fields)`       | 字符串拼接   | `concat(' ', firstName, lastName)`    |
| `default(value, defaultValue)` | 默认值     | `default(phone, '未知')`                |
### 4.5 自定义脚本编辑器（Monaco）
* 提供完整 JavaScript 语法高亮、自动补全。
* 脚本接收 `value`（源字段值）和 `context`（辅助对象，如 `context.getRoot()` 获取原始 JSON 根对象）。
* 脚本应返回转换后的值。
***
## 五、后端 API 与伪代码
### 5.1 实体元数据 API
```java
@RestController
@RequestMapping("/api/entity")
public class EntityMetadataController {
    @PostMapping("/schemas")
    public ApiResponse saveEntity(@RequestBody ProgramSchemaDto dto) {
        // 保存到 program_schema 表
    }
    @GetMapping("/schemas")
    public ApiResponse listEntities(@RequestParam String programCode, @RequestParam(required=false) String category) {
        // 查询 program_schema，按 entity_category 过滤
    }
    @GetMapping("/relations")
    public ApiResponse getRelations(@RequestParam String programCode) {
        // 从 program_schema.entity_relations 汇总返回
    }
}
```
### 5.2 映射配置 API
```java
@RestController
@RequestMapping("/api/channels/{channel}")
public class MappingController {
    @GetMapping("/inbound-mappings/{operationCode}")
    public ApiResponse getInboundMappings(@PathVariable String channel, @PathVariable String operationCode) {
        ChannelAdapterConfig config = configRepo.findByProgramCodeAndChannel(programCode, channel);
        return ApiResponse.success(config.getInboundMappings().get(operationCode));
    }
    @PutMapping("/inbound-mappings/{operationCode}")
    public ApiResponse saveInboundMappings(@PathVariable String channel, @PathVariable String operationCode,
                                           @RequestBody List<MappingRule> rules) {
        // 更新 channel_adapter_config.inbound_mappings JSON
    }
    // 同理 outbound
}
```
### 5.3 入站脚本生成器（伪代码）
```java
public class InboundScriptGenerator {
    public String generate(String operationCode, List<MappingRule> rules) {
        StringBuilder script = new StringBuilder();
        script.append("function transform(source, context) {n");
        script.append("    const event = {n");
        script.append("        event_type: "").append(determineEventType(operationCode)).append("",n");
        script.append("        channel: "").append(channel).append("",n");
        script.append("        idempotent_key: source.tid,n");
        script.append("        event_time: new Date().toISOString(),n");
        script.append("        payload: {}n");
        script.append("    };n");
        for (MappingRule rule : rules) {
            if ("PATH".equals(rule.getType())) {
                script.append("    event.payload.").append(rule.getTarget()).append(" = getValueByPath(source, "").append(rule.getSource()).append("");n");
            } else if ("EXPRESSION".equals(rule.getType())) {
                script.append("    event.payload.").append(rule.getTarget()).append(" = ").append(rule.getExpression()).append("(getValueByPath(source, "").append(rule.getSource()).append(""));n");
            } else if ("ARRAY_MAPPING".equals(rule.getType())) {
                script.append("    event.payload.").append(rule.getTarget()).append(" = getValueByPath(source, "").append(rule.getSource()).append("").map(item => ({n");
                for (MappingRule sub : rule.getItemMapping()) {
                    script.append("        ").append(sub.getTarget()).append(": ").append(sub.getExpression()).append("(item.").append(sub.getSource()).append("),n");
                }
                script.append("    }));n");
            } else if ("SCRIPT".equals(rule.getType())) {
                script.append("    event.payload.").append(rule.getTarget()).append(" = (function(value) { ").append(rule.getScript()).append(" })(getValueByPath(source, "").append(rule.getSource()).append(""));n");
            }
        }
        script.append("    return event;n");
        script.append("}n");
        return script.toString();
    }
}
```
***
## 六、与 LiteFlow 集成
* 标准化组件 `StandardizeComponent` 读取 `channel_adapter_config.inbound_mappings`，根据操作代码获取映射规则，动态生成脚本并执行。
* 脚本执行结果 `TransactionEvent` 存入上下文，后续组件（One-ID、规则引擎等）复用。
* 出站映射可在动作执行组件或独立服务中调用 `OutboundMappingExecutor` 构建请求并发送。
***
## 七、开发实施步骤
1. 搭建 ChartDB 环境，集成 `@chartdb/react`。
2. 实现自定义节点（字段级 Handle）和自定义边（三种线型）。
3. 实现右侧面板动态切换（节点属性编辑器 + 映射配置编辑器）。
4. 实现实体保存/加载（对接 `program_schema`）。
5. 实现映射配置保存/加载（对接 `channel_adapter_config`）。
6. 实现入站映射脚本生成器及测试 API。
7. 集成 LiteFlow 标准化组件，实际执行脚本。
8. 测试完整流程（天猫订单接入 → 映射 → 标准化 → 规则引擎 → 积分发放）。
***
## 八、总结
本设计文档完整定义了基于 ChartDB 的统一实体建模与映射配置平台，核心要点：
* **复用 ChartDB 画布**，仅通过扩展实现业务实体、API 实体的可视化管理和字段级映射。
* **无弹窗设计**，所有配置通过右侧面板或底部抽屉内嵌完成，保持操作流畅。
* **字段级连线** + 右侧映射编辑器，支持直接映射、基础函数、自定义脚本、一对多数组映射。
* **配置存储**复用现有表结构，生成 GraalVM 脚本供 LiteFlow 使用。
* **提供完整的前后端伪代码和存储格式**，可直接指导开发。
该平台将极大提升 Loyalty 系统的配置灵活性，降低新渠道接入成本。
