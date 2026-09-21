const { callActivity } = require('../../utils/cloud')
const { bindThemeToPage } = require('../../utils/theme')
const { formatActivityLine } = require('../../utils/activityLine')
const { navigateToItemDetail } = require('../../utils/itemDetailNav')
const copy = require('../../utils/copy')

function formatRelativeTime(ts) {
  const t = Number(ts) || 0
  if (!t) return ''
  const diff = Date.now() - t
  if (diff < 60 * 1000) return copy.messages.justNow
  if (diff < 60 * 60 * 1000) {
    return copy.messages.minutesAgo(Math.floor(diff / (60 * 1000)))
  }
  if (diff < 24 * 60 * 60 * 1000) {
    return copy.messages.hoursAgo(Math.floor(diff / (60 * 60 * 1000)))
  }
  if (diff < 7 * 24 * 60 * 60 * 1000) {
    return copy.messages.daysAgo(Math.floor(diff / (24 * 60 * 60 * 1000)))
  }
  const d = new Date(t)
  return `${d.getMonth() + 1}/${d.getDate()}`
}

function mapRows(list) {
  return (list || []).map((row) => {
    const nickname =
      (row && row.actorNickname && String(row.actorNickname).trim()) || ''
    const initial = nickname ? nickname.slice(0, 1) : '家'
    return {
      _id: row._id,
      line: formatActivityLine(row, copy.messages),
      timeLabel: formatRelativeTime(row.createdAt),
      itemId: row.itemId,
      action: row.action,
      avatarUrl: (row && row.actorAvatarUrl) || '',
      initial
    }
  })
}

/** 家庭页 / session 已写入的权益，不另打接口 */
function getFamilyEntitlement() {
  try {
    const app = getApp()
    const family = app && app.globalData && app.globalData.family
    return (family && family.entitlement) || null
  } catch (e) {
    return null
  }
}

function isEntitlementActive(ent) {
  if (!ent) return false
  const expiresAt = Number(ent.expiresAt)
  if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) return false
  // withCapacity 会带 active；兑换写入的快照可能只有 expiresAt
  if (ent.active === false) return false
  return true
}

/**
 * list 可能因未上传 activity 云函数 / 读缓存滞后缺 active；
 * 与内存里的家庭权益取并集，避免 VIP 仍显示免费。
 */
function resolveActivityPlan(res) {
  const famEnt = getFamilyEntitlement()
  const famActive = isEntitlementActive(famEnt)
  const listActive = !!(res && res.active)
  const active = famActive || listActive

  let activityLimit = Number(res && res.activityLimit)
  if (!Number.isFinite(activityLimit) || activityLimit <= 0) {
    activityLimit = Number(famEnt && famEnt.activityLimit)
  }
  if (!Number.isFinite(activityLimit) || activityLimit <= 0) {
    activityLimit = active ? 200 : 30
  }
  // list 缓存仍是免费 30、但家庭已是 VIP：按加强档展示
  if (active && activityLimit <= 30) {
    const fromFam = Number(famEnt && famEnt.activityLimit)
    activityLimit = Number.isFinite(fromFam) && fromFam > 30 ? fromFam : 200
  }
  return { active, activityLimit }
}

function buildFooter(res, rowCount) {
  if (!rowCount) {
    return { showFooter: false, footerText: '' }
  }
  const plan = resolveActivityPlan(res)
  return {
    showFooter: true,
    footerText: plan.active
      ? copy.messages.footerActive(plan.activityLimit)
      : copy.messages.footerFree(plan.activityLimit)
  }
}

Page({
  data: {
    copy: copy.messages,
    common: copy.common,
    loading: true,
    loadingColors: ['#C4A484', '#C4A484'],
    error: '',
    rows: [],
    showFooter: false,
    footerText: '',
    theme: null,
    headerTitle: copy.messages.title
  },

  onShow() {
    bindThemeToPage(this, { headerTitle: copy.messages.title })
    this.load()
  },

  async load() {
    this.setData({ loading: true, error: '' })
    try {
      const res = await callActivity('list', { limit: 200 })
      const rows = mapRows((res && res.list) || [])
      const footer = buildFooter(res, rows.length)
      this.setData({
        rows,
        loading: false,
        showFooter: footer.showFooter,
        footerText: footer.footerText
      })
    } catch (e) {
      this.setData({
        loading: false,
        error: e.message || copy.common.loadFailed,
        rows: [],
        showFooter: false,
        footerText: ''
      })
    }
  },

  onRetry() {
    this.load()
  },

  onOpenItem(e) {
    const itemId = e.currentTarget.dataset.id
    const action = e.currentTarget.dataset.action
    if (!itemId || action === 'remove' || action === 'create_batch' || action === 'remove_batch') return
    navigateToItemDetail(itemId)
  }
})
