package com.loyalty.platform.api.controller;

import com.loyalty.platform.common.dto.ApiResponse;
import com.loyalty.platform.domain.entity.PointTypeDefinition;
import com.loyalty.platform.domain.entity.RuleVariableDefinition;
import com.loyalty.platform.domain.repository.PointTypeDefinitionRepository;
import com.loyalty.platform.domain.repository.RuleVariableDefinitionRepository;
import com.loyalty.platform.rules.VariableCalculationService;
import com.loyalty.platform.rules.VariableExpressionParser;
import com.loyalty.platform.rules.VariableExpressionParser.ValidationResult;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.web.bind.annotation.*;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.*;
import java.util.stream.Collectors;

/**
 * 变量管理 API 控制器。
 *
 * <p>设计文档 point_design_update.md §7.2：
 * 提供变量的 CRUD、表达式验证及预览计算接口。
 *
 * @author Loyalty SaaS Architecture Team
 * @since 2.0.0
 */
@RestController
@RequestMapping("/api/variables")
public class VariableController {

    private static final Logger log = LoggerFactory.getLogger(VariableController.class);

    private final RuleVariableDefinitionRepository varRepo;
    private final PointTypeDefinitionRepository pointTypeRepo;
    private final VariableExpressionParser parser;
    private final VariableCalculationService calcService;

    public VariableController(RuleVariableDefinitionRepository varRepo,
                               PointTypeDefinitionRepository pointTypeRepo,
                               VariableExpressionParser parser,
                               VariableCalculationService calcService) {
        this.varRepo = varRepo;
        this.pointTypeRepo = pointTypeRepo;
        this.parser = parser;
        this.calcService = calcService;
    }

    /** 获取变量列表 */
    @GetMapping
    public ApiResponse<List<RuleVariableDefinition>> list(@RequestParam String programCode) {
        return ApiResponse.success(varRepo.findActiveByProgramCode(programCode));
    }

    /** 获取单个变量详情 */
    @GetMapping("/{varCode}")
    public ApiResponse<RuleVariableDefinition> getDetail(@RequestParam String programCode,
                                                           @PathVariable String varCode) {
        return varRepo.findByProgramCodeAndVarCode(programCode, varCode)
                .map(ApiResponse::success)
                .orElse(ApiResponse.error("NOT_FOUND", "变量不存在: " + varCode));
    }

    /** 获取可用积分类型列表（供表达式编辑器辅助提示） */
    @GetMapping("/available-types")
    public ApiResponse<List<Map<String, String>>> getAvailableTypes(@RequestParam String programCode) {
        List<PointTypeDefinition> types = pointTypeRepo.findActiveByProgramCode(programCode);
        List<Map<String, String>> result = types.stream()
                .map(t -> Map.of("typeCode", t.getTypeCode(), "typeName", t.getTypeName()))
                .collect(Collectors.toList());
        return ApiResponse.success(result);
    }

    /** 创建变量 */
    @PostMapping
    public ApiResponse<RuleVariableDefinition> create(@RequestBody RuleVariableDefinition var) {
        // 验证表达式
        Set<String> availableTypes = pointTypeRepo.findActiveByProgramCode(var.getProgramCode())
                .stream().map(PointTypeDefinition::getTypeCode).collect(Collectors.toSet());
        ValidationResult validation = parser.validate(var.getExpression(), availableTypes);
        if (!validation.valid()) {
            return ApiResponse.error("VALIDATION_ERROR", validation.message());
        }

        if (var.getId() == null || var.getId().isBlank()) {
            var.setId(UUID.randomUUID().toString());
        }
        var.setCreatedAt(LocalDateTime.now());
        var.setUpdatedAt(LocalDateTime.now());
        log.info("[Variable] 创建变量: program={}, varCode={}", var.getProgramCode(), var.getVarCode());
        return ApiResponse.success(varRepo.save(var));
    }

