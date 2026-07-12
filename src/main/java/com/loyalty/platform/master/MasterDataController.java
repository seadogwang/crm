package com.loyalty.platform.master;

import com.loyalty.platform.common.context.TenantContext;
import com.loyalty.platform.common.dto.ApiResponse;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.*;

/**
 * 主数据 API — 提供枚举选项查询和代码↔标签转换。
 */
@RestController
@RequestMapping("/api/master-data")
public class MasterDataController {

    private static final Logger log = LoggerFactory.getLogger(MasterDataController.class);

    // 内存中的主数据（后续可改为数据库查询）
    private static final Map<String, List<Map<String, String>>> ENUM_DATA = new LinkedHashMap<>();
    static {
        ENUM_DATA.put("GENDER", List.of(
            Map.of("code", "MALE", "label", "男"),
            Map.of("code", "FEMALE", "label", "女"),
            Map.of("code", "UNKNOWN", "label", "未知")
        ));
        ENUM_DATA.put("CHANNEL", List.of(
            Map.of("code", "TMALL", "label", "天猫"),
            Map.of("code", "JD", "label", "京东"),
            Map.of("code", "DOUYIN", "label", "抖音"),
            Map.of("code", "WECHAT_MINI", "label", "微信小程序")
        ));
        ENUM_DATA.put("ORDER_STATUS", List.of(
            Map.of("code", "WAIT_BUYER_PAY", "label", "待付款"),
            Map.of("code", "WAIT_SELLER_SEND_GOODS", "label", "待发货"),
            Map.of("code", "WAIT_BUYER_CONFIRM_GOODS", "label", "待收货"),
            Map.of("code", "TRADE_FINISHED", "label", "已完成"),
            Map.of("code", "TRADE_CLOSED", "label", "已关闭")
        ));
        ENUM_DATA.put("MEMBER_STATUS", List.of(
            Map.of("code", "ENROLLED", "label", "已入会"),
            Map.of("code", "SUSPENDED", "label", "已冻结"),
            Map.of("code", "DEACTIVATED", "label", "已停用"),
            Map.of("code", "MERGED", "label", "已合并")
        ));
    }

    /** 获取主数据定义列表 */
    @GetMapping("/definitions")
    public ResponseEntity<ApiResponse<List<Map<String, String>>>> getDefinitions() {
        String pc = TenantContext.getRequired();
        List<Map<String, String>> definitions = new ArrayList<>();
        for (String code : ENUM_DATA.keySet()) {
            Map<String, String> def = new LinkedHashMap<>();
            def.put("dataCode", code);
            def.put("dataName", code);
            def.put("dataType", "ENUM");
            definitions.add(def);
        }
        return ResponseEntity.ok(ApiResponse.success(definitions));
    }

    /** 获取层级主数据选项（支持 level + parentCode 过滤） */
    @GetMapping("/hierarchy/options")
    public ResponseEntity<ApiResponse<Map<String, Object>>> getHierarchyOptions(
            @RequestParam String dataCode,
            @RequestParam(defaultValue = "1") int level,
            @RequestParam(required = false) String parentCode) {
        String pc = TenantContext.getRequired();
        List<Map<String, String>> options = getHierarchyNodes(dataCode, level, parentCode);
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("dataCode", dataCode);
        result.put("level", level);
        result.put("parentCode", parentCode);
        result.put("options", options);
        return ResponseEntity.ok(ApiResponse.success(result));
    }

    /** 层级数据节点查询 */
    private List<Map<String, String>> getHierarchyNodes(String dataCode, int level, String parentCode) {
        // 模拟数据（后续改为数据库查询）
        if ("REGION".equals(dataCode)) {
            return switch (level) {
                case 1 -> List.of(
                    Map.of("code", "110000", "label", "北京市"),
                    Map.of("code", "310000", "label", "上海市"),
                    Map.of("code", "440000", "label", "广东省")
                );
                case 2 -> "440000".equals(parentCode) ? List.of(
                    Map.of("code", "440100", "label", "广州市"),
                    Map.of("code", "440300", "label", "深圳市"),
                    Map.of("code", "440600", "label", "佛山市")
                ) : "110000".equals(parentCode) ? List.of(
                    Map.of("code", "110100", "label", "朝阳区"),
                    Map.of("code", "110200", "label", "海淀区")
                ) : List.of();
                case 3 -> "440100".equals(parentCode) ? List.of(
                    Map.of("code", "440101", "label", "天河区"),
                    Map.of("code", "440102", "label", "越秀区"),
                    Map.of("code", "440103", "label", "白云区")
                ) : "440300".equals(parentCode) ? List.of(
                    Map.of("code", "440301", "label", "南山区"),
                    Map.of("code", "440302", "label", "福田区")
                ) : List.of();
                default -> List.of();
            };
        }
        return List.of();
    }
    @GetMapping("/{dataCode}/options")
    public ResponseEntity<ApiResponse<List<Map<String, String>>>> getOptions(
            @PathVariable String dataCode) {
        String pc = TenantContext.getRequired();
        List<Map<String, String>> options = ENUM_DATA.getOrDefault(dataCode, List.of());
        return ResponseEntity.ok(ApiResponse.success(options));
    }

    /** 代码 → 标签转换 */
    @GetMapping("/{dataCode}/label")
    public ResponseEntity<ApiResponse<Map<String, String>>> getLabel(
            @PathVariable String dataCode, @RequestParam String code) {
        String pc = TenantContext.getRequired();
        List<Map<String, String>> options = ENUM_DATA.getOrDefault(dataCode, List.of());
        String label = options.stream()
            .filter(o -> code.equals(o.get("code")))
            .map(o -> o.get("label"))
            .findFirst().orElse(code);
        return ResponseEntity.ok(ApiResponse.success(Map.of("code", code, "label", label)));
    }

    /** 批量代码 → 标签转换 */
    @PostMapping("/labels")
    public ResponseEntity<ApiResponse<Map<String, String>>> getLabels(
            @RequestBody Map<String, Object> body) {
        String pc = TenantContext.getRequired();
        @SuppressWarnings("unchecked")
        Map<String, String> codes = (Map<String, String>) body.getOrDefault("codes", Map.of());
        Map<String, String> result = new LinkedHashMap<>();
        for (Map.Entry<String, String> entry : codes.entrySet()) {
            String dataCode = entry.getKey();
            String code = entry.getValue();
            List<Map<String, String>> options = ENUM_DATA.getOrDefault(dataCode, List.of());
            String label = options.stream()
                .filter(o -> code.equals(o.get("code")))
                .map(o -> o.get("label"))
                .findFirst().orElse(code);
            result.put(dataCode, label);
        }
        return ResponseEntity.ok(ApiResponse.success(result));
    }
}