# Loyalty 全渠道忠诚度管理 SaaS 平台
## 完整设计文档 v8.0
**版本**：8.0
**状态**：基于已实现功能的完整设计文档
**日期**：2026-07-12
**前一版本**：v7.3

---

## 第一章：引言与设计哲学

### 1.1 背景与战略愿景
Loyalty 平台经过多轮迭代，已从基础积分系统演进为**全渠道忠诚度管理中台**。v8.0 版本在 v7.3 的金融级架构基础上，新增了以下核心能力：

- **规则引擎可视化配置**：三栏布局（IF/THEN/ELSE），阶梯累进计算，多动作类型，变量池
- **实体建模与主数据关联**：program_schema 驱动的实体设计器，字段级主数据关联
- **One-ID 统一身份识别**：多渠道会员通，分层匹配引擎，渠道绑定管理
- **会员全生命周期管理**：字段排版编辑器，扩展属性动态渲染，等级评估规则
- **积分类型属性驱动**：消除硬编码，积分类型行为由属性控制

### 1.2 设计哲学
- **配置驱动**：规则、页面、实体均由元数据驱动，运营人员无需开发即可配置
- **属性驱动**：积分类型行为由 `isRedeemable`/`isTierCalc`/`allowRepay` 等属性控制
- **变量化**：通过 `sum('TYPE')` / `count('TYPE')` 表达式抽象汇总逻辑
- **所见即所得**：实体设计器画布、规则编辑器预览、会员信息实时渲染

### 1.3 核心术语
| 术语 | 定义 | 实现 |
|------|------|------|
| **Program** | 业务租户单元 | `program_code` 隔离 |
| **One-ID** | 全渠道身份识别唯一会员主键 | `OneIdMatcher` 分层匹配 |
| **EventFact** | 标准化领域事件 | `transaction_event` 表 |
| **PointType** | 积分类型定义 | `point_type_definition` 属性驱动 |
| **Variable** | 派生指标 | `rule_variable_definition` 表达式 |
| **MasterData** | 主数据/字典 | `x-master-data` 关联 |
| **EntityModeler** | 实体建模画布 | ReactFlow 画布 + program_schema |

---

## 第二章：系统架构

### 2.1 模块关系图
```
┌─────────────────────────────────────────────────────────────────┐
│                      Loyalty SaaS 平台                          │
├─────────────────────────────────────────────────────────────────┤
│  前端 (React 18 + Ant Design 5 + Zustand + ReactFlow)          │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────────────┐  │
│  │ 会员服务 │ │ 忠诚度   │ │ 营销管理 │ │ 系统设置         │  │
│  │ ·会员列表│ │ ·积分类型│ │ ·工作区  │ │ ·实体模型配置    │  │
│  │ ·字段排版│ │ ·变量配置│ │ ·决策引擎│ │ ·角色权限        │  │
│  │          │ │ ·累积规则│ │ ·画布编辑│ │ ·主数据管理      │  │
│  │          │ │ ·等级评估│ │ ·活动日历│ │ ·渠道会员通      │  │
│  │          │ │ ·One-ID  │ │          │ │ ·One-ID策略      │  │
│  └──────────┘ └──────────┘ └──────────┘ └──────────────────┘  │
├─────────────────────────────────────────────────────────────────┤
│  后端 (Spring Boot 3 + Drools 8 + PostgreSQL + LiteFlow)       │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────────────┐  │
│  │ 会员模块 │ │ 积分模块 │ │ 规则引擎 │ │ 主数据模块        │  │
│  │ Member   │ │ PointType│ │ RuleDrl  │ │ MasterData        │  │
│  │ OneId    │ │ Variable │ │ KieBase  │ │ RenderService     │  │
│  │ Channel  │ │ Account  │ │ TierEval │ │ DynamicField      │  │
│  └──────────┘ └──────────┘ └──────────┘ └──────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

### 2.2 数据模型总览
```
program_schema (实体定义)
  ├── MEMBER → member 表
  ├── ORDER → transaction_event 表
  ├── BEHAVIOR → transaction_event 表
  ├── REDEEM_ORDER → transaction_event 表
  ├── MASTER_DATA → master_data_enum 表
  └── OrderItem → 嵌套在 ORDER 中

