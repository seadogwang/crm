#!/bin/bash
# 会员功能测试 - 执行脚本
# 输出结果到 member_test_results.txt

TOKEN="eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIiwidXNlcm5hbWUiOiJzdXBlcmFkbWluIiwicm9sZSI6IlNVUEVSX0FETUlOIiwicHJvZ3JhbV9jb2RlIjoiKiIsInBlcm1pc3Npb25zIjpbIlBPSU5UU19BREpVU1QiLCJSVUxFX1JFQUQiLCJSVUxFX1dSSVRFIiwiUlVMRV9QVUJMSVNIIiwiTUVNQkVSX1JFQUQiLCJQT0lOVFNfR1JBTlQiLCJTQ0hFTUFfUkVBRCIsIkFVRElUX0VYUE9SVCIsIlBPSU5UU19SRURFRU0iLCJTQ0hFTUFfV1JJVEUiLCJNRU1CRVJfV1JJVEUiLCJDSEFOTkVMX1dSSVRFIiwiVEVOQU5UX1dSSVRFIiwiVEVOQU5UX1JFQUQiLCJNRU1CRVJfREVMRVRFIiwiQVVESVRfUkVBRCIsIkNIQU5ORUxfUkVBRCJdLCJpYXQiOjE3ODI4OTM2MTMsImV4cCI6MTc4Mjk4MDAxM30.IsjVQ5FAl0YVTsaIb1GOe3KA9VY898XvXy7CY60JAcA"
AUTH="X-Program-Code: PROG001"
BEARER="Authorization: Bearer ${TOKEN}"
BASE="http://localhost:8081"
RESULT_FILE="D:/Project/Loyalty-saas/member_test_results.txt"

echo "========== 会员功能API测试结果 ==========" > "$RESULT_FILE"
echo "测试日期: 2026-07-01" >> "$RESULT_FILE"
echo "" >> "$RESULT_FILE"


# ========== TC01: 最小必填信息 ==========
echo "===== [TC01] 最小必填信息注册 =====" >> "$RESULT_FILE"
echo "请求: mobile=13900000001, name=张三, 默认BASE等级" >> "$RESULT_FILE"
echo "--- 创建响应 ---" >> "$RESULT_FILE"
curl -s -X POST "$BASE/api/members" -H "$AUTH" -H "$BEARER" -H "Content-Type: application/json" \
  -d '{"terms_accepted":true,"ext_attributes":{"mobile":"13900000001","name":"张三"}}' >> "$RESULT_FILE" 2>&1
echo "" >> "$RESULT_FILE"
echo "--- 搜索验证 ---" >> "$RESULT_FILE"
curl -s -H "$AUTH" -H "$BEARER" "$BASE/api/members/search?keyword=13900000001" >> "$RESULT_FILE" 2>&1
echo "" >> "$RESULT_FILE"
echo "" >> "$RESULT_FILE"


# ========== TC02: 完整信息注册 ==========
echo "===== [TC02] 完整信息注册 =====" >> "$RESULT_FILE"
echo "请求: mobile=13900000002, name=李四, gender=MALE, birthday=1995-06-15, tier=GOLD" >> "$RESULT_FILE"
echo "--- 创建响应 ---" >> "$RESULT_FILE"
curl -s -X POST "$BASE/api/members" -H "$AUTH" -H "$BEARER" -H "Content-Type: application/json" \
  -d '{"terms_accepted":true,"tier_code":"GOLD","ext_attributes":{"mobile":"13900000002","name":"李四","gender":"MALE","birthday":"1995-06-15","email":"lisi@example.com","city":"北京","occupation":"工程师"}}' >> "$RESULT_FILE" 2>&1
echo "" >> "$RESULT_FILE"
echo "--- 搜索验证 ---" >> "$RESULT_FILE"
curl -s -H "$AUTH" -H "$BEARER" "$BASE/api/members/search?keyword=13900000002" >> "$RESULT_FILE" 2>&1
echo "" >> "$RESULT_FILE"
echo "" >> "$RESULT_FILE"


