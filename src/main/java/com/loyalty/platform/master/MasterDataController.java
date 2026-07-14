package com.loyalty.platform.master;

import com.loyalty.platform.common.context.TenantContext;
import com.loyalty.platform.common.dto.ApiResponse;
import com.loyalty.platform.domain.entity.*;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.ResponseEntity;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDateTime;
import java.util.*;
import java.util.stream.Collectors;

/**
 * 主数据管理 API — 支持枚举值、层级数据、标签的完整 CRUD。
 */
@RestController
@RequestMapping("/api/master-data")
public class MasterDataController {

    private static final Logger log = LoggerFactory.getLogger(MasterDataController.class);

    private final MasterDataDefinitionRepository defRepo;
    private final MasterDataEnumRepository enumRepo;
    private final MasterDataHierarchyRepository hierarchyRepo;
    private final MasterDataTagRepository tagRepo;

    public MasterDataController(MasterDataDefinitionRepository defRepo,
                                 MasterDataEnumRepository enumRepo,
                                 MasterDataHierarchyRepository hierarchyRepo,
                                 MasterDataTagRepository tagRepo) {
        this.defRepo = defRepo;
        this.enumRepo = enumRepo;
        this.hierarchyRepo = hierarchyRepo;
        this.tagRepo = tagRepo;
    }

    // ==================== 主数据定义 CRUD ====================

    @GetMapping("/definitions")
    public ResponseEntity<ApiResponse<List<Map<String, Object>>>> getDefinitions() {
        String pc = TenantContext.getRequired();
        List<MasterDataDefinition> list = defRepo.findByProgramCodeOrderByDataCode(pc);
        List<Map<String, Object>> result = list.stream().map(d -> {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("id", d.getId());
            m.put("dataCode", d.getDataCode());
            m.put("dataName", d.getDataName());
            m.put("dataType", d.getDataType());
            m.put("description", d.getDescription());
            m.put("status", d.getStatus());
            // 如果是枚举，附带枚举数量
            if ("ENUM".equals(d.getDataType())) {
                m.put("itemCount", enumRepo.countByProgramCodeAndDataCode(pc, d.getDataCode()));
            } else if ("HIERARCHY".equals(d.getDataType())) {
                m.put("itemCount", hierarchyRepo.countByProgramCodeAndDataCode(pc, d.getDataCode()));
            }
            return m;
        }).toList();
        return ResponseEntity.ok(ApiResponse.success(result));
    }

    @PostMapping("/types")
    @Transactional
    public ResponseEntity<ApiResponse<Map<String, Object>>> createType(@RequestBody Map<String, Object> body) {
        String pc = TenantContext.getRequired();
        String dataCode = (String) body.get("dataCode");
        if (dataCode == null || dataCode.isBlank()) {
            return ResponseEntity.ok(ApiResponse.error("ERR_INVALID", "dataCode 不能为空"));
        }
        if (defRepo.existsByProgramCodeAndDataCode(pc, dataCode)) {
            return ResponseEntity.ok(ApiResponse.error("ERR_EXISTS", "主数据类型已存在: " + dataCode));
        }

        MasterDataDefinition def = MasterDataDefinition.builder()
                .id(UUID.randomUUID().toString())
                .programCode(pc)
                .dataCode(dataCode.toUpperCase())
                .dataName((String) body.getOrDefault("dataName", dataCode))
                .dataType((String) body.getOrDefault("dataType", "ENUM"))
                .description((String) body.get("description"))
                .status((String) body.getOrDefault("status", "ACTIVE"))
                .build();
        defRepo.save(def);
        log.info("[MasterData] 类型创建: code={}, type={}, program={}", dataCode, def.getDataType(), pc);
        return ResponseEntity.ok(ApiResponse.success(Map.of("id", def.getId(), "dataCode", def.getDataCode())));
    }

    @PutMapping("/types/{dataCode}")
    @Transactional
    public ResponseEntity<ApiResponse<Map<String, Object>>> updateType(
            @PathVariable String dataCode, @RequestBody Map<String, Object> body) {
        String pc = TenantContext.getRequired();
        MasterDataDefinition def = defRepo.findByProgramCodeAndDataCode(pc, dataCode)
                .orElse(null);
        if (def == null) {
            return ResponseEntity.ok(ApiResponse.error("ERR_NOT_FOUND", "主数据类型不存在: " + dataCode));
        }
        if (body.containsKey("dataName")) def.setDataName((String) body.get("dataName"));
        if (body.containsKey("description")) def.setDescription((String) body.get("description"));
        if (body.containsKey("status")) def.setStatus((String) body.get("status"));
        def.setUpdatedAt(LocalDateTime.now());
        defRepo.save(def);
        return ResponseEntity.ok(ApiResponse.success(Map.of("updated", true)));
    }

