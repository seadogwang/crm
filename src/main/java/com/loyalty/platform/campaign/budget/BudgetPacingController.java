package com.loyalty.platform.campaign.budget;

import com.loyalty.platform.common.dto.ApiResponse;
import com.loyalty.platform.domain.entity.campaign.BudgetAlert;
import com.loyalty.platform.domain.entity.campaign.BudgetConsumption;
import com.loyalty.platform.domain.entity.campaign.BudgetPacing;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.*;

@RestController
@RequestMapping("/api/campaign/budget")
public class BudgetPacingController {

    private final BudgetPacingService pacingService;

    public BudgetPacingController(BudgetPacingService pacingService) {
        this.pacingService = pacingService;
    }

    /** 获取预算节奏状态 */
    @GetMapping("/pacing/{planId}")
    public ResponseEntity<ApiResponse<Map<String, Object>>> getStatus(@PathVariable String planId) {
        BudgetPacing p = pacingService.getPacing(planId);
        if (p == null) return ResponseEntity.ok(ApiResponse.success(null));

        Map<String, Object> data = new LinkedHashMap<>();
        data.put("planId", p.getPlanId());
        data.put("totalBudget", p.getTotalBudget());
        data.put("totalConsumed", p.getTotalConsumed());
        data.put("totalRemaining", p.getTotalBudget().subtract(p.getTotalConsumed()));
        data.put("consumptionRatio", p.getTotalBudget().compareTo(BigDecimal.ZERO) > 0
                ? p.getTotalConsumed().divide(p.getTotalBudget(), 4, RoundingMode.HALF_UP) : 0);
        data.put("pacingMode", p.getPacingMode());
        data.put("dailyCapEnabled", p.isDailyCapEnabled());
        data.put("dailyCapAmount", p.getDailyCapAmount());
        data.put("todayConsumed", p.getTodayConsumed());
        data.put("todayRemaining", p.getDailyCapAmount() != null
                ? p.getDailyCapAmount().subtract(p.getTodayConsumed()) : null);
        data.put("isPausedByBudget", p.isPausedByBudget());

        List<BudgetAlert> alerts = pacingService.getAlerts(planId, "ACTIVE");
        data.put("alerts", alerts);
        return ResponseEntity.ok(ApiResponse.success(data));
    }

    /** 创建/更新预算节奏配置 */
    @PutMapping("/pacing/{planId}")
    public ResponseEntity<ApiResponse<BudgetPacing>> saveConfig(
            @PathVariable String planId, @RequestBody BudgetPacing config) {
        BudgetPacing existing = pacingService.getPacing(planId);
        if (existing != null) {
            return ResponseEntity.ok(ApiResponse.success(pacingService.updatePacing(planId, config)));
        }
        config.setPlanId(planId);
        return ResponseEntity.ok(ApiResponse.success(pacingService.savePacing(config)));
    }

    /** 获取消耗明细 */
    @GetMapping("/pacing/{planId}/consumptions")
    public ResponseEntity<ApiResponse<List<BudgetConsumption>>> getConsumptions(
            @PathVariable String planId) {
        return ResponseEntity.ok(ApiResponse.success(pacingService.getConsumptions(planId)));
    }

    /** 获取告警 */
    @GetMapping("/pacing/{planId}/alerts")
    public ResponseEntity<ApiResponse<List<BudgetAlert>>> getAlerts(
            @PathVariable String planId,
            @RequestParam(required = false) String status) {
        return ResponseEntity.ok(ApiResponse.success(pacingService.getAlerts(planId, status)));
    }
}
