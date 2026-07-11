package com.loyalty.platform.api.service;

import com.loyalty.platform.api.dto.SaveLayoutRequest;
import com.loyalty.platform.common.context.TenantContext;
import com.loyalty.platform.common.exception.BusinessException;
import com.loyalty.platform.domain.entity.PageLayout;
import com.loyalty.platform.domain.entity.ProgramSchema;
import com.loyalty.platform.domain.repository.PageLayoutRepository;
import com.loyalty.platform.domain.repository.ProgramSchemaRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.*;

/**
 * 页面布局服务 — 负责布局的 CRUD、发布、版本管理、默认布局生成。
 *
 * @see Loyalty_member_page_config.md §6.1
 */
@Service
@Slf4j
@RequiredArgsConstructor
public class PageLayoutService {

    private final PageLayoutRepository layoutRepo;
    private final ProgramSchemaRepository schemaRepo;

    /**
     * 获取页面布局（优先返回 PUBLISHED 版本，若无则返回最新 DRAFT）
     */
    public PageLayout getLayout(String programCode, String entityType, String pageType) {
        // 1. 先查 PUBLISHED
        Optional<PageLayout> published = layoutRepo.findByProgramCodeAndEntityTypeAndPageTypeAndStatus(
                programCode, entityType, pageType, "PUBLISHED");
        if (published.isPresent()) {
            return published.get();
        }
        // 2. 若无 PUBLISHED，返回最新 DRAFT
        return layoutRepo.findFirstByProgramCodeAndEntityTypeAndPageTypeOrderByVersionDesc(
                programCode, entityType, pageType)
                .orElseGet(() -> generateDefaultLayout(programCode, entityType, pageType));
    }

    /**
     * 保存布局（草稿），版本号自动递增
     */
    @Transactional
    public PageLayout saveLayout(SaveLayoutRequest request) {
        String programCode = resolveProgramCode(request.getProgramCode());
        String entityType = request.getEntityType().toUpperCase();
        String pageType = request.getPageType().toUpperCase();

        // 获取当前最大版本
        int maxVersion = layoutRepo.findMaxVersion(programCode, entityType, pageType);

        PageLayout layout = PageLayout.builder()
                .id(UUID.randomUUID().toString())
                .programCode(programCode)
                .entityType(entityType)
                .pageType(pageType)
                .layoutConfig(request.getLayoutConfig())
                .fieldConfig(request.getFieldConfig())
                .version(maxVersion + 1)
                .status("DRAFT")
                .schemaVersion(getCurrentSchemaVersion(programCode, entityType))
                .createdBy(getCurrentUserId())
                .build();

        // 校验布局
        validateLayout(layout);
        return layoutRepo.save(layout);
    }

    /**
     * 发布布局：将指定版本设为 PUBLISHED，同类型其他已发布版本归档
     */
    @Transactional
    public PageLayout publishLayout(String layoutId) {
        PageLayout layout = layoutRepo.findById(layoutId)
                .orElseThrow(() -> new BusinessException("ERR_LAYOUT_NOT_FOUND", "布局不存在"));

        // 将同类型的其他 PUBLISHED 版本置为 ARCHIVED
        layoutRepo.updateStatusByProgramCodeAndEntityTypeAndPageType(
                layout.getProgramCode(),
                layout.getEntityType(),
                layout.getPageType(),
                "PUBLISHED",
                "ARCHIVED"
        );

        layout.setStatus("PUBLISHED");
        layout.setUpdatedAt(LocalDateTime.now());
        layout.setUpdatedBy(getCurrentUserId());
        return layoutRepo.save(layout);
    }