# ========== TC03: 女性会员注册 ==========
echo "===== [TC03] 女性会员注册 gender=FEMALE =====" >> "$RESULT_FILE"
echo "请求: mobile=13900000003, name=王芳, gender=FEMALE, tier=SILVER" >> "$RESULT_FILE"
echo "--- 创建响应 ---" >> "$RESULT_FILE"
curl -s -X POST "$BASE/api/members" -H "$AUTH" -H "$BEARER" -H "Content-Type: application/json" \
  -d '{"terms_accepted":true,"tier_code":"SILVER","ext_attributes":{"mobile":"13900000003","name":"王芳","gender":"FEMALE"}}' >> "$RESULT_FILE" 2>&1
echo "" >> "$RESULT_FILE"
echo "--- 搜索验证 ---" >> "$RESULT_FILE"
curl -s -H "$AUTH" -H "$BEARER" "$BASE/api/members/search?keyword=13900000003" >> "$RESULT_FILE" 2>&1
echo "" >> "$RESULT_FILE"
echo "" >> "$RESULT_FILE"


# ========== TC04: 白金会员注册 ==========
echo "===== [TC04] 白金会员注册 tier=PLATINUM =====" >> "$RESULT_FILE"
echo "请求: mobile=13900000004, name=赵六, tier=PLATINUM" >> "$RESULT_FILE"
echo "--- 创建响应 ---" >> "$RESULT_FILE"
curl -s -X POST "$BASE/api/members" -H "$AUTH" -H "$BEARER" -H "Content-Type: application/json" \
  -d '{"terms_accepted":true,"tier_code":"PLATINUM","ext_attributes":{"mobile":"13900000004","name":"赵六","gender":"MALE"}}' >> "$RESULT_FILE" 2>&1
echo "" >> "$RESULT_FILE"
echo "--- 搜索验证 ---" >> "$RESULT_FILE"
curl -s -H "$AUTH" -H "$BEARER" "$BASE/api/members/search?keyword=13900000004" >> "$RESULT_FILE" 2>&1
echo "" >> "$RESULT_FILE"
echo "" >> "$RESULT_FILE"


# ========== TC05: 无手机号注册 ==========
echo "===== [TC05] 无手机号注册 =====" >> "$RESULT_FILE"
echo "请求: 无mobile字段, name=无手机号会员" >> "$RESULT_FILE"
echo "--- 创建响应 ---" >> "$RESULT_FILE"
curl -s -X POST "$BASE/api/members" -H "$AUTH" -H "$BEARER" -H "Content-Type: application/json" \
  -d '{"terms_accepted":true,"tier_code":"BASE","ext_attributes":{"name":"无手机号会员","channel":"WECHAT"}}' >> "$RESULT_FILE" 2>&1
echo "" >> "$RESULT_FILE"
echo "--- 搜索验证(应返回未找到) ---" >> "$RESULT_FILE"
curl -s -H "$AUTH" -H "$BEARER" "$BASE/api/members/search?keyword=无手机号会员" >> "$RESULT_FILE" 2>&1
echo "" >> "$RESULT_FILE"
echo "" >> "$RESULT_FILE"


# ========== TC06: 重复手机号注册 ==========
echo "===== [TC06] 重复手机号注册(异常) =====" >> "$RESULT_FILE"
echo "请求: 使用TC01已注册的手机号 13900000001" >> "$RESULT_FILE"
echo "--- 创建响应(期望ERR_MEMBER_EXISTS) ---" >> "$RESULT_FILE"
curl -s -X POST "$BASE/api/members" -H "$AUTH" -H "$BEARER" -H "Content-Type: application/json" \
  -d '{"terms_accepted":true,"ext_attributes":{"mobile":"13900000001","name":"重复注册测试"}}' >> "$RESULT_FILE" 2>&1
echo "" >> "$RESULT_FILE"
echo "" >> "$RESULT_FILE"


# ========== TC07: 无terms_accepted ==========
echo "===== [TC07] 不带terms_accepted注册(异常) =====" >> "$RESULT_FILE"
echo "请求: terms_accepted=false" >> "$RESULT_FILE"
echo "--- 创建响应(期望ERR_TERMS_NOT_ACCEPTED) ---" >> "$RESULT_FILE"
curl -s -X POST "$BASE/api/members" -H "$AUTH" -H "$BEARER" -H "Content-Type: application/json" \
  -d '{"terms_accepted":false,"ext_attributes":{"mobile":"13900000007"}}' >> "$RESULT_FILE" 2>&1
