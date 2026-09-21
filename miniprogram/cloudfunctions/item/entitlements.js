/**
 * 家庭容量档：计划 / 产品常量与解析。
 * 云函数隔离部署，item / family / ai / activity 各持一份，内容须保持一致。
 */
const crypto = require('crypto')

const FREE_PLAN_ID = 'free'

const PLANS = {
  free: {
    familyLimit: 1,
    memberLimit: 2,
    itemLimit: 50,
    activityLimit: 30
  },
  capacity_std: {
    // null = 不限（activityLimit 除外，消息保留始终有限）
    familyLimit: null,
    memberLimit: null,
    itemLimit: null,
    activityLimit: 200
  }
}

const PRODUCTS = {
  capacity_90d: { planId: 'capacity_std', days: 90 },
  capacity_365d: { planId: 'capacity_std', days: 365 }
}

const LIMIT_KEYS = ['familyLimit', 'memberLimit', 'itemLimit', 'activityLimit']

function normalizeCode(code) {
  return String(code || '')
    .trim()
    .toUpperCase()
    .replace(/[\s-]+/g, '')
}

function hashCode(plaintext) {
  return crypto.createHash('sha256').update(normalizeCode(plaintext), 'utf8').digest('hex')
}

function isSubscriptionActive(sub, now = Date.now()) {
  return !!(sub && sub.expiresAt && Number(sub.expiresAt) > now)
}

function resolveOneLimit(plan, override, key) {
  let value = plan[key] == null ? null : Number(plan[key])
  if (override && typeof override === 'object' && Object.prototype.hasOwnProperty.call(override, key)) {
    const v = override[key]
    value = v === null || v === '' ? null : Number(v)
    if (value != null && !Number.isFinite(value)) {
      const free = PLANS.free[key]
      value = free == null ? null : Number(free)
    }
  }
  return value
}

function resolveLimits(planId, override) {
  const plan = PLANS[planId] || PLANS.free
  const out = {}
  for (let i = 0; i < LIMIT_KEYS.length; i++) {
    const key = LIMIT_KEYS[i]
    out[key] = resolveOneLimit(plan, override, key)
  }
  return out
}

/** 无订阅或已过期 → free；有效则用 planId + limitsOverride */
function resolveEffectiveFromSub(sub, now = Date.now()) {
  if (!isSubscriptionActive(sub, now)) {
    return {
      planId: FREE_PLAN_ID,
      active: false,
      expiresAt: sub && sub.expiresAt != null ? Number(sub.expiresAt) : null,
      product: (sub && sub.product) || null,
      ...resolveLimits(FREE_PLAN_ID, null)
    }
  }
  const planId = sub.planId && PLANS[sub.planId] ? sub.planId : 'capacity_std'
  return {
    planId,
    active: true,
    expiresAt: Number(sub.expiresAt),
    product: sub.product || null,
    ...resolveLimits(planId, sub.limitsOverride)
  }
}

function getProduct(productId) {
  const id = String(productId || '').trim()
  const product = PRODUCTS[id]
  if (!product) return null
  return { id, ...product }
}

module.exports = {
  FREE_PLAN_ID,
  PLANS,
  PRODUCTS,
  LIMIT_KEYS,
  normalizeCode,
  hashCode,
  isSubscriptionActive,
  resolveLimits,
  resolveEffectiveFromSub,
  getProduct
}
