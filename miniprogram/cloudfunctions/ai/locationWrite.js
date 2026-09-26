/**
 * 在已有空间下新建/删除位置。space 云函数与 ai.act 共用。
 */
module.exports = function createLocationWriter(db) {
  const CREATE_MANY_LIMIT = 20
  const REMOVE_MANY_LIMIT = 20

  function ok(data) {
    return { ok: true, data }
  }

  function fail(code, message) {
    return { ok: false, code, message }
  }

  function normalizeImageFileID(value) {
    if (value === undefined) return { skip: true }
    if (value === null || value === '') return { fileID: '' }
    const s = String(value).trim()
    if (!s) return { fileID: '' }
    if (!s.startsWith('cloud://')) return { error: true }
    return { fileID: s }
  }

  async function deleteCloudFiles(fileIDs) {
    const list = (fileIDs || [])
      .map((id) => String(id || '').trim())
      .filter((id) => id.startsWith('cloud://'))
    if (!list.length) return
    try {
      const cloud = require('wx-server-sdk')
      for (let i = 0; i < list.length; i += 50) {
        await cloud.deleteFile({ fileList: list.slice(i, i + 50) })
      }
    } catch (e) {
      console.warn('deleteCloudFiles failed', e && e.message)
    }
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

  function dedupeIds(raw) {
    const ids = []
    const seen = {}
    ;(Array.isArray(raw) ? raw : []).forEach((id) => {
      const s = String(id || '').trim()
      if (!s || seen[s]) return
      seen[s] = true
      ids.push(s)
    })
    return ids
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

  async function clearItemsLocation(familyId, locationId, now) {
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const items = await db
        .collection('items')
        .where({ familyId, locationId })
        .limit(100)
        .get()
      const list = items.data || []
      if (!list.length) break
      await Promise.all(
        list.map((item) =>
          db.collection('items').doc(item._id).update({
            data: {
              locationId: null,
              updatedAt: now
            }
          })
        )
      )
      if (list.length < 100) break
    }
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

    const imageRes = normalizeImageFileID(event.imageFileID)
    if (imageRes.error) return fail('INVALID_IMAGE', '图片无效')

    const now = Date.now()
    const doc = {
      familyId: ctx.familyId,
      spaceId,
      name,
      createdAt: now,
      updatedAt: now
    }
    if (!imageRes.skip && imageRes.fileID) doc.imageFileID = imageRes.fileID
    const addRes = await db.collection('locations').add({ data: doc })
    return ok({ _id: addRes._id, ...doc })
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

  async function removeLocation(openid, event, options = {}) {
    const ctx = await resolveFamilyContext(openid, options.familyCtx)
    if (ctx.error) return ctx.error

    const locationId = String((event && event.locationId) || '').trim()
    if (!locationId) return fail('INVALID_ID', '缺少 locationId')

    const snap = await db.collection('locations').doc(locationId).get().catch(() => null)
    if (!snap || !snap.data) return fail('NOT_FOUND', '位置不存在')
    if (snap.data.familyId !== ctx.familyId) {
      return fail('FORBIDDEN', '无权操作该位置')
    }

    const now = Date.now()
    await clearItemsLocation(ctx.familyId, locationId, now)
    await db.collection('locations').doc(locationId).remove()
    await deleteCloudFiles([snap.data.imageFileID])
    return ok({
      removed: true,
      locationId,
      name: snap.data.name || '',
      spaceId: snap.data.spaceId || ''
    })
  }

  async function removeLocationMany(openid, event, options = {}) {
    const ctx = await resolveFamilyContext(openid, options.familyCtx)
    if (ctx.error) return ctx.error

    const ids = dedupeIds(event && event.locationIds)
    if (!ids.length) return fail('INVALID_IDS', '没有要删除的位置')
    if (ids.length > REMOVE_MANY_LIMIT) {
      return fail('INVALID_IDS', `一次最多删 ${REMOVE_MANY_LIMIT} 个位置`)
    }

    const snaps = await Promise.all(
      ids.map((id) => db.collection('locations').doc(id).get().catch(() => null))
    )
    const locs = []
    for (let i = 0; i < snaps.length; i++) {
      const snap = snaps[i]
      if (!snap || !snap.data) return fail('NOT_FOUND', '位置不存在')
      if (snap.data.familyId !== ctx.familyId) {
        return fail('FORBIDDEN', '无权操作该位置')
      }
      locs.push({ _id: ids[i], ...snap.data })
    }

    const now = Date.now()
    for (let i = 0; i < locs.length; i++) {
      await clearItemsLocation(ctx.familyId, locs[i]._id, now)
      await db.collection('locations').doc(locs[i]._id).remove()
    }
    await deleteCloudFiles(locs.map((l) => l.imageFileID))

    return ok({
      removed: true,
      locationIds: locs.map((l) => l._id),
      names: locs.map((l) => l.name || ''),
      count: locs.length
    })
  }

  return {
    createLocation,
    createLocationMany,
    removeLocation,
    removeLocationMany
  }
}
