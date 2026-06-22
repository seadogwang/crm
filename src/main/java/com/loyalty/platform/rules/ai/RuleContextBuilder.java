package com.loyalty.platform.rules.ai;

import com.loyalty.platform.domain.entity.PointTypeDefinition;
import com.loyalty.platform.domain.entity.ProgramSchema;
import com.loyalty.platform.domain.entity.TierDefinition;
import com.loyalty.platform.domain.repository.PointTypeDefinitionRepository;
import com.loyalty.platform.domain.repository.ProgramSchemaRepository;
import com.loyalty.platform.domain.repository.TierDefinitionRepository;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

@Service
public class RuleContextBuilder {

    private final ProgramSchemaRepository schemaRepo;
    private final PointTypeDefinitionRepository pointTypeRepo;
    private final TierDefinitionRepository tierRepo;

    public RuleContextBuilder(ProgramSchemaRepository schemaRepo,
                              PointTypeDefinitionRepository pointTypeRepo,
                              TierDefinitionRepository tierRepo) {
        this.schemaRepo = schemaRepo;
        this.pointTypeRepo = pointTypeRepo;
        this.tierRepo = tierRepo;
    }

    public String buildSystemPrompt(String programCode, String ruleType) {
        StringBuilder sb = new StringBuilder();
        sb.append("你是一个忠诚度管理系统的规则配置助手，帮助运营人员创建 Drools 规则。\n\n");

        // 1. 实体 Schema
        sb.append("## 可用数据模型\n\n");
        appendEntitySchema(sb, programCode, "MEMBER", "会员实体");
        appendEntitySchema(sb, programCode, "ORDER", "订单实体");
        appendEntitySchema(sb, programCode, "TRANSACTION", "交易事件实体");

        // 2. 积分类型
        List<PointTypeDefinition> pointTypes = pointTypeRepo.findByProgramCodeAndStatus(programCode, "ACTIVE");
        if ("积分累积规则".equals(ruleType)) {
            pointTypes = pointTypes.stream().filter(p -> Boolean.TRUE.equals(p.getIsRedeemable())).collect(Collectors.toList());
        } else if ("等级规则".equals(ruleType)) {
            pointTypes = pointTypes.stream().filter(p -> Boolean.TRUE.equals(p.getIsTierCalc())).collect(Collectors.toList());
        }

        sb.append("## 可用积分类型\n");
        for (PointTypeDefinition pt : pointTypes) {
            sb.append("- ").append(pt.getTypeCode()).append(" (").append(pt.getTypeName()).append(")")
                    .append(pt.getIsRedeemable() ? "，可兑换" : "")
                    .append(pt.getIsTierCalc() ? "，算等级" : "")
                    .append(Boolean.TRUE.equals(pt.getAllowRepay()) ? "，可冲抵" : "")
                    .append("\n");
        }

        // 3. 等级定义
        List<TierDefinition> tiers = tierRepo.findByProgramCodeOrderBySequenceAsc(programCode);
        sb.append("\n## 可用会员等级\n");
        for (TierDefinition t : tiers) {
            sb.append("- ").append(t.getTierCode()).append(": ").append(t.getTierName()).append("\n");
        }

        // 4. 输出格式（V4：全场景覆盖）
        sb.append("\n## 输出格式\n");
        sb.append("你是规则配置助手，负责通过对话澄清用户需求，然后生成表单。\n\n");
        sb.append("### 场景识别（第一步）\n");
        sb.append("1. 基础规则 vs 活动规则：有时间限制=活动规则(promo)，无时间限制=基础规则(base)\n");
        sb.append("2. 累积规则 vs 等级规则：送积分=累积规则，升级/保级=等级规则\n");
        sb.append("3. 奖励模式：固定倍数、固定积分值、阶梯倍数、阶梯固定值、阶梯循环\n");
        sb.append("4. 指定商品多倍：整单多倍(订单中含指定商品则整单多倍) vs 商品多倍(仅指定商品多倍)\n");
        sb.append("5. 有效期：长期生效(无时间限制) vs 指定时间段\n\n");
        sb.append("### 第一阶段：澄清（CLARIFYING）\n");
        sb.append("每次只问一个问题，给出选项。优先澄清：场景类型→奖励模式→指定商品范围→有效期→其他。\n");
        sb.append("JSON 格式：\n");
        sb.append("{\n");
        sb.append("  \"status\": \"CLARIFYING\",\n");
        sb.append("  \"message\": \"自然的引导文字\",\n");
        sb.append("  \"question\": {\n");
        sb.append("    \"id\": \"q1\",\n");
        sb.append("    \"text\": \"业务语言的问题\",\n");
        sb.append("    \"options\": [{\"value\":\"A\",\"label\":\"选项A\"}],\n");
        sb.append("    \"required\": true\n");
        sb.append("  }\n");
        sb.append("}\n\n");
        sb.append("### 第二阶段：生成表单（CLARIFIED）\n");
        sb.append("当所有核心问题已澄清，输出 formSchema。根据场景动态生成：\n");
        sb.append("- 基础规则：简单触发条件+奖励，无时间字段\n");
        sb.append("- 活动规则：含时间范围+时间基准，含指定商品选择\n");
        sb.append("- 阶梯规则：含 step_table 类型字段\n");
        sb.append("- 循环规则：含 cycle_config 类型字段\n");
        sb.append("JSON 格式：\n");
        sb.append("{\n");
        sb.append("  \"status\": \"CLARIFIED\",\n");
        sb.append("  \"message\": \"信息已完整。请填写以下表单：\",\n");
        sb.append("  \"formSchema\": { \"sections\": [...] }\n");
        sb.append("}\n\n");
        sb.append("### 第三阶段：规则生成（READY）\n");
        sb.append("当用户提交表单后，输出完整规则：\n");
        sb.append("{\n");
        sb.append("  \"status\": \"READY\",\n");
        sb.append("  \"message\": \"业务规则描述\",\n");
        sb.append("  \"ruleName\": \"规则名称\",\n");
        sb.append("  \"ruleCategory\": \"base|promo\",\n");
        sb.append("  \"drlContent\": \"Drools DRL代码...\"\n");
        sb.append("}\n\n");
        sb.append("## 约束\n");
        sb.append("1. 每次只问一个问题，提供2-4个选项\n");
        sb.append("2. 使用业务语言，不用技术术语\n");
        sb.append("3. question.id 用 q1,q2,q3... 编号\n");
        sb.append("4. 澄清完成后生成 formSchema，根据澄清结果动态定制\n");
        sb.append("5. 基础规则不包含时间字段，活动规则必须包含时间\n");
        sb.append("6. 指定商品多倍必须区分整单多倍 vs 商品多倍\n");

        return sb.toString();
    }

    private void appendEntitySchema(StringBuilder sb, String programCode, String entityType, String label) {
        var opt = schemaRepo.findByProgramCodeAndEntityType(programCode, entityType);
        if (opt.isEmpty()) return;

        ProgramSchema schema = opt.get();
        Map<String, Object> fieldSchema = schema.getFieldSchema();
        if (fieldSchema == null) return;

        sb.append("### ").append(label).append("\n");
        sb.append("字段：\n");

        @SuppressWarnings("unchecked")
        Map<String, Object> props = (Map<String, Object>) fieldSchema.get("properties");
        if (props != null) {
            for (var entry : props.entrySet()) {
                @SuppressWarnings("unchecked")
                Map<String, Object> def = (Map<String, Object>) entry.getValue();
                String type = def.get("type") instanceof String s ? s : "string";
                String desc = def.get("title") instanceof String s ? s : entry.getKey();
                sb.append("- ").append(entry.getKey()).append(" (").append(desc).append("，").append(type).append("型)");

                if (def.containsKey("enum")) {
                    sb.append("，可选值：").append(def.get("enum"));
                }
                sb.append("\n");
            }
        }
        sb.append("\n");
    }
}