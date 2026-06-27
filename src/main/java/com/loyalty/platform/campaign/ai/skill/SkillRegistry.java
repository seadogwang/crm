package com.loyalty.platform.campaign.ai.skill;

import jakarta.annotation.PostConstruct;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * 技能注册表 — 管理所有 ExternalSkill 实现。
 */
@Component
public class SkillRegistry {

    private static final Logger log = LoggerFactory.getLogger(SkillRegistry.class);

    private final Map<String, ExternalSkill> skills = new ConcurrentHashMap<>();
    private final List<ExternalSkill> skillBeans;

    public SkillRegistry(List<ExternalSkill> skillBeans) {
        this.skillBeans = skillBeans;
    }

    @PostConstruct
    public void init() {
        for (ExternalSkill skill : skillBeans) {
            skills.put(skill.getSkillName(), skill);
            log.info("Skill registered: {}", skill.getSkillName());
        }
        log.info("Skill registry initialized with {} skills", skills.size());
    }

    public ExternalSkill getSkill(String name) {
        return skills.get(name);
    }

    /**
     * 获取所有启用的技能（从配置读取，目前返回全部）。
     */
    public List<ExternalSkill> getAllEnabled() {
        return List.of(
                skills.get("COMPETITOR_MONITOR"),
                skills.get("SOCIAL_LISTENING"),
                skills.get("REGULATORY_WATCH"),
                skills.get("INVENTORY_RISK")
        );
    }

    public List<ExternalSkill> getAll() {
        return List.copyOf(skillBeans);
    }
}
