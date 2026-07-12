# 实体属性与主数据关联设计文档
> **关联主文档**：基于AI的下一代全渠道忠诚度管理SaaS平台 v7.3
> **版本**：1.0
> **设计目标**：在实体设计画布上实现实体属性与主数据的关联配置，支持枚举值（如性别）和层级数据（如省市区）两种关联模式，使前端页面能够自动根据主数据渲染下拉选择、级联选择等组件，并完成“代码 ↔ 标签”的自动转换。
## 一、设计背景与目标
### 1.1 当前痛点
| 痛点          | 说明                                                   |
| ----------- | ---------------------------------------------------- |
| **硬编码枚举值**  | 性别、状态等字段的可选值硬编码在前端代码中，新增/修改需发布                       |
| **数据展示不一致** | 存储的是代码值（如 `M`），前端需要额外逻辑转换为标签（如“男”）                   |
| **层级数据无标准** | 省市县等层级数据无法标准化关联到实体字段                                 |
| **配置分散**    | 主数据定义在 `master_data_definition` 表中，但实体字段与主数据的关联关系未建立 |
### 1.2 设计目标
1. **在实体设计画布中**：通过点击字段配置“主数据关联”，建立实体属性与主数据的关联
2. **在页面设计中**：关联了主数据的字段自动渲染为对应的选择组件（下拉/级联/单选等）
3. **在运行时**：自动完成“代码 ↔ 标签”的转换，前端展示标签，存储代码
4. **支持两种主数据类型**：
   * **枚举型**：如性别、状态（平铺选项列表）
   * **层级型**：如省市县（树形结构，需级联选择）
