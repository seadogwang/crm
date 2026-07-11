package com.loyalty.platform.campaign.strategy;

import com.loyalty.platform.common.dto.ApiResponse;
import com.loyalty.platform.domain.entity.campaign.*;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import java.util.*;

@RestController
@RequestMapping("/api/campaign/strategy")
public class StrategyController {
    private final StrategyWorkflowService workflowService;

    public StrategyController(StrategyWorkflowService workflowService) {
        this.workflowService = workflowService;
    }

    /** Step 1: 创建目标（含行业类型+自动匹配蓝图） */
    @PostMapping("/goal")
    public ResponseEntity<ApiResponse<CampaignGoal>> createGoal(@RequestBody CampaignGoal goal) {
        return ResponseEntity.ok(ApiResponse.success(workflowService.createGoalWithBlueprint(goal)));
    }

    /** Step 2: 分析缺口 */
    @PostMapping("/goal/{goalId}/analyze-gap")
    public ResponseEntity<ApiResponse<GoalDecomposition>> analyzeGap(@PathVariable String goalId) {
        return ResponseEntity.ok(ApiResponse.success(workflowService.analyzeGap(goalId)));
    }

    /** Step 4: 从拆解结果创建举措 */
    @PostMapping("/goal/{goalId}/create-initiatives")
    public ResponseEntity<ApiResponse<List<CampaignInitiative>>> createInitiatives(@PathVariable String goalId) {
        return ResponseEntity.ok(ApiResponse.success(workflowService.createInitiativesFromDecomposition(goalId)));
    }

    /** 获取拆解结果 */
    @GetMapping("/goal/{goalId}/decomposition")
    public ResponseEntity<ApiResponse<GoalDecomposition>> getDecomposition(@PathVariable String goalId) {
        return ResponseEntity.ok(ApiResponse.success(workflowService.getDecomposition(goalId)));
    }

    /** 蓝图管理 */
    @GetMapping("/blueprints")
    public ResponseEntity<ApiResponse<List<StrategyBlueprint>>> getBlueprints(
            @RequestParam(required = false) String industryType) {
        return ResponseEntity.ok(ApiResponse.success(workflowService.getBlueprints(industryType)));
    }

    @PostMapping("/blueprint")
    public ResponseEntity<ApiResponse<StrategyBlueprint>> saveBlueprint(@RequestBody StrategyBlueprint bp) {
        return ResponseEntity.ok(ApiResponse.success(workflowService.saveBlueprint(bp)));
    }
}
