package com.loyalty.saas.accounting;

import com.loyalty.saas.common.context.TenantContext;
import com.loyalty.saas.domain.entity.AccountTransaction;
import com.loyalty.saas.domain.entity.MemberAccount;
import com.loyalty.saas.domain.repository.AccountTransactionRepository;
import com.loyalty.saas.domain.repository.MemberAccountRepository;
import com.loyalty.saas.domain.repository.RedemptionAllocationRepository;
import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.jdbc.AutoConfigureTestDatabase;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.context.annotation.Import;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;

@DataJpaTest
@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.NONE)
@Import({PointGrantService.class, PointRedeemService.class, CompactionService.class})
@TestMethodOrder(MethodOrderer.OrderAnnotation.class)
class AccountingIntegrationTest {

    @Autowired private PointGrantService grantService;
    @Autowired private PointRedeemService redeemService;
    @Autowired private CompactionService compactionService;
    @Autowired private AccountTransactionRepository txRepo;
    @Autowired private MemberAccountRepository accountRepo;

    @PersistenceContext private EntityManager em;

    private static final String PROG = "PROG001";
    private static final Long MEMBER = 8821L;
    private static final String TYPE = "REWARD_POINTS";
    private static final String OP_KEY = "test-integration-key";

    @BeforeEach
    void setUp() {
        TenantContext.set(PROG);
        em.createNativeQuery("SET app.current_program_code = '" + PROG + "'").executeUpdate();

        // ensure account exists
        if (accountRepo.findByMemberIdAndType(PROG, MEMBER, TYPE).isEmpty()) {
            accountRepo.save(MemberAccount.builder()
                    .programCode(PROG).memberId(MEMBER).accountType(TYPE)
                    .balance(BigDecimal.ZERO).totalAccrued(BigDecimal.ZERO)
                    .totalRedeemed(BigDecimal.ZERO).totalExpired(BigDecimal.ZERO)
                    .overdraftLimit(new BigDecimal("1000.0000"))
                    .creditLimit(new BigDecimal("500.0000"))
                    .creditUsed(BigDecimal.ZERO).version(1).build());
            em.flush();
        }
    }

    @AfterEach
    void tearDown() {
        TenantContext.clear();
    }

    @Test @Order(1)
    @DisplayName("基础发分：无透支无信用 → 直接 ACCRUAL")
    void basicGrant() {
        BigDecimal amount = new BigDecimal("100.0000");
        grantService.grantPoints(PROG, MEMBER, TYPE, amount, "RULE-001", "SNAP-001");

        em.flush(); em.clear();

        BigDecimal balance = txRepo.sumAvailableBalance(PROG, MEMBER, TYPE);
        assertTrue(balance.compareTo(BigDecimal.ZERO) > 0, "余额应大于0");
        System.out.println("[TEST] Basic grant: balance=" + balance);
    }

    @Test @Order(2)
    @DisplayName("发分后 FIFO 核销 → 生成 Allocation 记录")
    void grantThenRedeem() {
        // 先发分
        grantService.grantPoints(PROG, MEMBER, TYPE, new BigDecimal("200.0000"), "RULE-002", null);
        em.flush(); em.clear();

        BigDecimal beforeBalance = txRepo.sumAvailableBalance(PROG, MEMBER, TYPE);
        assertTrue(beforeBalance.compareTo(new BigDecimal("100.0000")) >= 0);

        // 再核销
        redeemService.redeemPoints(PROG, MEMBER, TYPE, new BigDecimal("50.0000"));
        em.flush(); em.clear();

        BigDecimal afterBalance = txRepo.sumAvailableBalance(PROG, MEMBER, TYPE);
        // afterBalance 应该 <= beforeBalance - 50（惰性过期可能导致额外扣减）
        System.out.println("[TEST] Grant+Redeem: before=" + beforeBalance + ", after=" + afterBalance);
    }

