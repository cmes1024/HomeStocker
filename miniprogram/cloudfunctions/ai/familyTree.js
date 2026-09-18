/**
 * 家庭结构树：空间 → 位置、标签。不含物资。
 * space / tag / family 云函数各有一份同名模块，保持无交叉依赖。
 */

async function ensureTreeCollection(db) {
  try {
    await db.createCollection('familyTrees')
  } catch (e) {
    // 已存在
  }
}

function sortSpaces(list) {
  const spaces = list || []
  spaces.sort((a, b) => {
    if (a.isDefault && !b.isDefault) return -1
    if (!a.isDefault && b.isDefault) return 1
    return (a.createdAt || 0) - (b.createdAt || 0)
  })
  return spaces
}

function isUsableTree(doc) {
  return !!(doc && Array.isArray(doc.spaces) && Array.isArray(doc.tags))
}

async function rebuildFamilyTree(db, familyId) {
  if (!familyId) return null
  await ensureTreeCollection(db)
  const [spacesRes, locsRes, tagsRes] = await Promise.all([
    db.collection('spaces').where({ familyId }).limit(100).get(),
    db.collection('locations').where({ familyId }).limit(200).get(),
    db.collection('tags').where({ familyId }).limit(100).get()
  ])
  const spaces = sortSpaces(spacesRes.data || [])
  const locations = (locsRes.data || []).slice().sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0))
  const tags = (tagsRes.data || []).slice().sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0))
  const locBySpace = {}
  locations.forEach((loc) => {
    if (!loc || !loc.spaceId) return
    if (!locBySpace[loc.spaceId]) locBySpace[loc.spaceId] = []
    locBySpace[loc.spaceId].push({ id: loc._id, name: loc.name || '' })
  })
  const now = Date.now()
  const tree = {
    familyId,
    rev: now,
    spaces: spaces.map((s) => ({
      id: s._id,
      name: s.name || '',
      isDefault: !!s.isDefault,
      locations: locBySpace[s._id] || []
    })),
    tags: tags.map((t) => ({
      id: t._id,
      name: t.name || ''
    })),
    updatedAt: now
  }
  await db.collection('familyTrees').doc(familyId).set({ data: tree })
  return tree
}

async function getOrRebuildFamilyTree(db, familyId) {
  if (!familyId) return null
  const snap = await db.collection('familyTrees').doc(familyId).get().catch(() => null)
  const doc = snap && snap.data
  if (isUsableTree(doc)) return { familyId, ...doc }
  return rebuildFamilyTree(db, familyId)
}

async function touchFamilyTree(db, familyId) {
  try {
    return await rebuildFamilyTree(db, familyId)
  } catch (e) {
    console.warn('familyTree update failed', familyId, e && e.message)
    return null
  }
}

async function deleteFamilyTree(db, familyId) {
  if (!familyId) return
  try {
    await db.collection('familyTrees').doc(familyId).remove()
  } catch (e) {
    console.warn('familyTree delete failed', familyId, e && e.message)
  }
}

function renderTreeNames(tree) {
  const lines = []
  const spaces = (tree && tree.spaces) || []
  if (!spaces.length) {
    lines.push('- （无空间）')
  } else {
    spaces.forEach((space) => {
      const title = space.isDefault ? `${space.name}（默认）` : space.name
      lines.push(`- ${title}`)
      const locs = space.locations || []
      if (!locs.length) {
        lines.push('  - （无位置）')
      } else {
        locs.forEach((loc) => lines.push(`  - ${loc.name || ''}`))
      }
    })
  }
  const tags = ((tree && tree.tags) || []).map((t) => t.name).filter(Boolean)
  lines.push('')
  lines.push(`标签：${tags.length ? tags.join('、') : '（无）'}`)
  return lines.join('\n')
}

module.exports = {
  rebuildFamilyTree,
  getOrRebuildFamilyTree,
  touchFamilyTree,
  deleteFamilyTree,
  renderTreeNames,
  isUsableTree
}
