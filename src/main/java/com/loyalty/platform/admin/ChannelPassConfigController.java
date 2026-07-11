package com.loyalty.platform.admin;

import com.loyalty.platform.common.context.TenantContext;
import com.loyalty.platform.common.dto.ApiResponse;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.*;

/**
 * 渠道会员通配置管理 API。
 */
@RestController
@RequestMapping("/api/admin/channel-pass")
public class ChannelPassConfigController {

    private static final Logger log = LoggerFactory.getLogger(ChannelPassConfigController.class);
    // 内存存储（后续可改为数据库）
    private final Map<String, Map<String, Object>> store = new LinkedHashMap<>();

    /** 获取渠道配置列表 */
    @GetMapping("/config")
    public ResponseEntity<ApiResponse<List<Map<String, Object>>>> list() {
        String pc = TenantContext.getRequired();
        List<Map<String, Object>> configs = new ArrayList<>();
        String[] channels = {"TMALL", "JD", "WECHAT", "DOUYIN", "POS"};
        for (String ch : channels) {
            String key = pc + ":" + ch;
            Map<String, Object> cfg = store.getOrDefault(key, Map.of("channel", ch, "enabled", false));
            configs.add(new LinkedHashMap<>(cfg));
        }
        return ResponseEntity.ok(ApiResponse.success(configs));
    }

    /** 更新渠道配置 */
    @PutMapping("/config")
    public ResponseEntity<ApiResponse<Map<String, Object>>> update(@RequestBody Map<String, Object> body) {
        String pc = TenantContext.getRequired();
        String channel = (String) body.get("channel");
        String key = pc + ":" + channel;
        Map<String, Object> cfg = new LinkedHashMap<>(body);
        store.put(key, cfg);
        log.info("[ChannelPass] 配置已更新: channel={}", channel);
        return ResponseEntity.ok(ApiResponse.success(cfg));
    }

    /** 开通渠道 */
    @PostMapping("/{channel}/enable")
    public ResponseEntity<ApiResponse<Map<String, Object>>> enable(@PathVariable String channel) {
        String pc = TenantContext.getRequired();
        String key = pc + ":" + channel.toUpperCase();
        Map<String, Object> cfg = store.getOrDefault(key, new LinkedHashMap<>(Map.of("channel", channel.toUpperCase())));
        cfg.put("enabled", true);
        store.put(key, cfg);
        return ResponseEntity.ok(ApiResponse.success(Map.of("message", "已开通")));
    }

    /** 关闭渠道 */
    @PostMapping("/{channel}/disable")
    public ResponseEntity<ApiResponse<Map<String, Object>>> disable(@PathVariable String channel) {
        String pc = TenantContext.getRequired();
        String key = pc + ":" + channel.toUpperCase();
        Map<String, Object> cfg = store.getOrDefault(key, new LinkedHashMap<>(Map.of("channel", channel.toUpperCase())));
        cfg.put("enabled", false);
        store.put(key, cfg);
        return ResponseEntity.ok(ApiResponse.success(Map.of("message", "已关闭")));
    }
}