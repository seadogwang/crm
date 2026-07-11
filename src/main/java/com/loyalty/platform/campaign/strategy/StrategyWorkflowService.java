package com.loyalty.platform.campaign.strategy;

import com.loyalty.platform.domain.entity.campaign.*;
import com.loyalty.platform.domain.repository.campaign.*;
import org.slf4j.*;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Instant;
import java.util.*;

@Service @Transactional
public class StrategyWorkflowService {
    private static final Logger log = LoggerFactory.getLogger(StrategyWorkflowService.class);
    private final CampaignGoalRepository goalRepository;
    private final StrategyBlueprintRepository blueprintRepository;
    private final GoalDecompositionRepository decompositionRepository;
    private final CampaignInitiativeRepository initiativeRepository;

    public StrategyWorkflowService(CampaignGoalRepository goalRepository,
                                   StrategyBlueprintRepository blueprintRepository,
                                   GoalDecompositionRepository decompositionRepository,
                                   CampaignInitiativeRepository initiativeRepository) {
        this.goalRepository = goalRepository;
        this.blueprintRepository = blueprintRepository;
        this.decompositionRepository = decompositionRepository;
        this.initiativeRepository = initiativeRepository;
    }

    /** Step 1: 创建目标并自动匹配蓝图 */
    @Transactional
    public CampaignGoal createGoalWithBlueprint(CampaignGoal goal) {
        if (goal.getId() == null) goal.setId(UUID.randomUUID().toString());
        goal.setWorkflowStatus("GOAL_DRAFT");
        // Auto-match blueprint
        if (goal.getBlueprintId() == null && goal.getIndustryType() != null) {
            List<StrategyBlueprint> matches = blueprintRepository
                    .findByIndustryTypeAndIsActiveTrue(goal.getIndustryType());
            if (!matches.isEmpty()) goal.setBlueprintId(matches.get(0).getId());
            else blueprintRepository.findByIsSystemDefaultTrueAndIsActiveTrue()
                    .ifPresent(b -> goal.setBlueprintId(b.getId()));
        }
        log.info("Goal created: id={}, industry={}, blueprint={}", goal.getId(), goal.getIndustryType(), goal.getBlueprintId());
        return goalRepository.save(goal);
    }

    /** Step 2: 分析缺口 */
    @Transactional
    public GoalDecomposition analyzeGap(String goalId) {
        CampaignGoal goal = goalRepository.findById(goalId).orElseThrow();
        double baseline = goal.getCurrentValue() != null ? goal.getCurrentValue().doubleValue() : 0;
        double target = goal.getTargetValue() != null ? goal.getTargetValue().doubleValue() : 0;
        double gap = target - baseline;

        StrategyBlueprint bp = goal.getBlueprintId() != null
                ? blueprintRepository.findById(goal.getBlueprintId()).orElse(null) : null;
        String mode = bp != null ? "BLUEPRINT" : "CORRELATION";

        // Build simple decomposition
        Map<String, Object> leverGaps = new LinkedHashMap<>();
        leverGaps.put("totalGap", gap);
        leverGaps.put("baselineValue", baseline);
        leverGaps.put("targetValue", target);
        if (bp != null) leverGaps.put("blueprintName", bp.getBlueprintName());

        // Build initiative suggestions
        List<Map<String, Object>> suggestions = buildSuggestions(goal, bp, gap);

        GoalDecomposition decomp = GoalDecomposition.builder()
                .id(UUID.randomUUID().toString()).goalId(goalId)
                .workspaceId(goal.getWorkspaceId()).blueprintId(goal.getBlueprintId())
                .targetValue(BigDecimal.valueOf(target)).baselineValue(BigDecimal.valueOf(baseline))
                .totalGap(BigDecimal.valueOf(gap)).decompositionMode(mode)
                .leverGaps(toJson(leverGaps)).initiativeSuggestions(toJson(suggestions)).build();
        decomp = decompositionRepository.save(decomp);

        goal.setWorkflowStatus("GAP_ANALYZED");
        goalRepository.save(goal);
        log.info("Gap analyzed: goalId={}, mode={}, gap={}", goalId, mode, String.format("%.2f", gap));
        return decomp;
    }

