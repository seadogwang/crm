package com.loyalty.saas.rules;

import com.loyalty.saas.domain.entity.RuleDefinition;
import com.loyalty.saas.domain.repository.RuleDefinitionRepository;
import org.kie.api.KieBase;
import org.kie.api.KieServices;
import org.kie.api.builder.KieBuilder;
import org.kie.api.builder.KieFileSystem;
import org.kie.api.builder.Message;
import org.kie.api.runtime.KieContainer;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import java.util.List;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicReference;

/**
 * KieBase 原子热替换缓存管理器 — 无锁并发安全。
 *
 * <p>设计文档 6.1.2 节实现。核心要求：
 * <ul>
 *   <li><b>读取无锁</b>：{@link #getKieBase(String)} 通过 {@code AtomicReference.get()} 读取，
 *       不需要任何锁，性能极高。</li>
 *   <li><b>原子替换</b>：{@link #refreshKieBase(String)} 先构建新 KieBase（耗时操作在锁外），
 *       再通过 {@code AtomicReference.getAndSet()} 纳秒级原子替换引用。</li>
 *   <li><b>无损切换</b>：已获取旧引用的线程继续使用旧版本完成推理，
 *       新线程获取到的是新版本，不阻塞、不重试。</li>
 *   <li><b>安全降级</b>：buildKieBase 编译失败时抛出异常，ref 不变，继续使用旧版本。</li>
 * </ul>
 *
 * <p><b>AI 编码强制约束</b>：
 * <ul>
 *   <li>严禁将 KieBase 直接存储在普通成员变量中。</li>
 *   <li>严禁使用 synchronized 包裹推理执行逻辑。</li>
 *   <li>必须使用 AtomicReference 或等效的原子类管理 KieBase 引用。</li>
 * </ul>
 *
 * <p>并发安全保证：
 * <table>
 *   <tr><td>线程 A 正在推理，线程 B 触发 update</td><td>A 使用旧版本完成 → 无风险</td></tr>
 *   <tr><td>ref.getAndSet() 发生瞬间</td><td>Java 引用是值传递，不受影响 → 无风险</td></tr>
 *   <tr><td>热更新后首次获取</td><td>ref.get() 得到新版本 → 期望行为</td></tr>
 *   <tr><td>buildKieBase() 编译失败</td><td>抛出异常，ref 不变 → 安全降级</td></tr>
 * </table>
 *
 * @author Loyalty SaaS Architecture Team
 * @since 1.0.0
 */
@Component
public class KieBaseCacheManager {

    private static final Logger log = LoggerFactory.getLogger(KieBaseCacheManager.class);

    /**
     * program_code → AtomicReference&lt;KieBase&gt; 缓存。
     * 使用 ConcurrentHashMap 保证 put 的线程安全，
     * 使用 AtomicReference 保证 KieBase 引用的原子更新。
     */
    private final ConcurrentHashMap<String, AtomicReference<KieBase>> cache = new ConcurrentHashMap<>();

    /**
     * program_code → KieContainer 缓存，用于在热替换时 dispose 旧容器，防止资源泄漏。
     */
    private final ConcurrentHashMap<String, KieContainer> containerCache = new ConcurrentHashMap<>();

    private final RuleDefinitionRepository ruleRepo;

    public KieBaseCacheManager(RuleDefinitionRepository ruleRepo) {
        this.ruleRepo = ruleRepo;
    }

    /**
     * 获取指定 Program 的当前 KieBase。
     *
     * <p><b>读取操作无锁</b>：直接调用 {@code AtomicReference.get()}，
     * 这是 volatile 读，性能极高不阻塞。
     *
     * <p>首次调用时触发初始化（双重检查锁定，仅初始化一次）。
     *
     * @param programCode 租户计划代码
     * @return 当前生效的 KieBase
     */
    public KieBase getKieBase(String programCode) {
        AtomicReference<KieBase> ref = cache.get(programCode);
        if (ref == null) {
            // 首次加载：双重检查锁定（仅初始化使用锁，后续读取无锁）
            synchronized (this) {
                ref = cache.get(programCode);
                if (ref == null) {
                    KieBase kieBase = buildKieBase(programCode);
                    ref = new AtomicReference<>(kieBase);
                    cache.put(programCode, ref);
                    log.info("[KieBaseCache] 首次加载: program={}", programCode);
                }
            }
        }
        return ref.get(); // 无锁原子读取
    }

