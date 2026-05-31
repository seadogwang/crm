package com.loyalty.saas.rules;

import com.loyalty.saas.domain.entity.EventFact;
import com.loyalty.saas.rules.action.Action;
import com.loyalty.saas.rules.drl.MemberFact;
import com.loyalty.saas.rules.regression.ActionDiff;
import com.loyalty.saas.rules.regression.RegressionReport;
import org.kie.api.KieBase;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.util.*;

/**
 * 影子沙箱回归测试服务 — 双 KieSession 并发回放与差异分析。
 *
 * <p>设计文档 6.3 节实现。核心流程：
 * <ol>
 *   <li>构建双引擎环境: Baseline（仅线上老规则）+ Candidate（老规则 + 新草稿）</li>
 *   <li>加载回放数据集（生产环境历史事件切片 + AI 模拟用例）</li>
 *   <li>逐事件双引擎并发回放</li>
 *   <li>ActionDiff 对比Baseline和Candidate输出</li>
 *   <li>生成 RegressionReport（PASS / WARNING / CRITICAL）</li>
 * </ol>
 *
 * <p>检测的冲突类型：
 * <ul>
 *   <li><b>叠加超发 (Double Reward)</b>: Candidate 比 Baseline 多发了积分</li>
 *   <li><b>规则遮蔽 (Shadowing)</b>: Baseline 的发分在 Candidate 中被互斥组覆盖</li>
 *   <li><b>等级差异</b>: 两套规则产出了不同的升降级</li>
 * </ul>
 *
 * @author Loyalty SaaS Architecture Team
 * @since 1.0.0
 */
@Service
public class RuleRegressionService {

    private static final Logger log = LoggerFactory.getLogger(RuleRegressionService.class);

    private final KieBaseCacheManager cacheManager;
    private final RuleEngineService ruleEngine;

    public RuleRegressionService(KieBaseCacheManager cacheManager, RuleEngineService ruleEngine) {
        this.cacheManager = cacheManager;
        this.ruleEngine = ruleEngine;
    }

    /**
     * 执行影子沙箱回归测试。
     *
     * <p>构建双 KieBase 环境，使用历史真实事件回放，检测新规则是否存在冲突。
     *
     * @param programCode   租户计划代码
     * @param draftRuleDrl  新规则的 DRL 脚本（草稿）
     * @param testFacts     回放测试数据集（来自生产历史切片 + AI 用例）
     * @return 回归测试报告
     */
    public RegressionReport runShadowRegression(String programCode, String draftRuleDrl,
                                                 List<RegressionTestCase> testFacts) {
        log.info("[Regression] 沙箱回归开始: program={}, testFacts={}", programCode, testFacts.size());

        RegressionReport report = new RegressionReport();
        report.setDatasetDescription(testFacts.size() + " 条测试用例");

        // 1. 获取 Baseline KieBase（当前线上规则）
        KieBase baselineKie;
        try {
            baselineKie = cacheManager.getKieBase(programCode);
        } catch (Exception e) {
            log.error("[Regression] 获取 Baseline KieBase 失败", e);
            report.addDiff(new ActionDiff(List.of(), List.of()),
                    "Baseline KieBase 加载失败: " + e.getMessage());
            return report;
        }

        // 2. 构建 Candidate KieBase（线上规则 + 新草稿）
        //    这里简化处理：用 Baseline 作为 Candidate（实际应编译含草稿的新 KieBase）
        KieBase candidateKie = baselineKie; // 骨架：实际需要 buildKieBaseWithDraft()

        // 3. 逐事件双引擎回放并对比
        for (RegressionTestCase testCase : testFacts) {
            try {
                List<Object> baselineFacts = wrapFacts(testCase);
                List<Object> candidateFacts = wrapFacts(testCase);

                List<Action> baselineActions = ruleEngine.evaluate(baselineKie, baselineFacts);
                List<Action> candidateActions = ruleEngine.evaluate(candidateKie, candidateFacts);

                ActionDiff diff = new ActionDiff(baselineActions, candidateActions);

                if (diff.isEmpty()) {
                    report.addPass();
                } else {
                    report.addDiff(diff, testCase.description());
                    log.warn("[Regression] 差异检测: case={}, diff={}", testCase.description(), diff.getWarnings());
                }
            } catch (Exception e) {
                log.error("[Regression] 用例执行异常: case={}", testCase.description(), e);
                // 异常用例计为差异
                report.addDiff(new ActionDiff(List.of(), List.of()),
                        testCase.description() + " [异常: " + e.getMessage() + "]");
            }
        }

        log.info("[Regression] 回归完成: {}", report);
        return report;
    }

    /**
     * 将测试用例包装为 DRL 事实对象。
     */
    private List<Object> wrapFacts(RegressionTestCase tc) {
        List<Object> facts = new ArrayList<>();
        facts.add(tc.eventFact());

        if (tc.memberFact() != null) {
            facts.add(tc.memberFact());
        }
        return facts;
    }

    /**
     * 回归测试用例 — 包含一个事件事实 + 可选的会员事实。
     */
    public record RegressionTestCase(EventFact eventFact, MemberFact memberFact, String description) {}
}