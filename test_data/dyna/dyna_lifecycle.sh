#!/bin/bash
# 动态属性会员全生命周期测试
TOKEN=$(cat /tmp/token2.txt)
AUTH="X-Program-Code: PROG001"
BEARER="Authorization: Bearer ${TOKEN}"
BASE="http://localhost:8081"
DATA="D:/Project/Loyalty-saas/test_data/dyna"
RESULT="D:/Project/Loyalty-saas/dyna_lifecycle_results.txt"

echo "========================================" > "$RESULT"
echo " 会员动态属性全生命周期测试报告 " >> "$RESULT"
echo " 测试日期: 2026-07-01 " >> "$RESULT"
echo "========================================" >> "$RESULT"
echo "" >> "$RESULT"

# ============================================
# Step 1: Create member with dynamic attributes
# ============================================
echo "===== Step 1: 创建含动态属性的会员 =====" >> "$RESULT"
echo "" >> "$RESULT"
echo "请求体(dyna/create_member.json):" >> "$RESULT"
echo "  25个动态属性字段: name/mobile/gender/birthday/email/city/age" >> "$RESULT"
echo "  vip_level/membership_source/annual_income/preferred_channel" >> "$RESULT"
echo "  tags/hobbies/referral_code/notes/id_verified/last_purchase_date" >> "$RESULT"
echo "  total_points_earned/member_tenure_months/preferred_store" >> "$RESULT"
echo "  consent_marketing/pet_name/total_spent/total_orders" >> "$RESULT"
echo "  等级: SILVER" >> "$RESULT"
echo "" >> "$RESULT"

CREATE_RESP=$(curl -s -X POST "$BASE/api/members" \
  -H "$AUTH" -H "$BEARER" \
  -H "Content-Type: application/json" -H "X-Idempotency-Key: dyna-test-001" \
  -d "@${DATA}/create_member.json")
echo "$CREATE_RESP" >> "$RESULT"
echo "" >> "$RESULT"

MEMBER_ID=$(echo "$CREATE_RESP" | grep -o '"memberId":[0-9]*' | head -1 | cut -d: -f2)
echo ">>> 创建的会员ID: $MEMBER_ID" >> "$RESULT"
echo "" >> "$RESULT"

# ============================================
# Step 2: Query member - verify dynamic fields
# ============================================
echo "===== Step 2: 查询会员 - 验证动态属性 =====" >> "$RESULT"
echo "" >> "$RESULT"
echo "--- 通过手机号搜索 ---" >> "$RESULT"
curl -s -H "$AUTH" -H "$BEARER" "$BASE/api/members/search?keyword=17700000001" >> "$RESULT" 2>&1
echo "" >> "$RESULT"
echo "" >> "$RESULT"

echo "--- 通过memberId查询详情 ---" >> "$RESULT"
curl -s -H "$AUTH" -H "$BEARER" "$BASE/api/members/${MEMBER_ID}" >> "$RESULT" 2>&1
echo "" >> "$RESULT"
echo "" >> "$RESULT"

# ============================================
# Step 3: Grant points to the member
# ============================================
echo "===== Step 3: 积分发放 - 3种账户类型 =====" >> "$RESULT"
echo "" >> "$RESULT"

echo "--- 3.1 REWARD发放5000积分 ---" >> "$RESULT"
curl -s -X POST "$BASE/api/members/${MEMBER_ID}/points/adjust" \
  -H "$AUTH" -H "$BEARER" -H "Content-Type: application/json" \
  -d '{"accountType":"REWARD","amount":5000,"increase":true}' >> "$RESULT" 2>&1
echo "" >> "$RESULT"

echo "--- 3.2 TIER发放2000成长值 ---" >> "$RESULT"
curl -s -X POST "$BASE/api/members/${MEMBER_ID}/points/adjust" \
  -H "$AUTH" -H "$BEARER" -H "Content-Type: application/json" \
  -d '{"accountType":"TIER","amount":2000,"increase":true}' >> "$RESULT" 2>&1
echo "" >> "$RESULT"

echo "--- 3.3 CREDIT发放10000授信积分 ---" >> "$RESULT"
curl -s -X POST "$BASE/api/members/${MEMBER_ID}/points/adjust" \
  -H "$AUTH" -H "$BEARER" -H "Content-Type: application/json" \
  -d '{"accountType":"CREDIT","amount":10000,"increase":true}' >> "$RESULT" 2>&1
echo "" >> "$RESULT"

echo "--- 3.4 REWARD扣减500积分 ---" >> "$RESULT"
curl -s -X POST "$BASE/api/members/${MEMBER_ID}/points/adjust" \
  -H "$AUTH" -H "$BEARER" -H "Content-Type: application/json" \
  -d '{"accountType":"REWARD","amount":500,"increase":false}' >> "$RESULT" 2>&1
echo "" >> "$RESULT"

echo "" >> "$RESULT"

# ============================================
# Step 4: Adjust tier
# ============================================
echo "===== Step 4: 等级调整 SILVER -> GOLD =====" >> "$RESULT"
echo "" >> "$RESULT"

echo "--- 4.1 升级到GOLD ---" >> "$RESULT"
curl -s -X POST "$BASE/api/members/${MEMBER_ID}/tier/adjust" \
  -H "$AUTH" -H "$BEARER" -H "Content-Type: application/json" \
  -d '{"newTier":"GOLD"}' >> "$RESULT" 2>&1
echo "" >> "$RESULT"

echo "--- 4.2 降级到BASE ---" >> "$RESULT"
curl -s -X POST "$BASE/api/members/${MEMBER_ID}/tier/adjust" \
  -H "$AUTH" -H "$BEARER" -H "Content-Type: application/json" \
  -d '{"newTier":"BASE"}' >> "$RESULT" 2>&1
echo "" >> "$RESULT"

echo "" >> "$RESULT"

# ============================================
# Step 5: Freeze member
# ============================================
echo "===== Step 5: 冻结会员 =====" >> "$RESULT"
echo "" >> "$RESULT"

echo "--- 5.1 冻结 ---" >> "$RESULT"
curl -s -X POST "$BASE/api/members/${MEMBER_ID}/freeze" \
  -H "$AUTH" -H "$BEARER" -H "Content-Type: application/json" >> "$RESULT" 2>&1
echo "" >> "$RESULT"

echo "--- 5.2 解冻 ---" >> "$RESULT"
curl -s -X POST "$BASE/api/members/${MEMBER_ID}/unfreeze" \
  -H "$AUTH" -H "$BEARER" -H "Content-Type: application/json" >> "$RESULT" 2>&1
echo "" >> "$RESULT"

echo "" >> "$RESULT"

# ============================================
# Step 6: Final query - verify everything
# ============================================
echo "===== Step 6: 最终查询 - 完整性验证 =====" >> "$RESULT"
echo "" >> "$RESULT"

curl -s -H "$AUTH" -H "$BEARER" "$BASE/api/members/${MEMBER_ID}" >> "$RESULT" 2>&1
echo "" >> "$RESULT"
echo "" >> "$RESULT"

echo "========================================" >> "$RESULT"
echo " 测试完毕 " >> "$RESULT"
echo "========================================" >> "$RESULT"