#!/bin/bash
# 会员扩展功能测试脚本 - 信息修改/积分调整/等级调整/冻结解冻/合并
TOKEN="eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIiwidXNlcm5hbWUiOiJzdXBlcmFkbWluIiwicm9sZSI6IlNVUEVSX0FETUlOIiwicHJvZ3JhbV9jb2RlIjoiKiIsInBlcm1pc3Npb25zIjpbIlBPSU5UU19BREpVU1QiLCJSVUxFX1JFQUQiLCJSVUxFX1dSSVRFIiwiUlVMRV9QVUJMSVNIIiwiTUVNQkVSX1JFQUQiLCJQT0lOVFNfR1JBTlQiLCJTQ0hFTUFfUkVBRCIsIkFVRElUX0VYUE9SVCIsIlBPSU5UU19SRURFRU0iLCJTQ0hFTUFfV1JJVEUiLCJNRU1CRVJfV1JJVEUiLCJDSEFOTkVMX1dSSVRFIiwiVEVOQU5UX1dSSVRFIiwiVEVOQU5UX1JFQUQiLCJNRU1CRVJfREVMRVRFIiwiQVVESVRfUkVBRCIsIkNIQU5ORUxfUkVBRCJdLCJpYXQiOjE3ODI4OTM2MTMsImV4cCI6MTc4Mjk4MDAxM30.IsjVQ5FAl0YVTsaIb1GOe3KA9VY898XvXy7CY60JAcA"
AUTH="X-Program-Code: PROG001"
BEARER="Authorization: Bearer ${TOKEN}"
BASE="http://localhost:8081"
DATA="D:/Project/Loyalty-saas/test_data/extend"
RESULT="D:/Project/Loyalty-saas/member_extend_test_results.txt"

echo "========== 会员扩展功能测试结果 ==========" > "$RESULT"
echo "测试日期: 2026-07-01" >> "$RESULT"
echo "" >> "$RESULT"

# ============================================================
# 第一部分: 信息修改 (PUT /api/members/{memberId})
# 使用会员: 9000000001 (当前有mobile/name)
# ============================================================
echo "============================================" >> "$RESULT"
echo "第一部分: 会员信息修改 (PUT)" >> "$RESULT"
echo "============================================" >> "$RESULT"

echo "----- TC-M01: 添加新字段到ext_attributes -----" >> "$RESULT"
echo "请求: 添加age, vip_level, remark字段" >> "$RESULT"
curl -s -X PUT "$BASE/api/members/9000000001" \
  -H "$AUTH" -H "$BEARER" -H "Content-Type: application/json" \
  -d "@${DATA}/m01_update_add.json" >> "$RESULT" 2>&1
echo "" >> "$RESULT"
echo "--- 修改后查询验证 ---" >> "$RESULT"
curl -s -H "$AUTH" -H "$BEARER" "$BASE/api/members/search?keyword=9000000001" >> "$RESULT" 2>&1
echo "" >> "$RESULT"
echo "" >> "$RESULT"

echo "----- TC-M02: 修改已有字段的值 -----" >> "$RESULT"
echo "请求: 修改name为新值，修改vip_level" >> "$RESULT"
curl -s -X PUT "$BASE/api/members/9000000001" \
  -H "$AUTH" -H "$BEARER" -H "Content-Type: application/json" \
  -d "@${DATA}/m02_update_change.json" >> "$RESULT" 2>&1
echo "" >> "$RESULT"
echo "--- 修改后查询验证 ---" >> "$RESULT"
curl -s -H "$AUTH" -H "$BEARER" "$BASE/api/members/search?keyword=9000000001" >> "$RESULT" 2>&1
echo "" >> "$RESULT"
echo "" >> "$RESULT"

echo "----- TC-M03: 修改手机号 -----" >> "$RESULT"
echo "请求: 将手机号改为13999999999" >> "$RESULT"
curl -s -X PUT "$BASE/api/members/9000000001" \
  -H "$AUTH" -H "$BEARER" -H "Content-Type: application/json" \
  -d "@${DATA}/m03_update_mobile.json" >> "$RESULT" 2>&1
echo "" >> "$RESULT"
echo "--- 新手机号搜索验证 ---" >> "$RESULT"
curl -s -H "$AUTH" -H "$BEARER" "$BASE/api/members/search?keyword=13999999999" >> "$RESULT" 2>&1
echo "" >> "$RESULT"
echo "--- 旧手机号搜索验证(应找不到) ---" >> "$RESULT"
curl -s -H "$AUTH" -H "$BEARER" "$BASE/api/members/search?keyword=13900000010" >> "$RESULT" 2>&1
echo "" >> "$RESULT"
echo "" >> "$RESULT"

