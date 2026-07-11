#!/bin/bash
# Bug 修复验证脚本
TOKEN=$(cat /tmp/token.txt)
AUTH="X-Program-Code: PROG001"
BEARER="Authorization: Bearer ${TOKEN}"
BASE="http://localhost:8081"
DATA="D:/Project/Loyalty-saas/test_data"
RESULT="D:/Project/Loyalty-saas/bug_fix_verify_results.txt"

echo "========== Bug修复验证测试 ==========" > "$RESULT"
echo "测试日期: 2026-07-01" >> "$RESULT"
echo "" >> "$RESULT"

echo "===== 准备工作：创建测试会员 =====" >> "$RESULT"

# 创建会员A（用于B-01修改手机号测试，也用于B-03合并）
curl -s -X POST "$BASE/api/members" -H "$AUTH" -H "$BEARER" \
  -H "Content-Type: application/json" -H "X-Idempotency-Key: verify-mem-a" \
  -d '{"terms_accepted":true,"ext_attributes":{"mobile":"18800000001","name":"Bug验证会员A"}}' >> "$RESULT" 2>&1
echo "" >> "$RESULT"

# 创建会员B（用于B-03合并）
curl -s -X POST "$BASE/api/members" -H "$AUTH" -H "$BEARER" \
  -H "Content-Type: application/json" -H "X-Idempotency-Key: verify-mem-b" \
  -d '{"terms_accepted":true,"ext_attributes":{"mobile":"18800000002","name":"Bug验证会员B"}}' >> "$RESULT" 2>&1
echo "" >> "$RESULT"

# 创建会员C（用于B-02等级调整测试）并设置tier=GOLD
curl -s -X POST "$BASE/api/members" -H "$AUTH" -H "$BEARER" \
  -H "Content-Type: application/json" -H "X-Idempotency-Key: verify-mem-c" \
  -d '{"terms_accepted":true,"tier_code":"GOLD","ext_attributes":{"mobile":"18800000003","name":"Bug验证会员C"}}' >> "$RESULT" 2>&1
echo "" >> "$RESULT"

# 获取会员A的信息，拿到memberId
echo "--- 获取会员A信息 ---" >> "$RESULT"
MEMBER_A=$(curl -s -H "$AUTH" -H "$BEARER" "$BASE/api/members/search?keyword=18800000001")
echo "$MEMBER_A" >> "$RESULT" 2>&1
MEMBER_A_ID=$(echo "$MEMBER_A" | grep -o '"memberId":"[0-9]*"' | cut -d'"' -f4)
echo "" >> "$RESULT"

echo "--- 获取会员B信息 ---" >> "$RESULT"
MEMBER_B=$(curl -s -H "$AUTH" -H "$BEARER" "$BASE/api/members/search?keyword=18800000002")
echo "$MEMBER_B" >> "$RESULT" 2>&1
MEMBER_B_ID=$(echo "$MEMBER_B" | grep -o '"memberId":"[0-9]*"' | cut -d'"' -f4)
echo "" >> "$RESULT"

echo "--- 获取会员C信息 ---" >> "$RESULT"
MEMBER_C=$(curl -s -H "$AUTH" -H "$BEARER" "$BASE/api/members/search?keyword=18800000003")
echo "$MEMBER_C" >> "$RESULT" 2>&1
MEMBER_C_ID=$(echo "$MEMBER_C" | grep -o '"memberId":"[0-9]*"' | cut -d'"' -f4)
echo "" >> "$RESULT"

echo "会员A ID: $MEMBER_A_ID" >> "$RESULT"
echo "会员B ID: $MEMBER_B_ID" >> "$RESULT"
echo "会员C ID: $MEMBER_C_ID" >> "$RESULT"

echo "" >> "$RESULT"
echo "========================================" >> "$RESULT"
echo "验证 B-01: 修改手机号后旧唯一键是否清理" >> "$RESULT"
echo "========================================" >> "$RESULT"
echo "" >> "$RESULT"

