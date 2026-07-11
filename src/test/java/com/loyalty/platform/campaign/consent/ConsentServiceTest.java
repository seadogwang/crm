package com.loyalty.platform.campaign.consent;

import com.loyalty.platform.domain.entity.campaign.UserConsent;
import com.loyalty.platform.domain.repository.campaign.*;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.Optional;
import java.util.List;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;

/**
 * Unit tests for ConsentService — tests all 4 layers of send checking.
 */
@ExtendWith(MockitoExtension.class)
class ConsentServiceTest {

    @Mock private UserConsentRepository consentRepository;
    @Mock private ConsentChangeLogRepository changeLogRepository;
    @Mock private GdprRequestRepository gdprRepository;

    private ConsentService consentService;

    @BeforeEach
    void setUp() {
        consentService = new ConsentService(consentRepository, changeLogRepository, gdprRepository);
    }

    // ========================================================================
    // canSend — 4 check layers
    // ========================================================================

    @Test
    void shouldAllowWhenNoConsentRecord() {
        // No consent record → default allow
        when(consentRepository.findById("M001")).thenReturn(Optional.empty());

        ConsentService.SendCheckResult result = consentService.canSend("M001", "EMAIL", null);
        assertTrue(result.isAllowed());
        assertEquals("DEFAULT_ALLOWED", result.getCode());
    }

    @Test
    void shouldAllowWhenAllChecksPass() {
        UserConsent consent = UserConsent.builder()
                .memberId("M001").globalUnsubscribe(false)
                .emailOptIn(true).smsOptIn(true).pushOptIn(true)
                .quietHoursEnabled(false).build();
        when(consentRepository.findById("M001")).thenReturn(Optional.of(consent));

        ConsentService.SendCheckResult result = consentService.canSend("M001", "EMAIL", null);
        assertTrue(result.isAllowed());
        assertEquals("ALL_CHECKS_PASSED", result.getCode());
    }

    @Test
    void shouldBlockWhenGloballyUnsubscribed() {
        // 1st check: global unsubscribe
        UserConsent consent = UserConsent.builder()
                .memberId("M001").globalUnsubscribe(true)
                .emailOptIn(true).build();
        when(consentRepository.findById("M001")).thenReturn(Optional.of(consent));

        ConsentService.SendCheckResult result = consentService.canSend("M001", "EMAIL", null);
        assertFalse(result.isAllowed());
        assertEquals("GLOBAL_UNSUBSCRIBED", result.getCode());
    }

    @Test
    void shouldBlockWhenChannelOptedOut() {
        // 2nd check: channel opt-in
        UserConsent consent = UserConsent.builder()
                .memberId("M001").globalUnsubscribe(false)
                .emailOptIn(false)  // Email opted out
                .smsOptIn(true).pushOptIn(true).build();
        when(consentRepository.findById("M001")).thenReturn(Optional.of(consent));

        ConsentService.SendCheckResult result = consentService.canSend("M001", "EMAIL", null);
        assertFalse(result.isAllowed());
        assertEquals("CHANNEL_OPT_OUT", result.getCode());
    }

    @Test
    void shouldAllowDifferentChannelWhenOtherOptedOut() {
        // SMS opted out, but EMAIL ok
        UserConsent consent = UserConsent.builder()
                .memberId("M001").globalUnsubscribe(false)
                .emailOptIn(true).smsOptIn(false).pushOptIn(true).build();
        when(consentRepository.findById("M001")).thenReturn(Optional.of(consent));

        ConsentService.SendCheckResult result = consentService.canSend("M001", "EMAIL", null);
        assertTrue(result.isAllowed());
    }

    @Test
    void shouldBlockCategoryExcluded() {
        // 3rd check: category preference
        UserConsent consent = UserConsent.builder()
                .memberId("M001").globalUnsubscribe(false)
                .emailOptIn(true).smsOptIn(true).pushOptIn(true)
                .categoryPreferences("{\"included\":[\"服装\"],\"excluded\":[\"3C\"]}")
                .quietHoursEnabled(false).build();
        when(consentRepository.findById("M001")).thenReturn(Optional.of(consent));

        ConsentService.SendCheckResult result = consentService.canSend("M001", "EMAIL", "3C");
        assertFalse(result.isAllowed());
        assertEquals("CATEGORY_BLOCKED", result.getCode());
    }

    @Test
    void shouldBlockDuringQuietHours() {
        // 4th check: quiet hours
        UserConsent consent = UserConsent.builder()
                .memberId("M001").globalUnsubscribe(false)
                .emailOptIn(true).smsOptIn(true).pushOptIn(true)
                .quietHoursEnabled(true)
                .quietHoursStart(java.time.LocalTime.of(0, 0))  // midnight to 23:59
                .quietHoursEnd(java.time.LocalTime.of(23, 59))
                .timezone("Asia/Shanghai").build();
        when(consentRepository.findById("M001")).thenReturn(Optional.of(consent));

        ConsentService.SendCheckResult result = consentService.canSend("M001", "EMAIL", null);
        assertFalse(result.isAllowed());
        assertEquals("QUIET_HOURS", result.getCode());
    }

    @Test
    void globalUnsubBlocksAllChannels() {
        // Global unsubscribe overrides channel opt-in
        UserConsent consent = UserConsent.builder()
                .memberId("M001").globalUnsubscribe(true)
                .emailOptIn(true).smsOptIn(true).pushOptIn(true).build();
        when(consentRepository.findById("M001")).thenReturn(Optional.of(consent));

        // All channels blocked
        assertFalse(consentService.canSend("M001", "EMAIL", null).isAllowed());
        assertFalse(consentService.canSend("M001", "SMS", null).isAllowed());
        assertFalse(consentService.canSend("M001", "PUSH", null).isAllowed());
    }

    // ========================================================================
    // batchCanSend
    // ========================================================================

    @Test
    void batchCanSendShouldHandleMixedResults() {
        UserConsent u1 = UserConsent.builder().memberId("M001").globalUnsubscribe(false)
                .emailOptIn(true).smsOptIn(true).pushOptIn(true).quietHoursEnabled(false).build();
        UserConsent u2 = UserConsent.builder().memberId("M002").globalUnsubscribe(true)
                .emailOptIn(true).build();
        when(consentRepository.findByMemberIds(List.of("M001", "M002")))
                .thenReturn(List.of(u1, u2));

        var results = consentService.batchCanSend(List.of("M001", "M002"), "EMAIL", null);
        assertEquals(2, results.size());
        assertTrue(results.get("M001").isAllowed());
        assertFalse(results.get("M002").isAllowed());
        assertEquals("GLOBAL_UNSUBSCRIBED", results.get("M002").getCode());
    }
}
