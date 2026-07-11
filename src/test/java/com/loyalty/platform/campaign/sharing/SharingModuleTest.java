package com.loyalty.platform.campaign.sharing;

import com.loyalty.platform.domain.entity.campaign.*;
import com.loyalty.platform.domain.repository.campaign.*;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.*;
import org.mockito.junit.jupiter.MockitoExtension;
import java.math.BigDecimal;
import java.util.*;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
@DisplayName("Multi-Program Sharing Module Tests")
class SharingModuleTest {

    @Mock private SharingPolicyRepository policyRepository;
    @Mock private GlobalBlacklistRepository blacklistRepository;
    @Mock private CrossProgramRelationRepository relationRepository;
    private SharingPolicyService service;

    @BeforeEach void setUp() {
        service = new SharingPolicyService(policyRepository, blacklistRepository, relationRepository);
    }

    @Nested @DisplayName("可访问性检查")
    class AccessTests {
        @Test @DisplayName("同Program → 始终可访问")
        void shouldAllowSameProgram() {
            assertTrue(service.canAccess("PROG1", "PROG1"));
        }

        @Test @DisplayName("有targetPrograms共享策略 → 可访问")
        void shouldAllowWithPolicy() {
            SharingPolicy p = SharingPolicy.builder().id("P1").programCode("PROG2")
                    .sharingScope("SELECTIVE").targetPrograms(new String[]{"PROG1"})
                    .sharedResourceTypes(new String[]{"CONTENT_ASSET"})
                    .enabled(true).build();
            when(policyRepository.findByProgramCodeAndEnabledTrue("PROG2")).thenReturn(List.of(p));
            assertTrue(service.canAccess("PROG1", "PROG2"));
        }

        @Test @DisplayName("无共享策略 → 不可访问")
        void shouldDenyWithoutPolicy() {
            when(policyRepository.findByProgramCodeAndEnabledTrue("PROG2")).thenReturn(List.of());
            assertFalse(service.canAccess("PROG1", "PROG2"));
        }

        @Test @DisplayName("getAccessiblePrograms → 包含自身+共享")
        void shouldIncludeOwnAndShared() {
            SharingPolicy p = SharingPolicy.builder().id("P1").programCode("PROG3")
                    .sharingScope("GLOBAL").targetPrograms(new String[]{"PROG1"})
                    .sharedResourceTypes(new String[]{"BLACKLIST"}).enabled(true).build();
            when(policyRepository.findByEnabledTrue()).thenReturn(List.of(p));
            Set<String> r = service.getAccessiblePrograms("PROG1", "BLACKLIST");
            assertTrue(r.contains("PROG1"));
            assertTrue(r.contains("PROG3"));
        }
    }

    @Nested @DisplayName("策略管理")
    class PolicyTests {
        @Test @DisplayName("savePolicy → 自动生成ID")
        void shouldAutoGenerateId() {
            SharingPolicy p = SharingPolicy.builder().programCode("P1")
                    .sharingScope("GLOBAL").sharedResourceTypes(new String[]{"BLACKLIST"}).enabled(true).build();
            when(policyRepository.save(any())).thenReturn(p);
            assertNotNull(service.savePolicy(p));
            verify(policyRepository).save(p);
        }

        @Test @DisplayName("getPolicies → 按programCode")
        void shouldGetPolicies() {
            when(policyRepository.findByProgramCodeAndEnabledTrue("P1")).thenReturn(List.of());
            assertTrue(service.getPolicies("P1").isEmpty());
        }
    }

    @Nested @DisplayName("全局黑名单")
    class BlacklistTests {
        @Test @DisplayName("在黑名单中 → true")
        void shouldDetectBlacklisted() {
            when(blacklistRepository.existsByMemberIdAndIsActiveTrue("M_BAD")).thenReturn(true);
            assertTrue(service.isGloballyBlacklisted("M_BAD"));
        }

        @Test @DisplayName("不在黑名单 → false")
        void shouldAllowNonBlacklisted() {
            when(blacklistRepository.existsByMemberIdAndIsActiveTrue("M_OK")).thenReturn(false);
            assertFalse(service.isGloballyBlacklisted("M_OK"));
        }

        @Test @DisplayName("addBlacklist → 保存+返回")
        void shouldAddToBlacklist() {
            GlobalBlacklist b = GlobalBlacklist.builder().id("B1").memberId("M_BAD")
                    .sourceProgram("P1").sourceType("MANUAL").reason("Abuse").isActive(true).build();
            when(blacklistRepository.save(any())).thenReturn(b);
            GlobalBlacklist saved = service.addBlacklist("M_BAD", "P1", "Abuse");
            assertNotNull(saved);
            assertEquals("M_BAD", saved.getMemberId());
        }
    }

    @Nested @DisplayName("跨Program关系")
    class CrossProgramTests {
        @Test @DisplayName("addRelation → 保存")
        void shouldAddRelation() {
            CrossProgramRelation rel = CrossProgramRelation.builder().id("R1").planId("PLAN_1")
                    .programCode("P2").role("CONTRIBUTOR").budgetAllocation(BigDecimal.valueOf(50000)).build();
            when(relationRepository.save(any())).thenReturn(rel);
            CrossProgramRelation saved = service.addRelation("PLAN_1", "P2", "CONTRIBUTOR", BigDecimal.valueOf(50000));
            assertEquals("PLAN_1", saved.getPlanId());
        }

        @Test @DisplayName("getRelations → 按planId")
        void shouldGetRelations() {
            when(relationRepository.findByPlanId("PLAN_1")).thenReturn(List.of());
            assertTrue(service.getRelations("PLAN_1").isEmpty());
        }
    }
}
