/**
 * 在已有空间下新建位置。space 云函数与 ai.act 共用。
 */
module.exports = function createLocationWriter(db) {
  function ok(data) {
    return { ok: true, data }
  }

  function fail(code, message) {
    return { ok: false, code, message }
  }

  function membershipId(openid, familyId) {
    return `${openid}_${familyId}`
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

  async function getSpaceInFamily(spaceId, familyId) {
    const snap = await db.collection('spaces').doc(spaceId).get().catch(() => null)
    if (!snap || !snap.data) return null
    if (snap.data.familyId !== familyId) return null
    return { _id: spaceId, ...snap.data }
  }

  async function createLocation(openid, event, options = {}) {
    const ctx = await resolveFamilyContext(openid, options.familyCtx)
    if (ctx.error) return ctx.error

    const spaceId = event.spaceId
    if (!spaceId) return fail('INVALID_ID', '缺少 spaceId')

    const name = String(event.name || '').trim()
    if (!name) return fail('INVALID_NAME', '请输入位置名称')

    let space = null
    const hint = options.space
    const hintId = hint && (hint._id || hint.id)
    if (hintId && String(hintId) === String(spaceId) && hint.name != null) {
      space = { _id: spaceId, name: String(hint.name || ''), familyId: ctx.familyId }
    } else {
      space = await getSpaceInFamily(spaceId, ctx.familyId)
    }
    if (!space) return fail('NOT_FOUND', '空间不存在')

    const now = Date.now()
    const doc = {
      familyId: ctx.familyId,
      spaceId,
      name,
      createdAt: now,
      updatedAt: now
    }
    const addRes = await db.collection('locations').add({ data: doc })
    return ok({ _id: addRes._id, ...doc })
  }

  const CREATE_MANY_LIMIT = 20

  function extractBatchAddIds(addRes) {
    if (!addRes) return []
    if (Array.isArray(addRes._ids)) return addRes._ids
    if (Array.isArray(addRes.ids)) return addRes.ids
    if (Array.isArray(addRes.id_list)) return addRes.id_list
    if (addRes._id) return [addRes._id]
    return []
  }

  /**
   * 批量新建位置。event.locations: [{ spaceId, name }]
   * options.spaces: { [spaceId]: hint } 可跳过重复 get。
   * 不在此 touch 树。
   */
  async function createLocationMany(openid, event, options = {}) {
    const ctx = await resolveFamilyContext(openid, options.familyCtx)
    if (ctx.error) return ctx.error

    const raw = Array.isArray(event && event.locations) ? event.locations : []
    if (!raw.length) return fail('INVALID_ITEMS', '没有要创建的位置')
    if (raw.length > CREATE_MANY_LIMIT) {
      return fail('INVALID_ITEMS', `一次最多建 ${CREATE_MANY_LIMIT} 个位置`)
    }

    const prepared = []
    for (let i = 0; i < raw.length; i++) {
      const row = raw[i] || {}
      const step = i + 1
      const spaceId = row.spaceId
      if (!spaceId) {
        return fail('INVALID_ID', `第 ${step} 个位置缺少 spaceId`)
      }
      const name = String(row.name || '').trim()
      if (!name) {
        return fail('INVALID_NAME', `第 ${step} 个位置缺少名称`)
      }

      let space = null
      const hint = options.spaces && options.spaces[spaceId]
      const hintId = hint && (hint._id || hint.id)
      if (hintId && String(hintId) === String(spaceId) && hint.name != null) {
        space = { _id: spaceId, name: String(hint.name || ''), familyId: ctx.familyId }
      } else {
        space = await getSpaceInFamily(spaceId, ctx.familyId)
      }
      if (!space) {
        return fail('NOT_FOUND', `第 ${step} 个位置：空间不存在`)
      }

      prepared.push({ spaceId, name, space })
    }

    const now = Date.now()
    const docs = prepared.map((p) => ({
      familyId: ctx.familyId,
      spaceId: p.spaceId,
      name: p.name,
      createdAt: now,
      updatedAt: now
    }))

    let addRes
    try {
      addRes = await db.collection('locations').add({ data: docs })
    } catch (e) {
      console.error('createLocationMany add failed', e)
      return fail('INTERNAL', e.message || '批量创建位置失败')
    }
    const ids = extractBatchAddIds(addRes)
    if (ids.length !== docs.length) {
      console.error('createLocationMany id mismatch', ids.length, docs.length, addRes)
      return fail('INTERNAL', '批量创建位置结果异常')
    }

    const list = docs.map((doc, i) => ({ _id: ids[i], ...doc }))
    return ok({ list, count: list.length })
  }

  return { createLocation, createLocationMany }
}