    @DeleteMapping("/types/{dataCode}")
    @Transactional
    public ResponseEntity<ApiResponse<Map<String, Object>>> deleteType(@PathVariable String dataCode) {
        String pc = TenantContext.getRequired();
        MasterDataDefinition def = defRepo.findByProgramCodeAndDataCode(pc, dataCode)
                .orElse(null);
        if (def == null) {
            return ResponseEntity.ok(ApiResponse.error("ERR_NOT_FOUND", "主数据类型不存在: " + dataCode));
        }
        // 级联删除关联数据
        if ("ENUM".equals(def.getDataType())) {
            List<MasterDataEnum> enums = enumRepo.findByProgramCodeAndDataCodeOrderBySortOrder(pc, dataCode);
            enumRepo.deleteAll(enums);
        } else if ("HIERARCHY".equals(def.getDataType())) {
            List<MasterDataHierarchy> nodes = hierarchyRepo.findByProgramCodeAndDataCodeAndStatusOrderBySortOrder(pc, dataCode, "ACTIVE");
            hierarchyRepo.deleteAll(nodes);
        }
        defRepo.delete(def);
        log.info("[MasterData] 类型删除: code={}, program={}", dataCode, pc);
        return ResponseEntity.ok(ApiResponse.success(Map.of("deleted", true)));
    }

    // ==================== 枚举值管理 ====================

    @GetMapping("/{dataCode}/options")
    public ResponseEntity<ApiResponse<List<Map<String, String>>>> getOptions(@PathVariable String dataCode) {
        String pc = TenantContext.getRequired();
        List<MasterDataEnum> items = enumRepo.findByProgramCodeAndDataCodeAndStatusOrderBySortOrder(pc, dataCode, "ACTIVE");
        List<Map<String, String>> options = items.stream().map(e ->
                Map.of("code", e.getEnumCode(), "label", e.getEnumLabel())
        ).toList();
        return ResponseEntity.ok(ApiResponse.success(options));
    }

    @GetMapping("/{dataCode}/items")
    public ResponseEntity<ApiResponse<List<Map<String, Object>>>> getEnumItems(@PathVariable String dataCode) {
        String pc = TenantContext.getRequired();
        List<MasterDataEnum> items = enumRepo.findByProgramCodeAndDataCodeOrderBySortOrder(pc, dataCode);
        List<Map<String, Object>> result = items.stream().map(e -> {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("id", e.getId());
            m.put("enumCode", e.getEnumCode());
            m.put("enumLabel", e.getEnumLabel());
            m.put("enumValue", e.getEnumValue());
            m.put("sortOrder", e.getSortOrder());
            m.put("status", e.getStatus());
            return m;
        }).toList();
        return ResponseEntity.ok(ApiResponse.success(result));
    }

    @PostMapping("/{dataCode}/items")
    @Transactional
    public ResponseEntity<ApiResponse<Map<String, Object>>> createEnumItem(
            @PathVariable String dataCode, @RequestBody Map<String, Object> body) {
        String pc = TenantContext.getRequired();
        MasterDataEnum item = MasterDataEnum.builder()
                .id(UUID.randomUUID().toString())
                .programCode(pc)
                .dataCode(dataCode)
                .enumCode((String) body.get("enumCode"))
                .enumLabel((String) body.get("enumLabel"))
                .enumValue((String) body.get("enumValue"))
                .sortOrder(body.containsKey("sortOrder") ? (Integer) body.get("sortOrder") : 0)
                .status((String) body.getOrDefault("status", "ACTIVE"))
                .build();
        enumRepo.save(item);
        return ResponseEntity.ok(ApiResponse.success(Map.of("id", item.getId())));
    }

