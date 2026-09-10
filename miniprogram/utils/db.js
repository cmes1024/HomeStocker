const { callItem } = require('./cloud')

/**
 * 物资列表：走 item.search（空 keyword = 全量列表），兼容尚未部署 list action 的云函数。
 */
async function listItems(_familyId, options = {}) {
  const data = await callItem('search', {
    keyword: '',
    limit: options.limit || 100
  })
  return (data && data.list) || []
}

module.exports = {
  listItems
}