echo "----- TC-M04: 清空ext_attributes(仅留空对象) -----" >> "$RESULT"
echo "请求: ext_attributes设为{}" >> "$RESULT"
curl -s -X PUT "$BASE/api/members/9000000001" \
  -H "$AUTH" -H "$BEARER" -H "Content-Type: application/json" \
  -d "@${DATA}/m04_update_empty.json" >> "$RESULT" 2>&1
echo "" >> "$RESULT"
echo "--- 清空后查询验证 ---" >> "$RESULT"
curl -s -H "$AUTH" -H "$BEARER" "$BASE/api/members/search?keyword=9000000001" >> "$RESULT" 2>&1
echo "" >> "$RESULT"
echo "" >> "$RESULT"

echo "----- TC-M05: 更新不存在的会员 -----" >> "$RESULT"
curl -s -X PUT "$BASE/api/members/999999999" \
  -H "$AUTH" -H "$BEARER" -H "Content-Type: application/json" \
  -d '{"ext_attributes":{"test":"value"}}' >> "$RESULT" 2>&1
echo "" >> "$RESULT"
echo "" >> "$RESULT"

# ============================================================
# 第二部分: 积分调整 (POST /points/adjust)
# 使用会员: 1782893727198007 (TC01创建, BASE等级)
# ============================================================
echo "============================================" >> "$RESULT"
echo "第二部分: 积分调整 (POST /points/adjust)" >> "$RESULT"
echo "============================================" >> "$RESULT"

MEMBER_A="1782893727198007"

echo "----- TC-P01: REWARD账户发放积分1000 -----" >> "$RESULT"
curl -s -X POST "$BASE/api/members/${MEMBER_A}/points/adjust" \
  -H "$AUTH" -H "$BEARER" -H "Content-Type: application/json" \
  -d "@${DATA}/p01_grant_points.json" >> "$RESULT" 2>&1
echo "" >> "$RESULT"
echo "--- 积分发放后查询账户余额 ---" >> "$RESULT"
curl -s -H "$AUTH" -H "$BEARER" "$BASE/api/members/search?keyword=${MEMBER_A}" >> "$RESULT" 2>&1
echo "" >> "$RESULT"
echo "" >> "$RESULT"

echo "----- TC-P02: REWARD账户扣减积分200 -----" >> "$RESULT"
curl -s -X POST "$BASE/api/members/${MEMBER_A}/points/adjust" \
  -H "$AUTH" -H "$BEARER" -H "Content-Type: application/json" \
  -d "@${DATA}/p02_redeem_points.json" >> "$RESULT" 2>&1
echo "" >> "$RESULT"
echo "--- 扣减后查询 ---" >> "$RESULT"
curl -s -H "$AUTH" -H "$BEARER" "$BASE/api/members/search?keyword=${MEMBER_A}" >> "$RESULT" 2>&1
echo "" >> "$RESULT"
echo "" >> "$RESULT"

echo "----- TC-P03: TIER账户发放积分500 -----" >> "$RESULT"
curl -s -X POST "$BASE/api/members/${MEMBER_A}/points/adjust" \
  -H "$AUTH" -H "$BEARER" -H "Content-Type: application/json" \
  -d "@${DATA}/p03_grant_tier_points.json" >> "$RESULT" 2>&1
echo "" >> "$RESULT"
echo "--- TIER积分发放后查询 ---" >> "$RESULT"
curl -s -H "$AUTH" -H "$BEARER" "$BASE/api/members/search?keyword=${MEMBER_A}" >> "$RESULT" 2>&1
echo "" >> "$RESULT"
echo "" >> "$RESULT"

echo "----- TC-P04: CREDIT账户发放积分3000(有透支额度5000) -----" >> "$RESULT"
curl -s -X POST "$BASE/api/members/${MEMBER_A}/points/adjust" \
  -H "$AUTH" -H "$BEARER" -H "Content-Type: application/json" \
  -d "@${DATA}/p04_grant_credit_points.json" >> "$RESULT" 2>&1
echo "" >> "$RESULT"
echo "--- CREDIT发放后查询 ---" >> "$RESULT"
curl -s -H "$AUTH" -H "$BEARER" "$BASE/api/members/search?keyword=${MEMBER_A}" >> "$RESULT" 2>&1
echo "" >> "$RESULT"
echo "" >> "$RESULT"

echo "----- TC-P05: 超额扣减(redeem金额超过余额) -----" >> "$RESULT"
echo "请求: 扣减REWARD账户999999(当前余额约800)" >> "$RESULT"
curl -s -X POST "$BASE/api/members/${MEMBER_A}/points/adjust" \
  -H "$AUTH" -H "$BEARER" -H "Content-Type: application/json" \
  -d "@${DATA}/p05_over_redeem.json" >> "$RESULT" 2>&1