point_type_definition (积分类型)
  ├── isRedeemable → 兑换引擎
  ├── isTierCalc → 等级引擎
  └── allowRepay → 冲抵引擎

rule_definition (规则定义)
  ├── metadata JSONB → 条件+奖励配置
  ├── drl_content → 自动生成的 DRL 代码
  └── rule_variable_definition → 变量表达式

member_channel_binding (渠道绑定)
  └── OneIdMatcher → 分层身份匹配
```

---

## 第三章：实体建模与主数据

### 3.1 实体设计器 (EntityDesigner)
基于 ReactFlow 的画布编辑器，管理 `program_schema` 中的实体定义。

**核心功能**：
- 可视化画布：拖拽实体位置，连线建立关系
- 字段编辑：内联编辑字段名、显示名、类型、主键
- 属性控制：每个字段可设置 `界面显示`(showInUI) 和 `规则可用`(availableInRules)
- 主数据关联：字段可关联 `x-master-data`，运行时自动渲染为下拉选择
- 表映射：固定字段映射 `fixedFieldMapping` 到实际数据库列

**字段定义存储格式**：
```json
{
  "properties": {
    "gender": {
      "type": "string",
      "title": "性别",
      "x-master-data": {
        "dataCode": "GENDER",
        "dataType": "ENUM",
        "valueField": "code",
        "labelField": "label",
        "component": "select"
      },
      "x-ui-metadata": {
        "showInUI": true,
        "availableInRules": true
      }
    }
  }
}
```

### 3.2 主数据管理 (MasterData)
**master_data_enum** 表存储枚举值，支持代码↔标签自动转换。

**MasterDataRenderService**：
- `codeToLabel(dataCode, code)` — 代码转标签
- `labelToCode(dataCode, label)` — 标签转代码
- `renderMemberFields(rawValues, fieldSchema)` — 批量渲染会员字段

**API**：
- `GET /api/master-data/definitions` — 主数据定义列表
- `GET /api/master-data/{dataCode}/options` — 枚举选项
- `GET /api/master-data/hierarchy/options` — 层级选项（级联）

### 3.3 DynamicField 动态组件
前端根据字段的 `x-master-data` 配置自动渲染合适的输入组件：
- 枚举型 → `Select` 下拉 / `Radio` 单选
- 层级型 → `Cascader` 级联选择
- 普通字段 → `Input` / `InputNumber` / `Boolean Select`

---

## 第四章：会员管理

### 4.1 会员数据结构
**member 表固定字段**：member_id, name, gender, birthday, tier_code, status, enroll_channel, schema_version, created_at, ext_attributes(JSONB)

**扩展字段**：29 个 ext_attributes 字段，由 MEMBER schema 定义

### 4.2 会员服务页面
**功能**：
- 搜索：按手机号/邮箱/会员ID查询
- 信息卡片：姓名、性别、生日、手机、入会渠道、当前等级
- 积分账户：按类型展示余额（排除 RECORD 类型）
- 交易流水：仅显示可兑换类型的交易
- 渠道绑定：展示 member_channel_binding 数据
- 信息修改：DynamicField 动态渲染编辑表单
- 生日/手机快速修改：独立弹窗

### 4.3 字段排版编辑器
**FieldLayoutEditor** 组件支持：
- 字段显隐控制（勾选开关）
- 字段标签自定义编辑
- 可编辑/只读开关
- 上下移动排序
- 添加字段（从 schema 未显示字段中选择）
- 布局保存到 `/api/members/layout`

### 4.4 入会渠道
`member.enroll_channel` 字段记录会员入会来源渠道。

---

## 第五章：积分体系

### 5.1 积分类型管理
**point_type_definition** 表，属性驱动：
| 属性 | 字段 | 说明 |
|------|------|------|
| 可兑换 | isRedeemable | 兑换引擎使用 |
| 算等级 | isTierCalc | 等级引擎使用 |
| 可冲抵 | allowRepay | 冲抵引擎使用 |
| 允许负分 | allowNegative | 透支控制 |
| 过期模式 | expiryMode | NONE/FIXED_DAYS/NATURAL_MONTH/NATURAL_YEAR |

**前端**：表格内联编辑，hover 输入框，Switch 开关，保存按钮

**后端**：`PointTypeService` 属性驱动查询
- `getRedeemableTypes()` — 可兑换类型
- `getTierCalcTypes()` — 等级计算类型
- `getRepayableTypes()` — 可冲抵类型

### 5.2 变量管理
**rule_variable_definition** 表，支持表达式：
- `sum('TYPE')` — 时间窗口内发分累计
- `count('TYPE')` — 交易次数
- `balance('TYPE')` — 当前余额

**后端**：
- `VariableExpressionParser` — 提取原子类型、语法校验
- `VariableCalculationService` — 按需预加载、Aviator 表达式计算

**前端**：表格内联编辑，表达式辅助（函数按钮+类型插入），预览计算

### 5.3 积分流水
**过滤规则**：仅显示 `isRedeemable=true` 的积分类型交易
**积分账户**：排除 `pointCategory=RECORD` 的类型

---

## 第六章：规则引擎

### 6.1 累积规则配置
**三栏布局**：
- 左侧：变量池（订单/会员/变量字段，点击添加到条件）
- 中间：IF 条件区（蓝色） + THEN 动作区（绿色） + ELSE 动作区（红色）
- 右侧：规则语义预览 + 模拟计算器

**条件配置**：
- 条件来源：订单/会员/变量
- 独立 AND/OR 连接符
- 条件组递归嵌套

**动作类型**：
| 动作 | 说明 | 配置 |
|------|------|------|
| 赋值 | 积分类型 = 字段 × 倍数 | 积分类型 + 字段 + 运算符 + 值 |
| 累加 | 积分类型 += 固定值 | 积分类型 + 值 |
| 循环遍历 | FOR 集合遍历 | 集合字段 + 元素变量 |
| 条件分支 | IF-ELSE 嵌套 | 条件组 + THEN/ELSE 动作 |
| 分段阶梯累进 | 区间扣减 + 上限控制 | 积分类型 + 依据字段 + 阶梯表 |

**阶梯计算**：
- 档位扣减模式：从高到低扣减
- 积分上限：启用后超限截断，溢出按倍数继续
- 模拟计算器：输入金额实时计算毛积分→上限→最终积分

### 6.2 规则类型选择
- **积分累积规则**：THEN 可选择可兑换+记录型积分
- **等级积分累积规则**：THEN 可选择算等级+记录型积分

### 6.3 DRL 自动生成
**RuleDrlGenerator**：根据 `rule_definition.metadata` 自动生成 Drools DRL 代码。
- 条件：EVENT_ATTRIBUTE / MEMBER_ATTRIBUTE / VARIABLE
- 奖励：FIXED_VALUE / FIXED_MULTIPLIER / STEP / STEP_CYCLE
- 上限：perOrderLimit / accumulativeLimit

### 6.4 等级评估规则
**TierRuleConfig** 页面：
- 升级规则：评估维度 + 附加条件 + AND/OR 独立控制
- 保级规则：保级条件 + 附加条件
- 等级设置：有效期模式 + 等级阶梯

---

## 第七章：One-ID 统一身份

### 7.1 分层匹配引擎
**OneIdMatcher** 匹配优先级：
1. 第零层：UnionID 匹配
2. 第一层：双因素匹配（渠道ID + 加密手机）
3. 第二层：渠道ID 匹配
4. 第三层：密文手机匹配
5. 第四层：未匹配 → 创建新会员

### 7.2 渠道绑定
**member_channel_binding** 表（行存储）：
- channel_user_id, channel_union_id, channel_nickname
- channel_mobile_encrypted, encrypt_type
- authorized_at, status

**ChannelBindingService**：
- `bindChannel()` — 绑定/更新/激活
- `unbindChannel()` — 解绑
- `getMemberBindings()` — 查询会员绑定

### 7.3 渠道会员通配置
**前端**：表格内联编辑，开通/关闭开关，加密方式选择（无/双重MD5/MD5/SHA256），加密Salt

### 7.4 One-ID 策略配置
**前端**：优先级字段拖拽排序，权重+必填配置

### 7.5 数据迁移
**OneIdMigrationService**：`member_unique_key` → `member_channel_binding` 迁移

---

## 第八章：API 接口

### 8.1 积分类型
| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/point-types` | 列表 |
| POST | `/api/point-types` | 创建 |
| PUT | `/api/point-types/{typeCode}` | 更新 |
| DELETE | `/api/point-types/{typeCode}` | 删除 |
| GET | `/api/point-types/redeemable` | 可兑换 |
| GET | `/api/point-types/tier-calc` | 算等级 |
| GET | `/api/point-types/repayable` | 可冲抵 |