    /**
     * 回滚到指定版本：复制目标版本内容创建新版本
     */
    @Transactional
    public PageLayout rollbackLayout(String programCode, String entityType, String pageType, int targetVersion) {
        PageLayout target = layoutRepo.findByProgramCodeAndEntityTypeAndPageTypeAndVersion(
                        programCode, entityType, pageType, targetVersion)
                .orElseThrow(() -> new BusinessException("ERR_LAYOUT_VERSION_NOT_FOUND",
                        "目标版本不存在: v" + targetVersion));

        int maxVersion = layoutRepo.findMaxVersion(programCode, entityType, pageType);

        PageLayout newLayout = PageLayout.builder()
                .id(UUID.randomUUID().toString())
                .programCode(target.getProgramCode())
                .entityType(target.getEntityType())
                .pageType(target.getPageType())
                .layoutConfig(new LinkedHashMap<>(target.getLayoutConfig()))
                .fieldConfig(target.getFieldConfig() != null ? new LinkedHashMap<>(target.getFieldConfig()) : null)
                .version(maxVersion + 1)
                .status("DRAFT")
                .schemaVersion(target.getSchemaVersion())
                .createdBy(getCurrentUserId())
                .build();

        return layoutRepo.save(newLayout);
    }

    /**
     * 获取版本历史
     */
    public List<PageLayout> getVersionHistory(String programCode, String entityType, String pageType) {
        return layoutRepo.findByProgramCodeAndEntityTypeAndPageTypeOrderByVersionDesc(
                programCode, entityType, pageType);
    }

    /**
     * 生成默认布局（当第一次进入设计器时）
     * 从 program_schema 获取所有字段，放入单个"基本信息"分组
     */
    public PageLayout generateDefaultLayout(String programCode, String entityType, String pageType) {
        Optional<ProgramSchema> schemaOpt = schemaRepo.findByProgramCodeAndEntityType(
                programCode, entityType);

        Map<String, Object> layoutConfig = new LinkedHashMap<>();
        layoutConfig.put("version", "1.0");

        List<Map<String, Object>> sections = new ArrayList<>();

        // 基本信息分组
        Map<String, Object> basicSection = new LinkedHashMap<>();
        basicSection.put("id", "section_basic");
        basicSection.put("title", "基本信息");
        basicSection.put("icon", "AppstoreOutlined");
        basicSection.put("collapsible", true);
        basicSection.put("collapsed", false);
        basicSection.put("columns", 2);

        List<Map<String, Object>> fields = new ArrayList<>();

        if (schemaOpt.isPresent()) {
            ProgramSchema schema = schemaOpt.get();
            Map<String, Object> fieldSchema = schema.getFieldSchema();
            if (fieldSchema != null) {
                @SuppressWarnings("unchecked")
                Map<String, Object> properties = (Map<String, Object>) fieldSchema.get("properties");
                if (properties != null) {
                    for (String key : properties.keySet()) {
                        if (key.startsWith("_")) continue; // 跳过系统字段
                        Map<String, Object> field = buildDefaultFieldConfig(key);
                        fields.add(field);
                    }
                }
            }
        }

        // 如果没有属性定义，至少添加一些基础字段
        if (fields.isEmpty()) {
            fields.add(buildDefaultFieldConfig("memberId"));
            fields.add(buildDefaultFieldConfig("name"));
            fields.add(buildDefaultFieldConfig("gender"));
            fields.add(buildDefaultFieldConfig("birthday"));
            fields.add(buildDefaultFieldConfig("email"));
            fields.add(buildDefaultFieldConfig("mobile"));
        }

        basicSection.put("fields", fields);
        sections.add(basicSection);
        layoutConfig.put("sections", sections);

        String schemaVersion = schemaOpt.map(ProgramSchema::getVersionTag).orElse("v0");

        PageLayout layout = PageLayout.builder()
                .id(UUID.randomUUID().toString())
                .programCode(programCode)
                .entityType(entityType)
                .pageType(pageType)
                .layoutConfig(layoutConfig)
                .version(1)
                .status("DRAFT")
                .schemaVersion(schemaVersion)
                .build();

        log.info("[PageLayout] 生成默认布局: program={}, entity={}, page={}, fields={}",
                programCode, entityType, pageType, fields.size());
        return layout;
    }

