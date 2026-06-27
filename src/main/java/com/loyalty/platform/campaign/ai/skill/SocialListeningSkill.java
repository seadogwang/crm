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
 * 舆情监控技能 — 调用社交媒体 API + LLM 情感分析。
 *
 * <p>开发阶段：模拟返回舆情信号。
 * 生产阶段：SocialApiClient + LLMClient 分析非结构化内容。
 */
@Component
public class SocialListeningSkill implements ExternalSkill {

    private static final Logger log = LoggerFactory.getLogger(SocialListeningSkill.class);

    @Override
    public String getSkillName() {
        return "SOCIAL_LISTENING";
    }

    @Override
    public List<String> getCompetitorUrls() {
        return Collections.emptyList();
    }

    @Override
    public List<String> getKeywords() {
        return List.of("品牌A", "产品X", "体验", "投诉", "推荐");
    }

    @Override
    public List<ExternalSignal> execute(SkillExecutionContext context) {
        log.info("Executing SocialListeningSkill for program: {}", context.getProgramCode());

        List<ExternalSignal> signals = new ArrayList<>();

        // 开发阶段：模拟返回舆情信号
        // 生产阶段：SocialApiClient.search(keywords, days, limit) + LLMClient.chat(prompt)

        // 模拟负面舆情
        ExternalSignal negativeSignal = ExternalSignal.builder()
                .id(UUID.randomUUID().toString())
                .signalType("SENTIMENT_SHIFT")
                .severity("WARNING")
                .sourceSkill(getSkillName())
                .targetEntity(context.getProgramCode())
                .title("品牌舆情预警: 用户投诉增多")
                .description("近期社交媒体情感倾向转负（得分-0.45），主要话题: 服务质量下降")
                .impactFactor(BigDecimal.valueOf(0.85))
                .affectedSegments("[\"ALL\"]")
                .recommendedAction("PAUSE_CAMPAIGN")
                .expiresAt(LocalDateTime.now().plusDays(2))
                .isConsumed(false)
                .build();
        signals.add(negativeSignal);

        // 模拟正向热点
        ExternalSignal positiveSignal = ExternalSignal.builder()
                .id(UUID.randomUUID().toString())
                .signalType("VIRAL_EVENT")
                .severity("INFO")
                .sourceSkill(getSkillName())
                .targetEntity(context.getProgramCode())
                .title("热点话题: #品牌大促# 引发热议")
                .description("社交媒体出现正向热点，情感得分0.65，可借势营销")
                .impactFactor(BigDecimal.valueOf(1.20))
                .affectedSegments("[\"ENGAGED\",\"ACTIVE\"]")
                .recommendedAction("BOOST_ENGAGEMENT")
                .expiresAt(LocalDateTime.now().plusDays(1))
                .isConsumed(false)
                .build();
        signals.add(positiveSignal);

        log.info("SocialListeningSkill generated {} signals", signals.size());
        return signals;
    }
}