    /** Step 4: 从策略创建举措 */
    @Transactional
    public List<CampaignInitiative> createInitiativesFromDecomposition(String goalId) {
        CampaignGoal goal = goalRepository.findById(goalId).orElseThrow();
        GoalDecomposition decomp = decompositionRepository.findTopByGoalIdOrderByCreatedAtDesc(goalId).orElse(null);
        if (decomp == null) return List.of();

        List<CampaignInitiative> result = new ArrayList<>();
        int idx = 0;
        for (Map<String, Object> s : parseJsonList(decomp.getInitiativeSuggestions())) {
            CampaignInitiative ini = CampaignInitiative.builder()
                    .id(UUID.randomUUID().toString()).workspaceId(goal.getWorkspaceId())
                    .goalId(goalId).name(String.valueOf(s.getOrDefault("name", "策略举措" + (idx + 1))))
                    .initiativeType(String.valueOf(s.getOrDefault("type", "PROMOTION")))
                    .priority(100 - idx * 10)
                    .analysisJson(toJson(s))
                    .status("PLANNED").build();
            result.add(initiativeRepository.save(ini));
            idx++;
        }
        goal.setWorkflowStatus("INITIATIVE_CREATED");
        goalRepository.save(goal);
        log.info("Initiatives created: goalId={}, count={}", goalId, result.size());
        return result;
    }

    /** 获取蓝图列表 */
    public List<StrategyBlueprint> getBlueprints(String industryType) {
        return industryType != null ? blueprintRepository.findByIndustryTypeAndIsActiveTrue(industryType)
                : blueprintRepository.findByIsActiveTrue();
    }

    /** 保存蓝图 */
    public StrategyBlueprint saveBlueprint(StrategyBlueprint bp) {
        if (bp.getId() == null) bp.setId(UUID.randomUUID().toString());
        return blueprintRepository.save(bp);
    }

    /** 获取拆解结果 */
    public GoalDecomposition getDecomposition(String goalId) {
        return decompositionRepository.findTopByGoalIdOrderByCreatedAtDesc(goalId).orElse(null);
    }

    // Helpers
    private List<Map<String, Object>> buildSuggestions(CampaignGoal goal, StrategyBlueprint bp, double gap) {
        List<Map<String, Object>> suggestions = new ArrayList<>();
        if (bp != null) {
            suggestions.add(Map.of("name", bp.getBlueprintName() + "-新客获取", "type", "ACQUISITION",
                    "expectedContribution", String.format("%.2f", gap * 0.4), "leverCode", "new_customer"));
            suggestions.add(Map.of("name", bp.getBlueprintName() + "-老客复购", "type", "RETENTION",
                    "expectedContribution", String.format("%.2f", gap * 0.3), "leverCode", "repeat_rate"));
            suggestions.add(Map.of("name", bp.getBlueprintName() + "-客单价提升", "type", "UPSELL",
                    "expectedContribution", String.format("%.2f", gap * 0.3), "leverCode", "avg_order_value"));
        } else {
            suggestions.add(Map.of("name", "通用增长举措-用户获取", "type", "ACQUISITION",
                    "expectedContribution", String.format("%.2f", gap * 0.5)));
            suggestions.add(Map.of("name", "通用增长举措-用户留存", "type", "RETENTION",
                    "expectedContribution", String.format("%.2f", gap * 0.5)));
        }
        return suggestions;
    }

    @SuppressWarnings("unchecked")
    private List<Map<String, Object>> parseJsonList(String json) {
        if (json == null) return List.of();
        try { return new com.fasterxml.jackson.databind.ObjectMapper().readValue(json, List.class); }
        catch (Exception e) { return List.of(); }
    }

    private String toJson(Object obj) {
        try { return new com.fasterxml.jackson.databind.ObjectMapper().writeValueAsString(obj); }
        catch (Exception e) { return "{}"; }
    }
}
