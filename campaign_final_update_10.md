## 缺失项 8（P2）：动态内容与个性化推荐详细设计
> **优先级**：P2（增强功能）\
> **原因**：当前内容系统仅支持静态变量替换（`{{user_name}}`），无法实现真正意义上的“千人千面”。现代营销平台的核心竞争力在于**在正确的时间，把正确的内容，给正确的人**。动态内容与推荐能力的缺失将使系统在用户体验和转化优化上落后于竞品。\
> **对应章节**：第13章（Content）扩展 + 第5章（Execution Worker）扩展 + 第2章（Opportunity）协同\
> **设计原则**：**最小化侵入，最大化复用**。在现有内容渲染引擎基础上增加“动态内容块（Dynamic Content Block）”能力，通过新增 `RECOMMEND` 节点类型或扩展模板语法，复用 Loyalty 用户画像和推荐能力。
## 一、设计目标
1. **动态内容块（Dynamic Content Blocks）** ：在素材模板中定义动态区域，由推荐引擎或规则引擎在发送时实时填充。
2. **多种推荐策略**：
   * **“看了又看”**（基于浏览历史的相似商品推荐）
   * **“买了又买”**（基于购买历史的关联商品推荐）
   * **“热门推荐”**（基于全站热度的商品推荐）
   * **“个性化优惠”**（基于用户画像的动态优惠券面额）
   * **“动态文案”**（基于用户属性的文案变量，如年龄段、城市、偏好品类）
