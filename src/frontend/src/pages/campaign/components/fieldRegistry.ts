/**
 * 人群筛选字段注册表 — 完全动态的统计定义
 * 根据 campaign_final_update_1.md 第4章设计
 *
 * 用户自己定义统计指标，不依赖任何预聚合字段
 */

export interface FieldMetadata {
  key: string;
  label: string;
  group: 'member_attr' | 'dynamic_stat';
  dataType: 'string' | 'number' | 'date' | 'boolean' | 'enum';
  enumOptions?: { label: string; value: string }[];
  description?: string;
}

// ====== 静态属性（会员基础信息） ======
export const STATIC_ATTR_FIELDS: Record<string, FieldMetadata> = {
  tier_code: { key: 'tier_code', label: '会员等级', group: 'member_attr', dataType: 'enum',
    enumOptions: [{ label: '青铜', value: 'BRONZE' }, { label: '白银', value: 'SILVER' }, { label: '黄金', value: 'GOLD' }, { label: '铂金', value: 'PLATINUM' }, { label: '钻石', value: 'DIAMOND' }] },
  status: { key: 'status', label: '会员状态', group: 'member_attr', dataType: 'enum',
    enumOptions: [{ label: '活跃', value: 'ACTIVE' }, { label: '休眠', value: 'DORMANT' }, { label: '已停用', value: 'INACTIVE' }] },
  gender: { key: 'gender', label: '性别', group: 'member_attr', dataType: 'enum',
    enumOptions: [{ label: '男', value: 'M' }, { label: '女', value: 'F' }] },
  register_date: { key: 'register_date', label: '注册日期', group: 'member_attr', dataType: 'date' },
  blacklist_flag: { key: 'blacklist_flag', label: '黑名单', group: 'member_attr', dataType: 'boolean' },
};

// ====== 动态统计 — 数据源 ======
export const DATA_SOURCES = [
  { label: '订单明细', value: 'order_fact', fields: ['order_id', 'order_date', 'order_amount', 'net_amount', 'discount_amount', 'channel', 'sku_code', 'sku_name', 'category_code', 'category_name', 'brand_code', 'brand_name', 'quantity', 'unit_price', 'line_amount'] },
  { label: '积分流水', value: 'points_transaction', fields: ['transaction_date', 'point_type', 'amount', 'balance_after', 'reason'] },
  { label: '等级变更', value: 'tier_change_log', fields: ['change_date', 'from_tier', 'to_tier', 'reason'] },
];

// ====== 动态统计 — 聚合函数 ======
export const AGGREGATION_FUNCS = [
  { label: '计数 (COUNT)', value: 'COUNT' },
  { label: '求和 (SUM)', value: 'SUM' },
  { label: '平均 (AVG)', value: 'AVG' },
  { label: '最大 (MAX)', value: 'MAX' },
  { label: '最小 (MIN)', value: 'MIN' },
  { label: '去重计数 (COUNT_DISTINCT)', value: 'COUNT_DISTINCT' },
];

export const CONDITION_OPERATORS = [
  { label: '等于 (=)', value: 'eq' },
  { label: '不等于 (!=)', value: 'ne' },
  { label: '大于 (>)', value: 'gt' },
  { label: '大于等于 (>=)', value: 'gte' },
  { label: '小于 (<)', value: 'lt' },
  { label: '小于等于 (<=)', value: 'lte' },
  { label: '包含 (in)', value: 'in' },
];

export const TIME_WINDOW_TYPES = [
  { label: '全部历史', value: 'ALL' },
  { label: '最近N天', value: 'LAST_N_DAYS' },
  { label: '自定义', value: 'CUSTOM' },
];