echo "" >> "$RESULT"
echo "--- 超额扣减后查询验证余额 ---" >> "$RESULT"
curl -s -H "$AUTH" -H "$BEARER" "$BASE/api/members/search?keyword=${MEMBER_A}" >> "$RESULT" 2>&1
echo "" >> "$RESULT"
echo "" >> "$RESULT"

echo "----- TC-P06: 对不存在会员调整积分 -----" >> "$RESULT"
echo "请求: 对memberId=999999999发放积分" >> "$RESULT"
curl -s -X POST "$BASE/api/members/999999999/points/adjust" \
  -H "$AUTH" -H "$BEARER" -H "Content-Type: application/json" \
  -d '{"accountType":"REWARD","amount":100,"increase":true}' >> "$RESULT" 2>&1
echo "" >> "$RESULT"
echo "" >> "$RESULT"

# ============================================================
# 第三部分: 等级调整 (POST /tier/adjust)
# 使用会员: 1782893727647169 (GOLD等级)
# ============================================================
echo "============================================" >> "$RESULT"
echo "第三部分: 等级调整 (POST /tier/adjust)" >> "$RESULT"
echo "============================================" >> "$RESULT"

MEMBER_T="1782893727647169"

echo "----- TC-T01: 升级 GOLD -> PLATINUM -----" >> "$RESULT"
echo "请求: newTier=PLATINUM" >> "$RESULT"
curl -s -X POST "$BASE/api/members/${MEMBER_T}/tier/adjust" \
  -H "$AUTH" -H "$BEARER" -H "Content-Type: application/json" \
  -d '{"newTier":"PLATINUM"}' >> "$RESULT" 2>&1
echo "" >> "$RESULT"
echo "--- 升级后查询 ---" >> "$RESULT"
curl -s -H "$AUTH" -H "$BEARER" "$BASE/api/members/search?keyword=${MEMBER_T}" >> "$RESULT" 2>&1
echo "" >> "$RESULT"
echo "" >> "$RESULT"

echo "----- TC-T02: 降级 PLATINUM -> BASE -----" >> "$RESULT"
echo "请求: newTier=BASE" >> "$RESULT"
curl -s -X POST "$BASE/api/members/${MEMBER_T}/tier/adjust" \
  -H "$AUTH" -H "$BEARER" -H "Content-Type: application/json" \
  -d '{"newTier":"BASE"}' >> "$RESULT" 2>&1
echo "" >> "$RESULT"
echo "--- 降级后查询 ---" >> "$RESULT"
curl -s -H "$AUTH" -H "$BEARER" "$BASE/api/members/search?keyword=${MEMBER_T}" >> "$RESULT" 2>&1
echo "" >> "$RESULT"
echo "" >> "$RESULT"

echo "----- TC-T03: 设置不存在的等级 -----" >> "$RESULT"
echo "请求: newTier=SUPER_VIP" >> "$RESULT"
curl -s -X POST "$BASE/api/members/${MEMBER_T}/tier/adjust" \
  -H "$AUTH" -H "$BEARER" -H "Content-Type: application/json" \
  -d '{"newTier":"SUPER_VIP"}' >> "$RESULT" 2>&1
echo "" >> "$RESULT"
echo "--- 设置后查询(是否被修改) ---" >> "$RESULT"
curl -s -H "$AUTH" -H "$BEARER" "$BASE/api/members/search?keyword=${MEMBER_T}" >> "$RESULT" 2>&1
echo "" >> "$RESULT"
echo "" >> "$RESULT"

echo "----- TC-T04: 设置相同等级 BASE -> BASE(幂等) -----" >> "$RESULT"
curl -s -X POST "$BASE/api/members/${MEMBER_T}/tier/adjust" \
  -H "$AUTH" -H "$BEARER" -H "Content-Type: application/json" \
  -d '{"newTier":"BASE"}' >> "$RESULT" 2>&1
echo "" >> "$RESULT"
echo "--- 幂等操作后查询 ---" >> "$RESULT"
curl -s -H "$AUTH" -H "$BEARER" "$BASE/api/members/search?keyword=${MEMBER_T}" >> "$RESULT" 2>&1
echo "" >> "$RESULT"
echo "" >> "$RESULT"

echo "----- TC-T05: 对不存在会员调整等级 -----" >> "$RESULT"
curl -s -X POST "$BASE/api/members/999999999/tier/adjust" \
  -H "$AUTH" -H "$BEARER" -H "Content-Type: application/json" \
  -d '{"newTier":"GOLD"}' >> "$RESULT" 2>&1
echo "" >> "$RESULT"
echo "" >> "$RESULT"

# ============================================================
# 第四部分: 冻结/解冻 (POST /freeze & /unfreeze)
# 使用会员: 1782893727933019 (TC03, SILVER等级)
# ============================================================
echo "============================================" >> "$RESULT"
echo "第四部分: 冻结/解冻 (POST /freeze & /unfreeze)" >> "$RESULT"
echo "============================================" >> "$RESULT"

