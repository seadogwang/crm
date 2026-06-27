package com.loyalty.platform.campaign.execution.worker;

import com.loyalty.platform.campaign.intervention.service.InterventionService;
import com.loyalty.platform.campaign.opportunity.service.MLScoringClient;
import org.springframework.stereotype.Component;

import java.util.List;
import java.util.Map;

/**
 * AI 评分 Worker — 调用 ML 模型对会员评分。
 *
 * <p>Zeebe Job Type: {@code campaign-ai-score}
 */
@Component
public class AiScoreWorker extends BaseCampaignWorker {

    private final MLScoringClient mlClient;

    public AiScoreWorker(InterventionService interventionService, MLScoringClient mlClient) {
        super(interventionService);
        this.mlClient = mlClient;
    }

    @Override
    public String getJobType() {
        return "campaign-ai-score";
    }

    @Override
    @SuppressWarnings("unchecked")
    public Map<String, Object> handle(Map<String, Object> variables) {
        List<Map<String, Object>> members = (List<Map<String, Object>>) variables.get("members");
        String modelName = getString(variables, "model");

        log.info("AIScore: model={}, members={}", modelName, members != null ? members.size() : 0);

        if (members == null || members.isEmpty()) {
            return result("scores", List.of());
        }

        // 开发阶段：使用 MLScoringClient 模拟评分
        // 生产阶段：调用指定 ML 模型
        var features = members.stream().map(m ->
                com.loyalty.platform.campaign.opportunity.dto.MemberFeature.builder()
                        .memberId((String) m.get("memberId"))
                        .build()
        ).toList();

        var scores = mlClient.predictBatch(features);

        return result("scores", scores);
    }
}
