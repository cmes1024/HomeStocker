const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()
const service = require('./service')(db)

function fail(code, message) {
  return { ok: false, code, message }
}

function callerOpenid() {
  const ctx = cloud.getWXContext()
  return ctx.OPENID || ctx.FROM_OPENID || ''
}

exports.main = async (event) => {
  const OPENID = callerOpenid()
  if (!OPENID) {
    return fail('UNAUTHORIZED', '未登录')
  }

  const action = event && event.action
  try {
    switch (action) {
      case 'create':
        return await service.createItem(OPENID, event)
      case 'createMany':
        return await service.createMany(OPENID, event)
      case 'update':
        return await service.updateItem(OPENID, event)
      case 'remove':
        return await service.removeItem(OPENID, event)
      case 'removeMany':
        return await service.removeMany(OPENID, event)
      case 'merge':
        return await service.mergeItems(OPENID, event)
      case 'get':
        return await service.getItem(OPENID, event)
      case 'list':
        return await service.listItems(OPENID, event)
      case 'count':
        return await service.countItems(OPENID)
      case 'search':
        return await service.searchItems(OPENID, event)
      case 'listExpiring':
        return await service.listExpiring(OPENID, event)
      case 'home':
        return await service.home(OPENID, event)
      default:
        return fail('UNKNOWN_ACTION', `未知 action: ${action}`)
    }
  } catch (e) {
    console.error('item error', action, e)
    return fail('INTERNAL', e.message || String(e))
  }
}
