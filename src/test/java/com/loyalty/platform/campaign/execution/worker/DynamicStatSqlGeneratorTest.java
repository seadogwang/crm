package com.loyalty.platform.campaign.execution.worker;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.junit.jupiter.api.Assertions.*;

@DisplayName("DynamicStatSqlGenerator")
class DynamicStatSqlGeneratorTest {

    private final DynamicStatSqlGenerator generator = new DynamicStatSqlGenerator();

    @Test
    @DisplayName("parameterizes static conditions")
    void parameterizesStaticConditions() {
        DynamicStatSqlGenerator.SqlFragment fragment =
                generator.buildStaticCondition("status", "eq", "ACTIVE' OR '1'='1");

        assertEquals("ma.status = ?", fragment.sql());
        assertEquals(List.of("ACTIVE' OR '1'='1"), fragment.parameters());
    }

    @Test
    @DisplayName("rejects unsupported static fields")
    void rejectsUnsupportedStaticFields() {
        assertThrows(IllegalArgumentException.class,
                () -> generator.buildStaticCondition("status; DROP TABLE member", "eq", "ACTIVE"));
    }

    @Test
    @DisplayName("keeps tenant condition outside OR condition group")
    void keepsTenantConditionOutsideOrGroup() {
        DynamicStatSqlGenerator.SqlFragment first = generator.buildStaticCondition("status", "eq", "ACTIVE");
        DynamicStatSqlGenerator.SqlFragment second = generator.buildStaticCondition("city", "eq", "Shanghai");

        DynamicStatSqlGenerator.GeneratedSql sql =
                generator.buildFinalSql("P001", List.of(first, second), List.of(), "OR", true, 100);

        assertTrue(sql.sql().contains("AND ma.program_code = ?"));
        assertTrue(sql.sql().contains("AND (ma.status = ? OR ma.city = ?)"));
        assertEquals(List.of("P001", "ACTIVE", "Shanghai"), sql.parameters());
    }

    @Test
    @DisplayName("parameterizes dynamic aggregate HAVING")
    void parameterizesDynamicAggregateHaving() {
        DynamicStatSqlGenerator.GeneratedSql sql = generator.generateSubQuery(
                "P001", "order_fact", "SUM", "order_amount",
                "LAST_N_DAYS", 30, "gte", "1000 OR 1=1");

        assertTrue(sql.sql().contains("FROM campaign_order_fact WHERE program_code = ?"));
        assertTrue(sql.sql().contains("HAVING SUM(order_amount) >= ?"));
        assertEquals(List.of("P001", "1000 OR 1=1"), sql.parameters());
    }
}