### 8.2 变量
| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/variables` | 列表 |
| POST | `/api/variables` | 创建 |
| PUT | `/api/variables/{varCode}` | 更新 |
| DELETE | `/api/variables/{varCode}` | 删除 |
| POST | `/api/variables/validate` | 验证表达式 |
| POST | `/api/variables/calculate` | 预览计算 |

### 8.3 规则
| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/admin/rules` | 列表 |
| POST | `/api/admin/rules` | 创建（自动生成DRL） |
| PUT | `/api/admin/rules/{id}` | 更新 |
| POST | `/api/admin/rules/{id}/publish` | 发布 |

### 8.4 主数据
| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/master-data/definitions` | 定义列表 |
| GET | `/api/master-data/{dataCode}/options` | 枚举选项 |
| GET | `/api/master-data/hierarchy/options` | 层级选项 |
| GET | `/api/master-data/{dataCode}/label` | 代码→标签 |
| POST | `/api/master-data/labels` | 批量转换 |

### 8.5 会员通
| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/spi/{channel}/bind/query` | 绑定查询 |
| POST | `/api/spi/{channel}/bind` | 绑定/解绑 |
| GET | `/api/admin/channel-pass/config` | 渠道配置 |
| PUT | `/api/admin/channel-pass/config` | 更新配置 |
| GET | `/api/admin/one-id/strategy` | 策略列表 |