MEMBER_F="1782893727933019"

echo "----- TC-F01: 冻结会员 -----" >> "$RESULT"
curl -s -X POST "$BASE/api/members/${MEMBER_F}/freeze" \
  -H "$AUTH" -H "$BEARER" -H "Content-Type: application/json" >> "$RESULT" 2>&1
echo "" >> "$RESULT"
echo "--- 冻结后查询状态 ---" >> "$RESULT"
curl -s -H "$AUTH" -H "$BEARER" "$BASE/api/members/search?keyword=${MEMBER_F}" >> "$RESULT" 2>&1
echo "" >> "$RESULT"
echo "" >> "$RESULT"

echo "----- TC-F02: 重复冻结(已冻结再冻结) -----" >> "$RESULT"
curl -s -X POST "$BASE/api/members/${MEMBER_F}/freeze" \
  -H "$AUTH" -H "$BEARER" -H "Content-Type: application/json" >> "$RESULT" 2>&1
echo "" >> "$RESULT"
echo "--- 重复冻结后查询 ---" >> "$RESULT"
curl -s -H "$AUTH" -H "$BEARER" "$BASE/api/members/search?keyword=${MEMBER_F}" >> "$RESULT" 2>&1
echo "" >> "$RESULT"
echo "" >> "$RESULT"

echo "----- TC-F03: 解冻会员 -----" >> "$RESULT"
curl -s -X POST "$BASE/api/members/${MEMBER_F}/unfreeze" \
  -H "$AUTH" -H "$BEARER" -H "Content-Type: application/json" >> "$RESULT" 2>&1
echo "" >> "$RESULT"
echo "--- 解冻后查询状态 ---" >> "$RESULT"
curl -s -H "$AUTH" -H "$BEARER" "$BASE/api/members/search?keyword=${MEMBER_F}" >> "$RESULT" 2>&1
echo "" >> "$RESULT"
echo "" >> "$RESULT"

echo "----- TC-F04: 冻结不存在的会员 -----" >> "$RESULT"
curl -s -X POST "$BASE/api/members/999999999/freeze" \
  -H "$AUTH" -H "$BEARER" -H "Content-Type: application/json" >> "$RESULT" 2>&1
echo "" >> "$RESULT"
echo "" >> "$RESULT"

echo "----- TC-F05: 解冻不存在的会员 -----" >> "$RESULT"
curl -s -X POST "$BASE/api/members/999999999/unfreeze" \
  -H "$AUTH" -H "$BEARER" -H "Content-Type: application/json" >> "$RESULT" 2>&1
echo "" >> "$RESULT"
echo "" >> "$RESULT"

# ============================================================
# 第五部分: 会员合并 (POST /merge)
# 使用会员: A=1782893727198007 (有积分) + B=1782893728523653 (无手机号)
# ============================================================
echo "============================================" >> "$RESULT"
echo "第五部分: 会员合并 (POST /merge)" >> "$RESULT"
echo "============================================" >> "$RESULT"

echo "----- TC-MG01: 创建合并任务(主: 1782893727198007, 副: 1782893728523653) -----" >> "$RESULT"
curl -s -X POST "$BASE/api/members/merge" \
  -H "$AUTH" -H "$BEARER" -H "Content-Type: application/json" \
  -d "@${DATA}/mg01_merge.json" >> "$RESULT" 2>&1
echo "" >> "$RESULT"
echo "" >> "$RESULT"

echo "----- TC-MG02: 合并不存在的会员 -----" >> "$RESULT"
curl -s -X POST "$BASE/api/members/merge" \
  -H "$AUTH" -H "$BEARER" -H "Content-Type: application/json" \
  -d "@${DATA}/mg02_merge_nonexist.json" >> "$RESULT" 2>&1
echo "" >> "$RESULT"
echo "" >> "$RESULT"

echo "----- TC-MG03: 合并任务状态查询(通过memberId查合并后的会员) -----" >> "$RESULT"
echo "--- 主会员状态 ---" >> "$RESULT"
curl -s -H "$AUTH" -H "$BEARER" "$BASE/api/members/search?keyword=1782893727198007" >> "$RESULT" 2>&1
echo "" >> "$RESULT"
echo "" >> "$RESULT"
echo "--- 被合并会员状态(可能已标记为MERGED) ---" >> "$RESULT"
curl -s -H "$AUTH" -H "$BEARER" "$BASE/api/members/search?keyword=1782893728523653" >> "$RESULT" 2>&1
echo "" >> "$RESULT"
echo "" >> "$RESULT"

echo "========== 测试完毕 ==========" >> "$RESULT"
