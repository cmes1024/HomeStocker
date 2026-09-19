const { matchLocation } = require('../agent/treeMatch')

async function ensureLocation(writers, openid, tree, space, locationName, enabledSet, familyCtx) {
  const name = String(locationName || '').trim()
  if (!name || !space) return { locationId: null, tree }
  const existing = matchLocation(space, name)
  if (existing) return { locationId: existing.id, locationName: existing.name, tree }
  if (!enabledSet['space.createLocation']) {
    return {
      error: { ok: false, code: 'NO_LOCATION', message: `位置「${name}」不在「${space.name}」下` }
    }
  }
  const created = await writers.location.createLocation(
    openid,
    {
      spaceId: space.id,
      name
    },
    {
      familyCtx,
      space: { id: space.id, name: space.name, isDefault: !!space.isDefault }
    }
  )
  if (!created.ok) {
    return { error: { ok: false, code: created.code, message: created.message } }
  }
  const loc = created.data || {}
  const locId = loc._id || loc.id
  space.locations = (space.locations || []).concat([{ id: locId, name }])
  return { locationId: locId, locationName: name, tree, created: true }
}

async function findDuplicates(db, familyId, spaceId, locationId, name) {
  const where = { familyId, name, spaceId }
  if (locationId) where.locationId = locationId
  else where.locationId = null
  const res = await db.collection('items').where(where).limit(10).get()
  return res.data || []
}

module.exports = {
  ensureLocation,
  findDuplicates
}