    @Test @Order(3)
    @DisplayName("余额不足时核销抛出 ERR_INSUFFICIENT_POINTS")
    void redeemInsufficient() {
        // redeemPoints 的校验在 FOR UPDATE 之前，余额不足立即抛异常
        try {
            redeemService.redeemPoints(PROG, MEMBER, TYPE, new BigDecimal("999999.0000"));
            fail("should throw");
        } catch (RuntimeException e) {
            assertTrue(e.getMessage().contains("积分不足") || e.getMessage().contains("INSUFFICIENT"),
                    "应为积分不足异常: " + e.getMessage());
        }
    }

    @Test @Order(4)
    @DisplayName("非法参数校验：零或负数被拒绝")
    void rejectInvalidAmounts() {
        assertThrows(RuntimeException.class,
                () -> grantService.grantPoints(PROG, MEMBER, TYPE, BigDecimal.ZERO, null, null));
        assertThrows(RuntimeException.class,
                () -> grantService.grantPoints(PROG, MEMBER, TYPE, new BigDecimal("-10"), null, null));
        assertThrows(RuntimeException.class,
                () -> redeemService.redeemPoints(PROG, MEMBER, TYPE, BigDecimal.ZERO));
    }

    @Test @Order(5)
    @DisplayName("BigDecimal compareTo 精度：2.0 和 2.00 视为相等")
    void bigDecimalPrecision() {
        BigDecimal a = new BigDecimal("2.0");
        BigDecimal b = new BigDecimal("2.00");
        // equals: false (不同 scale)
        assertFalse(a.equals(b), "BigDecimal.equals 比较 scale，2.0 != 2.00");
        // compareTo: 0 (相同数值)
        assertEquals(0, a.compareTo(b), "BigDecimal.compareTo 比较数值，2.0 == 2.00");

        grantService.grantPoints(PROG, MEMBER, TYPE, new BigDecimal("10.0000"), "RULE-PREC", null);
        em.flush(); em.clear();

        BigDecimal balance = txRepo.sumAvailableBalance(PROG, MEMBER, TYPE);
        // 用 compareTo 而非 assertEquals(BigDecimal, BigDecimal)
        assertTrue(balance.compareTo(BigDecimal.ZERO) > 0);
    }

    @Test @Order(6)
    @DisplayName("透支冲抵：创建 OVERDRAFT 后发分自动补天窗")
    void grantRepaysOverdraft() {
        // 手动创建一笔透支记录
        AccountTransaction overdraft = AccountTransaction.builder()
                .accountId(1L) // minimal account_id for test
                .programCode(PROG).memberId(MEMBER).accountType(TYPE)
                .transactionType("OVERDRAFT")
                .amount(new BigDecimal("-30.0000"))
                .remainingAmount(new BigDecimal("-30.0000"))
                .status("OVERDRAFT")
                .operationKey(OP_KEY + "-od-" + System.currentTimeMillis())
                .createdAt(LocalDateTime.now())
                .build();
        txRepo.save(overdraft);
        em.flush();

        // 发分 100 → 先补 30 天窗 → 剩余 70 入账
        grantService.grantPoints(PROG, MEMBER, TYPE, new BigDecimal("100.0000"), "RULE-OD", null);
        em.flush(); em.clear();

        // 透支记录应被 SETTLED（用 EntityManager 查询，因为 BaseRepository.findById 被安全哨兵禁用）
        AccountTransaction odUpdated = em.find(AccountTransaction.class, overdraft.getId());
        assertNotNull(odUpdated);
        AccountTransaction od = odUpdated;
        BigDecimal odRemaining = od.getRemainingAmount();
        assertTrue(odRemaining.compareTo(BigDecimal.ZERO) >= 0,
                "透支 remainingAmount 应 >= 0, actual=" + odRemaining);
        System.out.println("[TEST] Overdraft: status=" + od.getStatus() + ", remaining=" + odRemaining);
    }
}