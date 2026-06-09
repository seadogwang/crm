package com.loyalty.platform.domain.repository;

import com.loyalty.platform.common.context.TenantContext;
import com.loyalty.platform.domain.entity.Program;
import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.jdbc.AutoConfigureTestDatabase;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;

import java.util.Optional;

import static org.junit.jupiter.api.Assertions.*;

@DataJpaTest
@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.NONE)
@TestMethodOrder(MethodOrderer.OrderAnnotation.class)
@DisplayName("JPA 实体映射 + 安全哨兵 集成测试")
class ProgramRepositoryIntegrationTest {

    @Autowired
    private ProgramRepository programRepository;

    @PersistenceContext
    private EntityManager entityManager;

    @BeforeEach
    void setUp() {
        TenantContext.set("PROG001");
        // 手动设置 PostgreSQL RLS 上下文（@DataJpaTest 不启动 RlsDataSourcePostProcessor）
        entityManager.createNativeQuery("SET app.current_program_code = 'PROG001'").executeUpdate();
    }
    @AfterEach
    void tearDown() { TenantContext.clear(); }

    @Test @Order(1)
    @DisplayName("查询 PROG001 —— 验证 JPA 映射正确")
    void shouldFindProgramByCode() {
        Optional<Program> result = programRepository.findByCode("PROG001");
        assertTrue(result.isPresent());
        Program p = result.get();
        assertEquals("PROG001", p.getCode());
        assertEquals("积分计划", p.getName());
        assertNotNull(p.getConfigJson());
        System.out.println("[TEST] Program: code=" + p.getCode() + ", name=" + p.getName());
    }

    @Test @Order(2)
    @DisplayName("findByIdWithTenant: 安全哨兵查询")
    void shouldFindByIdWithTenant() {
        Optional<Program> result = programRepository.findByIdWithTenant("PROG001");
        assertTrue(result.isPresent());
    }

    @Test @Order(3)
    @DisplayName("findById: 安全哨兵改为 @Deprecated 标记（JDK动态代理不支持default阻断），由PostgreSQL RLS保证隔离")
    void shouldFindByIdWorksSinceSentinelRemoved() {
        // 安全哨兵 default 方法已移除——JDK 动态代理绕过 default 方法直接调用 SimpleJpaRepository
        // 跨租户隔离由 PostgreSQL RLS Policy 保证
        Optional<Program> result = programRepository.findById("PROG001");
        assertTrue(result.isPresent());
        assertEquals("PROG001", result.get().getCode());
    }

    @Test @Order(4)
    @DisplayName("findAll: 安全哨兵改为 @Deprecated 标记，由PostgreSQL RLS保证隔离")
    void shouldFindAllWorksSinceSentinelRemoved() {
        // 安全哨兵 default 方法已移除——JDK 动态代理绕过 default 方法直接调用 SimpleJpaRepository
        // 跨租户隔离由 PostgreSQL RLS Policy 保证
        var programs = programRepository.findAll();
        assertFalse(programs.isEmpty());
        assertTrue(programs.stream().anyMatch(p -> "PROG001".equals(p.getCode())));
    }

    @Test @Order(5)
    @DisplayName("查询不存在的计划返回 empty")
    void shouldReturnEmptyForNonExistent() {
        Optional<Program> result = programRepository.findByCode("NONEXIST");
        assertFalse(result.isPresent());
    }

    @Test @Order(6)
    @DisplayName("JSONB 字段正确反序列化")
    void shouldDeserializeJsonbField() {
        Optional<Program> result = programRepository.findByCode("PROG001");
        assertTrue(result.isPresent());
        assertFalse(result.get().getConfigJson().isEmpty());
        System.out.println("[TEST] configJson: " + result.get().getConfigJson());
    }
}