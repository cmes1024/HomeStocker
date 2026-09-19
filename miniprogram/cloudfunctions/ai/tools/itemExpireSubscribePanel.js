const { listItemsCompact } = require('../agent/itemsQuery')
const { placeNamesForItem } = require('../agent/treeMatch')

const id = 'item.expireSubscribePanel'

async function loadSubscribedItemSet(db, familyId, openid) {
  const res = await db
    .collection('itemExpireSubs')
    .where({ familyId, openid })
    .limit(100)
    .get()
    .catch(() => ({ data: [] }))
  const set = {}
  ;(res.data || []).forEach((row) => {
    if (row && row.itemId) set[row.itemId] = true
  })
  return set
}

async function listExpireSubscribePanel(db, familyId, openid, tree) {
  const [all, subscribed] = await Promise.all([
    listItemsCompact(db, familyId, { limit: 100 }),
    loadSubscribedItemSet(db, familyId, openid)
  ])
  const rows = (all || [])
    .filter((item) => item && item._id && item.expireDate)
    .sort((a, b) => String(a.expireDate).localeCompare(String(b.expireDate)))
    .slice(0, 30)
    .map((item) => {
      const place = placeNamesForItem(item, tree)
      const placeBits = [place.spaceName, place.locationName].filter(Boolean)
      return {
        itemId: item._id,
        name: item.name || '未命名',
        expireDate: item.expireDate,
        spaceName: place.spaceName,
        locationName: place.locationName,
        placeLabel: placeBits.length ? placeBits.join(' / ') : '',
        expireReminderEnabled: !!subscribed[item._id]
      }
    })
  return rows
}

async function run(ctx, call, step) {
  const { db, familyId, openid, tree } = ctx
  const items = await listExpireSubscribePanel(db, familyId, openid, tree)
  const summary = items.length
    ? '临期提醒要你本人点开关授权。下面是已设过期日的物资，打开即可订阅：'
    : '还没有设置过期日的物资。先给物资加上过期日期，再来订阅临期提醒。'
  return {
    ok: true,
    summary,
    ui: 'subscribePanel',
    subscribeItems: items
  }
}

module.exports = {
  id,
  run,
  listExpireSubscribePanel
}
