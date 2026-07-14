package com.loyalty.platform.admin;

import com.loyalty.platform.common.context.TenantContext;
import com.loyalty.platform.common.dto.ApiResponse;
import com.loyalty.platform.domain.entity.OneIdStrategy;
import com.loyalty.platform.domain.repository.OneIdStrategyRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDateTime;
import java.util.*;

/**
 * One-ID 策略管理 API。
 */
@RestController
@RequestMapping("/api/admin/one-id/strategy")
public class OneIdStrategyController {

    private static final Logger log = LoggerFactory.getLogger(OneIdStrategyController.class);
    private final OneIdStrategyRepository strategyRepo;

    public OneIdStrategyController(OneIdStrategyRepository strategyRepo) {
        this.strategyRepo = strategyRepo;
    }

    /** 获取策略列表 */
    @GetMapping
    public ResponseEntity<ApiResponse<List<Map<String, Object>>>> list() {
        String pc = TenantContext.getRequired();
        List<OneIdStrategy> strategies = strategyRepo.findByProgramCode(pc);
        List<Map<String, Object>> result = strategies.stream().map(s -> {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("id", s.getId());
            m.put("strategyCode", s.getStrategyCode());
            m.put("strategyName", s.getStrategyName());
            m.put("priorityFields", s.getPriorityFields().get("priority_fields"));
            m.put("isDefault", s.getIsDefault());
            m.put("status", s.getStatus());
            return m;
        }).toList();
        return ResponseEntity.ok(ApiResponse.success(result));
    }

    /** 更新策略 */
    @PutMapping
    public ResponseEntity<ApiResponse<Map<String, Object>>> update(@RequestBody Map<String, Object> body) {
        String pc = TenantContext.getRequired();
        String strategyCode = (String) body.getOrDefault("strategyCode", "PHONE_PRIMARY");

        OneIdStrategy strategy = strategyRepo.findByProgramCode(pc).stream()
                .filter(s -> strategyCode.equals(s.getStrategyCode()))
                .findFirst().orElse(null);

        if (strategy == null) {
            return ResponseEntity.ok(ApiResponse.error("ERR_NOT_FOUND", "策略不存在"));
        }

        if (body.containsKey("strategyName"))
            strategy.setStrategyName((String) body.get("strategyName"));
        if (body.containsKey("isDefault"))
            strategy.setIsDefault((Boolean) body.get("isDefault"));
        if (body.containsKey("status"))
            strategy.setStatus((String) body.get("status"));
        if (body.containsKey("priorityFields")) {
            @SuppressWarnings("unchecked")
            List<Object> fields = (List<Object>) body.get("priorityFields");
            strategy.setPriorityFields(Map.of("priority_fields", fields));
        }
        strategy.setUpdatedAt(LocalDateTime.now());
        strategyRepo.save(strategy);

        log.info("[OneIdStrategy] 策略已更新: program={}, code={}", pc, strategyCode);
        return ResponseEntity.ok(ApiResponse.success(Map.of("updated", true)));
    }

    /** 初始化默认策略 */
    @PostMapping("/init")
    public ResponseEntity<ApiResponse<Map<String, Object>>> init() {
        String pc = TenantContext.getRequired();
        if (!strategyRepo.findByProgramCode(pc).isEmpty()) {
            return ResponseEntity.ok(ApiResponse.error("ERR_EXISTS", "策略已存在"));
        }

        OneIdStrategy phone = OneIdStrategy.builder()
                .id(UUID.randomUUID().toString())
                .programCode(pc)
                .strategyCode("PHONE_PRIMARY")
                .strategyName("手机号优先")
                .priorityFields(Map.of("priority_fields", List.of(
                        Map.of("field", "phone", "weight", 10, "required", true),
                        Map.of("field", "email", "weight", 5, "required", false),
                        Map.of("field", "channel_user_id", "weight", 3, "required", false)
                )))
                .isDefault(true).status("ACTIVE").build();

        OneIdStrategy email = OneIdStrategy.builder()
                .id(UUID.randomUUID().toString())
                .programCode(pc)
                .strategyCode("EMAIL_PRIMARY")
                .strategyName("邮箱优先")
                .priorityFields(Map.of("priority_fields", List.of(
                        Map.of("field", "email", "weight", 10, "required", true),
                        Map.of("field", "phone", "weight", 5, "required", false),
                        Map.of("field", "channel_user_id", "weight", 3, "required", false)
                )))
                .isDefault(false).status("ACTIVE").build();

        strategyRepo.saveAll(List.of(phone, email));
        log.info("[OneIdStrategy] 默认策略已初始化: program={}", pc);
        return ResponseEntity.ok(ApiResponse.success(Map.of("message", "已初始化默认策略")));
    }
}