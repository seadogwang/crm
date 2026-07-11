package com.loyalty.platform.campaign.calendar;

import com.loyalty.platform.common.dto.ApiResponse;
import com.loyalty.platform.domain.entity.campaign.CalendarCache;
import com.loyalty.platform.domain.entity.campaign.ConflictRecord;
import com.loyalty.platform.domain.repository.campaign.CalendarCacheRepository;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDate;
import java.util.*;

@RestController
@RequestMapping("/api/campaign/calendar")
public class CalendarController {

    private final CalendarCacheRepository cacheRepository;
    private final ConflictDetectionService detectionService;

    public CalendarController(CalendarCacheRepository cacheRepository,
                               ConflictDetectionService detectionService) {
        this.cacheRepository = cacheRepository;
        this.detectionService = detectionService;
    }

    /** 获取日历月视图数据 */
    @GetMapping("/workspace/{workspaceId}")
    public ResponseEntity<ApiResponse<Map<String, Object>>> getCalendar(
            @PathVariable String workspaceId,
            @RequestParam(defaultValue = "2026") int year,
            @RequestParam(defaultValue = "6") int month) {

        LocalDate start = LocalDate.of(year, month, 1);
        LocalDate end = start.plusMonths(1).minusDays(1);
        List<CalendarCache> items = cacheRepository.findByWorkspaceIdAndDateRange(workspaceId, start, end);
        List<ConflictRecord> conflicts = detectionService.getActiveConflicts(workspaceId);

        // Group by date
        List<Map<String, Object>> days = new ArrayList<>();
        for (LocalDate d = start; !d.isAfter(end); d = d.plusDays(1)) {
            Map<String, Object> day = new LinkedHashMap<>();
            day.put("date", d.toString());
            List<Map<String, Object>> dayCampaigns = new ArrayList<>();
            for (CalendarCache cc : items) {
                if (!d.isBefore(cc.getStartDate()) && !d.isAfter(cc.getEndDate())) {
                    Map<String, Object> c = new LinkedHashMap<>();
                    c.put("planId", cc.getPlanId());
                    c.put("name", cc.getPlanName());
                    c.put("triggerType", cc.getTriggerType());
                    c.put("status", cc.getStatus());
                    c.put("estimatedVolume", cc.getEstimatedAudienceSize());
                    dayCampaigns.add(c);
                }
            }
            day.put("campaigns", dayCampaigns);
            // Match conflicts to this day
            List<Map<String, Object>> dayConflicts = new ArrayList<>();
            for (ConflictRecord cr : conflicts) {
                if (cr.getConflictStartDate() != null && cr.getConflictEndDate() != null
                        && !d.isBefore(cr.getConflictStartDate()) && !d.isAfter(cr.getConflictEndDate())) {
                    Map<String, Object> cf = new LinkedHashMap<>();
                    cf.put("conflictId", cr.getId());
                    cf.put("type", cr.getConflictType());
                    cf.put("severity", cr.getSeverity());
                    cf.put("message", cr.getConflictDetail());
                    dayConflicts.add(cf);
                }
            }
            day.put("conflicts", dayConflicts);
            days.add(day);
        }

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("year", year);
        result.put("month", month);
        result.put("days", days);
        result.put("totalConflicts", conflicts.size());
        return ResponseEntity.ok(ApiResponse.success(result));
    }

    /** 获取冲突列表 */
    @GetMapping("/conflicts")
    public ResponseEntity<ApiResponse<List<ConflictRecord>>> getConflicts(
            @RequestParam String workspaceId,
            @RequestParam(defaultValue = "ACTIVE") String status) {
        return ResponseEntity.ok(ApiResponse.success(
                status.equals("ACTIVE") ? detectionService.getActiveConflicts(workspaceId)
                        : List.of()));
    }

    /** 手动触发检测 */
    @PostMapping("/detect/{workspaceId}")
    public ResponseEntity<ApiResponse<List<ConflictRecord>>> detectNow(
            @PathVariable String workspaceId) {
        return ResponseEntity.ok(ApiResponse.success(detectionService.detectForWorkspace(workspaceId)));
    }

    /** 解决/忽略冲突 */
    @PostMapping("/conflicts/{conflictId}/resolve")
    public ResponseEntity<ApiResponse<ConflictRecord>> resolve(
            @PathVariable String conflictId,
            @RequestBody Map<String, String> body) {
        String action = body.getOrDefault("action", "RESOLVED");
        String note = body.getOrDefault("note", "");
        return ResponseEntity.ok(ApiResponse.success(
                detectionService.resolveConflict(conflictId, action, note)));
    }
}
