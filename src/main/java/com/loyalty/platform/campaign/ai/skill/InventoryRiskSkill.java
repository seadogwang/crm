package com.loyalty.platform.campaign.ai.skill;

import com.loyalty.platform.domain.entity.campaign.ExternalSignal;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.*;

/**
 * 库存风险监控技能 — 监控商品库存水平，识别库存积压和缺货风险。
 *
 * <p>开发阶段：模拟返回库存风险信号。
 * 生产阶段：接入库存系统 API + 销售预测模型。
 */
@Component
public class InventoryRiskSkill implements ExternalSkill {

    private static final Logger log = LoggerFactory.getLogger(InventoryRiskSkill.class);

    @Override
    public String getSkillName() {
        return "INVENTORY_RISK";
    }

    @Override
    public List<String> getCompetitorUrls() {
        return Collections.emptyList();
    }

    @Override
    public List<String> getKeywords() {
        return List.of("库存", "积压", "缺货", "滞销", "热销", "清仓", "补货", "周转率");
    }

    @Override
    public List<ExternalSignal> execute(SkillExecutionContext context) {
        log.info("Executing InventoryRiskSkill for program: {}", context.getProgramCode());

        List<ExternalSignal> signals = new ArrayList<>();

        String programCode = context.getProgramCode() != null ? context.getProgramCode() : "PROG001";

        // 模拟：库存积压风险
        ExternalSignal signal1 = ExternalSignal.builder()
                .id(UUID.randomUUID().toString())
                .programCode(programCode)
                .signalType("INVENTORY_RISK")
                .severity("WARNING")
                .sourceSkill("INVENTORY_RISK")
                .targetEntity("SKU-2024-Q1-冬季外套")
                .title("库存积压预警：冬季外套库存周转率低于阈值")
                .description("SKU-2024-Q1冬季外套当前库存 2,500 件，最近30天仅售出 120 件，" +
                        "库存周转率低于 0.1。建议启动清仓促销活动，避免过季库存积压。")
                .impactFactor(BigDecimal.valueOf(1.25))
                .affectedSegments("[\"price_sensitive\",\"high_value\"]")
                .recommendedAction("LAUNCH_CLEARANCE_CAMPAIGN")
                .expiresAt(LocalDateTime.now().plusDays(14))
                .isConsumed(false)
                .createdAt(LocalDateTime.now())
                .updatedAt(LocalDateTime.now())
                .build();
        signals.add(signal1);

        // 模拟：热销品缺货风险
        ExternalSignal signal2 = ExternalSignal.builder()
                .id(UUID.randomUUID().toString())
                .programCode(programCode)
                .signalType("INVENTORY_RISK")
                .severity("CRITICAL")
                .sourceSkill("INVENTORY_RISK")
                .targetEntity("SKU-2026-SUMMER-防晒霜")
                .title("缺货预警：热销防晒霜库存不足 3 天")
                .description("SKU-2026-SUMMER防晒霜当前库存仅剩 200 件，日均销量 80 件，" +
                        "预计 3 天内售罄。建议暂停对该商品的促销推广，优先保障自然流量供应。")
                .impactFactor(BigDecimal.valueOf(0.50))
                .affectedSegments("[\"high_value\",\"new_member\",\"active\"]")
                .recommendedAction("PAUSE_PROMOTION_RESTOCK")
                .expiresAt(LocalDateTime.now().plusDays(3))
                .isConsumed(false)
                .createdAt(LocalDateTime.now())
                .updatedAt(LocalDateTime.now())
                .build();
        signals.add(signal2);

        // 模拟：新品上市库存充足
        ExternalSignal signal3 = ExternalSignal.builder()
                .id(UUID.randomUUID().toString())
                .programCode(programCode)
                .signalType("INVENTORY_RISK")
                .severity("INFO")
                .sourceSkill("INVENTORY_RISK")
                .targetEntity("SKU-2026-NEW-智能手表")
                .title("新品上市：智能手表库存充足，建议加大推广")
                .description("SKU-2026-NEW智能手表首批到货 5,000 件，库存充足。" +
                        "建议启动新品首发营销活动，配合会员专属优惠促进首销转化。")
                .impactFactor(BigDecimal.valueOf(1.30))
                .affectedSegments("[\"vip\",\"high_value\",\"new_member\"]")
                .recommendedAction("BOOST_NEW_PRODUCT_LAUNCH")
                .expiresAt(LocalDateTime.now().plusDays(7))
                .isConsumed(false)
                .createdAt(LocalDateTime.now())
                .updatedAt(LocalDateTime.now())
                .build();
        signals.add(signal3);

        log.info("InventoryRiskSkill completed: {} signals generated", signals.size());
        return signals;
    }
}