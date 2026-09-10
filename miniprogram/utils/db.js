const { callItem, callSpace } = require('./cloud')

/**
 * 物资列表：走 item.search（空 keyword = 全量列表），兼容尚未部署 list action 的云函数。
 * options.spaceId 可选，按空间筛选。
 */
async function listItems(_familyId, options = {}) {
  const data = await callItem('search', {
    keyword: '',
    limit: options.limit || 100,
    spaceId: options.spaceId || undefined
  })
  return (data && data.list) || []
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

module.exports = {
  listItems,
  listSpaces,
  listLocations,
  listItemsBySpace
}