### 8.6 实体设计器
| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/entity-designer/entities` | 实体列表 |
| POST | `/api/entity-designer/entities` | 创建实体 |
| PUT | `/api/entity-designer/entities/{et}` | 更新实体 |
| POST | `/api/entity-designer/entities/{et}/fields` | 添加字段 |
| DELETE | `/api/entity-designer/entities/{et}/fields/{fn}` | 删除字段 |
| PUT | `/api/entity-designer/entities/{et}/position` | 保存位置 |
| POST | `/api/entity-designer/entities/{et}/relations` | 添加关系 |

---

## 第九章：数据模型

### 9.1 核心表
| 表名 | 说明 | 关键字段 |
|------|------|----------|
| `member` | 会员主表 | member_id, name, gender, birthday, tier_code, status, enroll_channel, ext_attributes |
| `program_schema` | 实体定义 | entity_type, field_schema, entity_relations, layout_position, fixed_field_mapping |
| `point_type_definition` | 积分类型 | type_code, is_redeemable, is_tier_calc, allow_repay, expiry_mode |
| `rule_definition` | 规则定义 | rule_code, metadata(JSONB), drl_content, status |
| `rule_variable_definition` | 变量定义 | var_code, expression, status |
| `account_transaction` | 积分流水 | member_id, account_type, transaction_type, amount, remaining_amount |
| `member_channel_binding` | 渠道绑定 | channel, channel_user_id, channel_mobile_encrypted, status |
| `one_id_strategy` | One-ID策略 | strategy_code, priority_fields(JSONB) |
| `channel_crypto_config` | 加密配置 | channel, encrypt_type, encrypt_algorithm, salt |
| `channel_member_pass_config` | 会员通配置 | channel, enabled, tmall_salt |
| `master_data_enum` | 枚举值 | data_code, enum_code, enum_label |

### 9.2 迁移脚本
| 版本 | 内容 |
|------|------|
| V1_29 | rule_variable_definition 表 |
| V1_30 | member.enroll_channel 字段 |
| V1_31 | member_channel_binding + one_id_strategy + channel_crypto_config + channel_member_pass_config |

---

## 第十章：前端路由与菜单

### 10.1 菜单结构
```
会员服务 → /members
  └── 会员列表+详情+编辑

