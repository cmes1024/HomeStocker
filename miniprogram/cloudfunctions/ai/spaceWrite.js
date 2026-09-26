/**
 * 空间领域写。space 云函数与 ai.act 共用，避免嵌套 callFunction 丢失 OPENID。
 */
module.exports = function createSpaceWriter(db) {
  const DEFAULT_COVER_KEY = 'default-indoor'
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

  async function migrateItemsFromSpace(familyId, spaceId, targetId, now) {
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const itemRes = await db
        .collection('items')
        .where({ familyId, spaceId })
        .limit(100)
        .get()
      const items = itemRes.data || []
      if (!items.length) break
      await Promise.all(
        items.map((item) =>
          db.collection('items').doc(item._id).update({
            data: {
              spaceId: targetId,
              locationId: null,
              updatedAt: now
            }
          })
        )
      )
      if (items.length < 100) break
    }
  }

  async function deleteLocationsForSpace(spaceId) {
    const fileIDs = []
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const locRes = await db.collection('locations').where({ spaceId }).limit(100).get()
      const locs = locRes.data || []
      if (!locs.length) break
      locs.forEach((l) => {
        if (l && l.imageFileID) fileIDs.push(l.imageFileID)
      })
      await Promise.all(locs.map((l) => db.collection('locations').doc(l._id).remove()))
      if (locs.length < 100) break
    }
    await deleteCloudFiles(fileIDs)
  }

  async function createSpace(openid, event, options = {}) {
    const ctx = await resolveFamilyContext(openid, options.familyCtx)
    if (ctx.error) return ctx.error

    const name = String(event.name || '').trim()
    if (!name) return fail('INVALID_NAME', '请输入空间名称')

    const imageRes = normalizeImageFileID(event.imageFileID)
    if (imageRes.error) return fail('INVALID_IMAGE', '图片无效')

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
    if (!imageRes.skip && imageRes.fileID) doc.imageFileID = imageRes.fileID
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

  async function removeSpace(openid, event, options = {}) {
    const ctx = await resolveFamilyContext(openid, options.familyCtx)
    if (ctx.error) return ctx.error

    const spaceId = String((event && event.spaceId) || '').trim()
    if (!spaceId) return fail('INVALID_ID', '缺少 spaceId')

    const snap = await db.collection('spaces').doc(spaceId).get().catch(() => null)
    if (!snap || !snap.data) return fail('NOT_FOUND', '空间不存在')
    if (snap.data.familyId !== ctx.familyId) {
      return fail('FORBIDDEN', '无权操作该空间')
    }
    if (snap.data.isDefault) {
      return fail('DEFAULT_SPACE', '默认仓库只能改名，不能删除')
    }

    const all = await listSpacesForFamily(ctx.familyId)
    if (all.length <= 1) {
      return fail('LAST_SPACE', '至少保留一个空间')
    }

    const target =
      all.find((s) => s._id !== spaceId && s.isDefault) ||
      all.find((s) => s._id !== spaceId)
    if (!target) {
      return fail('LAST_SPACE', '至少保留一个空间')
    }

    const now = Date.now()
    await migrateItemsFromSpace(ctx.familyId, spaceId, target._id, now)
    await deleteLocationsForSpace(spaceId)
    await db.collection('spaces').doc(spaceId).remove()
    await deleteCloudFiles([snap.data.imageFileID])

    return ok({
      removed: true,
      spaceId,
      name: snap.data.name || '',
      migratedTo: target._id,
      migratedToName: target.name
    })
  }

  /**
   * 批量删空间：先全量校验，再逐个迁移物资/清位置/删空间。
   * 物资统一迁到「不在删除集合内」的默认仓（或其它保留空间）。
   */
  async function removeMany(openid, event, options = {}) {
    const ctx = await resolveFamilyContext(openid, options.familyCtx)
    if (ctx.error) return ctx.error

    const ids = dedupeIds(event && event.spaceIds)
    if (!ids.length) return fail('INVALID_IDS', '没有要删除的空间')
    if (ids.length > REMOVE_MANY_LIMIT) {
      return fail('INVALID_IDS', `一次最多删 ${REMOVE_MANY_LIMIT} 个空间`)
    }

    const all = await listSpacesForFamily(ctx.familyId)
    const byId = {}
    all.forEach((s) => {
      if (s && s._id) byId[s._id] = s
    })

    const doomed = []
    for (let i = 0; i < ids.length; i++) {
      const space = byId[ids[i]]
      if (!space) return fail('NOT_FOUND', '空间不存在')
      if (space.isDefault) {
        return fail('DEFAULT_SPACE', '默认仓库只能改名，不能删除')
      }
      doomed.push(space)
    }

    const doomedSet = {}
    doomed.forEach((s) => {
      doomedSet[s._id] = true
    })
    if (all.length - doomed.length < 1) {
      return fail('LAST_SPACE', '至少保留一个空间')
    }

    const target =
      all.find((s) => s && !doomedSet[s._id] && s.isDefault) ||
      all.find((s) => s && !doomedSet[s._id])
    if (!target) {
      return fail('LAST_SPACE', '至少保留一个空间')
    }

    const now = Date.now()
    const removedIds = []
    const names = []
    for (let i = 0; i < doomed.length; i++) {
      const space = doomed[i]
      await migrateItemsFromSpace(ctx.familyId, space._id, target._id, now)
      await deleteLocationsForSpace(space._id)
      await db.collection('spaces').doc(space._id).remove()
      await deleteCloudFiles([space.imageFileID])
      removedIds.push(space._id)
      names.push(space.name || '')
    }

    return ok({
      removed: true,
      spaceIds: removedIds,
      names,
      count: removedIds.length,
      migratedTo: target._id,
      migratedToName: target.name
    })
  }

  return {
    createSpace,
    createMany,
    removeSpace,
    removeMany
  }
}
