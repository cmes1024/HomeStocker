const { listItems, listSpaces, loadHomeBoard: fetchHomeBoard, loadHomeBootstrap, countItems, listExpiringItems } = require('../../utils/db')
const { callSpace, callItem } = require('../../utils/cloud')
const { routeByMembership } = require('../../utils/route')
const { rememberSession } = require('../../utils/session')
const { bindThemeToPage, setAppFamily } = require('../../utils/theme')
const { enrichLedgerItemsAsync } = require('../../utils/runLedgerEnrich')
const { shanghaiTodayYmd, normalizeDateInput } = require('../../utils/expireStatus')
const { navigateToItemDetail } = require('../../utils/itemDetailNav')
const copy = require('../../utils/copy')
const { appName } = require('../../config/index')

/** v2：空字符串 = 全部；旧 key 不再读取，避免默认卡在空仓库 */
const FILTER_SPACE_KEY = 'itemsFilterSpaceId_v2'
const FILTER_ALL_ID = '__all__'

function readSavedFilterSpaceId() {
  try {
    const raw = wx.getStorageSync(FILTER_SPACE_KEY)
    if (raw === undefined || raw === null || raw === '') return ''
    return String(raw)
  } catch (e) {
    return ''
  }
}

function writeSavedFilterSpaceId(id) {
  try {
    if (!id) {
      wx.removeStorageSync(FILTER_SPACE_KEY)
    } else {
      wx.setStorageSync(FILTER_SPACE_KEY, id)
    }
  } catch (e) {
    // ignore
  }
}

function filterLabel(spaces, filterSpaceId) {
  if (!filterSpaceId) return copy.items.filterAll
  const space = (spaces || []).find((s) => s && s._id === filterSpaceId)
  return (space && space.name) || copy.items.defaultSpaceName
}

function selectionLabels(selectedCount) {
  const n = selectedCount || 0
  return {
    selectedCount: n,
    selectedCountLabel: copy.items.selectedCount(n),
    batchRemoveLabel: n > 0 ? copy.items.batchRemoveN(n) : copy.items.batchRemove
  }
}

function emptySelectionState() {
  return {
    managing: false,
    selectedMap: {},
    batchRemoving: false,
    ...selectionLabels(0)
  }
}

/** 清单筛选 / 分块：非默认在前，isDefault 兜底空间沉底（不看名称） */
function spacesForLedgerFilter(spaces) {
  const normal = []
  const defaults = []
  ;(spaces || []).forEach((s) => {
    if (!s) return
    if (s.isDefault) defaults.push(s)
    else normal.push(s)
  })
  return normal.concat(defaults)
}

/**
 * 全部视图：按空间列表顺序分块；空空间不出现；未知空间挂到末尾。
 */
function buildItemGroups(items, spaces) {
  const list = items || []
  if (!list.length) return []

  const buckets = Object.create(null)
  const orphans = []
  list.forEach((item) => {
    if (!item) return
    const sid = item.spaceId ? String(item.spaceId) : ''
    if (!sid) {
      orphans.push(item)
      return
    }
    if (!buckets[sid]) buckets[sid] = []
    buckets[sid].push(item)
  })

  const groups = []
  const seen = Object.create(null)
  ;(spaces || []).forEach((space) => {
    if (!space || !space._id) return
    const sid = String(space._id)
    const gItems = buckets[sid]
    if (!gItems || !gItems.length) return
    seen[sid] = true
    groups.push({
      spaceId: sid,
      name: space.name || copy.items.defaultSpaceName,
      count: gItems.length,
      items: gItems
    })
  })

  Object.keys(buckets).forEach((sid) => {
    if (seen[sid]) return
    const gItems = buckets[sid]
    if (!gItems || !gItems.length) return
    groups.push({
      spaceId: sid,
      name: (gItems[0] && gItems[0].spaceName) || copy.items.defaultSpaceName,
      count: gItems.length,
      items: gItems
    })
  })

  if (orphans.length) {
    groups.push({
      spaceId: '_orphan',
      name: copy.items.defaultSpaceName,
      count: orphans.length,
      items: orphans
    })
  }

  return groups
}

