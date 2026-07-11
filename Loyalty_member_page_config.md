# Loyalty 会员界面动态设计器设计文档
> **关联主文档**：基于AI的下一代全渠道忠诚度管理SaaS平台 v7.3
> **版本**：1.0
> **设计目标**：为 Loyalty 后台管理系统提供可视化页面设计器，使运营人员能够通过拖拽方式自由配置会员详情/编辑页面的布局，实现“页面随 Schema 而动”，零代码扩展会员属性展示。
## 一、设计背景与目标
### 1.1 当前痛点
| 痛点         | 说明                                                                |
| ---------- | ----------------------------------------------------------------- |
| **属性变化频繁** | 会员 `ext_attributes` 字段通过 `program_schema` 动态定义，但页面布局固定，新增属性无法优雅展示 |
| **布局僵化**   | 所有会员属性平铺展示，无法按业务场景分组（如“基本信息”、“偏好设置”、“扩展信息”）                       |
| **运营依赖开发** | 调整字段顺序、分组、必填等，需要前端修改代码并重新部署                                       |
| **多端适配困难** | 详情页、编辑页、列表页需要不同的展示策略，无法独立配置                                       |
### 1.2 设计目标
1. **可视化拖拽设计**：运营人员通过拖拽即可调整页面布局，无需编写代码
2. **Schema 驱动**：布局配置与 `program_schema` 解耦，但自动感知 Schema 变更
3. **多页面类型支持**：同一实体（会员）支持详情页、编辑页、列表页三种布局配置
4. **组件化设计**：支持多种 UI 组件（输入框、下拉框、日期选择器、标签、分割线等）
5. **实时预览**：设计器中实时预览配置效果
6. **版本管理**：支持布局配置的版本历史与回滚
## 二、整体架构
### 2.1 架构分层
```text
┌─────────────────────────────────────────────────────────────────────────────┐
│                         前端设计器（React + Formily）                        │
│  ┌───────────────────────────────────────────────────────────────────────┐ │
│  │  字段面板（左侧）  │  画布（中间）  │  属性面板（右侧）               │ │
│  │  · 系统字段        │  · 拖拽排序    │  · 字段标签                     │ │
│  │  · 扩展字段        │  · 分组展示    │  · 组件类型                     │ │
│  │  · 组件库          │  · 实时预览    │  · 必填/只读                    │ │
│  └───────────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                        后端服务（Spring Boot）                               │
│  ┌───────────────────────────────────────────────────────────────────────┐ │
│  │  LayoutService（布局 CRUD）                                          │ │
│  │  SchemaSyncService（Schema 变更检测与同步）                          │ │
│  │  RenderService（布局 → Formily Schema 转换）                         │ │
│  └───────────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                        数据存储（PostgreSQL）                                │
│  ┌───────────────────────────────────────────────────────────────────────┐ │
│  │  program_page_layout（页面布局配置表）                                │ │
│  │  program_schema（会员属性定义，已有）                                 │ │
│  └───────────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────────────┘
```
### 2.2 数据流向
```text
1. 运营进入设计器
   → 加载 program_schema（可用字段列表）
   → 加载 page_layout（已有布局配置，若无则生成默认布局）
   → 渲染画布
2. 运营拖拽调整布局
   → 更新画布状态
   → 右侧属性面板同步更新
3. 运营点击保存
   → 前端提交 layout_config JSON
   → 后端校验并存储到 program_page_layout 表
4. 会员详情页加载
   → 读取 page_layout（按 page_type = 'DETAIL'）
   → 读取会员数据
   → LayoutRender 引擎将 layout_config 转换为 Formily Schema
   → 渲染最终页面
```
## 三、数据模型设计
### 3.1 页面布局配置表（`program_page_layout`）
```sql
-- ============================================================
-- 页面布局配置表
-- ============================================================
CREATE TABLE program_page_layout (
    id VARCHAR(64) PRIMARY KEY,
    program_code VARCHAR(32) NOT NULL,
    entity_type VARCHAR(32) NOT NULL,              -- MEMBER / ORDER / PRODUCT
    page_type VARCHAR(20) NOT NULL,                -- DETAIL / EDIT / LIST
    
    -- ===== 布局配置（核心） =====
    layout_config JSONB NOT NULL,                  -- 完整的布局 JSON
    field_config JSONB,                            -- 字段级覆盖配置（标签、必填、隐藏等）
    
    -- ===== 版本控制 =====
    version INT DEFAULT 1,
    schema_version VARCHAR(16),                    -- 关联的 program_schema 版本
    
    -- ===== 状态 =====
    status VARCHAR(20) DEFAULT 'DRAFT',            -- DRAFT / PUBLISHED / ARCHIVED
    
    -- ===== 元数据 =====
    created_by VARCHAR(64),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_by VARCHAR(64),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    UNIQUE(program_code, entity_type, page_type, version)
);
CREATE INDEX idx_ppl_program ON program_page_layout(program_code);
CREATE INDEX idx_ppl_entity ON program_page_layout(entity_type);
CREATE INDEX idx_ppl_type ON program_page_layout(page_type);
CREATE INDEX idx_ppl_status ON program_page_layout(status);
```
### 3.2 `layout_config` JSON 结构
```json
{
  "version": "1.0",
  "sections": [
    {
      "id": "section_basic",
      "title": "基本信息",
      "icon": "UserOutlined",
      "collapsible": true,
      "collapsed": false,
      "columns": 2,
      "fields": [
        {
          "id": "field_member_id",
          "field_key": "memberId",
          "label": "会员ID",
          "component": "Text",
          "span": 1,
          "required": true,
          "readonly": true,
          "placeholder": "自动生成"
        },
        {
          "id": "field_name",
          "field_key": "name",
          "label": "姓名",
          "component": "Input",
          "span": 1,
          "required": true,
          "readonly": false,
          "placeholder": "请输入姓名"
        },
        {
          "id": "field_gender",
          "field_key": "gender",
          "label": "性别",
          "component": "Select",
          "span": 1,
          "required": true,
          "readonly": false,
          "options": [
            { "value": "MALE", "label": "男" },
            { "value": "FEMALE", "label": "女" }
          ]
        },
        {
          "id": "field_birthday",
          "field_key": "birthday",
          "label": "生日",
          "component": "DatePicker",
          "span": 1,
          "required": false,
          "readonly": false
        }
      ]
    },
    {
      "id": "section_contact",
      "title": "联系方式",
      "icon": "PhoneOutlined",
      "collapsible": true,
      "collapsed": false,
      "columns": 2,
      "fields": [
        {
          "id": "field_email",
          "field_key": "email",
          "label": "邮箱",
          "component": "Input",
          "span": 1,
          "required": false,
          "readonly": false
        },
        {
          "id": "field_phone",
          "field_key": "phone",
          "label": "手机号",
          "component": "Input",
          "span": 1,
          "required": true,
          "readonly": false
        }
      ]
    },
    {
      "id": "section_ext",
      "title": "扩展属性",
      "icon": "SettingOutlined",
      "collapsible": true,
      "collapsed": false,
      "columns": 2,
      "fields": [
        {
          "id": "field_pet_name",
          "field_key": "ext_attributes.pet_name",
          "label": "宠物名称",
          "component": "Input",
          "span": 1,
          "required": false,
          "readonly": false
        },
        {
          "id": "field_shoe_size",
          "field_key": "ext_attributes.shoe_size",
          "label": "鞋码",
          "component": "InputNumber",
          "span": 1,
          "required": false,
          "readonly": false
        }
      ]
    }
  ],
  "fieldConfigOverrides": {
    "ext_attributes.pet_name": {
      "label": "宠物名字",
      "required": true,
      "placeholder": "请输入宠物名字"
    }
  }
}
```
### 3.3 `field_config` 字段覆盖配置
用于在不修改 `program_schema` 的情况下，覆盖特定字段在页面上的展示配置：
```json
{
  "ext_attributes.pet_name": {
    "label": "宠物名字",
    "required": true,
    "placeholder": "请输入宠物名字",
    "hidden": false,
    "readonly": false,
    "helpText": "仅用于宠物活动推送"
  },
  "ext_attributes.shoe_size": {
    "label": "鞋码",
    "hidden": true
  },
  "birthday": {
    "label": "出生日期",
    "component": "DatePicker",
    "required": false
  }
}
```
## 四、前端设计器界面设计
### 4.1 整体布局
```text
┌─ 页面设计器 ─────────────────────────────────────────────────────────────────┐
│ [← 返回]  会员详情页设计器    [预览] [保存草稿] [发布] [历史版本]           │
├─────────────────────────────────────────────────────────────────────────────┤
│ ┌──────────────┐ ┌────────────────────────────────────┬───────────────────┐ │
│ │  字段面板     │ │         画布（拖拽区）              │   属性面板        │ │
│ │              │ │                                     │                   │ │
│ │ ── 系统字段 ── │ │  ┌─ 基本信息 ───────────────────┐ │  字段设置        │ │
│ │  会员ID      │ │  │ [会员ID] [姓名]                 │ │  字段名: pet_name│ │
│ │  姓名        │ │  │ [性别]  [生日]                 │ │  标签: [宠物名]  │ │
│ │  性别        │ │  └─────────────────────────────────┘ │  组件: [Input ▼] │ │
│ │  生日        │ │  ┌─ 联系方式 ───────────────────┐ │  ☑ 必填          │ │
│ │  邮箱        │ │  │ [邮箱]  [手机]                │ │  ☐ 只读          │ │
│ │  手机        │ │  └─────────────────────────────────┘ │  占位列宽: [1▼]  │ │
│ │ ── 扩展属性 ── │ │  ┌─ 扩展属性 ─────────────────┐ │  帮助文本: [...]  │ │
│ │  宠物名称    │ │  │ [宠物名称] [鞋码]             │ │  [删除字段]       │ │
│ │  鞋码        │ │  └─────────────────────────────────┘ │                   │ │
│ │  肤色        │ │  [+ 添加分组]                       │                   │ │
│ │              │ │                                     │                   │ │
│ │ ── 组件库 ── │ │                                     │                   │ │
│ │  [分割线]    │ │                                     │                   │ │
│ │  [标题]      │ │                                     │                   │ │
│ │  [备注框]    │ │                                     │                   │ │
│ └──────────────┘ └────────────────────────────────────┴───────────────────┘ │
└─────────────────────────────────────────────────────────────────────────────┘
```
### 4.2 字段面板（左侧）
从 `program_schema` 自动加载可用字段，按来源分组：
```text
┌─ 字段面板 ──────────┐
│  🔍 [搜索字段...]    │
│                      │
│  📌 系统字段         │
│    [会员ID]  🔒      │
│    [姓名]            │
│    [性别]            │
│    [生日]            │
│    [邮箱]            │
│    [手机]            │
│    [等级]            │
│                      │
│  🧩 扩展属性         │
│    [宠物名称]        │
│    [鞋码]            │
│    [肤色]            │
│    [兴趣爱好]        │
│                      │
│  🧰 组件             │
│    ──── 分割线       │
│    ──── 标题         │
│    ──── 备注框       │
│    ──── 自定义组件    │
└─────────────────────┘
```
**字段交互**：
* **拖拽添加**：从字段面板拖拽字段到画布的“分组”或“区域”
* **双击添加**：双击字段自动添加到当前选中分组末尾
* **字段状态**：🔒 表示该字段在 Schema 中定义为必填，不可隐藏
### 4.3 画布（中间）
拖拽式布局编辑区：
**分组标题操作**：
* 点击分组标题 → 展开/折叠
* 拖拽分组标题 → 调整分组顺序
* 悬停分组 → 显示「添加字段」「删除分组」「编辑分组」操作按钮
**字段操作**：
* 拖拽字段 → 调整字段顺序
* 悬停字段 → 显示「编辑」「复制」「删除」「上移」「下移」操作按钮
* 双击字段 → 自动定位到右侧属性面板
**空状态**：
```text
┌─ 拖拽字段到这里 ───────────────────────────────────────────────────────────┐
│  📥 从左侧字段面板拖拽字段到此区域                                          │
│  或点击「添加分组」创建新分组                                               │
└───────────────────────────────────────────────────────────────────────────┘
```
### 4.4 属性面板（右侧）
选中字段/分组后，右侧显示对应配置：
**字段属性**：
| 属性   | 控件     | 说明                                                                |
| ---- | ------ | ----------------------------------------------------------------- |
| 字段名  | 只读文本   | 底层字段 key                                                          |
| 显示标签 | 文本输入   | 页面展示名称                                                            |
| 组件类型 | 下拉选择   | Input / Select / DatePicker / Text / InputNumber / Switch / Radio |
| 占位列宽 | 下拉选择   | 1 / 2 / 3 / 4（基于栅格系统）                                             |
| 必填   | Switch | 是否必填                                                              |
| 只读   | Switch | 是否只读                                                              |
| 隐藏   | Switch | 是否在页面隐藏                                                           |
| 帮助文本 | 文本输入   | 字段下方的提示文字                                                         |
| 占位文本 | 文本输入   | 输入框的 placeholder                                                  |
**分组属性**：
| 属性   | 控件     | 说明            |
| ---- | ------ | ------------- |
| 分组标题 | 文本输入   | 分组名称          |
| 图标   | 图标选择器  | 分组图标          |
| 列数   | 下拉选择   | 1 / 2 / 3 / 4 |
| 可折叠  | Switch | 是否支持折叠        |
| 默认折叠 | Switch | 初始状态是否折叠      |
### 4.5 工具栏
```text
┌─────────────────────────────────────────────────────────────────────────────┐
│  ← 返回   会员详情页设计器                                    [历史版本]    │
│  页面类型: [详情页 ▼]  实体: [会员 ▼]  版本: v3  状态: ● 草稿            │
│                                                                             │
│  [💾 保存草稿]  [👁️ 预览]  [📤 发布]  [↺ 回滚]  [📋 导入/导出]            │
└─────────────────────────────────────────────────────────────────────────────┘
```
* **页面类型切换**：详情页 / 编辑页 / 列表页（切换后加载对应布局）
* **预览**：在新窗口或抽屉中预览真实数据渲染效果
* **发布**：将 DRAFT 状态变为 PUBLISHED，前端页面将使用此版本
## 五、运行时渲染引擎
### 5.1 渲染架构（基于 Formily）
```text
会员数据 + Layout Config
         │
         ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  LayoutRenderService（后端）                                                │
│  1. 解析 layout_config                                                     │
│  2. 生成 Formily JSON Schema                                               │
│  3. 生成 Formily UI Schema                                                │
└─────────────────────────────────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  前端 Formily 渲染器                                                        │
│  1. 接收 Schema + UI Schema                                               │
│  2. 使用 SchemaField 渲染页面                                              │
│  3. 绑定会员数据                                                           │
└─────────────────────────────────────────────────────────────────────────────┘
```
### 5.2 后端 Layout → Formily Schema 转换
```java
@Service
public class LayoutToFormilyConverter {
    /**
     * 将 layout_config 转换为 Formily Schema
     */
    public FormilySchema convert(String programCode, JSONObject layoutConfig) {
        FormilySchema formilySchema = new FormilySchema();
        formilySchema.setType("object");
        JSONObject properties = new JSONObject();
        JSONArray sections = layoutConfig.getJSONArray("sections");
        for (int i = 0; i < sections.size(); i++) {
            JSONObject section = sections.getJSONObject(i);
            String sectionId = section.getString("id");
            String sectionTitle = section.getString("title");
            int columns = section.getInt("columns");
            JSONArray fields = section.getJSONArray("fields");
            // 每个分组作为一个 object 嵌套
            JSONObject sectionProps = new JSONObject();
            sectionProps.put("type", "object");
            sectionProps.put("title", sectionTitle);
            JSONObject sectionProperties = new JSONObject();
            for (int j = 0; j < fields.size(); j++) {
                JSONObject field = fields.getJSONObject(j);
                String fieldKey = field.getString("field_key");
                String component = field.getString("component");
                String label = field.getString("label");
                boolean required = field.optBoolean("required", false);
                boolean readonly = field.optBoolean("readonly", false);
                String placeholder = field.optString("placeholder", "");
                int span = field.optInt("span", 1);
                JSONObject fieldSchema = new JSONObject();
                fieldSchema.put("type", mapComponentToJsonType(component));
                fieldSchema.put("title", label);
                // x-component 映射
                fieldSchema.put("x-component", mapComponentToAntd(component));
                // x-component-props
                JSONObject componentProps = new JSONObject();
                componentProps.put("placeholder", placeholder);
                componentProps.put("readOnly", readonly);
                if (span > 0) {
                    componentProps.put("span", span);
                }
                fieldSchema.put("x-component-props", componentProps);
                // 校验规则
                if (required) {
                    JSONArray validators = new JSONArray();
                    validators.put("required");
                    fieldSchema.put("x-validator", validators);
                }
                // 数据路径（支持 ext_attributes 嵌套）
                String dataPath = fieldKey.startsWith("ext_attributes.")
                    ? fieldKey
                    : fieldKey;
                sectionProperties.put(dataPath, fieldSchema);
            }
            sectionProps.put("properties", sectionProperties);
            properties.put(sectionId, sectionProps);
        }
        formilySchema.setProperties(properties);
        return formilySchema;
    }
    private String mapComponentToAntd(String component) {
        switch (component) {
            case "Input": return "Input";
            case "InputNumber": return "NumberPicker";
            case "Select": return "Select";
            case "DatePicker": return "DatePicker";
            case "Text": return "Text";
            case "Switch": return "Switch";
            case "Radio": return "Radio";
            default: return "Input";
        }
    }
    private String mapComponentToJsonType(String component) {
        switch (component) {
            case "InputNumber": return "number";
            case "Switch": return "boolean";
            case "DatePicker": return "string";
            default: return "string";
        }
    }
}
```
### 5.3 前端渲染组件
tsx
```
// MemberDetailRenderer.tsx
import React, { useEffect, useState } from 'react';
import { createForm } from '@formily/core';
import { FormProvider, createSchemaField } from '@formily/react';
import { Input, Select, DatePicker, Switch, NumberPicker, Radio } from '@formily/antd';
const SchemaField = createSchemaField({
  components: {
    Input,
    Select,
    DatePicker,
    Switch,
    NumberPicker,
    Radio,
    Text: ({ value }) => <span>{value}</span>,
  },
});
interface MemberDetailRendererProps {
  memberId: string;
  programCode: string;
  pageType: 'DETAIL' | 'EDIT';
}
export const MemberDetailRenderer: React.FC<MemberDetailRendererProps> = ({
  memberId,
  programCode,
  pageType,
}) => {
  const [schema, setSchema] = useState(null);
  const [uiSchema, setUiSchema] = useState(null);
  const [memberData, setMemberData] = useState(null);
  const form = useMemo(() => createForm(), []);
  useEffect(() => {
    // 1. 加载页面布局
    loadLayout(programCode, 'MEMBER', pageType).then((layout) => {
      // 2. 转换为 Formily Schema
      const { schema, uiSchema } = convertLayout(layout);
      setSchema(schema);
      setUiSchema(uiSchema);
    });
    // 3. 加载会员数据
    loadMemberData(memberId).then((data) => {
      setMemberData(data);
      form.setValues(data);
    });
  }, [memberId, programCode, pageType]);
  if (!schema || !memberData) return <Spin />;
  return (
    <FormProvider form={form}>
      <SchemaField schema={schema} />
    </FormProvider>
  );
};
```
## 六、后端服务实现
### 6.1 页面布局服务
```java
@Service
@Slf4j
@RequiredArgsConstructor
public class PageLayoutService {
    private final PageLayoutRepository layoutRepo;
    private final ProgramSchemaService schemaService;
    private final LayoutToFormilyConverter converter;
    /**
     * 获取页面布局（优先返回 PUBLISHED 版本，若无则返回最新 DRAFT）
     */
    public PageLayout getLayout(String programCode, String entityType, String pageType) {
        // 1. 先查 PUBLISHED
        Optional<PageLayout> published = layoutRepo.findByProgramCodeAndEntityTypeAndPageTypeAndStatus(
            programCode, entityType, pageType, "PUBLISHED"
        );
        if (published.isPresent()) {
            return published.get();
        }
        // 2. 若无 PUBLISHED，返回最新 DRAFT
        return layoutRepo.findFirstByProgramCodeAndEntityTypeAndPageTypeOrderByVersionDesc(
            programCode, entityType, pageType
        ).orElseGet(() -> generateDefaultLayout(programCode, entityType, pageType));
    }
    /**
     * 保存布局（草稿）
     */
    @Transactional
    public PageLayout saveLayout(SaveLayoutRequest request) {
        String programCode = request.getProgramCode();
        String entityType = request.getEntityType();
        String pageType = request.getPageType();
        // 获取当前最大版本
        int maxVersion = layoutRepo.findMaxVersion(programCode, entityType, pageType);
        PageLayout layout = new PageLayout();
        layout.setId(UUID.randomUUID().toString());
        layout.setProgramCode(programCode);
        layout.setEntityType(entityType);
        layout.setPageType(pageType);
        layout.setLayoutConfig(request.getLayoutConfig());
        layout.setFieldConfig(request.getFieldConfig());
        layout.setVersion(maxVersion + 1);
        layout.setStatus("DRAFT");
        layout.setSchemaVersion(getCurrentSchemaVersion(programCode, entityType));
        layout.setCreatedBy(SecurityContext.getCurrentUserId());
        // 校验布局
        validateLayout(layout);
        return layoutRepo.save(layout);
    }
    /**
     * 发布布局
     */
    @Transactional
    public PageLayout publishLayout(String layoutId) {
        PageLayout layout = layoutRepo.findById(layoutId)
            .orElseThrow(() -> new BusinessException("布局不存在"));
        // 将同类型的其他 PUBLISHED 版本置为 ARCHIVED
        layoutRepo.updateStatusByProgramCodeAndEntityTypeAndPageType(
            layout.getProgramCode(),
            layout.getEntityType(),
            layout.getPageType(),
            "PUBLISHED",
            "ARCHIVED"
        );
        layout.setStatus("PUBLISHED");
        layout.setUpdatedAt(LocalDateTime.now());
        layout.setUpdatedBy(SecurityContext.getCurrentUserId());
        return layoutRepo.save(layout);
    }
    /**
     * 生成默认布局（当第一次进入设计器时）
     */
    public PageLayout generateDefaultLayout(String programCode, String entityType, String pageType) {
        // 从 program_schema 获取所有字段
        ProgramSchema schema = schemaService.getCurrentSchema(programCode, entityType);
        JSONObject fieldSchema = schema.getFieldSchema();
        JSONObject properties = fieldSchema.getJSONObject("properties");
        JSONArray sections = new JSONArray();
        JSONObject basicSection = new JSONObject();
        basicSection.put("id", "section_basic");
        basicSection.put("title", "基本信息");
        basicSection.put("columns", 2);
        basicSection.put("collapsible", true);
        basicSection.put("collapsed", false);
        JSONArray fields = new JSONArray();
        for (String key : properties.keySet()) {
            JSONObject field = new JSONObject();
            field.put("id", "field_" + key);
            field.put("field_key", key);
            field.put("label", key);
            field.put("component", "Input");
            field.put("span", 1);
            field.put("required", false);
            field.put("readonly", false);
            fields.put(field);
        }
        basicSection.put("fields", fields);
        sections.put(basicSection);
        JSONObject layoutConfig = new JSONObject();
        layoutConfig.put("version", "1.0");
        layoutConfig.put("sections", sections);
        PageLayout layout = new PageLayout();
        layout.setId(UUID.randomUUID().toString());
        layout.setProgramCode(programCode);
        layout.setEntityType(entityType);
        layout.setPageType(pageType);
        layout.setLayoutConfig(layoutConfig);
        layout.setVersion(1);
        layout.setStatus("DRAFT");
        layout.setSchemaVersion(schema.getVersion());
        return layout;
    }
    /**
     * 校验布局
     */
    private void validateLayout(PageLayout layout) {
        JSONObject config = layout.getLayoutConfig();
        JSONArray sections = config.getJSONArray("sections");
        // 1. 校验是否有重复字段
        Set<String> fieldKeys = new HashSet<>();
        for (int i = 0; i < sections.size(); i++) {
            JSONArray fields = sections.getJSONObject(i).getJSONArray("fields");
            for (int j = 0; j < fields.size(); j++) {
                String fieldKey = fields.getJSONObject(j).getString("field_key");
                if (fieldKeys.contains(fieldKey)) {
                    throw new BusinessException("字段重复: " + fieldKey);
                }
                fieldKeys.add(fieldKey);
            }
        }
        // 2. 校验 Schema 中必填字段是否都被包含（仅对编辑页强校验）
        if ("EDIT".equals(layout.getPageType())) {
            ProgramSchema schema = schemaService.getCurrentSchema(
                layout.getProgramCode(), layout.getEntityType()
            );
            JSONObject fieldSchema = schema.getFieldSchema();
            JSONArray required = fieldSchema.optJSONArray("required");
            if (required != null) {
                for (int i = 0; i < required.size(); i++) {
                    String reqField = required.getString(i);
                    if (!fieldKeys.contains(reqField)) {
                        throw new BusinessException("必填字段 " + reqField + " 未在布局中配置");
                    }
                }
            }
        }
    }
}
```
### 6.2 会员详情页 API（集成布局）
```java
@RestController
@RequestMapping("/api/members")
@RequiredArgsConstructor
public class MemberController {
    private final MemberService memberService;
    private final PageLayoutService layoutService;
    private final LayoutToFormilyConverter converter;
    @GetMapping("/{memberId}/detail")
    public ApiResponse<MemberDetailResponse> getMemberDetail(@PathVariable String memberId) {
        String programCode = TenantContext.get();
        // 1. 获取会员数据
        Member member = memberService.findByMemberId(memberId);
        // 2. 获取页面布局（按 page_type = 'DETAIL'）
        PageLayout layout = layoutService.getLayout(programCode, "MEMBER", "DETAIL");
        // 3. 转换为 Formily Schema（供前端渲染）
        FormilySchema formilySchema = converter.convert(programCode, layout.getLayoutConfig());
        // 4. 返回数据 + Schema
        return ApiResponse.success(MemberDetailResponse.builder()
            .member(member)
            .layout(layout)
            .schema(formilySchema)
            .build());
    }
}
```
## 七、与 `program_schema` 的联动
### 7.1 Schema 变更检测
当 `program_schema` 被修改时（新增/删除/修改字段），需要同步更新布局配置：
```java
@Component
public class SchemaChangeListener {
    @Autowired
    private PageLayoutService layoutService;
    @EventListener
    public void onSchemaChanged(SchemaChangedEvent event) {
        String programCode = event.getProgramCode();
        String entityType = event.getEntityType();
        String newSchemaVersion = event.getNewVersion();
        // 1. 查询所有 DRAFT 状态的布局
        List<PageLayout> drafts = layoutService.findDraftsByProgramCodeAndEntityType(
            programCode, entityType
        );
        for (PageLayout draft : drafts) {
            // 2. 对比字段变化
            SchemaDiff diff = compareSchema(
                draft.getSchemaVersion(),
                newSchemaVersion,
                programCode,
                entityType
            );
            // 3. 新增字段自动添加到布局中（默认加入最后一个分组）
            for (String newField : diff.getAddedFields()) {
                addFieldToLayout(draft, newField);
            }
            // 4. 删除字段从布局中移除
            for (String removedField : diff.getRemovedFields()) {
                removeFieldFromLayout(draft, removedField);
            }
            // 5. 更新版本号
            draft.setSchemaVersion(newSchemaVersion);
            layoutService.saveLayout(draft);
        }
    }
}
```
### 7.2 字段自动同步策略
| Schema 变更  | 布局处理策略                                |
| ---------- | ------------------------------------- |
| **新增字段**   | 自动添加到最后一个分组的末尾，状态为“未配置”（需运营确认）        |
| **删除字段**   | 自动从布局中移除（软删除，保留配置但标记为 `hidden: true`） |
| **字段类型变更** | 保留布局配置，但标记为“需要校验”（运营需确认组件是否匹配）        |
| **必填属性变更** | 自动同步到布局的 `required` 属性                |
## 八、版本管理
### 8.1 版本历史
```sql
-- 版本历史查询
SELECT version, status, created_by, created_at, schema_version
FROM program_page_layout
WHERE program_code = 'BRAND_A'
  AND entity_type = 'MEMBER'
  AND page_type = 'DETAIL'
ORDER BY version DESC;
```
### 8.2 回滚操作
```java
@Transactional
public PageLayout rollbackLayout(String layoutId, int targetVersion) {
    // 1. 获取目标版本的布局
    PageLayout target = layoutRepo.findByProgramCodeAndEntityTypeAndPageTypeAndVersion(
        programCode, entityType, pageType, targetVersion
    );
    // 2. 创建新版本（复制目标版本的内容）
    PageLayout newLayout = new PageLayout();
    BeanUtils.copyProperties(target, newLayout);
    newLayout.setId(UUID.randomUUID().toString());
    newLayout.setVersion(layoutService.getMaxVersion(programCode, entityType, pageType) + 1);
    newLayout.setStatus("DRAFT");
    newLayout.setCreatedBy(SecurityContext.getCurrentUserId());
    newLayout.setCreatedAt(LocalDateTime.now());
    return layoutRepo.save(newLayout);
}
```
## 九、API 设计
| 方法   | 路径                                                    | 说明               |
| ---- | ----------------------------------------------------- | ---------------- |
| GET  | `/api/layout/{programCode}/{entityType}/{pageType}`   | 获取页面布局           |
| POST | `/api/layout`                                         | 保存布局（草稿）         |
| POST | `/api/layout/{layoutId}/publish`                      | 发布布局             |
| GET  | `/api/layout/{layoutId}/history`                      | 获取版本历史           |
| POST | `/api/layout/{layoutId}/rollback/{version}`           | 回滚到指定版本          |
| GET  | `/api/layout/field-schema/{programCode}/{entityType}` | 获取可用字段列表（供设计器使用） |
| POST | `/api/layout/preview`                                 | 预览布局效果           |
## 十、开发实施步骤
| 阶段          | 任务                             | 说明                    |
| ----------- | ------------------------------ | --------------------- |
| **Phase 1** | 创建 `program_page_layout` 表     | 数据库 DDL               |
| **Phase 2** | 实现后端 Layout Service            | CRUD + 发布 + 版本管理      |
| **Phase 3** | 实现 Layout → Formily Schema 转换器 | 后端转换逻辑                |
| **Phase 4** | 前端设计器 UI（字段面板 + 画布 + 属性面板）     | React + Formily + DnD |
| **Phase 5** | 前端运行时渲染器                       | 会员详情页集成               |
| **Phase 6** | Schema 联动（变更检测 + 自动同步）         | 监听 Schema 变更事件        |
| **Phase 7** | 测试与联调                          | 完整流程测试                |
## 十一、总结
| 能力            | 实现方式                               |
| ------------- | ---------------------------------- |
| **可视化拖拽设计**   | React + @dnd-kit 拖拽库，左侧字段面板 → 中间画布 |
| **属性配置**      | 右侧属性面板，实时修改字段/分组配置                 |
| **多页面类型**     | 支持 DETAIL / EDIT / LIST 三种页面独立配置   |
| **版本管理**      | 同一实体/页面支持多版本，DRAFT / PUBLISHED 状态  |
| **Schema 联动** | 监听 `program_schema` 变更，自动同步新增/删除字段 |
| **运行时渲染**     | Formily Schema 驱动，零代码渲染            |
| **字段覆盖**      | `field_config` 支持覆盖 Schema 默认配置    |
