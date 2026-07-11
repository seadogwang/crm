#!/bin/bash
TOKEN=$(cat /tmp/token4.txt)
AUTH="X-Program-Code: PROG001"
BEARER="Authorization: Bearer $TOKEN"
BASE="http://localhost:8081"
RESULT="D:/Project/Loyalty-saas/schema_validation_test.txt"

echo "========== Schema 字段校验测试 ==========" > "$RESULT"
echo "测试日期: 2026-07-01" >> "$RESULT"
echo "" >> "$RESULT"

echo "=== 1. 查看当前 Schema 版本 ===" >> "$RESULT"
curl -s -H "$AUTH" -H "$BEARER" "$BASE/api/schemas/MEMBER" >> "$RESULT" 2>&1
echo "" >> "$RESULT"
echo "" >> "$RESULT"

echo "=== 2. 发布扩展 Schema v3 ===" >> "$RESULT"
curl -s -X POST "$BASE/api/admin/schemas/publish" \
  -H "$AUTH" -H "$BEARER" -H "Content-Type: application/json" \
  -d "@D:/Project/Loyalty-saas/test_data/schema/member_schema_v3.json" >> "$RESULT" 2>&1
echo "" >> "$RESULT"
echo "" >> "$RESULT"

echo "=== 3. 验证版本已更新 ===" >> "$RESULT"
curl -s -H "$AUTH" -H "$BEARER" "$BASE/api/schemas/MEMBER" >> "$RESULT" 2>&1
echo "" >> "$RESULT"
echo "" >> "$RESULT"

echo "============================================" >> "$RESULT"
echo "测试1: schema定义字段创建(应成功)" >> "$RESULT"
echo "============================================" >> "$RESULT"
curl -s -X POST "$BASE/api/members" -H "$AUTH" -H "$BEARER" \
  -H "Content-Type: application/json" -H "X-Idempotency-Key: validate-ok-1" \
  -d '{"terms_accepted":true,"tier_code":"GOLD","ext_attributes":{"mobile":"16600000001","name":"Schema合法字段","gender":"MALE","city":"北京","age":28,"email":"test@test.com","vip_level":"DIAMOND","total_spent":50000}}' >> "$RESULT" 2>&1
echo "" >> "$RESULT"
echo "" >> "$RESULT"

echo "============================================" >> "$RESULT"
echo "测试2: 未在schema定义的字段(应被拒绝)" >> "$RESULT"
echo "============================================" >> "$RESULT"
curl -s -X POST "$BASE/api/members" -H "$AUTH" -H "$BEARER" \
  -H "Content-Type: application/json" -H "X-Idempotency-Key: validate-reject-1" \
  -d '{"terms_accepted":true,"ext_attributes":{"mobile":"16600000002","name":"非法字段测试","undefined_field":"这个字段不在schema中","another_unknown":123}}' >> "$RESULT" 2>&1
echo "" >> "$RESULT"
echo "" >> "$RESULT"

echo "============================================" >> "$RESULT"
echo "测试3: 纯系统字段创建(应成功)" >> "$RESULT"
echo "============================================" >> "$RESULT"
curl -s -X POST "$BASE/api/members" -H "$AUTH" -H "$BEARER" \
  -H "Content-Type: application/json" -H "X-Idempotency-Key: validate-ok-2" \
  -d '{"terms_accepted":true,"ext_attributes":{"mobile":"16600000003","name":"仅系统字段","phone":"16600000003"}}' >> "$RESULT" 2>&1
echo "" >> "$RESULT"
echo "" >> "$RESULT"

echo "============================================" >> "$RESULT"
echo "测试4: 更新会员时使用非法字段(应被拒绝)" >> "$RESULT"
echo "============================================" >> "$RESULT"
curl -s -X PUT "$BASE/api/members/999999999" -H "$AUTH" -H "$BEARER" \
  -H "Content-Type: application/json" \
  -d '{"ext_attributes":{"illegal_field":"这个不行"}}' >> "$RESULT" 2>&1
echo "" >> "$RESULT"
echo "" >> "$RESULT"

echo "============================================" >> "$RESULT"
echo "测试5: 空ext_attributes(应成功)" >> "$RESULT"
echo "============================================" >> "$RESULT"
curl -s -X POST "$BASE/api/members" -H "$AUTH" -H "$BEARER" \
  -H "Content-Type: application/json" -H "X-Idempotency-Key: validate-ok-3" \
  -d '{"terms_accepted":true,"ext_attributes":{}}' >> "$RESULT" 2>&1
echo "" >> "$RESULT"
echo "" >> "$RESULT"

echo "============================================" >> "$RESULT"
echo "测试6: 只含系统内置字段(应成功)" >> "$RESULT"
echo "============================================" >> "$RESULT"
curl -s -X POST "$BASE/api/members" -H "$AUTH" -H "$BEARER" \
  -H "Content-Type: application/json" -H "X-Idempotency-Key: validate-ok-4" \
  -d '{"terms_accepted":true,"ext_attributes":{"name":"系统字段测试","mobile":"16600000005","phone":"16600000005"}}' >> "$RESULT" 2>&1
echo "" >> "$RESULT"
echo "" >> "$RESULT"

echo "========== 测试完毕 ==========" >> "$RESULT"