/**
 * 标签领域写。tag 云函数与 ai.act 共用，避免嵌套 callFunction 丢失 OPENID。
 */
module.exports = function createTagWriter(db) {
  const CREATE_MANY_LIMIT = 20
  const REMOVE_MANY_LIMIT = 20

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

  async function listTagsForFamily(familyId) {
    const res = await db.collection('tags').where({ familyId }).limit(100).get()
    const list = res.data || []
    list.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0))
    return list
  }

  async function stripTagFromItems(familyId, tagId) {
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const res = await db
        .collection('items')
        .where({
          familyId,
          tagIds: tagId
        })
        .limit(100)
        .get()
      const list = res.data || []
      if (!list.length) break
      const now = Date.now()
      await Promise.all(
        list.map((item) => {
          const next = (item.tagIds || []).filter((id) => id !== tagId)
          return db.collection('items').doc(item._id).update({
            data: { tagIds: next, updatedAt: now }
          })
        })
      )
      if (list.length < 100) break
    }
  }

  async function createTag(openid, event, options = {}) {
    const ctx = await resolveFamilyContext(openid, options.familyCtx)
    if (ctx.error) return ctx.error

    const name = String(event.name || '').trim().slice(0, 20)
    if (!name) return fail('INVALID_NAME', '请输入标签名称')

    const existing = await listTagsForFamily(ctx.familyId)
    if (existing.some((t) => t.name === name)) {
      return fail('DUPLICATE_NAME', '已有同名标签')
    }

    const now = Date.now()
    const doc = {
      familyId: ctx.familyId,
      name,
      isDefault: false,
      createdAt: now,
      updatedAt: now
    }
    const addRes = await db.collection('tags').add({ data: doc })
    return ok({ _id: addRes._id, ...doc })
  }

  async function createMany(openid, event, options = {}) {
    const ctx = await resolveFamilyContext(openid, options.familyCtx)
    if (ctx.error) return ctx.error

    const raw = Array.isArray(event && event.tags) ? event.tags : []
    if (!raw.length) return fail('INVALID_ITEMS', '没有要创建的标签')
    if (raw.length > CREATE_MANY_LIMIT) {
      return fail('INVALID_ITEMS', `一次最多建 ${CREATE_MANY_LIMIT} 个标签`)
    }

    const names = []
    const batchSeen = {}
    for (let i = 0; i < raw.length; i++) {
      const name = String((raw[i] && (raw[i].name || raw[i])) || '')
        .trim()
        .slice(0, 20)
      if (!name) {
        return fail('INVALID_NAME', `第 ${i + 1} 个标签缺少名称`)
      }
      if (batchSeen[name]) {
        return fail('DUPLICATE_NAME', `第 ${i + 1} 个标签与本批重复`)
      }
      batchSeen[name] = true
      names.push(name)
    }

    const existing = await listTagsForFamily(ctx.familyId)
    const existingNames = {}
    existing.forEach((t) => {
      if (t && t.name) existingNames[t.name] = true
    })
    for (let i = 0; i < names.length; i++) {
      if (existingNames[names[i]]) {
        return fail('DUPLICATE_NAME', `已有同名标签「${names[i]}」`)
      }
    }

    const now = Date.now()
    const docs = names.map((name, i) => ({
      familyId: ctx.familyId,
      name,
      isDefault: false,
      createdAt: now + i,
      updatedAt: now + i
    }))

    let addRes
    try {
      addRes = await db.collection('tags').add({ data: docs })
    } catch (e) {
      console.error('tag.createMany add failed', e)
      return fail('INTERNAL', e.message || '批量创建标签失败')
    }
    const ids = extractBatchAddIds(addRes)
    if (ids.length !== docs.length) {
      console.error('tag.createMany id mismatch', ids.length, docs.length, addRes)
      return fail('INTERNAL', '批量创建标签结果异常')
    }

    const list = docs.map((doc, i) => ({ _id: ids[i], ...doc }))
    return ok({ list, count: list.length })
  }

  async function removeTag(openid, event, options = {}) {
    const ctx = await resolveFamilyContext(openid, options.familyCtx)
    if (ctx.error) return ctx.error

    const tagId = String((event && event.tagId) || '').trim()
    if (!tagId) return fail('INVALID_ID', '缺少 tagId')

    const snap = await db.collection('tags').doc(tagId).get().catch(() => null)
    if (!snap || !snap.data) return fail('NOT_FOUND', '标签不存在')
    if (snap.data.familyId !== ctx.familyId) {
      return fail('FORBIDDEN', '无权操作该标签')
    }

    await stripTagFromItems(ctx.familyId, tagId)
    await db.collection('tags').doc(tagId).remove()
    return ok({
      removed: true,
      tagId,
      name: snap.data.name || ''
    })
  }

  async function removeMany(openid, event, options = {}) {
    const ctx = await resolveFamilyContext(openid, options.familyCtx)
    if (ctx.error) return ctx.error

    const ids = dedupeIds(event && event.tagIds)
    if (!ids.length) return fail('INVALID_IDS', '没有要删除的标签')
    if (ids.length > REMOVE_MANY_LIMIT) {
      return fail('INVALID_IDS', `一次最多删 ${REMOVE_MANY_LIMIT} 个标签`)
    }

    const snaps = await Promise.all(
      ids.map((id) => db.collection('tags').doc(id).get().catch(() => null))
    )
    const tags = []
    for (let i = 0; i < snaps.length; i++) {
      const snap = snaps[i]
      if (!snap || !snap.data) return fail('NOT_FOUND', '标签不存在')
      if (snap.data.familyId !== ctx.familyId) {
        return fail('FORBIDDEN', '无权操作该标签')
      }
      tags.push({ _id: ids[i], ...snap.data })
    }

    for (let i = 0; i < tags.length; i++) {
      await stripTagFromItems(ctx.familyId, tags[i]._id)
      await db.collection('tags').doc(tags[i]._id).remove()
    }

    return ok({
      removed: true,
      tagIds: tags.map((t) => t._id),
      names: tags.map((t) => t.name || ''),
      count: tags.length
    })
  }

  return {
    createTag,
    createMany,
    removeTag,
    removeMany,
    listTagsForFamily
  }
}
