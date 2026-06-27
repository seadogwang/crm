package com.loyalty.platform.campaign.ai.skill;

import com.loyalty.platform.domain.entity.campaign.ExternalSignal;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.UUID;

/**
 * 政策法规监控技能 — 监控行业政策法规变化并评估对营销活动的影响。
 *
 * <p>开发阶段：模拟返回政策信号。
 * 生产阶段：接入政策法规数据库 API + LLM 分析政策影响。
 */
@Component
public class RegulatoryWatchSkill implements ExternalSkill {

    private static final Logger log = LoggerFactory.getLogger(RegulatoryWatchSkill.class);

    private static final List<String> REGULATORY_SOURCES = List.of(
            "https://www.gov.cn/zhengce/",
            "https://www.samr.gov.cn/",
            "https://www.cac.gov.cn/"
    );

    @Override
    public String getSkillName() {
        return "REGULATORY_WATCH";
    }

    @Override
    public List<String> getCompetitorUrls() {
        return Collections.emptyList();
    }

    @Override
    public List<String> getKeywords() {
        return List.of("数据安全", "个人信息保护", "消费者权益", "电商法", "广告法",
                "隐私政策", "合规", "反垄断", "价格法", "促销规范");
    }

    @Override
    public List<ExternalSignal> execute(SkillExecutionContext context) {
        log.info("Executing RegulatoryWatchSkill for program: {}", context.getProgramCode());

        List<ExternalSignal> signals = new ArrayList<>();

        // 开发阶段：模拟返回政策法规信号
        String programCode = context.getProgramCode() != null ? context.getProgramCode() : "PROG001";

        // 模拟：数据安全法规更新
        ExternalSignal signal1 = ExternalSignal.builder()
                .id(UUID.randomUUID().toString())
                .programCode(programCode)
                .signalType("POLICY_CHANGE")
                .severity("WARNING")
                .sourceSkill("REGULATORY_WATCH")
                .targetEntity("数据安全法")
                .title("数据安全法规更新：个人信息处理需获明确同意")
                .description("监管部门发布最新指引，要求所有营销活动中的个人信息处理必须获得用户的明确同意，" +
                        "包括邮件营销、短信营销和个性化推荐。建议审查现有营销流程的合规性。")
                .impactFactor(BigDecimal.valueOf(0.85))
                .affectedSegments("[\"high_value\",\"new_member\",\"all\"]")
                .recommendedAction("REVIEW_CONSENT_MECHANISM")
                .expiresAt(LocalDateTime.now().plusDays(30))
                .isConsumed(false)
                .createdAt(LocalDateTime.now())
                .updatedAt(LocalDateTime.now())
                .build();
        signals.add(signal1);

        // 模拟：消费者权益保护政策
        ExternalSignal signal2 = ExternalSignal.builder()
                .id(UUID.randomUUID().toString())
                .programCode(programCode)
                .signalType("POLICY_CHANGE")
                .severity("CRITICAL")
                .sourceSkill("REGULATORY_WATCH")
                .targetEntity("消费者权益保护法")
                .title("消费者权益保护法修订：营销活动透明度要求提高")
                .description("新修订的消费者权益保护法要求所有会员营销活动必须明确披露：优惠条件、使用限制、" +
                        "有效期和退改规则。不合规的营销活动可能面临行政处罚。")
                .impactFactor(BigDecimal.valueOf(0.70))
                .affectedSegments("[\"all\"]")
                .recommendedAction("UPDATE_MARKETING_DISCLOSURE")
                .expiresAt(LocalDateTime.now().plusDays(14))
                .isConsumed(false)
                .createdAt(LocalDateTime.now())
                .updatedAt(LocalDateTime.now())
                .build();
        signals.add(signal2);

        // 模拟：广告法合规检查
        ExternalSignal signal3 = ExternalSignal.builder()
                .id(UUID.randomUUID().toString())
                .programCode(programCode)
                .signalType("POLICY_CHANGE")
                .severity("INFO")
                .sourceSkill("REGULATORY_WATCH")
                .targetEntity("广告法")
                .title("广告法执法力度加强：注意营销文案用词")
                .description("近期多地市场监管部门加强了对营销广告用词的审查，'最'、'第一'、" +
                        "'国家级'等绝对化用语被重点监管。建议审查所有营销素材的文案合规性。")
                .impactFactor(BigDecimal.valueOf(0.95))
                .affectedSegments("[\"all\"]")
                .recommendedAction("AUDIT_CONTENT_COMPLIANCE")
                .expiresAt(LocalDateTime.now().plusDays(7))
                .isConsumed(false)
                .createdAt(LocalDateTime.now())
                .updatedAt(LocalDateTime.now())
                .build();
        signals.add(signal3);

        log.info("RegulatoryWatchSkill completed: {} signals generated", signals.size());
        return signals;
    }
}