echo "----- 步骤1: 修改会员A手机号为 18811111111 -----" >> "$RESULT"
curl -s -X PUT "$BASE/api/members/${MEMBER_A_ID}" \
  -H "$AUTH" -H "$BEARER" -H "Content-Type: application/json" \
  -d '{"ext_attributes":{"mobile":"18811111111","name":"Bug验证会员A-已改手机号"}}' >> "$RESULT" 2>&1
echo "" >> "$RESULT"

echo "----- 步骤2: 用新手机号 18811111111 搜索(应找到) -----" >> "$RESULT"
curl -s -H "$AUTH" -H "$BEARER" "$BASE/api/members/search?keyword=18811111111" >> "$RESULT" 2>&1
echo "" >> "$RESULT"

echo "----- 步骤3: 用旧手机号 18800000001 搜索(应找不到) -----" >> "$RESULT"
curl -s -H "$AUTH" -H "$BEARER" "$BASE/api/members/search?keyword=18800000001" >> "$RESULT" 2>&1
echo "" >> "$RESULT"

echo "" >> "$RESULT"
echo "========================================" >> "$RESULT"
echo "验证 B-02: 等级调整校验有效性" >> "$RESULT"
echo "========================================" >> "$RESULT"
echo "" >> "$RESULT"

echo "----- 步骤1: 查会员C当前等级(应为GOLD) -----" >> "$RESULT"
curl -s -H "$AUTH" -H "$BEARER" "$BASE/api/members/search?keyword=18800000003" >> "$RESULT" 2>&1
echo "" >> "$RESULT"

echo "----- 步骤2: 设置不存在的等级 SUPER_VIP(应拒绝) -----" >> "$RESULT"
curl -s -X POST "$BASE/api/members/${MEMBER_C_ID}/tier/adjust" \
  -H "$AUTH" -H "$BEARER" -H "Content-Type: application/json" \
  -d '{"newTier":"SUPER_VIP"}' >> "$RESULT" 2>&1
echo "" >> "$RESULT"

echo "----- 步骤3: 验证等级未被修改(仍为GOLD) -----" >> "$RESULT"
curl -s -H "$AUTH" -H "$BEARER" "$BASE/api/members/search?keyword=18800000003" >> "$RESULT" 2>&1
echo "" >> "$RESULT"

echo "----- 步骤4: 设置有效等级 SILVER(应成功) -----" >> "$RESULT"
curl -s -X POST "$BASE/api/members/${MEMBER_C_ID}/tier/adjust" \
  -H "$AUTH" -H "$BEARER" -H "Content-Type: application/json" \
  -d '{"newTier":"SILVER"}' >> "$RESULT" 2>&1
echo "" >> "$RESULT"

echo "----- 步骤5: 验证等级已改为 SILVER -----" >> "$RESULT"
curl -s -H "$AUTH" -H "$BEARER" "$BASE/api/members/search?keyword=18800000003" >> "$RESULT" 2>&1
echo "" >> "$RESULT"

echo "" >> "$RESULT"
echo "========================================" >> "$RESULT"
echo "验证 B-03: 会员合并同步执行" >> "$RESULT"
echo "========================================" >> "$RESULT"
echo "" >> "$RESULT"

echo "----- 步骤1: 执行合并(主: 会员A, 副: 会员B) -----" >> "$RESULT"
curl -s -X POST "$BASE/api/members/merge" \
  -H "$AUTH" -H "$BEARER" -H "Content-Type: application/json" \
  -d "{\"mainMemberId\":${MEMBER_A_ID},\"duplicateMemberId\":${MEMBER_B_ID}}" >> "$RESULT" 2>&1
echo "" >> "$RESULT"

echo "----- 步骤2: 查询主会员A(应正常) -----" >> "$RESULT"
curl -s -H "$AUTH" -H "$BEARER" "$BASE/api/members/search?keyword=${MEMBER_A_ID}" >> "$RESULT" 2>&1
echo "" >> "$RESULT"

echo "----- 步骤3: 查询被合并会员B状态(应为MERGED) -----" >> "$RESULT"
curl -s -H "$AUTH" -H "$BEARER" "$BASE/api/members/search?keyword=${MEMBER_B_ID}" >> "$RESULT" 2>&1
echo "" >> "$RESULT"

echo "" >> "$RESULT"
echo "========== 验证完毕 ==========" >> "$RESULT"