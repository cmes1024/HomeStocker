const { callItem, callSpace, callBootstrap } = require('./cloud')

/**
 * 物资列表：优先 item.list；失败时回退 search 空 keyword（兼容未部署 list 的环境）。
 */
async function listItems(_familyId, options = {}) {
  const payload = {
    limit: options.limit || 100,
    spaceId: options.spaceId || undefined,
    tagId: options.tagId || undefined
  }
  try {
    const data = await callItem('list', payload)
    return (data && data.list) || []
  } catch (e) {
    if (e && e.code === 'UNKNOWN_ACTION') {
      const data = await callItem('search', {
        keyword: '',
        ...payload
      })
      return (data && data.list) || []
    }
    throw e
  }
}

async function countItems() {
  const data = await callItem('count')
  return Number(data && data.total) || 0
}

async function listExpiringItems(options = {}) {
  const data = await callItem('listExpiring', {
    limit: options.limit || 50
  })
  return {
    list: (data && data.list) || [],
    today: data && data.today,
    windowEnd: data && data.windowEnd
  }
}

/**
 * 清单首页：一次云函数取列表 + 件数 + 临期横幅。
 */
async function loadHomeBoard(options = {}) {
  const data = await callItem('home', {
    limit: options.limit || 500,
    spaceId: options.spaceId || undefined
  })
  return {
    list: (data && data.list) || [],
    total: Number(data && data.total) || 0,
    expiringTop: (data && data.expiringTop) || null,
    expiringCount: Number(data && data.expiringCount) || 0,
    today: data && data.today,
    windowEnd: data && data.windowEnd
  }
}

/**
 * 清单首页聚合：family + spaces + board + cursor（未部署 bootstrap 时抛错由页面降级）。
 */
async function loadHomeBootstrap(options = {}) {
  const data = await callBootstrap('home', {
    limit: options.limit || 500,
    spaceId: options.spaceId || undefined
  })
  return {
    family: (data && data.family) || null,
    spaces: (data && data.spaces && data.spaces.list) || [],
    board: {
      list: (data && data.board && data.board.list) || [],
      total: Number(data && data.board && data.board.total) || 0,
      expiringTop: (data && data.board && data.board.expiringTop) || null,
      expiringCount: Number(data && data.board && data.board.expiringCount) || 0,
      today: data && data.board && data.board.today,
      windowEnd: data && data.board && data.board.windowEnd
    },
    cursor: (data && data.cursor) || null
  }
}

async function listSpaces() {
  const data = await callSpace('list')
  return (data && data.list) || []
}

async function listLocations(spaceId) {
  const data = await callSpace('listLocations', { spaceId })
  if (Array.isArray(data)) return data
  if (data && Array.isArray(data.list)) return data.list
  return []
}

/**
 * 单空间详情：空间 + 位置 + 物资（未部署 space.detail 时降级双请求）。
 */
async function loadSpaceDetail(spaceId, options = {}) {
  const id = String(spaceId || '')
  try {
    const data = await callSpace('detail', {
      spaceId: id,
      limit: options.limit || 100
    })
    return {
      space: (data && data.space) || null,
      locations: (data && data.locations) || [],
      list: (data && data.list) || []
    }
  } catch (e) {
    if (e && e.code === 'NO_FAMILY') throw e
    const [spacePack, locationList] = await Promise.all([
      listItemsBySpace(id, options),
      listLocations(id)
    ])
    return {
      space: (spacePack && spacePack.space) || null,
      locations: Array.isArray(locationList) ? locationList : [],
      list: (spacePack && spacePack.list) || []
    }
  }
}

/**
 * 单空间物资（含 locationName）
 */
async function listItemsBySpace(spaceId, options = {}) {
  const data = await callSpace('listItemsBySpace', {
    spaceId,
    limit: options.limit || 100
  })
  return {
    space: (data && data.space) || null,
    list: (data && data.list) || []
  }
}

/**
 * 口袋页：一次拉齐各空间物资。
 */
async function listPockets(options = {}) {
  const data = await callSpace('listPockets', {
    limit: options.limit || 100
  })
  return (data && data.pockets) || []
}

module.exports = {
  listItems,
  countItems,
  listExpiringItems,
  loadHomeBoard,
  loadHomeBootstrap,
  listSpaces,
  listLocations,
  loadSpaceDetail,
  listItemsBySpace,
  listPockets
}