    /** 更新变量 */
    @PutMapping("/{varCode}")
    public ApiResponse<RuleVariableDefinition> update(@RequestParam String programCode,
                                                        @PathVariable String varCode,
                                                        @RequestBody RuleVariableDefinition updated) {
        RuleVariableDefinition existing = varRepo.findByProgramCodeAndVarCode(programCode, varCode)
                .orElseThrow(() -> new IllegalArgumentException("变量不存在: " + varCode));

        // 验证表达式
        Set<String> availableTypes = pointTypeRepo.findActiveByProgramCode(programCode)
                .stream().map(PointTypeDefinition::getTypeCode).collect(Collectors.toSet());
        ValidationResult validation = parser.validate(updated.getExpression(), availableTypes);
        if (!validation.valid()) {
            return ApiResponse.error("VALIDATION_ERROR", validation.message());
        }

        existing.setVarName(updated.getVarName());
        existing.setVarType(updated.getVarType());
        existing.setExpression(updated.getExpression());
        existing.setDescription(updated.getDescription());
        existing.setUpdatedAt(LocalDateTime.now());
        log.info("[Variable] 更新变量: program={}, varCode={}", programCode, varCode);
        return ApiResponse.success(varRepo.save(existing));
    }

    /** 删除变量（软删除） */
    @DeleteMapping("/{varCode}")
    public ApiResponse<Void> delete(@RequestParam String programCode,
                                     @PathVariable String varCode) {
        // 检查是否被规则引用
        if (varRepo.isReferencedByRule(programCode, varCode)) {
            return ApiResponse.error("REFERENCED", "变量被规则引用，无法删除: " + varCode);
        }
        RuleVariableDefinition existing = varRepo.findByProgramCodeAndVarCode(programCode, varCode)
                .orElseThrow(() -> new IllegalArgumentException("变量不存在: " + varCode));
        existing.setStatus("INACTIVE");
        varRepo.save(existing);
        log.info("[Variable] 删除变量（软删除）: program={}, varCode={}", programCode, varCode);
        return ApiResponse.success(null);
    }

    /** 验证表达式语法 */
    @PostMapping("/validate")
    public ApiResponse<Map<String, Object>> validate(@RequestBody Map<String, String> body) {
        String programCode = body.get("programCode");
        String expression = body.get("expression");

        Set<String> availableTypes = pointTypeRepo.findActiveByProgramCode(programCode)
                .stream().map(PointTypeDefinition::getTypeCode).collect(Collectors.toSet());

        ValidationResult result = parser.validate(expression, availableTypes);
        Set<String> extractedTypes = parser.extractAtomicTypes(expression);

        return ApiResponse.success(Map.of(
                "valid", result.valid(),
                "message", result.message(),
                "extractedTypes", extractedTypes
        ));
    }

    /** 预览计算（测试会员） */
    @PostMapping("/calculate")
    public ApiResponse<Map<String, Object>> calculate(@RequestBody Map<String, Object> body) {
        String programCode = (String) body.get("programCode");
        String varCode = (String) body.get("varCode");
        Long memberId = Long.valueOf(String.valueOf(body.get("memberId")));
        int windowDays = body.containsKey("windowDays") ? (Integer) body.get("windowDays") : 365;

        // 获取变量定义
        RuleVariableDefinition var = varRepo.findByProgramCodeAndVarCode(programCode, varCode)
                .orElseThrow(() -> new IllegalArgumentException("变量不存在: " + varCode));

        // 计算
        BigDecimal value = calcService.calculateSingleVariable(programCode, varCode, memberId, windowDays);

        // 提取明细
        Set<String> atomicTypes = parser.extractAtomicTypes(var.getExpression());
        Map<String, BigDecimal> allValues = calcService.calculateVariables(
                programCode, new ArrayList<>(atomicTypes), memberId, windowDays);

        return ApiResponse.success(Map.of(
                "varCode", varCode,
                "value", value,
                "expression", var.getExpression(),
                "details", allValues
        ));
    }
}