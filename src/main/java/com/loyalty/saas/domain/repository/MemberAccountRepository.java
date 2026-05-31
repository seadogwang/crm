package com.loyalty.saas.domain.repository;

import com.loyalty.saas.common.repository.BaseRepository;
import com.loyalty.saas.domain.entity.MemberAccount;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.jpa.repository.QueryHints;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import jakarta.persistence.QueryHint;
import java.util.Optional;

@Repository
public interface MemberAccountRepository extends BaseRepository<MemberAccount, Long> {

    /**
     * 悲观锁获取账户（仅用于信用额度等风控参数，不操作 balance）。
     * 锁超时 3000ms，避免死锁长阻塞。
     */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @QueryHints(@QueryHint(name = "jakarta.persistence.lock.timeout", value = "3000"))
    @Query("SELECT a FROM MemberAccount a WHERE a.programCode = :pc AND a.memberId = :mid AND a.accountType = :atype")
    Optional<MemberAccount> findByMemberIdAndTypeForUpdate(@Param("pc") String programCode,
                                                            @Param("mid") Long memberId,
                                                            @Param("atype") String accountType);

    /**
     * 普通查询账户（不加锁，用于余额展示等非关键读）。
     */
    @Query("SELECT a FROM MemberAccount a WHERE a.programCode = :pc AND a.memberId = :mid AND a.accountType = :atype")
    Optional<MemberAccount> findByMemberIdAndType(@Param("pc") String programCode,
                                                   @Param("mid") Long memberId,
                                                   @Param("atype") String accountType);
}