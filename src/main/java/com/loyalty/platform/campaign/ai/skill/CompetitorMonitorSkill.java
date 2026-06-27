package com.loyalty.platform.campaign.ai.skill;

import com.loyalty.platform.domain.entity.campaign.ExternalSignal;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.temporal.ChronoUnit;
import java.util.*;

/**
 * 竞品监控技能 — 爬取竞品网页 + LLM 解析。
 *
 * <p>开发阶段：模拟返回竞品信号。
 * 生产阶段：WebCrawlerService + LLMClient Tool Calling 解析非结构化数据。
 */
@Component
public class CompetitorMonitorSkill implements ExternalSkill {

    private static final Logger log = LoggerFactory.getLogger(CompetitorMonitorSkill.class);

    private static final List<String> DEFAULT_URLS = List.of(
            "https://www.competitor-a.com/products",
            "https://www.competitor-b.com/promotions"
    );

    @Override
    public String getSkillName() {
        return "COMPETITOR_MONITOR";
    }

    @Override
    public List<String> getCompetitorUrls() {
        return DEFAULT_URLS;
    }

    @Override
    public List<String> getKeywords() {
        return List.of("price", "discount", "new", "launch", "promotion");
    }

    @Override
    public List<ExternalSignal> execute(SkillExecutionContext context) {
        log.info("Executing CompetitorMonitorSkill for program: {}", context.getProgramCode());

        // 开发阶段：模拟返回竞品信号
        // 生产阶段使用 WebCrawlerService.fetch(url) + LLMClient.chatWithTools(prompt, tools)
        List<ExternalSignal> signals = new ArrayList<>();

        // 模拟价格变更信号
        signals.add(ExternalSignal.builder()
                .id(UUID.randomUUID().toString())
                .signalType("PRICE_CHANGE")
                .severity("WARNING")
                .sourceSkill(getSkillName())
                .targetEntity("竞品A 产品X")
                .title("竞品降价: 产品X")
                .description("竞品A 产品X 从 ¥399 降至 ¥299，降幅25%")
                .impactFactor(BigDecimal.valueOf(1.25))
                .affectedSegments("[\"HIGH_VALUE\",\"PRICE_SENSITIVE\"]")
                .recommendedAction("PRICE_MATCH_WINBACK")
                .expiresAt(LocalDateTime.now().plusDays(3))
                .isConsumed(false)
                .build());

        // 模拟新品发布信号
        signals.add(ExternalSignal.builder()
                .id(UUID.randomUUID().toString())
                .signalType("NEW_LAUNCH")
                .severity("INFO")
                .sourceSkill(getSkillName())
                .targetEntity("竞品B 产品Y")
                .title("新品发布: 竞品B 产品Y")
                .description("竞品B 发布新产品Y，定位高端市场")
                .impactFactor(BigDecimal.valueOf(1.10))
                .affectedSegments("[\"PREMIUM\",\"HIGH_VALUE\"]")
                .recommendedAction("VALUE_ADD_OFFER")
                .expiresAt(LocalDateTime.now().plusDays(7))
                .isConsumed(false)
                .build());

        log.info("CompetitorMonitorSkill generated {} signals", signals.size());
        return signals;
    }
}
