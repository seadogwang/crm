package com.loyalty.platform.member;

import com.loyalty.platform.domain.entity.MemberChannelBinding;
import com.loyalty.platform.domain.repository.ChannelBindingRepository;
import com.loyalty.platform.domain.repository.MemberRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
@DisplayName("OneIdMatcher")
class OneIdMatcherTest {

    @Mock private ChannelBindingRepository bindingRepo;
    @Mock private MemberRepository memberRepo;
    private OneIdMatcher matcher;

    @BeforeEach
    void setUp() { matcher = new OneIdMatcher(bindingRepo, memberRepo); }

    @Nested
    @DisplayName("身份匹配")
    class Match {

        @Test
        @DisplayName("UnionID 匹配成功")
        void matchByUnionId() {
            var b = MemberChannelBinding.builder().memberId("123").status("ACTIVE").build();
            when(bindingRepo.findByProgramCodeAndChannelAndChannelUnionId("PROG", "TMALL", "omid_001"))
                    .thenReturn(Optional.of(b));

            var req = OneIdMatcher.MatchRequest.builder().programCode("PROG").channel("TMALL")
                    .channelUnionId("omid_001").build();
            var result = matcher.match(req);

            assertThat(result.isFound()).isTrue();
            assertThat(result.memberId()).isEqualTo("123");
        }

        @Test
        @DisplayName("双因素匹配成功")
        void matchByDualFactor() {
            var b = MemberChannelBinding.builder().memberId("123").status("ACTIVE")
                    .channelMobileEncrypted("enc_xxx").build();
            when(bindingRepo.findByProgramCodeAndChannelAndChannelUserId("PROG", "TMALL", "ouid_001"))
                    .thenReturn(Optional.of(b));

            var req = OneIdMatcher.MatchRequest.builder().programCode("PROG").channel("TMALL")
                    .channelUserId("ouid_001").encryptedMobile("enc_xxx").build();
            var result = matcher.match(req);

            assertThat(result.isFound()).isTrue();
            assertThat(result.matchType()).isEqualTo("DUAL_FACTOR");
        }

        @Test
        @DisplayName("密文不匹配需二次验证")
        void dualFactorMismatch() {
            var b = MemberChannelBinding.builder().memberId("123").status("ACTIVE")
                    .channelMobileEncrypted("enc_yyy").build();
            when(bindingRepo.findByProgramCodeAndChannelAndChannelUserId("PROG", "TMALL", "ouid_001"))
                    .thenReturn(Optional.of(b));

            var req = OneIdMatcher.MatchRequest.builder().programCode("PROG").channel("TMALL")
                    .channelUserId("ouid_001").encryptedMobile("enc_xxx").build();
            var result = matcher.match(req);

            assertThat(result.isConflict()).isTrue();
        }

        @Test
        @DisplayName("渠道ID匹配成功")
        void matchByChannelUserId() {
            var b = MemberChannelBinding.builder().memberId("123").status("ACTIVE").build();
            when(bindingRepo.findByProgramCodeAndChannelAndChannelUserId("PROG", "TMALL", "ouid_001"))
                    .thenReturn(Optional.of(b));

            var req = OneIdMatcher.MatchRequest.builder().programCode("PROG").channel("TMALL")
                    .channelUserId("ouid_001").build();
            var result = matcher.match(req);

            assertThat(result.isFound()).isTrue();
        }

        @Test
        @DisplayName("密文手机匹配成功")
        void matchByEncryptedMobile() {
            var b = MemberChannelBinding.builder().memberId("123").status("ACTIVE").build();
            when(bindingRepo.findByEncryptedMobile("PROG", "TMALL", "enc_xxx"))
                    .thenReturn(Optional.of(b));

            var req = OneIdMatcher.MatchRequest.builder().programCode("PROG").channel("TMALL")
                    .encryptedMobile("enc_xxx").build();
            var result = matcher.match(req);

            assertThat(result.isFound()).isTrue();
        }

        @Test
        @DisplayName("未匹配返回 NOT_FOUND")
        void matchNotFound() {
            var req = OneIdMatcher.MatchRequest.builder().programCode("PROG").channel("TMALL").build();
            var result = matcher.match(req);

            assertThat(result.isFound()).isFalse();
        }

        @Test
        @DisplayName("INACTIVE 绑定不参与匹配")
        void inactiveBindingIgnored() {
            var b = MemberChannelBinding.builder().memberId("123").status("INACTIVE").build();
            when(bindingRepo.findByProgramCodeAndChannelAndChannelUserId("PROG", "TMALL", "ouid_001"))
                    .thenReturn(Optional.of(b));

            var req = OneIdMatcher.MatchRequest.builder().programCode("PROG").channel("TMALL")
                    .channelUserId("ouid_001").build();
            var result = matcher.match(req);

            assertThat(result.isFound()).isFalse();
        }
    }
}