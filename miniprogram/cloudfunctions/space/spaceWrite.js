/**
 * 空间领域写。space 云函数与 ai.act 共用，避免嵌套 callFunction 丢失 OPENID。
 */
module.exports = function createSpaceWriter(db) {
  const DEFAULT_COVER_KEY = 'default-indoor'
  const CREATE_MANY_LIMIT = 20

  function ok(data) {
    return { ok: true, data }
  }

  function fail(code, message) {
    return { ok: false, code, message }
  }

  function membershipId(openid, familyId) {
    return `${openid}_${familyId}`
  }

  function extractBatchAddIds(addRes) {
    if (!addRes) return []
    if (Array.isArray(addRes._ids)) return addRes._ids
    if (Array.isArray(addRes.ids)) return addRes.ids
    if (Array.isArray(addRes.id_list)) return addRes.id_list
    if (addRes._id) return [addRes._id]
    return []
  }

  async function resolveFamilyContext(openid, reuse) {
    if (reuse && reuse.familyId && (!reuse.openid || reuse.openid === openid)) {
      return { familyId: reuse.familyId, openid }
    }
    const userSnap = await db.collection('users').doc(openid).get().catch(() => null)
    if (!userSnap || !userSnap.data) {
      return { error: fail('NO_FAMILY', '尚未加入家庭') }
    }
    const familyId = userSnap.data.currentFamilyId
    if (!familyId) {
      return { error: fail('NO_FAMILY', '尚未加入家庭') }
    }
    const mem = await db
      .collection('memberships')
      .doc(membershipId(openid, familyId))
      .get()
      .catch(() => null)
    if (!mem || !mem.data) {
      return { error: fail('NO_FAMILY', '尚未加入家庭') }
    }
    return { familyId, openid }
  }

  async function listSpacesForFamily(familyId) {
    const res = await db
      .collection('spaces')
      .where({ familyId })
      .limit(100)
      .get()
    const list = res.data || []
    list.sort((a, b) => {
      if (a.isDefault && !b.isDefault) return -1
      if (!a.isDefault && b.isDefault) return 1
      return (a.createdAt || 0) - (b.createdAt || 0)
    })
    return list
  }

  async function createSpace(openid, event, options = {}) {
    const ctx = await resolveFamilyContext(openid, options.familyCtx)
    if (ctx.error) return ctx.error

    const name = String(event.name || '').trim()
    if (!name) return fail('INVALID_NAME', '请输入空间名称')

    const now = Date.now()
    const existing = await listSpacesForFamily(ctx.familyId)
    const doc = {
      familyId: ctx.familyId,
      name,
      floorId: event.floorId || null,
      isDefault: existing.length === 0,
      coverKey: event.coverKey || DEFAULT_COVER_KEY,
      createdAt: now,
      updatedAt: now
    }
    const addRes = await db.collection('spaces').add({ data: doc })
    return ok({ _id: addRes._id, ...doc })
  }

  /**
   * 批量新建空间：先校验，通过后一次 spaces.add 数组。不在此 touch 树（由调用方一次重建）。
   */
  async function createMany(openid, event, options = {}) {
    const ctx = await resolveFamilyContext(openid, options.familyCtx)
    if (ctx.error) return ctx.error

    const raw = Array.isArray(event && event.spaces) ? event.spaces : []
    if (!raw.length) return fail('INVALID_ITEMS', '没有要创建的空间')
    if (raw.length > CREATE_MANY_LIMIT) {
      return fail('INVALID_ITEMS', `一次最多建 ${CREATE_MANY_LIMIT} 个空间`)
    }

    const names = []
    for (let i = 0; i < raw.length; i++) {
      const name = String((raw[i] && raw[i].name) || '').trim()
      if (!name) {
        return fail('INVALID_NAME', `第 ${i + 1} 个空间缺少名称`)
      }
      names.push(name)
    }

    const existing = await listSpacesForFamily(ctx.familyId)
    const emptyFamily = existing.length === 0
    const now = Date.now()
    const docs = names.map((name, i) => ({
      familyId: ctx.familyId,
      name,
      floorId: null,
      isDefault: emptyFamily && i === 0,
      coverKey: DEFAULT_COVER_KEY,
      createdAt: now,
      updatedAt: now
    }))

    let addRes
    try {
      addRes = await db.collection('spaces').add({ data: docs })
    } catch (e) {
      console.error('space.createMany add failed', e)
      return fail('INTERNAL', e.message || '批量创建空间失败')
    }
    const ids = extractBatchAddIds(addRes)
    if (ids.length !== docs.length) {
      console.error('space.createMany id mismatch', ids.length, docs.length, addRes)
      return fail('INTERNAL', '批量创建空间结果异常')
    }

    const list = docs.map((doc, i) => ({ _id: ids[i], ...doc }))
    return ok({ list, count: list.length })
  }

  return {
    createSpace,
    createMany
  }
}
