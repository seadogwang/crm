package com.loyalty.platform.campaign.ai.skill;

import com.loyalty.platform.campaign.opportunity.service.ExternalSignalService;
import com.loyalty.platform.domain.entity.campaign.ExternalSignal;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

import java.util.List;

/**
 * AI 技能调度器 — 按预设策略定时执行外部感知技能。
 *
 * <p>调度策略：
 * <ul>
 *   <li>竞品价格：每 6 小时</li>
 *   <li>舆情：每 2 小时</li>
 *   <li>政策法规：每 24 小时</li>
 * </ul>
 */
@Service
public class SkillSchedulerService {

    private static final Logger log = LoggerFactory.getLogger(SkillSchedulerService.class);

    private final List<ExternalSkill> skills;
    private final ExternalSignalService signalService;

    public SkillSchedulerService(List<ExternalSkill> skills, ExternalSignalService signalService) {
        this.skills = skills;
        this.signalService = signalService;
    }

    /**
     * 竞品监控：每 6 小时。
     */
    @Scheduled(cron = "0 0 */6 * * ?")
    public void runCompetitorMonitor() {
        log.info("Scheduled: Running competitor monitor skills");
        skills.stream()
                .filter(s -> s instanceof CompetitorMonitorSkill)
                .forEach(this::executeSkill);
    }

    /**
 * 舆情监控：每 2 小时。
     */
    @Scheduled(cron = "0 0 */2 * * ?")
    public void runSocialListening() {
        log.info("Scheduled: Running social listening skills");
        skills.stream()
                .filter(s -> s instanceof SocialListeningSkill)
                .forEach(this::executeSkill);
    }

    /**
     * 政策法规监控：每 24 小时。
     */
    @Scheduled(cron = "0 0 0 */1 * ?")
    public void runRegulatoryWatch() {
        log.info("Scheduled: Running regulatory watch skills");
        skills.stream()
                .filter(s -> s instanceof RegulatoryWatchSkill)
                .forEach(this::executeSkill);
    }

    /**
     * 库存风险监控：每 4 小时。
     */
    @Scheduled(cron = "0 0 */4 * * ?")
    public void runInventoryRisk() {
        log.info("Scheduled: Running inventory risk skills");
        skills.stream()
                .filter(s -> s instanceof InventoryRiskSkill)
                .forEach(this::executeSkill);
    }

    /**
     * 过期信号清理：每日凌晨 3 点。
     */
    @Scheduled(cron = "0 0 3 * * ?")
    public void cleanExpiredSignals() {
        signalService.cleanExpiredSignals();
        log.info("Scheduled: Expired signals cleaned");
    }

    private void executeSkill(ExternalSkill skill) {
        try {
            SkillExecutionContext ctx = SkillExecutionContext.builder()
                    .programCode("PROG001")
                    .build();
            List<ExternalSignal> signals = skill.execute(ctx);
            for (ExternalSignal signal : signals) {
                signalService.createSignal(signal);
            }
            log.info("Skill '{}' completed: {} signals generated", skill.getSkillName(), signals.size());
        } catch (Exception e) {
            log.error("Skill '{}' execution failed: {}", skill.getSkillName(), e.getMessage(), e);
        }
    }
}