    /**
     * 规则变更后，重新编译并原子替换 KieBase。
     *
     * <p>关键设计：
     * <ol>
     *   <li>先构建新 KieBase 对象（耗时数百毫秒，但在锁外完成，不阻塞推理线程）</li>
     *   <li>再通过 {@code AtomicReference.getAndSet()} 原子替换引用（纳秒级操作）</li>
     *   <li>旧 KieBase 仍被已获取引用的线程使用，等待 GC 回收</li>
     * </ol>
     *
     * @param programCode 租户计划代码
     * @throws RuleCompileException 如果新规则编译失败（旧版本不受影响）
     */
    public void refreshKieBase(String programCode) {
        // 0. 记录旧容器引用，构建新版本后再销毁
        KieContainer oldContainer = containerCache.get(programCode);

        // 1. 构建新版本 KieBase（耗时操作，不在锁内）
        KieBase newKieBase = buildKieBase(programCode);

        // 2. 确保 AtomicReference 存在
        AtomicReference<KieBase> ref = cache.computeIfAbsent(programCode,
                k -> new AtomicReference<>());

        // 3. 原子替换引用（纳秒级操作）
        KieBase oldKieBase = ref.getAndSet(newKieBase);

        // 4. 销毁旧 KieContainer，释放 Drools 内部资源
        if (oldContainer != null) {
            try {
                oldContainer.dispose();
                log.info("[KieBaseCache] 旧 KieContainer 已销毁: program={}", programCode);
            } catch (Exception e) {
                log.warn("[KieBaseCache] 销毁旧 KieContainer 失败: program={}", programCode, e);
            }
        }

        log.info("[KieBaseCache] 热更新完成: program={}, oldKieBase hash={}, newKieBase hash={}",
                programCode, System.identityHashCode(oldKieBase), System.identityHashCode(newKieBase));
    }

    /**
     * 编译 KieBase：从 DB 加载该 Program 的所有 ACTIVE 规则。
     *
     * <p>每次编译创建全新的 KieFileSystem + KieBuilder + KieContainer，
     * 确保每次构建是独立、可重现的。
     *
     * @param programCode 租户计划代码
     * @return 编译好的 KieBase
     * @throws RuleCompileException 如果规则编译有 ERROR 级别消息
     */
    KieBase buildKieBase(String programCode) {
        List<RuleDefinition> activeRules = ruleRepo.findActiveByProgramCode(programCode);

        if (activeRules.isEmpty()) {
            log.debug("[KieBaseCache] Program [{}] 无活跃规则，返回空 KieBase", programCode);
            KieServices ks = KieServices.Factory.get();
            KieContainer emptyContainer = ks.newKieContainer(ks.getRepository().getDefaultReleaseId());
            containerCache.put(programCode, emptyContainer);
            return emptyContainer.getKieBase();
        }

        KieServices kieServices = KieServices.Factory.get();
        KieFileSystem kieFileSystem = kieServices.newKieFileSystem();

        for (RuleDefinition rule : activeRules) {
            String drlPath = "src/main/resources/rules/"
                    + programCode + "/" + rule.getRuleCode() + "_v" + rule.getVersion() + ".drl";
            kieFileSystem.write(drlPath, rule.getDrlContent());
            log.debug("[KieBaseCache] 加载规则: {}", drlPath);
        }

        KieBuilder kieBuilder = kieServices.newKieBuilder(kieFileSystem);
        kieBuilder.buildAll();

        if (kieBuilder.getResults().hasMessages(Message.Level.ERROR)) {
            String errors = kieBuilder.getResults().getMessages(Message.Level.ERROR).toString();
            log.error("[KieBaseCache] 规则编译失败: program={}, errors={}", programCode, errors);
            throw new RuleCompileException("规则编译失败: " + errors);
        }

        // 记录非错误的编译消息（警告/信息）
        if (kieBuilder.getResults().hasMessages(Message.Level.WARNING)) {
            log.warn("[KieBaseCache] 编译警告: {}", kieBuilder.getResults().getMessages(Message.Level.WARNING));
        }

        KieContainer kieContainer = kieServices.newKieContainer(
                kieServices.getRepository().getDefaultReleaseId());

        // 将 KieContainer 放入缓存，便于后续 dispose
        KieContainer previous = containerCache.put(programCode, kieContainer);
        if (previous != null) {
            log.debug("[KieBaseCache] 替换并存储新 KieContainer: program={}", programCode);
        }

        return kieContainer.getKieBase();
    }

    /**
     * 获取缓存中的 Program 数量（监控用）。
     */
    public int getCacheSize() {
        return cache.size();
    }

    /**
     * 移除指定 Program 的缓存（下线用）。
     */
    public void evict(String programCode) {
        KieContainer container = containerCache.remove(programCode);
        if (container != null) {
            try {
                container.dispose();
                log.info("[KieBaseCache] KieContainer 已销毁: program={}", programCode);
            } catch (Exception e) {
                log.warn("[KieBaseCache] 销毁 KieContainer 失败: program={}", programCode, e);
            }
        }
        cache.remove(programCode);
        log.info("[KieBaseCache] 缓存已清除: program={}", programCode);
    }

    /**
     * 规则编译异常。
     */
    public static class RuleCompileException extends RuntimeException {
        public RuleCompileException(String message) { super(message); }
    }
}