忠诚度
├── 积分类型 → /points/type
├── 等级设置 → /tiers
├── 变量配置 → /variables
├── 累积规则配置 → /rules (列表) /rules/engine (编辑器)
├── 等级评估配置 → /rules/tier
├── 计算流程配置 → /flow-designer
├── One-ID 策略 → /system/oneid-strategy
└── 条款管理 → /campaign/terms

营销管理
├── 营销工作区 / 决策引擎 / 画布编辑器 / 内容合规 / 干预中心
├── 执行引擎 / 机会智能 / 模拟优化 / 反馈闭环
├── 活动日历 / 偏好管理 / 策略蓝图 / 预算节奏
├── 共享管理 / 推荐管理 / 实验管理

系统设置
├── 实体模型配置 → /entity-designer
├── 主数据管理 → /system/master-data
├── 渠道会员通 → /system/channel-pass
├── 角色权限 / 用户管理 / 操作日志 / SPI日志
├── 大模型配置 / 死信队列 / Webhook监控
├── 渠道列表 / 租户审计
```

---

## 第十一章：测试

### 11.1 测试覆盖
| 层级 | 测试数 | 状态 |
|------|--------|------|
| 后端全量 | 554 | 0 失败 |
| OneIdMatcher 单元测试 | 7 | 全部通过 |
| 前端 TypeScript | — | 0 错误 |

### 11.2 关键测试场景
- OneIdMatcher: UnionID/双因素/渠道ID/密文/INACTIVE 绑定不参与匹配
- VariableExpressionParser: 表达式提取/验证/边界条件
- VariableCalculationService: 表达式替换/计算/按需预加载
- PointTypeService: 属性驱动查询/CRUD/引用检测

---

## 第十二章：总结

| 能力 | 实现方式 |
|------|----------|
| **积分类型管理** | point_type_definition 属性驱动（isRedeemable/isTierCalc/allowRepay） |
| **变量配置** | rule_variable_definition 表达式（sum/count/balance + 四则运算） |
| **规则引用变量** | metadata.conditions[].type = "VARIABLE" |
| **按需预加载** | 解析变量表达式 → 提取原子类型 → 批量查询数据库 |
| **实体建模** | ReactFlow 画布 + program_schema 存储 |
| **主数据关联** | x-master-data 配置 + DynamicField 动态组件 |
| **One-ID 匹配** | 分层匹配（UnionID → 双因素 → 渠道ID → 密文） |
| **渠道绑定** | member_channel_binding 行存储 |
| **DRL 自动生成** | RuleDrlGenerator 从 metadata 生成 Drools 代码 |
| **字段排版** | FieldLayoutEditor 可视化配置 |
| **代码↔标签转换** | MasterDataRenderService 自动转换 |

---

*文档版本：v8.0 | 最后更新：2026-07-12*