    /**
     * 查询草稿状态的布局（供 Schema 变更监听使用）
     */
    public List<PageLayout> findDraftsByProgramCodeAndEntityType(String programCode, String entityType) {
        return layoutRepo.findByProgramCodeAndEntityTypeAndStatus(programCode, entityType, "DRAFT");
    }

    // ==================== 私有方法 ====================

    private String resolveProgramCode(String programCode) {
        return (programCode != null && !programCode.isBlank())
                ? programCode : TenantContext.getRequired();
    }

    private String getCurrentUserId() {
        // TODO: 替换为真实的 SecurityContext.getCurrentUserId()
        return "system";
    }

    private String getCurrentSchemaVersion(String programCode, String entityType) {
        return schemaRepo.findByProgramCodeAndEntityType(programCode, entityType)
                .map(ProgramSchema::getVersionTag)
                .orElse("v0");
    }

    @SuppressWarnings("unchecked")
    private Map<String, Object> buildDefaultFieldConfig(String fieldKey) {
        Map<String, Object> field = new LinkedHashMap<>();
        field.put("id", "field_" + fieldKey);
        field.put("field_key", fieldKey);
        field.put("label", fieldKey);
        // 智能推断默认组件类型
        String component = inferComponent(fieldKey);
        field.put("component", component);
        field.put("span", 1);
        field.put("required", false);
        field.put("readonly", "memberId".equals(fieldKey));
        return field;
    }

    private String inferComponent(String fieldKey) {
        String lower = fieldKey.toLowerCase();
        if (lower.contains("date") || lower.contains("birthday") || lower.contains("time")) return "DatePicker";
        if (lower.contains("gender") || lower.contains("sex")) return "Select";
        if (lower.contains("amount") || lower.contains("price") || lower.contains("age")
                || lower.contains("size") || lower.contains("number")) return "InputNumber";
        if (lower.contains("status") || lower.contains("flag") || lower.contains("switch")) return "Switch";
        if (lower.contains("id") || lower.contains("code")) return "Text";
        return "Input";
    }

    /**
     * 校验布局配置
     */
    @SuppressWarnings("unchecked")
    private void validateLayout(PageLayout layout) {
        Map<String, Object> config = layout.getLayoutConfig();
        if (config == null || config.isEmpty()) {
            throw new BusinessException("ERR_LAYOUT_INVALID",
                    "layout_config 不能为空，请提供至少包含一个分组的布局配置");
        }

        List<Map<String, Object>> sections = (List<Map<String, Object>>) config.get("sections");
        if (sections == null || sections.isEmpty()) {
            throw new BusinessException("ERR_LAYOUT_INVALID", "布局必须至少包含一个分组");
        }

        // 校验是否有重复字段
        Set<String> fieldKeys = new HashSet<>();
        for (Map<String, Object> section : sections) {
            List<Map<String, Object>> fields = (List<Map<String, Object>>) section.get("fields");
            if (fields == null) continue;
            for (Map<String, Object> field : fields) {
                String fieldKey = (String) field.get("field_key");
                if (fieldKey == null) continue;
                if (fieldKeys.contains(fieldKey)) {
                    throw new BusinessException("ERR_LAYOUT_DUPLICATE_FIELD", "字段重复: " + fieldKey);
                }
                fieldKeys.add(fieldKey);
            }
        }

        // 编辑页：校验 Schema 中的必填字段是否都被包含
        if ("EDIT".equals(layout.getPageType())) {
            Optional<ProgramSchema> schemaOpt = schemaRepo.findByProgramCodeAndEntityType(
                    layout.getProgramCode(), layout.getEntityType());
            if (schemaOpt.isPresent()) {
                Map<String, Object> fieldSchema = schemaOpt.get().getFieldSchema();
                if (fieldSchema != null) {
                    List<String> required = (List<String>) fieldSchema.get("required");
                    if (required != null) {
                        for (String reqField : required) {
                            if (!fieldKeys.contains(reqField)) {
                                throw new BusinessException("ERR_LAYOUT_MISSING_REQUIRED",
                                        "必填字段 " + reqField + " 未在布局中配置");
                            }
                        }
                    }
                }
            }
        }
    }
}