function daysUntilExpire(expireDate, now = Date.now()) {
  const date = normalizeDateInput(expireDate)
  if (!date) return null
  const today = shanghaiTodayYmd(now)
  const [y1, m1, d1] = today.split('-').map(Number)
  const [y2, m2, d2] = date.split('-').map(Number)
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86400000)
}

function dueLabel(expireDate) {
  const days = daysUntilExpire(expireDate)
  if (days == null) return '即将到期'
  if (days < 0) return '已过期'
  if (days === 0) return '今天到期'
  return `${days}天后到期`
}

function buildExpireBanner(item, spaceName, locationName, count = 1) {
  if (!item) return null
  const total = Math.max(1, Number(count) || 1)
  const days = daysUntilExpire(item.expireDate)
  const itemId = item._id || ''

  if (total > 1) {
    let message
    if (days == null) {
      message = `有${total}件物品即将到期`
    } else if (days < 0) {
      message = `有${total}件物品已过期或即将到期`
    } else if (days === 0) {
      message = `有${total}件物品即将到期，最早今天到期`
    } else {
      message = `有${total}件物品即将到期，最早${days}天后到期`
    }
    return { place: '', message, itemId, count: total }
  }

  const place = [spaceName, locationName].filter(Boolean).join('-')
  const name = String(item.name || '').trim() || '物品'
  let message
  if (days == null) {
    message = place ? `里的${name}即将到期` : `${name}即将到期`
  } else if (days < 0) {
    message = place ? `里的${name}已过期` : `${name}已过期`
  } else if (days === 0) {
    message = place ? `里的${name}将于今天到期` : `${name}将于今天到期`
  } else {
    message = place
      ? `里的${name}将于${days}天后到期`
      : `${name}将于${days}天后到期`
  }
  return { place, message, itemId, count: 1 }
}

