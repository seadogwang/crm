package com.loyalty.platform.campaign.execution.dlq;

import com.loyalty.platform.common.dto.ApiResponse;
import com.loyalty.platform.domain.entity.campaign.CampaignZeebeTask;
import com.loyalty.platform.domain.entity.campaign.DlqReplayLog;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.*;

@RestController
@RequestMapping("/api/campaign/dlq")
public class DlqController {

    private final DLQReplayService replayService;
    private final DLQCaptor captor;

    public DlqController(DLQReplayService replayService, DLQCaptor captor) {
        this.replayService = replayService;
        this.captor = captor;
    }

    /** 获取死信列表 */
    @GetMapping("/list")
    public ResponseEntity<ApiResponse<Map<String, Object>>> list(
            @RequestParam(required = false) String planId) {
        List<CampaignZeebeTask> tasks = planId != null
                ? replayService.getDlqByPlan(planId)
                : replayService.getDlqList();
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("total", tasks.size());
        result.put("items", tasks);
        return ResponseEntity.ok(ApiResponse.success(result));
    }

    /** 获取死信数量 */
    @GetMapping("/count")
    public ResponseEntity<ApiResponse<Map<String, Object>>> count() {
        return ResponseEntity.ok(ApiResponse.success(Map.of(
                "dlqCount", replayService.getDlqCount())));
    }

    /** 单条重放 */
    @PostMapping("/{taskId}/replay")
    public ResponseEntity<ApiResponse<DLQReplayService.ReplayResult>> replaySingle(
            @PathVariable String taskId,
            @RequestBody Map<String, String> body) {
        String operatorId = body.getOrDefault("operatorId", "admin");
        String reason = body.getOrDefault("reason", "Manual replay");
        return ResponseEntity.ok(ApiResponse.success(
                replayService.replaySingle(taskId, operatorId, reason)));
    }

    /** 批量重放 */
    @PostMapping("/replay/batch")
    public ResponseEntity<ApiResponse<DLQReplayService.BatchResult>> replayBatch(
            @RequestBody Map<String, String> body) {
        String planId = body.get("planId");
        String nodeType = body.get("nodeType");
        String operatorId = body.getOrDefault("operatorId", "admin");
        String reason = body.getOrDefault("reason", "Batch replay");
        return ResponseEntity.ok(ApiResponse.success(
                replayService.replayBatch(planId, nodeType, operatorId, reason)));
    }

    /** 获取重放日志 */
    @GetMapping("/{taskId}/replay-logs")
    public ResponseEntity<ApiResponse<List<DlqReplayLog>>> replayLogs(
            @PathVariable String taskId) {
        return ResponseEntity.ok(ApiResponse.success(replayService.getReplayLogs(taskId)));
    }

    /** 归档死信 */
    @PostMapping("/archive")
    public ResponseEntity<ApiResponse<Map<String, Object>>> archive(
            @RequestParam(defaultValue = "7") int daysOld) {
        int count = replayService.archiveOld(daysOld);
        return ResponseEntity.ok(ApiResponse.success(Map.of("archived", count)));
    }
}