echo "" >> "$RESULT_FILE"
echo "" >> "$RESULT_FILE"


# ========== TC08: 中文+特殊字符 ==========
echo "===== [TC08] 中文+特殊字符 =====" >> "$RESULT_FILE"
echo "请求: name=赵氏·子龙·测试号, 含emoji" >> "$RESULT_FILE"
echo "--- 创建响应 ---" >> "$RESULT_FILE"
curl -s -X POST "$BASE/api/members" -H "$AUTH" -H "$BEARER" -H "Content-Type: application/json" \
  -d '{"terms_accepted":true,"ext_attributes":{"mobile":"13900000008","name":"赵氏·子龙·测试号","nickname":"😊微笑测试","备注":"含中文备注信息"}}' >> "$RESULT_FILE" 2>&1
echo "" >> "$RESULT_FILE"
echo "--- 搜索验证 ---" >> "$RESULT_FILE"
curl -s -H "$AUTH" -H "$BEARER" "$BASE/api/members/search?keyword=13900000008" >> "$RESULT_FILE" 2>&1
echo "" >> "$RESULT_FILE"
echo "" >> "$RESULT_FILE"


# ========== TC09: name=100字符 ==========
echo "===== [TC09] name字段100字符边界 =====" >> "$RESULT_FILE"
NAME100="ABCDEFGHIJABCDEFGHIJABCDEFGHIJABCDEFGHIJABCDEFGHIJABCDEFGHIJABCDEFGHIJABCDEFGHIJABCDEFGHIJABCDEFGHIJ"
echo "请求: name=100个字符(10x10)" >> "$RESULT_FILE"
echo "--- 创建响应 ---" >> "$RESULT_FILE"
curl -s -X POST "$BASE/api/members" -H "$AUTH" -H "$BEARER" -H "Content-Type: application/json" \
  -d "{\"terms_accepted\":true,\"ext_attributes\":{\"mobile\":\"13900000009\",\"name\":\"${NAME100}\"}}" >> "$RESULT_FILE" 2>&1
echo "" >> "$RESULT_FILE"
echo "--- 搜索验证 ---" >> "$RESULT_FILE"
curl -s -H "$AUTH" -H "$BEARER" "$BASE/api/members/search?keyword=13900000009" >> "$RESULT_FILE" 2>&1
echo "" >> "$RESULT_FILE"
echo "" >> "$RESULT_FILE"


# ========== TC10: 自定义memberId ==========
echo "===== [TC10] 自定义memberId注册 =====" >> "$RESULT_FILE"
echo "请求: member_id=9000000001" >> "$RESULT_FILE"
echo "--- 创建响应 ---" >> "$RESULT_FILE"
curl -s -X POST "$BASE/api/members" -H "$AUTH" -H "$BEARER" -H "Content-Type: application/json" \
  -d '{"member_id":9000000001,"terms_accepted":true,"tier_code":"GOLD","ext_attributes":{"mobile":"13900000010","name":"自定义ID会员"}}' >> "$RESULT_FILE" 2>&1
echo "" >> "$RESULT_FILE"
echo "--- 搜索验证 ---" >> "$RESULT_FILE"
curl -s -H "$AUTH" -H "$BEARER" "$BASE/api/members/search?keyword=13900000010" >> "$RESULT_FILE" 2>&1
echo "" >> "$RESULT_FILE"
echo "--- 通过memberId搜索验证 ---" >> "$RESULT_FILE"
curl -s -H "$AUTH" -H "$BEARER" "$BASE/api/members/search?keyword=9000000001" >> "$RESULT_FILE" 2>&1
echo "" >> "$RESULT_FILE"
echo "" >> "$RESULT_FILE"


