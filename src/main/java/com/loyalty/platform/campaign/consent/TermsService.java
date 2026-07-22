package com.loyalty.platform.campaign.consent;

import com.loyalty.platform.common.exception.BusinessException;
import com.loyalty.platform.common.util.HtmlSanitizer;
import com.loyalty.platform.domain.entity.campaign.TermsAcceptance;
import com.loyalty.platform.domain.entity.campaign.TermsMaster;
import com.loyalty.platform.domain.repository.campaign.TermsAcceptanceRepository;
import com.loyalty.platform.domain.repository.campaign.TermsMasterRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.List;
import java.util.Optional;

/**
 * 法律/服务同意（Terms & Conditions）核心服务。
 *
 * <p>与 {@link ConsentService}（营销偏好管理）不同，本服务专注于强制性的法律/服务同意：
 * 俱乐部章程、隐私政策、服务条款等。不接受则无法注册或继续使用服务。
 *
 * <p>核心流程：
 * <ol>
 *   <li>管理员创建/激活条款版本</li>
 *   <li>会员注册时强制接受最新章程</li>
 *   <li>登录时拦截器检查是否已接受最新版本</li>
 *   <li>章程更新时，旧版本记录保留，要求会员重新同意</li>
 * </ol>
 */
@Service
@Transactional
public class TermsService {

    private static final Logger log = LoggerFactory.getLogger(TermsService.class);

    private final TermsAcceptanceRepository acceptanceRepo;
    private final TermsMasterRepository masterRepo;

    public TermsService(TermsAcceptanceRepository acceptanceRepo,
                        TermsMasterRepository masterRepo) {
        this.acceptanceRepo = acceptanceRepo;
        this.masterRepo = masterRepo;
    }

    // ========================================================================
    // 会员端：检查与接受
    // ========================================================================

    /**
     * 检查用户是否已接受最新版本的指定条款。
     * 若未接受，应引导用户重新同意。
     *
     * @param memberId  会员ID
     * @param termsType 条款类型（CHARTER / PRIVACY_POLICY / TERMS_OF_SERVICE / DATA_PROCESSING）
     * @return true 表示已接受最新版本（或无版本要求）
     */
    @Transactional(readOnly = true)
    public boolean isLatestTermsAccepted(String memberId, String termsType) {
        // 1. 查询当前生效的版本
        TermsMaster master = getActiveMaster(termsType);
        if (master == null) return true; // 无版本要求

        // 2. 查询用户是否接受了该版本
        Optional<TermsAcceptance> acceptance = acceptanceRepo.findByMemberTypeAndVersion(
                memberId, termsType, master.getTermsVersion());
        return acceptance.isPresent() && acceptance.get().isAccepted();
    }

    /**
     * 执行接受操作（注册或更新章程时调用）。
     *
     * @param memberId  会员ID
     * @param termsType 条款类型
     * @param source    来源（WEB_APP / MOBILE_APP / MINI_PROGRAM / ADMIN）
     * @param ip        客户端IP
     * @param userAgent 浏览器/设备 User-Agent
     * @return 接受记录
     */
    @Transactional
    public TermsAcceptance acceptTerms(String memberId, String termsType,
                                        String source, String ip, String userAgent) {
        TermsMaster master = getActiveMaster(termsType);
        if (master == null) {
            throw new BusinessException("ERR_TERMS_TYPE_NOT_FOUND",
                    "无效的条款类型或没有生效的条款版本: " + termsType);
        }

        // 检查是否已有记录（upsert 模式）
        Optional<TermsAcceptance> existing = acceptanceRepo.findByMemberTypeAndVersion(
                memberId, termsType, master.getTermsVersion());

        TermsAcceptance acceptance;
        if (existing.isPresent()) {
            acceptance = existing.get();
        } else {
            acceptance = new TermsAcceptance();
            acceptance.setMemberId(memberId);
            acceptance.setProgramCode(master.getProgramCode());
            acceptance.setTermsType(termsType);
            acceptance.setTermsVersion(master.getTermsVersion());
        }

        acceptance.setAccepted(true);
        acceptance.setAcceptedAt(Instant.now());
        acceptance.setAcceptedIp(ip);
        acceptance.setUserAgent(userAgent);
        acceptance.setSource(source != null ? source : "WEB_APP");
        acceptance.setUpdatedAt(Instant.now());

        acceptance = acceptanceRepo.save(acceptance);
        log.info("Terms accepted: memberId={}, type={}, version={}, source={}",
                memberId, termsType, master.getTermsVersion(), source);
        return acceptance;
    }

    /**
     * 获取当前生效的条款内容（用于前端展示）。
     */
    @Transactional(readOnly = true)
    public TermsMaster getActiveTerms(String termsType) {
        return getActiveMaster(termsType);
    }

    /**
     * 获取会员的接受历史。
     */
    @Transactional(readOnly = true)
    public List<TermsAcceptance> getAcceptanceHistory(String memberId) {
        return acceptanceRepo.findByMemberId(memberId);
    }

    // ========================================================================
    // 管理员端：版本管理
    // ========================================================================

    /**
     * 创建新条款版本。
     * 自动将同类型的旧活动版本设为失效。
     */
    @Transactional
    public TermsMaster createTermsVersion(TermsMaster newVersion) {
        // 1. 将旧活动版本失效
        List<TermsMaster> oldActive = masterRepo.findActiveByTermsType(newVersion.getTermsType());
        for (TermsMaster old : oldActive) {
            old.setActive(false);
            masterRepo.save(old);
            log.info("Deactivated old terms version: type={}, version={}",
                    old.getTermsType(), old.getTermsVersion());
        }

        // 2. XSS 防护：净化条款内容 HTML
        if (newVersion.getTermsContent() != null) {
            newVersion.setTermsContent(HtmlSanitizer.sanitize(newVersion.getTermsContent()));
        }

        // 3. 保存新版本
        newVersion.setActive(true);
        if (newVersion.getReleasedAt() == null) {
            newVersion.setReleasedAt(Instant.now());
        }
        TermsMaster saved = masterRepo.save(newVersion);
        log.info("Created new terms version: type={}, version={}, effectiveDate={}",
                saved.getTermsType(), saved.getTermsVersion(), saved.getEffectiveDate());
        return saved;
    }

    /**
     * 停用指定条款版本。
     */
    @Transactional
    public void deactivateTerms(Long id) {
        TermsMaster master = masterRepo.findById(id)
                .orElseThrow(() -> new BusinessException("ERR_TERMS_NOT_FOUND",
                        "条款版本不存在: id=" + id));
        master.setActive(false);
        masterRepo.save(master);
        log.info("Deactivated terms: id={}, type={}, version={}",
                id, master.getTermsType(), master.getTermsVersion());
    }

    /**
     * 查询所有条款版本（按类型筛选）。
     */
    @Transactional(readOnly = true)
    public List<TermsMaster> getVersions(String termsType) {
        if (termsType != null && !termsType.isBlank()) {
            return masterRepo.findByTermsType(termsType);
        }
        return masterRepo.findAllActive();
    }

    /**
     * 获取指定类型+版本的接受记录列表（管理员审计）。
     */
    @Transactional(readOnly = true)
    public List<TermsAcceptance> getAcceptanceRecords(String termsType, String termsVersion) {
        return acceptanceRepo.findByTypeAndVersion(termsType, termsVersion);
    }

    // ========================================================================
    // 内部工具方法
    // ========================================================================

    private TermsMaster getActiveMaster(String termsType) {
        return masterRepo.findActiveByType(termsType).orElse(null);
    }
}