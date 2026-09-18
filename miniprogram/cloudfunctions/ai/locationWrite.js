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

  return { createLocation }
}