3. **AB测试兼容**：动态内容可与第 15 章 A/B 测试协同，不同变体使用不同的推荐策略。
4. **降级策略**：推荐服务不可用时，自动降级为默认内容或规则推荐。
5. **性能可控**：支持批量预取推荐结果，避免发送时逐条调用推荐服务。
## 二、与现有功能的集成点
| 现有功能                              | 如何与动态内容集成                                                              |
| --------------------------------- | ---------------------------------------------------------------------- |
| **Content Asset（第13章）**           | 扩展 `body_text` / `body_json` 支持动态内容块语法                                 |
| **变量渲染引擎（第13章）**                  | 升级为支持**块级渲染**（Block Rendering），处理 `{{#recommend}}...{{/recommend}}` 语法 |
| **SendEmail/SendSMS Worker（第5章）** | 在渲染内容时调用推荐服务，替换动态内容块                                                   |
| **Loyalty 用户画像（第1章）**             | 读取用户属性、购买历史、浏览历史作为推荐输入                                                 |
| **Opportunity Intelligence（第2章）** | 推荐结果可作为“机会信号”反馈给机会发现模块                                                 |
| **Event System（第6章）**             | 推荐曝光（展示）和点击事件回流，用于优化推荐模型                                               |
| **A/B Testing（第15章）**             | 不同变体可配置不同的推荐策略                                                         |
## 三、数据模型设计
### 3.1 推荐策略配置表（campaign\_recommendation\_strategy）
```sql
-- ============================================================
-- 推荐策略配置（运营人员可配置不同推荐策略）
-- ============================================================
CREATE TABLE IF NOT EXISTS campaign_recommendation_strategy (
    id VARCHAR(64) PRIMARY KEY,
    program_code VARCHAR(32) NOT NULL,
    -- ===== 策略基本信息 =====
    strategy_name VARCHAR(255) NOT NULL,
    strategy_type VARCHAR(64) NOT NULL,                -- SIMILAR_PRODUCTS / FREQUENTLY_BOUGHT / POPULAR / PERSONALIZED_OFFER / DYNAMIC_COPY
    description TEXT,
    -- ===== 推荐配置 =====
    recommendation_config JSONB NOT NULL,              -- 策略特定配置
    -- 示例（SIMILAR_PRODUCTS）：
    -- {"lookback_days": 30, "max_items": 3, "fallback_category": "热销"}
    -- 示例（PERSONALIZED_OFFER）：
    -- {"tiers": [{"min_spend": 0, "discount": 5}, {"min_spend": 1000, "discount": 10}]}
    -- ===== 降级策略 =====
    fallback_strategy_id VARCHAR(64),                  -- 推荐服务不可用时的降级策略
    fallback_content TEXT,                             -- 或直接指定降级内容
    -- ===== 缓存配置 =====
    cache_ttl_seconds INT DEFAULT 3600,                -- 推荐结果缓存时间
    -- ===== 状态 =====
    enabled BOOLEAN DEFAULT TRUE,
    is_default BOOLEAN DEFAULT FALSE,
    -- ===== 元数据 =====
    created_by VARCHAR(64),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_crs_program ON campaign_recommendation_strategy(program_code);
CREATE INDEX idx_crs_type ON campaign_recommendation_strategy(strategy_type);
```
### 3.2 推荐结果缓存表（campaign\_recommendation\_cache）
```sql
-- ============================================================
-- 推荐结果缓存（批量预取，避免发送时逐条调用）
-- ============================================================
CREATE TABLE IF NOT EXISTS campaign_recommendation_cache (
    id VARCHAR(64) PRIMARY KEY,
    member_id VARCHAR(64) NOT NULL,
    strategy_id VARCHAR(64) NOT NULL,
    -- ===== 推荐结果 =====
    recommendation_result JSONB NOT NULL,              -- 推荐结果列表
    -- 示例：[{"product_id": "P001", "product_name": "产品A", "score": 0.92}, ...]
    -- ===== 缓存控制 =====
    cache_key VARCHAR(255),                            -- 用于缓存失效的唯一键
    expires_at TIMESTAMPTZ NOT NULL,
    -- ===== 元数据 =====
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_crc_member ON campaign_recommendation_cache(member_id);
CREATE INDEX idx_crc_strategy ON campaign_recommendation_cache(strategy_id);
CREATE INDEX idx_crc_expires ON campaign_recommendation_cache(expires_at);
CREATE UNIQUE INDEX idx_crc_unique ON campaign_recommendation_cache(member_id, strategy_id);
```
### 3.3 动态内容模板语法扩展（内容存储无表变更）
> 内容存储在 `campaign_content_asset.body_text` 中，通过**扩展模板语法**实现动态内容，无需新增表结构。
**扩展语法**：
html
运行
```
<!-- ===== 1. 简单变量替换（已有） ===== -->
<p>亲爱的 {{user_name}}，您好！</p>
<!-- ===== 2. 推荐内容块（新增） ===== -->
{{#recommend strategy="SIMILAR_PRODUCTS" max_items="3"}}
<div class="recommend-item">
    <img src="{{image_url}}" alt="{{product_name}}">
    <h4>{{product_name}}</h4>
    <p>¥{{price}}</p>
    <a href="{{detail_url}}">查看详情</a>
</div>
{{/recommend}}
<!-- ===== 3. 条件渲染（新增） ===== -->
{{#if user_tier == "GOLD"}}
    <p>尊贵的黄金会员，您专属的 8 折优惠码：{{coupon_code}}</p>
{{else}}
    <p>新客专享 9 折优惠码：{{coupon_code}}</p>
{{/if}}
<!-- ===== 4. 循环渲染（新增） ===== -->
{{#each order_items}}
    <tr>
        <td>{{product_name}}</td>
        <td>{{quantity}}</td>
        <td>¥{{price}}</td>
    </tr>
{{/each}}
```
## 四、后端 Service 设计
### 4.1 推荐引擎核心接口
```java
package com.loyalty.platform.campaign.recommendation;
import com.loyalty.platform.campaign.recommendation.model.RecommendationContext;
import com.loyalty.platform.campaign.recommendation.model.RecommendationResult;
/**
 * 推荐引擎接口（支持多种实现）
 */
public interface RecommendationEngine {
    /**
     * 获取推荐结果
     * 
     * @param memberId 会员ID
     * @param strategyId 策略ID
     * @param context 推荐上下文（可选的额外参数）
     * @return 推荐结果列表
     */
    List<RecommendationItem> recommend(String memberId, String strategyId, 
                                        RecommendationContext context);
    /**
     * 批量获取推荐结果（用于批量预取，提升性能）
     */
    Map<String, List<RecommendationItem>> batchRecommend(
            List<String> memberIds, String strategyId, RecommendationContext context);
    /**
     * 支持的策略类型
     */
    String getStrategyType();
}
```
### 4.2 推荐策略实现示例
```java
package com.loyalty.platform.campaign.recommendation.engine;
import com.loyalty.platform.campaign.recommendation.RecommendationEngine;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;
import java.util.*;
@Slf4j
@Component
@RequiredArgsConstructor
public class SimilarProductsEngine implements RecommendationEngine {
    private final CampaignOrderDetailFlatRepository orderDetailRepository;
    private final CampaignBehaviorEventRepository behaviorRepository;
    @Override
    public String getStrategyType() {
        return "SIMILAR_PRODUCTS";
    }
    @Override
    public List<RecommendationItem> recommend(String memberId, String strategyId,
                                               RecommendationContext context) {
        // 1. 获取策略配置
        RecommendationStrategy strategy = getStrategy(strategyId);
        JsonNode config = strategy.getRecommendationConfig();
        int lookbackDays = config.path("lookbackDays").asInt(30);
        int maxItems = config.path("maxItems").asInt(3);
        String fallbackCategory = config.path("fallbackCategory").asText("热销");
        // 2. 获取用户近期浏览/购买的商品
        List<String> viewedProducts = behaviorRepository.findViewedProducts(
                memberId, lookbackDays, 10
        );
        List<String> purchasedProducts = orderDetailRepository.findPurchasedProducts(
                memberId, lookbackDays, 10
        );
        // 3. 构建推荐候选
        Set<String> candidateProducts = new HashSet<>();
        // 3a. 基于浏览历史推荐相似商品
        if (!viewedProducts.isEmpty()) {
            List<String> similar = findSimilarProducts(viewedProducts);
            candidateProducts.addAll(similar);
        }
        // 3b. 基于购买历史推荐关联商品
        if (!purchasedProducts.isEmpty()) {
            List<String> frequentlyBought = findFrequentlyBoughtTogether(purchasedProducts);
            candidateProducts.addAll(frequentlyBought);
        }
        // 3c. 如果候选太少，使用热门商品作为降级
        if (candidateProducts.size() < maxItems) {
            List<String> popular = findPopularProducts(fallbackCategory, maxItems);
            candidateProducts.addAll(popular);
        }
        // 4. 评分排序
        List<RecommendationItem> results = scoreAndRank(candidateProducts, memberId);
        // 5. 截取 Top N
        return results.stream().limit(maxItems).collect(Collectors.toList());
    }
    @Override
    public Map<String, List<RecommendationItem>> batchRecommend(
            List<String> memberIds, String strategyId, RecommendationContext context) {
        // 批量推荐：逐个调用并聚合结果
        Map<String, List<RecommendationItem>> results = new HashMap<>();
        for (String memberId : memberIds) {
            results.put(memberId, recommend(memberId, strategyId, context));
        }
        return results;
    }
    // ===== 私有方法（产品相似度计算、协同过滤等） =====
    private List<String> findSimilarProducts(List<String> viewedProducts) {
        // 调用相似度服务或预计算表
        // 简化：从产品知识图谱或协同过滤服务获取
        return new ArrayList<>();
    }
    private List<String> findFrequentlyBoughtTogether(List<String> purchasedProducts) {
        // 调用关联规则挖掘服务
        return new ArrayList<>();
    }
    private List<String> findPopularProducts(String category, int limit) {
        // 查询全站热销商品
        return orderDetailRepository.findTopProductsByCategory(category, limit);
    }
    private List<RecommendationItem> scoreAndRank(Set<String> candidates, String memberId) {
        // 使用用户画像对候选商品进行个性化排序
        List<RecommendationItem> items = new ArrayList<>();
        for (String productId : candidates) {
            double score = calculatePersonalizedScore(productId, memberId);
            items.add(RecommendationItem.builder()
                    .productId(productId)
                    .score(score)
                    .reason("基于您的浏览记录推荐")
                    .build());
        }
        items.sort((a, b) -> Double.compare(b.getScore(), a.getScore()));
        return items;
    }
}
```
### 4.3 动态内容渲染引擎（升级）
```java
package com.loyalty.platform.campaign.content.rendering;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.github.mustachejava.Mustache;
import com.github.mustachejava.MustacheFactory;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;
import java.io.StringWriter;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
@Slf4j
@Component
@RequiredArgsConstructor
public class DynamicContentRenderer {
    private final RecommendationEngineRegistry engineRegistry;
    private final RecommendationCacheService cacheService;
    private final ObjectMapper objectMapper;
    private final MustacheFactory mustacheFactory;
    /**
     * 渲染动态内容（核心方法）
     * 
     * 流程：
     * 1. 解析模板中的动态内容块
     * 2. 调用推荐引擎获取数据
     * 3. 使用 Mustache 或类似模板引擎完成最终渲染
     */
    public String render(String template, String memberId, Map<String, Object> baseVariables) {
        // 1. 解析模板，提取动态内容块
        List<DynamicBlock> blocks = parseDynamicBlocks(template);
        // 2. 构建渲染上下文
        Map<String, Object> renderContext = new HashMap<>(baseVariables);
        // 3. 处理每个动态内容块
        for (DynamicBlock block : blocks) {
            Object renderedContent = renderBlock(block, memberId, baseVariables);
            renderContext.put(block.getPlaceholder(), renderedContent);
        }
        // 4. 使用 Mustache 渲染最终模板
        Mustache mustache = mustacheFactory.compile(new StringReader(template), "template");
        StringWriter writer = new StringWriter();
        mustache.execute(writer, renderContext);
        writer.flush();
        return writer.toString();
    }
    /**
     * 渲染单个动态内容块
     */
    private Object renderBlock(DynamicBlock block, String memberId, 
                                Map<String, Object> context) {
        String blockType = block.getType();
        switch (blockType) {
            case "recommend":
                return renderRecommendationBlock(block, memberId, context);
            case "if":
                return renderConditionalBlock(block, memberId, context);
            case "each":
                return renderLoopBlock(block, memberId, context);
            default:
                // 未知块类型，返回空字符串
                return "";
        }
    }
    /**
     * 渲染推荐内容块
     */
    private Object renderRecommendationBlock(DynamicBlock block, String memberId,
                                              Map<String, Object> context) {
        JsonNode config = block.getConfig();
        String strategyId = config.path("strategy").asText();
        int maxItems = config.path("max_items").asInt(3);
        // 1. 尝试从缓存获取
        List<RecommendationItem> items = cacheService.getCachedRecommendations(
                memberId, strategyId
        );
        if (items == null || items.isEmpty()) {
            // 2. 缓存未命中，调用推荐引擎
            RecommendationEngine engine = engineRegistry.getEngine(strategyId);
            if (engine == null) {
                log.warn("Recommendation engine not found for strategy: {}", strategyId);
                return "";
            }
            items = engine.recommend(memberId, strategyId, RecommendationContext.builder()
                    .maxItems(maxItems)
                    .additionalParams(config)
                    .build());
            // 3. 缓存结果
            if (items != null && !items.isEmpty()) {
                cacheService.cacheRecommendations(memberId, strategyId, items);
            }
        }
        if (items == null || items.isEmpty()) {
            return "";
        }
        // 4. 将推荐项转换为 Map 列表（供模板渲染）
        List<Map<String, Object>> itemMaps = items.stream()
                .map(item -> Map.of(
                        "product_id", item.getProductId(),
                        "product_name", item.getProductName(),
                        "price", item.getPrice(),
                        "image_url", item.getImageUrl(),
                        "detail_url", item.getDetailUrl(),
                        "score", item.getScore(),
                        "reason", item.getReason()
                ))
                .collect(Collectors.toList());
        return itemMaps;
    }
    /**
     * 解析动态内容块
     * 
     * 支持的语法：
     * - {{#recommend strategy="xxx" max_items="3"}}...{{/recommend}}
     * - {{#if condition}}...{{else}}...{{/if}}
     * - {{#each list}}...{{/each}}
     */
    private List<DynamicBlock> parseDynamicBlocks(String template) {
        // 实现正则解析或使用 Mustache 自定义标签
        // 简化为使用正则解析
        List<DynamicBlock> blocks = new ArrayList<>();
        Pattern pattern = Pattern.compile(
            "\\{\\{\\s*#(recommend|if|each)\\s+([^}]*)\\}\\}(.*?)\\{\\{\\s*\\/\\1\\s*\\}\\}",
            Pattern.DOTALL
        );
        Matcher matcher = pattern.matcher(template);
        while (matcher.find()) {
            String type = matcher.group(1);
            String params = matcher.group(2);
            String content = matcher.group(3);
            DynamicBlock block = DynamicBlock.builder()
                    .type(type)
                    .config(parseConfig(params))
                    .content(content)
                    .placeholder("{{{" + type + "_" + blocks.size() + "}}}")
                    .build();
            blocks.add(block);
        }
        return blocks;
    }
    private JsonNode parseConfig(String params) {
        // 解析 key="value" 格式的参数
        Map<String, Object> config = new HashMap<>();
        Pattern pattern = Pattern.compile("(\\w+)\\s*=\\s*\"([^\"]*)\"");
        Matcher matcher = pattern.matcher(params);
        while (matcher.find()) {
            config.put(matcher.group(1), matcher.group(2));
        }
        return objectMapper.valueToTree(config);
    }
}
```
### 4.4 推荐缓存服务
```java
package com.loyalty.platform.campaign.recommendation;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.UUID;
@Slf4j
@Service
@RequiredArgsConstructor
public class RecommendationCacheService {
    private final RecommendationCacheRepository cacheRepository;
    /**
     * 获取缓存的推荐结果
     */
    public List<RecommendationItem> getCachedRecommendations(String memberId, String strategyId) {
        Optional<RecommendationCache> cached = cacheRepository
                .findByMemberIdAndStrategyIdAndExpiresAtAfter(memberId, strategyId, Instant.now());
        if (cached.isPresent()) {
            JsonNode result = cached.get().getRecommendationResult();
            // 将 JSON 解析为 RecommendationItem 列表
            return parseRecommendationItems(result);
        }
        return null;
    }
    /**
     * 缓存推荐结果
     */
    public void cacheRecommendations(String memberId, String strategyId, 
                                      List<RecommendationItem> items) {
        // 获取策略的 TTL 配置
        int ttlSeconds = getStrategyTTL(strategyId);
        RecommendationCache cache = RecommendationCache.builder()
                .id(UUID.randomUUID().toString())
                .memberId(memberId)
                .strategyId(strategyId)
                .recommendationResult(JsonUtil.toJsonNode(items))
                .cacheKey(memberId + ":" + strategyId)
                .expiresAt(Instant.now().plus(ttlSeconds, ChronoUnit.SECONDS))
                .build();
        cacheRepository.save(cache);
    }
    /**
     * 批量预取推荐结果（用于大批量发送前的预热）
     */
    public void preloadRecommendations(List<String> memberIds, String strategyId) {
        // 过滤出未缓存的会员
        List<String> uncachedMemberIds = memberIds.stream()
                .filter(mid -> !cacheRepository.existsByMemberIdAndStrategyIdAndExpiresAtAfter(
                        mid, strategyId, Instant.now()))
                .collect(Collectors.toList());
        if (uncachedMemberIds.isEmpty()) {
            return;
        }
        // 批量调用推荐引擎
        RecommendationEngine engine = engineRegistry.getEngine(strategyId);
        Map<String, List<RecommendationItem>> results = engine.batchRecommend(
                uncachedMemberIds, strategyId, new RecommendationContext());
        // 缓存结果
        for (Map.Entry<String, List<RecommendationItem>> entry : results.entrySet()) {
            cacheRecommendations(entry.getKey(), strategyId, entry.getValue());
        }
        log.info("Preloaded recommendations for {} members, strategy: {}",
                 uncachedMemberIds.size(), strategyId);
    }
}
```
### 4.5 集成到发送 Worker（SendEmailWorker 升级）
```java
@Component
public class SendEmailWorker extends BaseCampaignWorker {
    @Autowired
    private DynamicContentRenderer contentRenderer;
    @Autowired
    private RecommendationCacheService cacheService;
    @Override
    protected Map<String, Object> doExecute(Map<String, Object> variables) throws Exception {
        List<String> memberIds = getStringList(variables, "memberIds");
        String assetId = getString(variables, "assetId");
        String strategyId = getString(variables, "strategyId");  // 新增：推荐策略ID
        // 1. 批量预取推荐结果（性能优化）
        if (strategyId != null && !memberIds.isEmpty()) {
            cacheService.preloadRecommendations(memberIds, strategyId);
        }
        // 2. 逐条渲染并发送
        for (String memberId : memberIds) {
            // 2a. 获取会员数据（已有）
            Member member = memberService.findByMemberId(memberId);
            // 2b. 构建基础变量（已有）
            Map<String, Object> baseVariables = buildBaseVariables(member);
            // 2c. 动态渲染内容（新增）
            String renderedContent = contentRenderer.render(
                    getAssetBody(assetId),
                    memberId,
                    baseVariables
            );
            // 2d. 发送邮件（原有）
            channelService.sendEmail(member.getEmail(), renderedContent);
            // 2e. 记录推荐曝光事件（用于模型反馈）
            if (strategyId != null) {
                eventPublisher.publishRecommendationExposure(
                        memberId, strategyId, assetId, renderedContent
                );
            }
        }
        return buildResult(memberIds.size());
    }
}
```
## 五、前端界面设计
### 5.1 素材编辑中的动态内容块
```text
┌─ 素材编辑: 个性化推荐邮件 ─────────────────────────────────────────────────┐
│  状态: DRAFT  │  版本: v2  │  创建: 2026-06-28                           │
├──────────────────────────────────────────────────────────────────────────────┤
│  ┌─ 内容编辑 ─────────────────────────────────────────────────────────────┐ │
│  │  主题: [{{user_name}}，为您推荐今日好物！]                            │ │
│  │                                                                        │ │
│  │  正文 (HTML):                                                         │ │
│  │  ┌─────────────────────────────────────────────────────────────────┐ │ │
│  │  │ <html>                                                         │ │ │
│  │  │ <body>                                                         │ │ │
│  │  │   <h1>亲爱的 {{user_name}}</h1>                                │ │ │
│  │  │   <p>根据您的浏览记录，我们为您推荐：</p>                      │ │ │
│  │  │   {{#recommend strategy="SIMILAR_PRODUCTS" max_items="3"}}     │ │ │
│  │  │   <div class="product">                                        │ │ │
│  │  │     <img src="{{image_url}}">                                 │ │ │
│  │  │     <h4>{{product_name}}</h4>                                 │ │ │
│  │  │     <p>¥{{price}}</p>                                         │ │ │
│  │  │     <a href="{{detail_url}}">查看详情</a>                     │ │ │
│  │  │   </div>                                                       │ │ │
│  │  │   {{/recommend}}                                               │ │ │
│  │  │ </body>                                                        │ │ │
│  │  │ </html>                                                        │ │ │
│  │  └─────────────────────────────────────────────────────────────────┘ │ │
│  │                                                                        │ │
│  │  📋 检测到动态块: recommend (SIMILAR_PRODUCTS)                        │ │
│  │     预览时需选择测试会员                                              │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
│  ┌─ 预览（基于测试会员） ─────────────────────────────────────────────────┐ │
│  │  选择会员: [M_12345 (张三) ▼]  [🔍 预览]                             │ │
│  │  ┌─────────────────────────────────────────────────────────────────┐ │ │
│  │  │  主题: 张三，为您推荐今日好物！                                 │ │ │
│  │  │  正文:                                                         │ │ │
│  │  │  亲爱的 张三                                                   │ │ │
│  │  │  根据您的浏览记录，我们为您推荐：                               │ │ │
│  │  │  ┌───────┐  ┌───────┐  ┌───────┐                              │ │ │
│  │  │  │ 产品A  │  │ 产品B  │  │ 产品C  │                              │ │ │
│  │  │  │ ¥299  │  │ ¥159  │  │ ¥899  │                              │ │ │
│  │  │  └───────┘  └───────┘  └───────┘                              │ │ │
│  │  └─────────────────────────────────────────────────────────────────┘ │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
│  [💾 保存草稿] [📤 提交审批] [🧪 测试发送]                                 │
└──────────────────────────────────────────────────────────────────────────────┘
```
### 5.2 推荐策略配置
```text
┌─ 推荐策略配置 ──────────────────────────────────────────────────────────────┐
│  [+ 新建策略]  [筛选: 全部类型 ▼]                                         │
├──────────────────────────────────────────────────────────────────────────────┤
│  ┌─ 策略列表 ─────────────────────────────────────────────────────────────┐ │
│  │  策略名称          │ 类型                │ 状态  │ 默认 │ 操作      │ │
│  │  看了又看          │ SIMILAR_PRODUCTS    │ ✅   │ ✅   │ [编辑]    │ │
│  │  关联购买          │ FREQUENTLY_BOUGHT   │ ✅   │      │ [编辑]    │ │
│  │  热门推荐          │ POPULAR             │ ✅   │      │ [编辑]    │ │
│  │  个性化优惠        │ PERSONALIZED_OFFER  │ ⚪   │      │ [编辑]    │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
│  ┌─ 策略配置: 看了又看 ───────────────────────────────────────────────────┐ │
│  │  策略名称: [看了又看               ]                                   │ │
│  │  策略类型: [SIMILAR_PRODUCTS ▼]                                       │ │
│  │                                                                        │ │
│  │  ┌─ 推荐参数 ───────────────────────────────────────────────────────┐ │ │
│  │  │  回溯天数: [ 30 ] 天                                             │ │ │
│  │  │  最多推荐: [ 3 ] 个                                              │ │ │
│  │  │  降级类别: [ 热销 ]                                              │ │ │
│  │  │  缓存时间: [ 3600 ] 秒                                           │ │ │
│  │  └──────────────────────────────────────────────────────────────────┘ │ │
│  │                                                                        │ │
│  │  ┌─ 降级策略 ───────────────────────────────────────────────────────┐ │ │
│  │  │  ○ 使用热门商品                                                   │ │ │
│  │  │  ● 使用指定内容:                                                 │ │ │
│  │  │  ┌────────────────────────────────────────────────────────────┐ │ │ │
│  │  │  │ <p>今日推荐：<a href="/hot">查看热门商品</a></p>          │ │ │ │
│  │  │  └────────────────────────────────────────────────────────────┘ │ │ │
│  │  └──────────────────────────────────────────────────────────────────┘ │ │
│  │                                                                        │ │
│  │  [保存] [取消]                                                         │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────────────────┘
```
## 六、API 设计
### 6.1 获取推荐结果（供预览使用）
```json
GET /api/campaign/recommendation/preview?memberId=M_12345&strategyId=sim_001&maxItems=3
{
    "code": 0,
    "data": {
        "memberId": "M_12345",
        "strategyId": "sim_001",
        "strategyName": "看了又看",
        "items": [
            {
                "productId": "P001",
                "productName": "无线蓝牙耳机",
                "price": 299.00,
                "imageUrl": "https://cdn.example.com/p001.jpg",
                "detailUrl": "https://shop.example.com/p001",
                "score": 0.92,
                "reason": "基于您浏览的同类商品推荐"
            },
            {
                "productId": "P002",
                "productName": "运动手环",
                "price": 159.00,
                "imageUrl": "https://cdn.example.com/p002.jpg",
                "detailUrl": "https://shop.example.com/p002",
                "score": 0.85,
                "reason": "购买该商品的用户也看了"
            }
        ]
    }
}
```
### 6.2 配置推荐策略
```json
POST /api/campaign/recommendation/strategy
{
    "programCode": "BRAND_A",
    "strategyName": "看了又看",
    "strategyType": "SIMILAR_PRODUCTS",
    "recommendationConfig": {
        "lookback_days": 30,
        "max_items": 3,
        "fallback_category": "热销"
    },
    "cache_ttl_seconds": 3600,
    "is_default": true
}
```
## 七、性能优化策略
| 场景                  | 策略                    |
| ------------------- | --------------------- |
| **大批量发送（>10,000人）** | 发送前批量预取推荐结果，存入缓存表     |
| **小批量发送（<100人）**    | 实时调用推荐引擎，但设置超时（500ms） |
| **推荐服务不可用**         | 自动降级为默认内容（由策略配置）      |
| **缓存过期**            | 按策略配置的 TTL 自动过期       |
| **推荐结果变化**          | 支持手动清除缓存（运营操作）        |
## 八、与现有模块的集成点总结
| 现有模块                              | 集成方式         | 变更点                |
| --------------------------------- | ------------ | ------------------ |
| **Content Asset（第13章）**           | 扩展模板语法支持动态块  | `body_text` 解析逻辑升级 |
| **SendEmail/SendSMS Worker（第5章）** | 渲染时调用动态内容渲染器 | 新增依赖注入             |
| **Loyalty 用户画像**                  | 读取会员属性、购买历史  | 复用现有数据，无变更         |
| **Event System（第6章）**             | 推荐曝光/点击事件    | 新增事件类型             |
| **Opportunity Intelligence（第2章）** | 推荐结果作为兴趣信号   | 可选集成               |
## 九、实施检查清单
* 执行 DDL：`campaign_recommendation_strategy` 表
* 执行 DDL：`campaign_recommendation_cache` 表
* 实现 `RecommendationEngine` 接口及多种策略实现
* 实现 `DynamicContentRenderer`（动态内容渲染）
* 实现 `RecommendationCacheService`（缓存管理）
* 升级 `SendEmailWorker` / `SendSMSWorker` 集成渲染
* 前端：素材编辑支持动态内容块语法高亮
* 前端：推荐策略配置页面
* 前端：预览时支持选择测试会员
* 实现批量预取推荐（发送前预热）
* 实现降级策略
* 集成推荐曝光/点击事件追踪
## 十、总结
本设计为 Campaign Tools 补齐了**动态内容与个性化推荐能力**：
| 能力             | 实现方式                                       |
| -------------- | ------------------------------------------ |
| **动态推荐内容块**    | 扩展素材模板语法 `{{#recommend}}...{{/recommend}}` |
| **多种推荐策略**     | 可插拔的 `RecommendationEngine` 接口，支持多种策略      |
| **推荐结果缓存**     | `campaign_recommendation_cache` 表 + 批量预取   |
| **降级策略**       | 推荐服务不可用时自动切换为默认内容                          |
| **与现有内容系统集成**  | 渲染引擎升级，不改变现有素材存储结构                         |
| **与 A/B 测试兼容** | 不同变体可配置不同推荐策略                              |
**关键优势**：
1. **复用现有内容引擎**：仅升级渲染逻辑，素材存储结构不变。
2. **策略可插拔**：新增推荐策略只需实现接口，无需修改核心代码。
3. **性能可控**：缓存 + 批量预取保证大规模发送时的性能。
4. **降级保障**：推荐服务异常不影响 Campaign 发送。
