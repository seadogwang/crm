package com.loyalty.saas.common.cache;

import com.loyalty.saas.domain.entity.*;
import jakarta.annotation.PostConstruct;
import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import lombok.Getter;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.util.*;
import java.util.concurrent.ConcurrentHashMap;
import java.util.stream.Collectors;

/**
 * 系统缓存服务 — 启动时加载俱乐部定义和枚举值到内存。
 * Key: programCode, enumType
 */
@Service
public class SystemCacheService {
    private static final Logger log = LoggerFactory.getLogger(SystemCacheService.class);

    @PersistenceContext private EntityManager em;

    /** 程序级定义: programCode → { pointTypes, tiers } */
    @Getter
    private final Map<String, Map<String, Object>> programDefs = new ConcurrentHashMap<>();

    /** 全局枚举: enumType → [{code, name}] */
    @Getter
    private final Map<String, List<Map<String, String>>> enums = new ConcurrentHashMap<>();

    @PostConstruct
    public void init() {
        log.info("[SystemCache] 初始化缓存...");
        loadProgramDefs();
        loadEnums();
        log.info("[SystemCache] 缓存初始化完成: {} programs, {} enum types",
            programDefs.size(), enums.size());
    }

    private void loadProgramDefs() {
        try {
            // 积分类型
            List<PointTypeDefinition> pts = em.createQuery(
                "FROM PointTypeDefinition p WHERE p.status='ACTIVE'", PointTypeDefinition.class).getResultList();
            Map<String, List<Map<String, Object>>> pointTypesByProgram = pts.stream().collect(Collectors.groupingBy(
                PointTypeDefinition::getProgramCode,
                Collectors.mapping(p -> {
                    Map<String, Object> m = new LinkedHashMap<>();
                    m.put("typeCode", p.getTypeCode());
                    m.put("typeName", p.getTypeName());
                    m.put("isRedeemable", p.getIsRedeemable());
                    m.put("isTierCalc", p.getIsTierCalc());
                    m.put("isTransferable", p.getIsTransferable());
                    m.put("allowNegative", p.getAllowNegative());
                    m.put("expiryMode", p.getExpiryMode());
                    m.put("expiryValue", p.getExpiryValue());
                    m.put("creditLimit", p.getCreditLimit());
                    return m;
                }, Collectors.toList())));

            // 等级定义
            List<TierDefinition> tiers = em.createQuery(
                "FROM TierDefinition t ORDER BY t.sequence", TierDefinition.class).getResultList();
            Map<String, List<Map<String, Object>>> tiersByProgram = tiers.stream().collect(Collectors.groupingBy(
                TierDefinition::getProgramCode,
                Collectors.mapping(t -> {
                    Map<String, Object> m = new LinkedHashMap<>();
                    m.put("tierCode", t.getTierCode());
                    m.put("tierName", t.getTierName());
                    m.put("sequence", t.getSequence());
                    m.put("upgradeCriteria", t.getUpgradeCriteria());
                    return m;
                }, Collectors.toList())));

            // 合并
            Set<String> allPrograms = new HashSet<>();
            allPrograms.addAll(pointTypesByProgram.keySet());
            allPrograms.addAll(tiersByProgram.keySet());

            for (String pc : allPrograms) {
                Map<String, Object> def = new LinkedHashMap<>();
                def.put("pointTypes", pointTypesByProgram.getOrDefault(pc, Collections.emptyList()));
                def.put("tiers", tiersByProgram.getOrDefault(pc, Collections.emptyList()));
                programDefs.put(pc, def);
            }
        } catch (Exception e) {
            log.error("[SystemCache] 加载程序定义失败", e);
        }
    }

    private void loadEnums() {
        try {
            List<SystemEnum> all = em.createQuery(
                "FROM SystemEnum e WHERE e.isActive=true ORDER BY e.enumType, e.sortOrder",
                SystemEnum.class).getResultList();

            Map<String, List<Map<String, String>>> grouped = all.stream().collect(Collectors.groupingBy(
                SystemEnum::getEnumType,
                LinkedHashMap::new,
                Collectors.mapping(e -> {
                    Map<String, String> m = new LinkedHashMap<>();
                    m.put("code", e.getEnumCode());
                    m.put("name", e.getEnumName());
                    return m;
                }, Collectors.toList())));

            enums.putAll(grouped);
        } catch (Exception e) {
            log.error("[SystemCache] 加载枚举失败", e);
        }
    }

    /** 按类型获取枚举列表 */
    public List<Map<String, String>> getEnumByType(String enumType) {
        return enums.getOrDefault(enumType, Collections.emptyList());
    }

    /** 获取枚举名称 */
    public String getEnumName(String enumType, String code) {
        return enums.getOrDefault(enumType, Collections.emptyList()).stream()
            .filter(e -> code.equals(e.get("code")))
            .map(e -> e.get("name"))
            .findFirst().orElse(code);
    }

    /** 获取程序定义 */
    public Map<String, Object> getProgramDef(String programCode) {
        return programDefs.getOrDefault(programCode, Collections.emptyMap());
    }

    /** 刷新缓存 */
    public void refresh() {
        programDefs.clear();
        enums.clear();
        loadProgramDefs();
        loadEnums();
    }
}