### 1.3 核心概念
```text
实体设计器（画布）
       │
       ▼ 点击字段 → 配置主数据关联
┌─────────────────────────────────────────────────────────────┐
│  字段：gender                                              │
│  ☑ 关联主数据                                              │
│  主数据集：GENDER                                          │
│  值来源：code   展示来源：label                             │
│  前端组件：下拉选择                                         │
└─────────────────────────────────────────────────────────────┘
       │
       ▼ 保存到 program_schema.field_schema
┌─────────────────────────────────────────────────────────────┐
│  "gender": {                                               │
│    "type": "string",                                       │
│    "x-master-data": {                                      │
│      "dataCode": "GENDER",                                 │
│      "valueField": "code",                                 │
│      "labelField": "label"                                 │
│    }                                                       │
│  }                                                         │
└─────────────────────────────────────────────────────────────┘
       │
       ▼ 运行时渲染
┌─────────────────────────────────────────────────────────────┐
│  前端自动渲染为 <Select options={主数据选项} />            │
│  展示标签（男/女）  存储代码（M/F）                         │
└─────────────────────────────────────────────────────────────┘
```
## 二、数据模型
### 2.1 主数据定义表（`master_data_definition`）- 已有
```sql
CREATE TABLE master_data_definition (
    id VARCHAR(64) PRIMARY KEY,
    program_code VARCHAR(32) NOT NULL,
    data_code VARCHAR(64) NOT NULL,          -- 唯一标识，如 GENDER / REGION
    data_name VARCHAR(128) NOT NULL,         -- 显示名称
    data_type VARCHAR(20) NOT NULL,          -- ENUM / HIERARCHY / MAPPING / TAG
    description TEXT,
    config JSONB,
    status VARCHAR(20) DEFAULT 'ACTIVE',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(program_code, data_code)
);
```
### 2.2 枚举值表（`master_data_enum`）- 已有
```sql
CREATE TABLE master_data_enum (
    id VARCHAR(64) PRIMARY KEY,
    program_code VARCHAR(32) NOT NULL,
    data_code VARCHAR(64) NOT NULL,          -- 关联 master_data_definition
    enum_code VARCHAR(64) NOT NULL,          -- 存储代码，如 "M"
    enum_label VARCHAR(128) NOT NULL,        -- 显示标签，如 "男"
    enum_value VARCHAR(64),                  -- 额外值，如 "1"
    sort_order INT DEFAULT 0,
    status VARCHAR(20) DEFAULT 'ACTIVE',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(program_code, data_code, enum_code)
);
```
### 2.3 层级数据表（`master_data_hierarchy`）- 已有
```sql
CREATE TABLE master_data_hierarchy (
    id VARCHAR(64) PRIMARY KEY,
    program_code VARCHAR(32) NOT NULL,
    data_code VARCHAR(64) NOT NULL,          -- 关联 master_data_definition
    node_code VARCHAR(64) NOT NULL,          -- 节点代码，如 "440000"
    node_name VARCHAR(128) NOT NULL,         -- 节点名称，如 "广东省"
    parent_code VARCHAR(64),                 -- 父节点代码，根节点为 NULL
    node_level INT DEFAULT 1,                -- 层级（1=省, 2=市, 3=区/县）
    sort_order INT DEFAULT 0,
    status VARCHAR(20) DEFAULT 'ACTIVE',
    ext_attributes JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(program_code, data_code, node_code)
);
```
## 三、实体定义中的关联配置（`program_schema.field_schema` 扩展）
### 3.1 `x-master-data` 扩展属性
在 `program_schema.field_schema.properties` 的字段定义中，增加 `x-master-data` 扩展属性：
```json
{
  "properties": {
    "gender": {
      "type": "string",
      "description": "性别",
      "x-master-data": {
        "dataCode": "GENDER",
        "dataType": "ENUM",
        "valueField": "code",
        "labelField": "label",
        "component": "select"
      }
    },
    "province": {
      "type": "string",
      "description": "省份",
      "x-master-data": {
        "dataCode": "REGION",
        "dataType": "HIERARCHY",
        "level": 1,
        "valueField": "code",
        "labelField": "name",
        "component": "cascade-select"
      }
    },
    "city": {
      "type": "string",
      "description": "城市",
      "x-master-data": {
        "dataCode": "REGION",
        "dataType": "HIERARCHY",
        "level": 2,
        "parentField": "province",
        "valueField": "code",
        "labelField": "name",
        "component": "cascade-select"
      }
    }
  }
}
```
### 3.2 配置字段说明
| 字段            | 类型     | 必填 | 说明                                           |
| ------------- | ------ | -- | -------------------------------------------- |
| `dataCode`    | string | ✅  | 关联的 `master_data_definition.data_code`       |
| `dataType`    | string | ✅  | 主数据类型：`ENUM` 或 `HIERARCHY`                   |
| `valueField`  | string | ❌  | 存储时使用的字段，默认 `code`                           |
| `labelField`  | string | ❌  | 展示时使用的字段，默认 `label`（ENUM）或 `name`（HIERARCHY） |
| `component`   | string | ❌  | 推荐前端组件：`select` / `radio` / `cascade-select` |
| `level`       | int    | ❌  | 层级类型时必填：当前层级位置（1,2,3...）                     |
| `parentField` | string | ❌  | 层级类型时：父级字段名（同一实体中的字段）                        |
## 四、画布交互设计
### 4.1 字段在画布上的展示
关联了主数据的字段在画布上有特殊标识：
```text
┌─────────────────────────────────────────────────────────────────────────────┐
│                           📋 Member (会员)                                 │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  memberId     VARCHAR(64)   🔑                                     │   │
│  │  name         VARCHAR(100)                                         │   │
│  │  ▶ gender     VARCHAR(10)   [主数据: GENDER]   🏷️ 男/女          │   │
│  │  birthday     DATE                                                 │   │
│  │  ▶ province   VARCHAR(32)   [层级: REGION]    ▾                   │   │
│  │  ▶ city       VARCHAR(32)   [层级: REGION → province]             │   │
│  │  tierCode     VARCHAR(16)   [主数据: TIER]    🏷️ 黄金/铂金        │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────┘
```
**标识说明**：
* `▶` 表示该字段关联了主数据，点击可配置
* `[主数据: GENDER]` 显示关联的主数据代码
* `🏷️ 男/女` 显示主数据的样例标签（预览）
* `▾` 表示该字段是层级主数据，有子级依赖
* 父子字段之间的虚线连接表示级联依赖关系
### 4.2 点击字段 → 右侧属性面板配置
在画布上点击字段（如 `gender`），右侧属性面板展示完整配置：
```text
┌─ 字段属性配置：gender ──────────────────────────────────────────────────────┐
│  字段名：   [gender            ]  (不可修改，由实体定义决定)               │
│  显示名称： [性别              ]                                           │
│  类型：     [VARCHAR(10)       ]  (不可修改，由实体定义决定)               │
│  描述：     [会员性别          ]                                           │
│                                                                             │
│  ┌─ 主数据关联 ───────────────────────────────────────────────────────────┐ │
│  │  ☑ 关联主数据                                                         │ │
│  │  关联类型： [枚举 ▼]   (枚举 / 层级)                                   │ │
│  │  主数据集： [GENDER ▼]  (下拉选择已定义的主数据)                       │ │
│  │  值来源：   [code ▼]    (code / label / value)                        │ │
│  │  展示来源： [label ▼]   (label / code / value)                        │ │
│  │  前端组件： [下拉选择 ▼]  (select / radio / checkbox)                 │ │
│  │                                                                         │ │
│  │  预览数据：  M → 男, F → 女, U → 未知                                 │ │
│  └─────────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
│  [保存] [取消]                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```
#### 层级类型的属性面板（点击 `city` 字段时）：
```text
┌─ 字段属性配置：city ──────────────────────────────────────────────────────┐
│  字段名：   [city              ]                                          │
│  显示名称： [城市              ]                                          │
│  类型：     [VARCHAR(32)       ]                                          │
│                                                                             │
│  ┌─ 主数据关联 ───────────────────────────────────────────────────────────┐ │
│  │  ☑ 关联主数据                                                         │ │
│  │  关联类型： [层级 ▼]   (枚举 / 层级)                                   │ │
│  │  主数据集： [REGION ▼]                                                │ │
│  │  当前层级： [2 ▼]   (1=省, 2=市, 3=区/县)                            │ │
│  │  父级字段： [province ▼]  (同一实体中的字段)                          │ │
│  │  子级字段： [district ▼]  (可选，同一实体中的字段)                    │ │
│  │                                                                         │ │
│  │  值来源：   [code ▼]   展示来源： [name ▼]                            │ │
│  │  前端组件： [级联选择 ▼]  (select / cascade-select)                    │ │
│  └─────────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
│  [保存] [取消]                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```
### 4.3 层级依赖关系可视化（画布上的虚线）
在画布上，层级字段之间显示虚线连接线，表示依赖关系：
```text
┌─────────────────────────────────────────────────────────────────────────────┐
│  ▶ province   VARCHAR(32)   [层级: REGION]    ▾                          │
│       │                                                                    │
│       │ (依赖关系)                                                        │
│       ▼                                                                    │
│  ▶ city       VARCHAR(32)   [层级: REGION → province]                    │
│       │                                                                    │
│       │ (依赖关系)                                                        │
│       ▼                                                                    │
│  ▶ district   VARCHAR(32)   [层级: REGION → city]                        │
└─────────────────────────────────────────────────────────────────────────────┘
```
**虚线显示规则**：
* 当字段的 `x-master-data.parentField` 指向同一实体中的另一个字段时，自动绘制虚线
* 鼠标悬停虚线时显示提示：“城市依赖于省份”
### 4.4 快捷菜单
在画布上右键点击字段，提供快捷操作菜单：
```text
┌─────────────────────────────────────┐
│  配置字段                          │
│  ────────────────                  │
│  ✓ 关联主数据: GENDER             │
│  编辑主数据映射  →                │
│  查看主数据内容  →                │
│  解除关联                          │
│  ────────────────                  │
│  编辑字段属性                      │
│  删除字段                          │
└─────────────────────────────────────┘
```
* **关联主数据: GENDER**：显示当前关联状态，点击可直接切换
* **编辑主数据映射**：打开详细的映射配置面板
* **查看主数据内容**：跳转到主数据管理页面，查看该数据集的所有枚举值/层级节点
* **解除关联**：移除 `x-master-data` 配置
## 五、运行时渲染
### 5.1 后端服务
#### 5.1.1 主数据渲染服务
```java
@Service
public class MasterDataRenderService {
    
    @Autowired
    private MasterDataEnumRepository enumRepo;
    @Autowired
    private MasterDataHierarchyRepository hierarchyRepo;
    @Autowired
    private CacheManager cacheManager;
    /**
     * 获取枚举主数据选项（带缓存）
     */
    @Cacheable(value = "masterDataOptions", key = "#programCode + ':' + #dataCode")
    public List<MasterDataOption> getEnumOptions(String programCode, String dataCode) {
        List<MasterDataEnum> enums = enumRepo.findByProgramCodeAndDataCodeAndStatus(
            programCode, dataCode, "ACTIVE"
        );
        return enums.stream()
            .map(e -> new MasterDataOption(e.getEnumCode(), e.getEnumLabel()))
            .collect(Collectors.toList());
    }
    /**
     * 获取层级主数据选项（按层级和父级过滤）
     */
    public List<MasterDataOption> getHierarchyOptions(String programCode, String dataCode, 
                                                       int level, String parentCode) {
        List<MasterDataHierarchy> nodes;
        if (parentCode == null) {
            nodes = hierarchyRepo.findByDataCodeAndLevelAndStatus(
                dataCode, level, "ACTIVE"
            );
        } else {
            nodes = hierarchyRepo.findByDataCodeAndLevelAndParentCodeAndStatus(
                dataCode, level, parentCode, "ACTIVE"
            );
        }
        return nodes.stream()
            .map(n -> new MasterDataOption(n.getNodeCode(), n.getNodeName()))
            .collect(Collectors.toList());
    }
    /**
     * 代码 → 标签转换（枚举型）
     */
    public String enumCodeToLabel(String programCode, String dataCode, String code) {
        if (code == null) return null;
        Map<String, String> mapping = getEnumMapping(programCode, dataCode);
        return mapping.getOrDefault(code, code);
    }
    /**
     * 标签 → 代码转换（枚举型）
     */
    public String enumLabelToCode(String programCode, String dataCode, String label) {
        if (label == null) return null;
        List<MasterDataEnum> enums = enumRepo.findByProgramCodeAndDataCodeAndStatus(
            programCode, dataCode, "ACTIVE"
        );
        for (MasterDataEnum e : enums) {
            if (e.getEnumLabel().equals(label)) {
                return e.getEnumCode();
            }
        }
        return label;
    }
}
```
#### 5.1.2 会员详情渲染服务
```java
@Service
public class MemberRenderService {
    
    @Autowired
    private MasterDataRenderService masterDataService;
    @Autowired
    private ProgramSchemaRepository schemaRepo;
    /**
     * 渲染会员详情（自动转换主数据字段）
     */
    public MemberDetailDTO renderDetail(String programCode, Member member) {
        ProgramSchema schema = schemaRepo.findByProgramCodeAndEntityTypeAndStatus(
            programCode, "MEMBER", "ACTIVE"
        );
        
        JSONObject properties = schema.getFieldSchema().getJSONObject("properties");
        Map<String, Object> rendered = new LinkedHashMap<>();
        Map<String, Object> raw = new LinkedHashMap<>();
        for (String fieldName : properties.keySet()) {
            JSONObject fieldDef = properties.getJSONObject(fieldName);
            Object rawValue = getFieldValue(member, fieldName);
            raw.put(fieldName, rawValue);
            if (fieldDef.has("x-master-data")) {
                JSONObject masterConfig = fieldDef.getJSONObject("x-master-data");
                String dataCode = masterConfig.getString("dataCode");
                String label = masterDataService.enumCodeToLabel(
                    programCode, dataCode, String.valueOf(rawValue)
                );
                rendered.put(fieldName, label);
            } else {
                rendered.put(fieldName, rawValue);
            }
        }
        return MemberDetailDTO.builder()
            .memberId(member.getMemberId())
            .fields(rendered)      // 展示用
            .rawFields(raw)        // 编辑回传用
            .build();
    }
}
```
### 5.2 前端动态组件
```tsx
// 动态字段组件（自动根据 x-master-data 渲染）
const DynamicField = ({ fieldDef, programCode, value, onChange, form }) => {
    const masterData = fieldDef['x-master-data'];
    
    if (!masterData) {
        // 普通字段
        return <Input value={value} onChange={onChange} />;
    }
    
    if (masterData.dataType === 'ENUM') {
        // 枚举类型：下拉选择/单选/复选框
        const options = useMasterDataOptions(programCode, masterData.dataCode);
        switch (masterData.component) {
            case 'radio':
                return <RadioGroup options={options} value={value} onChange={onChange} />;
            case 'checkbox':
                return <CheckboxGroup options={options} value={value} onChange={onChange} />;
            default:
                return <Select options={options} value={value} onChange={onChange} />;
        }
    }
    
    if (masterData.dataType === 'HIERARCHY') {
        // 层级类型：级联选择
        const parentField = masterData.parentField;
        const level = masterData.level;
        const parentValue = form?.getFieldValue(parentField);
        
        const options = useHierarchyOptions(
            programCode, 
            masterData.dataCode, 
            level, 
            parentValue
        );
        
        return (
            <Select
                options={options}
                value={value}
                onChange={onChange}
                disabled={!parentValue && level > 1}
                placeholder={level > 1 ? '请先选择上级' : '请选择'}
            />
        );
    }
    
    return <Input value={value} onChange={onChange} />;
};
```
### 5.3 级联查询 API
```text
GET /api/master-data/hierarchy/options?programCode=BRAND_A&dataCode=REGION&level=2&parentCode=440000
响应：
{
  "dataCode": "REGION",
  "level": 2,
  "parentCode": "440000",
  "options": [
    { "code": "440100", "label": "广州市" },
    { "code": "440300", "label": "深圳市" }
  ]
}
```
## 六、API 设计
| 方法  | 路径                                                           | 说明                                  |
| --- | ------------------------------------------------------------ | ----------------------------------- |
| GET | `/api/master-data/{dataCode}/options`                        | 获取枚举主数据选项                           |
| GET | `/api/master-data/hierarchy/options`                         | 获取层级主数据选项（支持 level + parentCode 过滤） |
| GET | `/api/schemas/{entityType}/fields/{fieldPath}/master-config` | 获取字段的主数据关联配置                        |
## 七、与现有功能的集成
### 7.1 实体设计器改造
| 改造点         | 说明                                                   |
| ----------- | ---------------------------------------------------- |
| **画布字段展示**  | 关联了主数据的字段显示特殊标识（`[主数据: XXX]`）                        |
| **属性面板**    | 增加“主数据关联”配置区域，支持枚举和层级两种类型                            |
| **层级依赖可视化** | 在画布上使用虚线连接父子字段                                       |
| **快捷菜单**    | 右键菜单增加“关联主数据”相关操作                                    |
| **保存逻辑**    | 将 `x-master-data` 配置写入 `program_schema.field_schema` |
### 7.2 页面设计器改造
| 改造点      | 说明                           |
| -------- | ---------------------------- |
| **字段拖拽** | 拖拽关联了主数据的字段到画布时，自动感知并渲染为选择组件 |
| **组件属性** | 在组件属性面板中展示主数据关联信息            |
| **预览**   | 预览模式下，选择组件显示主数据的选项列表         |
### 7.3 运行时渲染改造
| 改造点         | 说明                                              |
| ----------- | ----------------------------------------------- |
| **主数据渲染服务** | 新增 `MasterDataRenderService`，负责代码↔标签转换          |
| **动态组件**    | 前端 `DynamicField` 组件根据 `x-master-data` 自动切换渲染方式 |
| **API**     | 新增主数据选项查询接口                                     |
## 八、开发实施步骤
| 阶段          | 任务             | 说明                                                                        |
| ----------- | -------------- | ------------------------------------------------------------------------- |
| **Phase 1** | 确保主数据表存在       | `master_data_definition`, `master_data_enum`, `master_data_hierarchy` 已存在 |
| **Phase 2** | 实体设计器 - 属性面板改造 | 增加“主数据关联”配置区域                                                             |
| **Phase 3** | 实体设计器 - 画布展示   | 关联字段显示特殊标识，层级字段显示虚线                                                       |
| **Phase 4** | 后端 - 主数据渲染服务   | `MasterDataRenderService` 实现                                              |
| **Phase 5** | 后端 - 会员详情渲染改造  | 集成主数据转换逻辑                                                                 |
| **Phase 6** | 前端 - 动态字段组件    | 根据 `x-master-data` 自动渲染                                                   |
| **Phase 7** | 前端 - 级联选择组件    | 层级主数据的级联联动                                                                |
| **Phase 8** | 页面设计器集成        | 字段拖拽时自动感知主数据关联                                                            |
## 九、总结
| 能力         | 实现方式                                                                 |
| ---------- | -------------------------------------------------------------------- |
| **画布关联配置** | 点击字段 → 右侧属性面板 → 配置主数据关联                                              |
| **枚举型主数据** | `x-master-data.dataType="ENUM"`，存储 `code`，展示 `label`                 |
| **层级型主数据** | `x-master-data.dataType="HIERARCHY"`，通过 `level` + `parentField` 建立依赖 |
| **画布可视化**  | 关联字段显示 `[主数据: XXX]` 标识，层级字段显示虚线依赖                                    |
| **运行时渲染**  | 前端根据 `x-master-data.component` 自动选择组件                                |
| **数据转换**   | 后端 `MasterDataRenderService` 完成代码↔标签转换                               |
