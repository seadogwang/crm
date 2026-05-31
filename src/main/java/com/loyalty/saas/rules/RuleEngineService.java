package com.loyalty.saas.rules;

import com.loyalty.saas.rules.action.ActionCollector;
import com.loyalty.saas.rules.action.Action;
import org.kie.api.KieBase;
import org.kie.api.runtime.StatelessKieSession;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.util.Collections;
import java.util.List;

/**
 * 规则引擎服务 — StatelessKieSession 推理入口。
 *
 * <p>设计文档 6.1.2.2 节实现。关键设计：
 * <ol>
 *   <li>一次性获取 KieBase 引用并持有到推理结束</li>
 *   <li>即使执行过程中发生热更新，本线程仍使用旧版本完成推理</li>
 *   <li>不阻塞、不重试、不受影响</li>
 * </ol>
 *
 * <p><b>线程安全</b>：每次都创建全新的 {@link StatelessKieSession}，
 * 执行完毕后立即释放，避免内存泄漏和并发污染。严禁使用 {@code StatefulKieSession}。
 *
 * @author Loyalty SaaS Architecture Team
 * @since 1.0.0
 */
@Service
public class RuleEngineService {

    private static final Logger log = LoggerFactory.getLogger(RuleEngineService.class);

    private final KieBaseCacheManager cacheManager;

    public RuleEngineService(KieBaseCacheManager cacheManager) {
        this.cacheManager = cacheManager;
    }

    /**
     * 执行规则推理。
     *
     * @param programCode 租户计划代码
     * @param facts       事实对象列表（MemberFact, EventFact 等）
     * @return 规则引擎输出的动作列表
     */
    public List<Action> evaluate(String programCode, List<Object> facts) {
        KieBase kieBase = cacheManager.getKieBase(programCode);
        return evaluate(kieBase, facts);
    }

    /**
     * 使用指定 KieBase 执行推理（沙箱回归用）。
     *
     * @param kieBase 指定的 KieBase（Baseline 或 Candidate）
     * @param facts   事实对象列表
     * @return 规则引擎输出的动作列表
     */
    public List<Action> evaluate(KieBase kieBase, List<Object> facts) {
        if (kieBase == null || facts == null || facts.isEmpty()) {
            return Collections.emptyList();
        }

        try {
            // 创建全新的无状态会话 → 线程安全，不污染
            StatelessKieSession session = kieBase.newStatelessKieSession();

            // 创建线程独立的动作收集器
            ActionCollector collector = new ActionCollector();
            session.setGlobal("collector", collector);

            // 插入所有事实并执行
            session.execute(facts);

            List<Action> actions = collector.getActions();
            log.debug("[RuleEngine] 推理完成: {} facts → {} actions", facts.size(), actions.size());
            return actions;

        } catch (Exception e) {
            log.error("[RuleEngine] 推理异常", e);
            // 不抛异常，返回空列表（安全降级）
            return Collections.emptyList();
        }
    }
}