Page({
  data: {
    copy: copy.items,
    common: copy.common,
    bootLoading: true,
    bootError: '',
    loading: false,
    error: '',
    items: [],
    itemGroups: [],
    collapsedSpaces: {},
    expireBanner: null,
    familyId: '',
    familyName: '',
    memberCount: 0,
    itemCount: 0,
    spaceCount: 0,
    statsReady: { members: false, items: false, spaces: false },
    headerTitle: appName,
    theme: null,
    spaces: [],
    filterSpaceId: '',
    filterSpaceName: copy.items.filterAll,
    sheetOpen: false,
    sheetKind: '',
    expireSheetLoading: false,
    expireSheetError: '',
    expireList: [],
    spaceLoading: false,
    pageColHeight: 0,
    animateTiles: true,
    loadingColors: ['#C4A484', '#8B6914'],
    managing: false,
    selectedMap: {},
    selectedCount: 0,
    selectedCountLabel: copy.items.selectedCount(0),
    batchRemoveLabel: copy.items.batchRemove,
    batchRemoving: false
  },

  onLoad() {
    wx.setNavigationBarTitle({ title: appName })
    const savedSpaceId = readSavedFilterSpaceId()
    bindThemeToPage(this, {
      headerTitle: appName,
      filterSpaceId: savedSpaceId,
      filterSpaceName: savedSpaceId ? copy.items.defaultSpaceName : copy.items.filterAll
    })
    this.syncPageColHeight()
    this.syncLoadingColors()
  },

  syncPageColHeight() {
    try {
      const menu = wx.getMenuButtonBoundingClientRect()
      const windowInfo = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync()
      const shellTop = menu.top + menu.height + 8 + 12
      const pageColHeight = Math.max((windowInfo.windowHeight || 0) - shellTop, 0)
      if (pageColHeight && pageColHeight !== this.data.pageColHeight) {
        this.setData({ pageColHeight })
      }
    } catch (e) {
      // keep stylesheet fallback
    }
  },

  syncLoadingColors() {
    const color = (this.data.theme && this.data.theme.themeColor) || '#C4A484'
    const prev = this.data.loadingColors
    if (prev && prev[0] === color && prev[1] === color) return
    this.setData({ loadingColors: [color, color] })
  },

  syncStats(patch = {}) {
    const memberCount = patch.memberCount !== undefined ? patch.memberCount : this.data.memberCount
    const itemCount = patch.itemCount !== undefined ? patch.itemCount : this.data.itemCount
    const spaceCount = patch.spaceCount !== undefined ? patch.spaceCount : this.data.spaceCount
    const prevReady = this.data.statsReady || {}
    const statsReady = {
      members: patch.membersReady !== undefined ? patch.membersReady : prevReady.members,
      items: patch.itemsReady !== undefined ? patch.itemsReady : prevReady.items,
      spaces: patch.spacesReady !== undefined ? patch.spacesReady : prevReady.spaces
    }
    return {
      ...patch,
      memberCount,
      itemCount,
      spaceCount,
      statsReady
    }
  },

  applyListView(items, spaces, filterSpaceId, collapsedSpaces) {
    const spaceList = spaces !== undefined ? spaces : this.data.spaces
    const spaceId = filterSpaceId !== undefined ? filterSpaceId : this.data.filterSpaceId
    const collapsed = collapsedSpaces !== undefined ? collapsedSpaces : this.data.collapsedSpaces || {}
    const groups = spaceId ? [] : buildItemGroups(items || [], spaceList)
    groups.forEach((g) => {
      const isCollapsed = !!collapsed[g.spaceId]
      g.collapsed = isCollapsed
      g.toggleLabel = isCollapsed ? copy.items.expandSpace : copy.items.collapseSpace
    })
    return {
      items: items || [],
      itemGroups: groups,
      collapsedSpaces: collapsed
    }
  },

  async onShow() {
    bindThemeToPage(this, { headerTitle: appName })
    this.syncLoadingColors()
    const hasStats = !!(this.data.statsReady && this.data.statsReady.items)
    if (!hasStats) {
      this.setData(this.syncStats({
        membersReady: false,
        itemsReady: false,
        spacesReady: false
      }))
    }
    try {
      const spaceIdHint = this.data.filterSpaceId || ''
      const booted = await this.bootFromBootstrap(spaceIdHint)
      if (booted) return
      await this.bootLegacy()
    } catch (e) {
      // bootError 已设置
    }
  },

  /**
   * 优先一次 bootstrap；未部署或失败则返回 false，走老路径。
   * @returns {Promise<boolean>}
   */
  async bootFromBootstrap(spaceIdHint) {
    let bundle
    try {
      this.setData({ bootLoading: true, bootError: '' })
      bundle = await loadHomeBootstrap({ spaceId: spaceIdHint || undefined })
    } catch (e) {
      if (e && e.code === 'NO_FAMILY') {
        setAppFamily(null)
        rememberSession({ hasFamily: false, family: null, currentFamilyId: null })
        wx.reLaunch({ url: '/pages/onboarding/index' })
        return true
      }
      // 未上传 bootstrap / 环境问题 → 降级
      return false
    }

    const family = bundle.family
    if (!family || !family._id) {
      setAppFamily(null)
      rememberSession({ hasFamily: false, family: null, currentFamilyId: null })
      wx.reLaunch({ url: '/pages/onboarding/index' })
      return true
    }

    setAppFamily(family)
    rememberSession({
      hasFamily: true,
      family,
      currentFamilyId: family._id
    })

    let spaces = spacesForLedgerFilter(bundle.spaces || [])
    let filterSpaceId = this.data.filterSpaceId || ''
    if (filterSpaceId && !spaces.some((s) => s && s._id === filterSpaceId)) {
      filterSpaceId = ''
      writeSavedFilterSpaceId('')
    }

    let board = bundle.board || { list: [], total: 0, expiringTop: null, expiringCount: 0 }
    if (filterSpaceId !== spaceIdHint) {
      try {
        board = await fetchHomeBoard({ spaceId: filterSpaceId || undefined })
      } catch (e) {
        // 保留 bootstrap 结果
      }
    }

    const familyName = family.name || ''
    const memberCount = family.memberCount || 0
    bindThemeToPage(this, {
      familyId: family._id,
      familyName,
      headerTitle: appName,
      bootLoading: false,
      ...this.syncStats({ memberCount, membersReady: true })
    })
    this.syncLoadingColors()

    const items = await enrichLedgerItemsAsync(board.list || [], {}, {}, {})
    const filterSpaceName = filterLabel(spaces, filterSpaceId)
    const managePatch = filterSpaceId ? {} : emptySelectionState()
    this.setData(
      this.syncStats({
        spaces,
        spaceCount: spaces.length,
        spacesReady: true,
        filterSpaceId,
        filterSpaceName,
        ...this.applyListView(items, spaces, filterSpaceId),
        ...managePatch,
        loading: false,
        itemCount: board.total,
        itemsReady: true
      })
    )

    const top = board.expiringTop
    let count = Number(board.expiringCount) || 0
    if (top && count < 1) count = 1
    this.applyExpireBanner(top, count || (top ? 1 : 0))
    return true
  },

  async bootLegacy() {
    const session = await routeByMembership(this, 'items')
    if (!session || !session.hasFamily) return
    setAppFamily(session.family)
    const familyName = (session.family && session.family.name) || ''
    const memberCount = (session.family && session.family.memberCount) || 0
    bindThemeToPage(this, {
      familyId: session.currentFamilyId,
      familyName,
      headerTitle: appName,
      bootLoading: false,
      ...this.syncStats({ memberCount, membersReady: true })
    })
    this.syncLoadingColors()

    const spaceIdHint = this.data.filterSpaceId || ''
    const spacesPromise = this.loadSpaces()
    const boardPromise = (async () => {
      await this.loadHomeBoard({ spaceId: spaceIdHint })
      const finalSpaceId = await spacesPromise
      if (finalSpaceId !== spaceIdHint) {
        await this.loadHomeBoard({
          silent: true,
          spaceId: finalSpaceId
        })
      }
    })()
    await Promise.all([spacesPromise, boardPromise])
  },

  onHide() {
    if (this.data.managing) this.exitManage()
  },

  onRetryBoot() {
    this.onShow()
  },

  async loadSpaces() {
    try {
      let spaces = await listSpaces()
      if (!spaces.length) {
        await callSpace('ensureDefault').catch(() => null)
        spaces = await listSpaces()
      }
      spaces = spacesForLedgerFilter(spaces)
      let filterSpaceId = this.data.filterSpaceId || ''
      if (filterSpaceId && !(spaces || []).some((s) => s && s._id === filterSpaceId)) {
        filterSpaceId = ''
        writeSavedFilterSpaceId('')
      }
      const filterSpaceName = filterLabel(spaces, filterSpaceId)
      const listPatch = this.applyListView(this.data.items, spaces, filterSpaceId)
      const managePatch = filterSpaceId ? {} : emptySelectionState()
      this.setData(this.syncStats({
        spaces,
        spaceCount: spaces.length,
        spacesReady: true,
        filterSpaceId,
        filterSpaceName,
        ...listPatch,
        ...managePatch
      }))
      return filterSpaceId
    } catch (e) {
      this.setData(this.syncStats({
        spaces: [],
        spaceCount: 0,
        spacesReady: true,
        itemGroups: []
      }))
      return this.data.filterSpaceId || ''
    }
  },

  applyExpireBanner(item, count) {
    if (!item) {
      this.setData({ expireBanner: null })
      return
    }
    const spaceList = this.data.spaces || []
    const space = spaceList.find((s) => s && s._id === item.spaceId)
    const spaceName = item.spaceName || (space && space.name) || ''
    const locationName = item.locationName || ''
    const total = Number(count)
    this.setData({
      expireBanner: buildExpireBanner(
        item,
        spaceName,
        locationName,
        Number.isFinite(total) && total > 0 ? total : 1
      )
    })
  },

  /**
   * 首页看板：列表 + 全家件数 + 临期横幅（一次云函数）。
   * @param {{ silent?: boolean, animate?: boolean, spaceId?: string }} [options]
   */
  async loadHomeBoard(options = {}) {
    const familyId = this.data.familyId || getApp().globalData.familyId
    if (!familyId) return

    const hasItems = (this.data.items || []).length > 0
    const silent = options.silent !== undefined ? !!options.silent : hasItems
    const spaceId =
      options.spaceId !== undefined ? options.spaceId : this.data.filterSpaceId

    if (!silent) {
      this.setData({ loading: true, error: '', animateTiles: true })
    } else {
      this.setData({ error: '', animateTiles: !!options.animate })
    }

    try {
      const board = await fetchHomeBoard({
        spaceId: spaceId || undefined
      })
      const items = await enrichLedgerItemsAsync(board.list || [], {}, {}, {})
      this.setData(
        this.syncStats({
          ...this.applyListView(items, this.data.spaces, spaceId || ''),
          loading: false,
          itemCount: board.total,
          itemsReady: true
        })
      )
      const top = board.expiringTop
      let count = Number(board.expiringCount) || 0
      if (top && count < 1) {
        try {
          const { list } = await listExpiringItems({ limit: 50 })
          const rows = list || []
          this.applyExpireBanner(rows[0] || top, rows.length || 1)
          return
        } catch (e) {
          count = 1
        }
      }
      this.applyExpireBanner(top, count || (top ? 1 : 0))
    } catch (e) {
      if (e && e.code === 'UNKNOWN_ACTION') {
        await this.loadHomeBoardLegacy(options)
        return
      }
      this.setData({
        loading: false,
        error: e.message || copy.common.loadFailed
      })
    }
  },

  /** 未部署 item.home 时：拆成 list + count + listExpiring */
  async loadHomeBoardLegacy(options = {}) {
    await this.loadList(options)
    try {
      const total = await countItems()
      this.setData(this.syncStats({ itemCount: total, itemsReady: true }))
    } catch (e) {
      this.setData(this.syncStats({ itemsReady: true }))
    }
    try {
      const { list } = await listExpiringItems({ limit: 50 })
      const rows = list || []
      this.applyExpireBanner(rows[0], rows.length)
    } catch (e) {
      this.setData({ expireBanner: null })
    }
  },

  /**
   * @param {{ silent?: boolean, animate?: boolean, spaceId?: string }} [options]
   */
  async loadList(options = {}) {
    const familyId = this.data.familyId || getApp().globalData.familyId
    if (!familyId) return

    const hasItems = (this.data.items || []).length > 0
    const silent = options.silent !== undefined ? !!options.silent : hasItems
    const spaceId =
      options.spaceId !== undefined ? options.spaceId : this.data.filterSpaceId

    if (!silent) {
      this.setData({ loading: true, error: '', animateTiles: true })
    } else {
      this.setData({ error: '', animateTiles: !!options.animate })
    }

    try {
      const raw = await listItems(familyId, {
        spaceId: spaceId || undefined
      })
      const items = await enrichLedgerItemsAsync(raw, {}, {}, {})
      this.setData({
        ...this.applyListView(items, this.data.spaces, spaceId || ''),
        loading: false
      })
    } catch (e) {
      this.setData({
        loading: false,
        error: e.message || copy.common.loadFailed
      })
    }
  },

  openSpaceSheet() {
    this.setData({
      sheetOpen: true,
      sheetKind: 'space'
    })
  },

  onToggleSpaceGroup(e) {
    const spaceId = e.currentTarget.dataset.spaceId
    if (!spaceId) return
    const collapsedSpaces = { ...(this.data.collapsedSpaces || {}) }
    if (collapsedSpaces[spaceId]) {
      delete collapsedSpaces[spaceId]
    } else {
      collapsedSpaces[spaceId] = true
    }
    this.setData(this.applyListView(this.data.items, this.data.spaces, this.data.filterSpaceId, collapsedSpaces))
  },

  closeSheet() {
    if (!this.data.sheetOpen) return
    this.setData({ sheetOpen: false, sheetKind: '' })
  },

  async onPickSpace(e) {
    let id = e.currentTarget.dataset.id
    if (id === FILTER_ALL_ID || id === undefined || id === null) id = ''
    else id = String(id)

    const isAll = !id
    const space = isAll
      ? null
      : (this.data.spaces || []).find((s) => s && s._id === id)
    if (!isAll && !space) {
      this.closeSheet()
      return
    }
    if (id === (this.data.filterSpaceId || '')) {
      this.closeSheet()
      return
    }

    writeSavedFilterSpaceId(id)
    this.setData({
      sheetOpen: false,
      sheetKind: '',
      filterSpaceId: id,
      filterSpaceName: isAll
        ? copy.items.filterAll
        : space.name || copy.items.defaultSpaceName,
      spaceLoading: true,
      ...emptySelectionState()
    })
    const started = Date.now()
    try {
      await this.loadHomeBoard({ silent: true, animate: true, spaceId: id })
    } finally {
      const wait = 420 - (Date.now() - started)
      if (wait > 0) {
        await new Promise((resolve) => setTimeout(resolve, wait))
      }
      this.setData({ spaceLoading: false })
    }
  },

  exitManage() {
    this.setData(emptySelectionState())
  },

  onToggleManage() {
    if (!this.data.filterSpaceId) return
    if (this.data.managing) {
      this.exitManage()
      return
    }
    this.setData({
      managing: true,
      selectedMap: {},
      batchRemoving: false,
      ...selectionLabels(0)
    })
  },

  onTileTap(e) {
    const id = (e.detail && e.detail.id) || e.currentTarget.dataset.id
    if (!id) return
    if (this.data.managing) {
      this.toggleSelect(id)
      return
    }
    this.goDetail(e)
  },

  toggleSelect(id) {
    if (!id || this.data.batchRemoving) return
    const selectedMap = { ...(this.data.selectedMap || {}) }
    if (selectedMap[id]) delete selectedMap[id]
    else selectedMap[id] = true
    this.setData({
      selectedMap,
      ...selectionLabels(Object.keys(selectedMap).length)
    })
  },

  async onBatchRemove() {
    if (!this.data.managing || this.data.batchRemoving) return
    const ids = Object.keys(this.data.selectedMap || {})
    if (!ids.length) {
      wx.showToast({ title: copy.items.batchRemoveEmpty, icon: 'none' })
      return
    }

    const spaceName = this.data.filterSpaceName || ''
    const confirm = await new Promise((resolve) => {
      wx.showModal({
        title: copy.items.batchRemoveTitle(ids.length, spaceName),
        content: copy.items.batchRemoveContent,
        confirmText: copy.items.batchRemoveConfirm,
        confirmColor: '#FA5151',
        success: (res) => resolve(!!res.confirm)
      })
    })
    if (!confirm) return

    this.setData({ batchRemoving: true })
    wx.showLoading({ title: copy.items.batchRemoving, mask: true })

    const CHUNK = 20
    let removed = 0
    try {
      for (let i = 0; i < ids.length; i += CHUNK) {
        const chunk = ids.slice(i, i + CHUNK)
        const res = await callItem('removeMany', { itemIds: chunk })
        removed += (res && res.count) || chunk.length
      }
      wx.hideLoading()
      this.setData(emptySelectionState())
      wx.showToast({
        title: copy.items.batchRemovedToast(removed),
        icon: 'success'
      })
      await this.loadHomeBoard({ silent: true })
    } catch (err) {
      wx.hideLoading()
      this.setData({ batchRemoving: false })
      wx.showToast({
        title: (err && err.message) || copy.common.opFailed,
        icon: 'none'
      })
      await this.loadHomeBoard({ silent: true })
    }
  },

  onRetryList() {
    this.loadHomeBoard({ silent: false })
  },

  goAdd() {
    const spaceId = this.data.filterSpaceId || ''
    const qs = spaceId ? `?spaceId=${encodeURIComponent(spaceId)}` : ''
    wx.navigateTo({ url: `/pages/items/edit${qs}` })
  },

  goDetail(e) {
    const id = (e.detail && e.detail.id) || e.currentTarget.dataset.id
    if (!id) return
    const item = (this.data.items || []).find((it) => it && it._id === id)
    if (!item) {
      navigateToItemDetail(id)
      return
    }
    const space = (this.data.spaces || []).find((s) => s && s._id === item.spaceId)
    navigateToItemDetail({
      ...item,
      spaceName: item.spaceName || (space && space.name) || ''
    })
  },

  goFamily() {
    wx.navigateTo({ url: '/pages/family/index' })
  },

  goAssist() {
    wx.navigateTo({
      url: '/packageAiAssist/assist/index',
      fail: () => wx.showToast({ title: copy.assist.openFail, icon: 'none' })
    })
  },

  goExpireBanner() {
    const banner = this.data.expireBanner
    if (!banner) return
    if ((banner.count || 1) > 1) {
      this.openExpireSheet()
      return
    }
    const id = banner.itemId
    if (!id) return
    const item = (this.data.items || []).find((it) => it && it._id === id)
    if (!item) {
      navigateToItemDetail(id)
      return
    }
    const space = (this.data.spaces || []).find((s) => s && s._id === item.spaceId)
    navigateToItemDetail({
      ...item,
      spaceName: item.spaceName || (space && space.name) || ''
    })
  },

  openExpireSheet() {
    this.setData({
      sheetOpen: true,
      sheetKind: 'expire',
      expireSheetLoading: true,
      expireSheetError: '',
      expireList: []
    })
    this.loadExpireSheetList()
  },

  async loadExpireSheetList() {
    try {
      const { list } = await listExpiringItems({ limit: 50 })
      const rows = (list || []).map((item) => {
        const place = [item.spaceName, item.locationName].filter(Boolean).join('-')
        return {
          _id: item._id,
          name: String(item.name || '').trim() || '物品',
          place,
          dueLabel: dueLabel(item.expireDate),
          expireDate: item.expireDate || '',
          spaceId: item.spaceId || '',
          spaceName: item.spaceName || '',
          locationName: item.locationName || '',
          quantity: item.quantity,
          unit: item.unit || ''
        }
      })
      this.setData({
        expireList: rows,
        expireSheetLoading: false,
        expireSheetError: rows.length ? '' : copy.items.expiringSheetEmpty
      })
      const top = (list || [])[0]
      if (top) this.applyExpireBanner(top, rows.length)
      else this.setData({ expireBanner: null })
    } catch (e) {
      this.setData({
        expireSheetLoading: false,
        expireSheetError: (e && e.message) || copy.items.expiringSheetFail
      })
    }
  },

  onExpireRowTap(e) {
    const id = e.currentTarget.dataset.id
    if (!id) return
    const row = (this.data.expireList || []).find((it) => it && it._id === id)
    this.closeSheet()
    if (row) {
      navigateToItemDetail(row)
      return
    }
    navigateToItemDetail(id)
  }
})