    @PutMapping("/{dataCode}/items/{itemId}")
    @Transactional
    public ResponseEntity<ApiResponse<Map<String, Object>>> updateEnumItem(
            @PathVariable String dataCode, @PathVariable String itemId, @RequestBody Map<String, Object> body) {
        String pc = TenantContext.getRequired();
        MasterDataEnum item = enumRepo.findById(itemId).orElse(null);
        if (item == null) return ResponseEntity.ok(ApiResponse.error("ERR_NOT_FOUND", "枚举项不存在"));
        if (body.containsKey("enumCode")) item.setEnumCode((String) body.get("enumCode"));
        if (body.containsKey("enumLabel")) item.setEnumLabel((String) body.get("enumLabel"));
        if (body.containsKey("enumValue")) item.setEnumValue((String) body.get("enumValue"));
        if (body.containsKey("sortOrder")) item.setSortOrder((Integer) body.get("sortOrder"));
        if (body.containsKey("status")) item.setStatus((String) body.get("status"));
        item.setUpdatedAt(LocalDateTime.now());
        enumRepo.save(item);
        return ResponseEntity.ok(ApiResponse.success(Map.of("updated", true)));
    }

    @DeleteMapping("/{dataCode}/items/{itemId}")
    @Transactional
    public ResponseEntity<ApiResponse<Map<String, Object>>> deleteEnumItem(
            @PathVariable String dataCode, @PathVariable String itemId) {
        enumRepo.deleteById(itemId);
        return ResponseEntity.ok(ApiResponse.success(Map.of("deleted", true)));
    }

    // ==================== 层级数据管理 ====================

    @GetMapping("/hierarchy/options")
    public ResponseEntity<ApiResponse<List<Map<String, Object>>>> getHierarchyOptions(
            @RequestParam String dataCode,
            @RequestParam(defaultValue = "1") int level,
            @RequestParam(required = false) String parentCode) {
        String pc = TenantContext.getRequired();
        List<MasterDataHierarchy> nodes;
        if (parentCode == null || parentCode.isEmpty()) {
            nodes = hierarchyRepo.findByProgramCodeAndDataCodeAndNodeLevelOrderBySortOrder(pc, dataCode, level);
        } else {
            nodes = hierarchyRepo.findByProgramCodeAndDataCodeAndNodeLevelAndParentCodeOrderBySortOrder(pc, dataCode, level, parentCode);
        }
        List<Map<String, Object>> result = nodes.stream().map(n -> {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("code", n.getNodeCode());
            m.put("label", n.getNodeName());
            m.put("level", n.getNodeLevel());
            m.put("parentCode", n.getParentCode());
            return m;
        }).toList();
        return ResponseEntity.ok(ApiResponse.success(result));
    }

    @GetMapping("/hierarchy/nodes")
    public ResponseEntity<ApiResponse<List<Map<String, Object>>>> getHierarchyNodes(@RequestParam String dataCode) {
        String pc = TenantContext.getRequired();
        List<MasterDataHierarchy> nodes = hierarchyRepo.findByProgramCodeAndDataCodeAndStatusOrderBySortOrder(pc, dataCode, "ACTIVE");
        List<Map<String, Object>> result = nodes.stream().map(n -> {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("id", n.getId());
            m.put("nodeCode", n.getNodeCode());
            m.put("nodeName", n.getNodeName());
            m.put("parentCode", n.getParentCode());
            m.put("nodeLevel", n.getNodeLevel());
            m.put("sortOrder", n.getSortOrder());
            m.put("status", n.getStatus());
            return m;
        }).toList();
        return ResponseEntity.ok(ApiResponse.success(result));
    }

    @PostMapping("/hierarchy/nodes")
    @Transactional
    public ResponseEntity<ApiResponse<Map<String, Object>>> createHierarchyNode(@RequestBody Map<String, Object> body) {
        String pc = TenantContext.getRequired();
        MasterDataHierarchy node = MasterDataHierarchy.builder()
                .id(UUID.randomUUID().toString())
                .programCode(pc)
                .dataCode((String) body.get("dataCode"))
                .nodeCode((String) body.get("nodeCode"))
                .nodeName((String) body.get("nodeName"))
                .parentCode((String) body.get("parentCode"))
                .nodeLevel(body.containsKey("nodeLevel") ? (Integer) body.get("nodeLevel") : 1)
                .sortOrder(body.containsKey("sortOrder") ? (Integer) body.get("sortOrder") : 0)
                .status((String) body.getOrDefault("status", "ACTIVE"))
                .build();
        hierarchyRepo.save(node);
        return ResponseEntity.ok(ApiResponse.success(Map.of("id", node.getId())));
    }

