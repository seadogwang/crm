package com.loyalty.saas.domain.repository;

import com.loyalty.saas.common.context.TenantContext;
import com.loyalty.saas.domain.entity.Program;
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
    @DisplayName("findById(无租户) 被安全哨兵禁用")
    void shouldRejectFindByIdWithoutTenant() {
        assertThrows(UnsupportedOperationException.class,
                () -> programRepository.findById("PROG001"));
    }

    @Test @Order(4)
    @DisplayName("findAll 被安全哨兵禁用")
    void shouldRejectFindAll() {
        assertThrows(UnsupportedOperationException.class,
                () -> programRepository.findAll());
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