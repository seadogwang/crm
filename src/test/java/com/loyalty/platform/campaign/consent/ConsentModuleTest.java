package com.loyalty.platform.campaign.consent;

import com.loyalty.platform.domain.entity.campaign.*;
import com.loyalty.platform.domain.repository.campaign.*;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.*;
import org.mockito.junit.jupiter.MockitoExtension;
import java.time.LocalTime;
import java.util.*;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
@DisplayName("Consent & Preference Module Tests")
class ConsentModuleTest {

    @Mock private UserConsentRepository consentRepository;
    @Mock private ConsentChangeLogRepository changeLogRepository;
    @Mock private GdprRequestRepository gdprRepository;
    private ConsentService service;

    @BeforeEach void setUp() {
        service = new ConsentService(consentRepository, changeLogRepository, gdprRepository);
    }

    private UserConsent buildConsent(String id) {
        return UserConsent.builder().memberId(id).programCode("P").build();
    }

    @Nested @DisplayName("canSend")
    class CanSendTests {
        @Test @DisplayName("无记录 → 允许")
        void allowNone() {
            when(consentRepository.findById("M1")).thenReturn(Optional.empty());
            var r = service.canSend("M1", "EMAIL", null);
            assertTrue(r.isAllowed());
        }

        @Test @DisplayName("全局退订 → 阻止")
        void blockGlobal() {
            UserConsent c = buildConsent("M1"); c.setGlobalUnsubscribe(true);
            when(consentRepository.findById("M1")).thenReturn(Optional.of(c));
            var r = service.canSend("M1", "EMAIL", null);
            assertFalse(r.isAllowed());
        }

        @Test @DisplayName("SMS未opt-in → 阻止")
        void blockSmsUnopted() {
            UserConsent c = buildConsent("M1"); c.setSmsOptIn(false);
            when(consentRepository.findById("M1")).thenReturn(Optional.of(c));
            var r = service.canSend("M1", "SMS", null);
            assertFalse(r.isAllowed());
            assertEquals("CHANNEL_OPT_OUT", r.getCode());
        }

        @Test @DisplayName("EMAIL已opt-in → 允许")
        void allowEmailOpted() {
            UserConsent c = buildConsent("M1"); c.setEmailOptIn(true);
            when(consentRepository.findById("M1")).thenReturn(Optional.of(c));
            assertTrue(service.canSend("M1", "EMAIL", null).isAllowed());
        }
    }

    @Nested @DisplayName("偏好更新")
    class UpdateTests {
        @Test @DisplayName("全局退订")
        void globalUnsub() {
            UserConsent c = buildConsent("M1");
            when(consentRepository.findById("M1")).thenReturn(Optional.of(c));
            when(consentRepository.save(any())).thenReturn(c);
            service.updateGlobalUnsubscribe("M1", "SPAM", "EMAIL", "WEB_UI");
            assertTrue(c.isGlobalUnsubscribe());
            assertNotNull(c.getUnsubscribeAt());
            verify(changeLogRepository).save(any());
        }

        @Test @DisplayName("重新订阅")
        void resubscribe() {
            UserConsent c = buildConsent("M1"); c.setGlobalUnsubscribe(true);
            when(consentRepository.findById("M1")).thenReturn(Optional.of(c));
            when(consentRepository.save(any())).thenReturn(c);
            service.reSubscribe("M1", "WEB_UI");
            assertFalse(c.isGlobalUnsubscribe());
        }

        @Test @DisplayName("更新渠道Opt-in")
        void channelOptIn() {
            UserConsent c = buildConsent("M1");
            when(consentRepository.findById("M1")).thenReturn(Optional.of(c));
            when(consentRepository.save(any())).thenReturn(c);
            service.updateChannelOptIn("M1", "EMAIL", false, "WEB_UI");
            assertFalse(c.isEmailOptIn());
        }

        @Test @DisplayName("更新静默时段")
        void quietHours() {
            UserConsent c = buildConsent("M1");
            when(consentRepository.findById("M1")).thenReturn(Optional.of(c));
            when(consentRepository.save(any())).thenReturn(c);
            service.updateQuietHours("M1", true, LocalTime.of(22, 0),
                    LocalTime.of(8, 0), "Asia/Shanghai", "WEB_UI");
            assertTrue(c.isQuietHoursEnabled());
        }
    }

    @Nested @DisplayName("GDPR")
    class GdprTests {
        @Test @DisplayName("提交删除请求")
        void submit() {
            GdprRequest g = GdprRequest.builder().id("G1").memberId("M1")
                    .requestType("DELETION").status("PENDING").build();
            when(gdprRepository.save(any())).thenReturn(g);
            GdprRequest r = service.submitGdprRequest("M1", "P", "DELETION", "UserReq", "WEB_UI");
            assertEquals("PENDING", r.getStatus());
        }
    }

    @Nested @DisplayName("查询")
    class QueryTests {
        @Test @DisplayName("getConsent")
        void get() {
            when(consentRepository.findById("M1")).thenReturn(Optional.of(buildConsent("M1")));
            assertEquals("M1", service.getConsent("M1").getMemberId());
        }

        @Test @DisplayName("getChangeLogs")
        void logs() {
            when(changeLogRepository.findByMemberIdOrderByCreatedAtDesc("M1")).thenReturn(List.of());
            assertTrue(service.getChangeLogs("M1").isEmpty());
        }
    }

    @Nested @DisplayName("Result factory")
    class ResultTests {
        @Test @DisplayName("allow/block")
        void factory() {
            assertTrue(ConsentService.SendCheckResult.allow("OK").isAllowed());
            var b = ConsentService.SendCheckResult.block("CODE", "msg");
            assertFalse(b.isAllowed());
            assertEquals("CODE", b.getCode());
        }
    }
}
