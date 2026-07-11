package com.loyalty.platform.domain.repository;

import com.loyalty.platform.common.repository.BaseRepository;
import com.loyalty.platform.domain.entity.MemberChannelBinding;
import org.springframework.data.jpa.repository.Query;
import org.springframework.stereotype.Repository;
import java.util.Optional;

@Repository
public interface ChannelBindingRepository extends BaseRepository<MemberChannelBinding, String> {
    Optional<MemberChannelBinding> findByProgramCodeAndChannelAndChannelUserId(String pc, String channel, String userId);
    Optional<MemberChannelBinding> findByProgramCodeAndChannelAndChannelUnionId(String pc, String channel, String unionId);
    @Query("SELECT b FROM MemberChannelBinding b WHERE b.programCode=:pc AND b.channel=:channel AND b.channelMobileEncrypted=:encrypted AND b.status='ACTIVE'")
    Optional<MemberChannelBinding> findByEncryptedMobile(String pc, String channel, String encrypted);
}