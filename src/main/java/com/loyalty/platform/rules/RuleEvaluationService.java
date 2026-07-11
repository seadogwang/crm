package com.loyalty.platform.rules;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.loyalty.platform.domain.entity.RuleDefinition;
import com.loyalty.platform.domain.entity.VariableFact;
import com.loyalty.platform.domain.repository.RuleDefinitionRepository;
import com.loyalty.platform.rules.action.Action;
import com.loyalty.platform.rules.action.ActionCollector;
import com.loyalty.platform.rules.drl.MemberFact;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.util.*;
import java.util.stream.Collectors;

/**
 * 规则评估服务 — 集成变量计算。
 *
 * <p>设计文档 point_design_update.md §6.4：
 * <ol>
 *   <li>获取所有 ACTIVE 规则</li>
 *   <li>提取所有规则中引用的变量（去重）</li>
 *   <li>计算所有变量的值（按需预加载）</li>
 *   <li>构建 VariableFact 并插入到规则执行上下文中</li>
 *   <li>执行 Drools 规则</li>
 * </ol>
 *
 * @author Loyalty SaaS Architecture Team
 * @since 2.0.0
 */
@Service
public class RuleEvaluationService {

    private static final Logger log = LoggerFactory.getLogger(RuleEvaluationService.class);

    private final RuleDefinitionRepository ruleRepo;
    private final VariableCalculationService varCalcService;
    private final KieBaseCacheManager kieManager;
    private final ObjectMapper objectMapper;

    public RuleEvaluationService(RuleDefinitionRepository ruleRepo,
                                  VariableCalculationService varCalcService,
                                  KieBaseCacheManager kieManager,
                                  ObjectMapper objectMapper) {
        this.ruleRepo = ruleRepo;
        this.varCalcService = varCalcService;
        this.kieManager = kieManager;
        this.objectMapper = objectMapper;
    }

    /**
     * 评估规则（带变量计算）。
     *
     * @param programCode 租户代码
     * @param event       事件事实
     * @param member      会员事实
     * @param windowDays  时间窗口天数
     * @return 规则引擎输出的动作列表
     */
    public List<Action> evaluate(String programCode, Object event, MemberFact member, int windowDays) {
        // 1. 获取所有 ACTIVE 规则
        List<RuleDefinition> rules = ruleRepo.findActiveByProgramCode(programCode);
        if (rules.isEmpty()) {
            log.debug("[RuleEval] 无 ACTIVE 规则: program={}", programCode);
            return Collections.emptyList();
        }

        // 2. 提取所有规则中引用的变量（去重）
        Set<String> allVarCodes = extractVariableCodes(rules);
        log.debug("[RuleEval] 规则数={}, 变量数={}", rules.size(), allVarCodes.size());

        // 3. 计算所有变量的值
        Map<String, BigDecimal> varValues = Collections.emptyMap();
        if (!allVarCodes.isEmpty()) {
            varValues = varCalcService.calculateVariables(
                    programCode, new ArrayList<>(allVarCodes), member.getMemberId(), windowDays);
        }

        // 4. 构建事实列表
        List<Object> facts = new ArrayList<>();
        facts.add(event);
        facts.add(member);
        if (!varValues.isEmpty()) {
            facts.add(new VariableFact(varValues));
        }

        // 5. 执行规则
        return executeRules(programCode, facts);
    }

    /**
     * 评估规则（无窗口参数，默认 365 天）。
     */
    public List<Action> evaluate(String programCode, Object event, MemberFact member) {
        return evaluate(programCode, event, member, 365);
    }

    /**
     * 评估规则并返回详细的评估结果（包含变量明细，用于测试和调试）。
     */
    public EvaluationResult evaluateWithDetails(String programCode, Object event,
                                                  MemberFact member, int windowDays) {
        // 1. 获取所有 ACTIVE 规则
        List<RuleDefinition> rules = ruleRepo.findActiveByProgramCode(programCode);

        // 2. 提取变量
        Set<String> allVarCodes = extractVariableCodes(rules);

        // 3. 计算变量值
        Map<String, BigDecimal> varValues = Collections.emptyMap();
        if (!allVarCodes.isEmpty()) {
            varValues = varCalcService.calculateVariables(
                    programCode, new ArrayList<>(allVarCodes), member.getMemberId(), windowDays);
        }

        // 4. 构建事实列表
        List<Object> facts = new ArrayList<>();
        facts.add(event);
        facts.add(member);
        if (!varValues.isEmpty()) {
            facts.add(new VariableFact(varValues));
        }

        // 5. 执行规则
        List<Action> actions = executeRules(programCode, facts);

        return new EvaluationResult(actions, varValues, allVarCodes);
    }

    /**
     * 提取所有规则中引用的变量编码（去重）。
     */
    @SuppressWarnings("unchecked")
    Set<String> extractVariableCodes(List<RuleDefinition> rules) {
        Set<String> varCodes = new LinkedHashSet<>();
        for (RuleDefinition rule : rules) {
            Map<String, Object> metadata = rule.getMetadata();
            if (metadata == null) continue;

            Object conditionsObj = metadata.get("conditions");
            if (conditionsObj instanceof List) {
                List<Map<String, Object>> conditions = (List<Map<String, Object>>) conditionsObj;
                for (Map<String, Object> cond : conditions) {
                    if ("VARIABLE".equals(cond.get("type"))) {
                        String varCode = (String) cond.get("varCode");
                        if (varCode != null && !varCode.isBlank()) {
                            varCodes.add(varCode);
                        }
                    }
                }
            }
        }
        return varCodes;
    }

    /**
     * 执行 Drools 规则（委托给 RuleEngineService）。
     */
    private List<Action> executeRules(String programCode, List<Object> facts) {
        try {
            var kieBase = kieManager.getKieBase(programCode);
            if (kieBase == null) {
                log.warn("[RuleEval] KieBase 不存在: program={}", programCode);
                return Collections.emptyList();
            }

            var session = kieBase.newStatelessKieSession();
            ActionCollector collector = new ActionCollector();
            session.setGlobal("collector", collector);
            session.execute(facts);

            List<Action> actions = collector.getActions();
            log.debug("[RuleEval] 推理完成: {} facts → {} actions", facts.size(), actions.size());
            return actions;
        } catch (Exception e) {
            log.error("[RuleEval] 规则执行异常: program={}", programCode, e);
            return Collections.emptyList();
        }
    }

    // ===== 内部类 =====

    public record EvaluationResult(
            List<Action> actions,
            Map<String, BigDecimal> variableValues,
            Set<String> extractedVarCodes) {}
}