    @PutMapping("/hierarchy/nodes/{nodeId}")
    @Transactional
    public ResponseEntity<ApiResponse<Map<String, Object>>> updateHierarchyNode(
            @PathVariable String nodeId, @RequestBody Map<String, Object> body) {
        MasterDataHierarchy node = hierarchyRepo.findById(nodeId).orElse(null);
        if (node == null) return ResponseEntity.ok(ApiResponse.error("ERR_NOT_FOUND", "节点不存在"));
        if (body.containsKey("nodeName")) node.setNodeName((String) body.get("nodeName"));
        if (body.containsKey("parentCode")) node.setParentCode((String) body.get("parentCode"));
        if (body.containsKey("nodeLevel")) node.setNodeLevel((Integer) body.get("nodeLevel"));
        if (body.containsKey("sortOrder")) node.setSortOrder((Integer) body.get("sortOrder"));
        if (body.containsKey("status")) node.setStatus((String) body.get("status"));
        node.setUpdatedAt(LocalDateTime.now());
        hierarchyRepo.save(node);
        return ResponseEntity.ok(ApiResponse.success(Map.of("updated", true)));
    }

    @DeleteMapping("/hierarchy/nodes/{nodeId}")
    @Transactional
    public ResponseEntity<ApiResponse<Map<String, Object>>> deleteHierarchyNode(@PathVariable String nodeId) {
        hierarchyRepo.deleteById(nodeId);
        return ResponseEntity.ok(ApiResponse.success(Map.of("deleted", true)));
    }

    // ==================== 标签管理 ====================

    @GetMapping("/tags")
    public ResponseEntity<ApiResponse<List<Map<String, Object>>>> getTags() {
        String pc = TenantContext.getRequired();
        List<MasterDataTag> tags = tagRepo.findByProgramCodeOrderByTagGroup(pc);
        List<Map<String, Object>> result = tags.stream().map(t -> {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("id", t.getId());
            m.put("tagCode", t.getTagCode());
            m.put("tagName", t.getTagName());
            m.put("tagGroup", t.getTagGroup());
            m.put("tagColor", t.getTagColor());
            m.put("status", t.getStatus());
            return m;
        }).toList();
        return ResponseEntity.ok(ApiResponse.success(result));
    }

    @PostMapping("/tags")
    @Transactional
    public ResponseEntity<ApiResponse<Map<String, Object>>> createTag(@RequestBody Map<String, Object> body) {
        String pc = TenantContext.getRequired();
        String tagCode = (String) body.get("tagCode");
        if (tagCode == null || tagCode.isBlank()) {
            return ResponseEntity.ok(ApiResponse.error("ERR_INVALID", "tagCode 不能为空"));
        }
        MasterDataTag tag = MasterDataTag.builder()
                .id(UUID.randomUUID().toString())
                .programCode(pc)
                .tagCode(tagCode)
                .tagName((String) body.getOrDefault("tagName", tagCode))
                .tagGroup((String) body.get("tagGroup"))
                .tagColor((String) body.get("tagColor"))
                .status((String) body.getOrDefault("status", "ACTIVE"))
                .build();
        tagRepo.save(tag);
        return ResponseEntity.ok(ApiResponse.success(Map.of("id", tag.getId())));
    }

    // ==================== 代码↔标签转换 ====================

    @GetMapping("/{dataCode}/label")
    public ResponseEntity<ApiResponse<Map<String, String>>> getLabel(
            @PathVariable String dataCode, @RequestParam String code) {
        String pc = TenantContext.getRequired();
        List<MasterDataEnum> items = enumRepo.findByProgramCodeAndDataCodeAndStatusOrderBySortOrder(pc, dataCode, "ACTIVE");
        String label = items.stream()
                .filter(e -> code.equals(e.getEnumCode()))
                .map(MasterDataEnum::getEnumLabel)
                .findFirst().orElse(code);
        return ResponseEntity.ok(ApiResponse.success(Map.of("code", code, "label", label)));
    }

    @PostMapping("/labels")
    public ResponseEntity<ApiResponse<Map<String, String>>> getLabels(@RequestBody Map<String, Object> body) {
        String pc = TenantContext.getRequired();
        @SuppressWarnings("unchecked")
        Map<String, String> codes = (Map<String, String>) body.getOrDefault("codes", Map.of());
        Map<String, String> result = new LinkedHashMap<>();
        for (Map.Entry<String, String> entry : codes.entrySet()) {
            String dataCode = entry.getKey();
            String code = entry.getValue();
            List<MasterDataEnum> items = enumRepo.findByProgramCodeAndDataCodeAndStatusOrderBySortOrder(pc, dataCode, "ACTIVE");
            String label = items.stream()
                    .filter(e -> code.equals(e.getEnumCode()))
                    .map(MasterDataEnum::getEnumLabel)
                    .findFirst().orElse(code);
            result.put(dataCode, label);
        }
        return ResponseEntity.ok(ApiResponse.success(result));
    }
}