# ========== TC11: +86前缀手机号 ==========
echo "===== [TC11] +86前缀手机号注册 =====" >> "$RESULT_FILE"
echo "请求: mobile=+8613900000011" >> "$RESULT_FILE"
echo "--- 创建响应 ---" >> "$RESULT_FILE"
curl -s -X POST "$BASE/api/members" -H "$AUTH" -H "$BEARER" -H "Content-Type: application/json" \
  -d '{"terms_accepted":true,"ext_attributes":{"mobile":"+8613900000011","name":"加86前缀测试"}}' >> "$RESULT_FILE" 2>&1
echo "" >> "$RESULT_FILE"
echo "--- 搜索验证(用纯数字13900000011) ---" >> "$RESULT_FILE"
curl -s -H "$AUTH" -H "$BEARER" "$BASE/api/members/search?keyword=13900000011" >> "$RESULT_FILE" 2>&1
echo "" >> "$RESULT_FILE"
echo "" >> "$RESULT_FILE"


# ========== TC12: 超长ext_attributes ==========
echo "===== [TC12] 丰富ext_attributes =====" >> "$RESULT_FILE"
echo "请求: 包含生日/邮箱/地址/标签等多字段" >> "$RESULT_FILE"
echo "--- 创建响应 ---" >> "$RESULT_FILE"
curl -s -X POST "$BASE/api/members" -H "$AUTH" -H "$BEARER" -H "Content-Type: application/json" \
  -d '{"terms_accepted":true,"tier_code":"PLATINUM","ext_attributes":{"mobile":"13900000012","name":"VIP会员","gender":"FEMALE","birthday":"1988-12-25","email":"vip@example.com","province":"广东省","city":"深圳市","district":"南山区","address":"科技园南区100号","occupation":"产品经理","annualIncome":"500000","hobby":"游泳,阅读,旅行","membershipSource":"APP","tags":["VIP","高净值","活跃用户"]}}' >> "$RESULT_FILE" 2>&1
echo "" >> "$RESULT_FILE"
echo "--- 搜索验证 ---" >> "$RESULT_FILE"
curl -s -H "$AUTH" -H "$BEARER" "$BASE/api/members/search?keyword=13900000012" >> "$RESULT_FILE" 2>&1
echo "" >> "$RESULT_FILE"
echo "" >> "$RESULT_FILE"


# ========== TC13: 手机号格式测试 ==========
echo "===== [TC13a] 手机号含空格 =====" >> "$RESULT_FILE"
echo "请求: mobile=139 0000 0013" >> "$RESULT_FILE"
echo "--- 创建响应 ---" >> "$RESULT_FILE"
curl -s -X POST "$BASE/api/members" -H "$AUTH" -H "$BEARER" -H "Content-Type: application/json" \
  -d '{"terms_accepted":true,"ext_attributes":{"mobile":"139 0000 0013","name":"空格格式手机号"}}' >> "$RESULT_FILE" 2>&1
echo "" >> "$RESULT_FILE"
echo "--- 搜索验证(用13900000013) ---" >> "$RESULT_FILE"
curl -s -H "$AUTH" -H "$BEARER" "$BASE/api/members/search?keyword=13900000013" >> "$RESULT_FILE" 2>&1
echo "" >> "$RESULT_FILE"
echo "" >> "$RESULT_FILE"

echo "===== [TC13b] 手机号含横线 =====" >> "$RESULT_FILE"
echo "请求: mobile=139-0000-0014" >> "$RESULT_FILE"
echo "--- 创建响应 ---" >> "$RESULT_FILE"
curl -s -X POST "$BASE/api/members" -H "$AUTH" -H "$BEARER" -H "Content-Type: application/json" \
  -d '{"terms_accepted":true,"ext_attributes":{"mobile":"139-0000-0014","name":"横线格式手机号"}}' >> "$RESULT_FILE" 2>&1
echo "" >> "$RESULT_FILE"
echo "--- 搜索验证(用13900000014) ---" >> "$RESULT_FILE"
curl -s -H "$AUTH" -H "$BEARER" "$BASE/api/members/search?keyword=13900000014" >> "$RESULT_FILE" 2>&1
echo "" >> "$RESULT_FILE"
echo "" >> "$RESULT_FILE"

echo "========== 测试完毕 ==========" >> "$RESULT_FILE"
