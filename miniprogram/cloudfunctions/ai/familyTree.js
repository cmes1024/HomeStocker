/**
 * 家庭结构树：空间 → 位置、标签。不含物资。
 * space / tag / family 云函数各有一份同名模块，保持无交叉依赖。
 */

let treeCollectionReady = false

async function ensureTreeCollection(db) {
  if (treeCollectionReady) return
  try {
    await db.createCollection('familyTrees')
  } catch (e) {
    // 已存在
  }
  treeCollectionReady = true
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

function markTreeDirty(ctx) {
  if (ctx) ctx.treeDirty = true
}

/** 同轮链式执行：内存补空间，不打库；收尾再 flush。 */
function patchSpaceIntoTree(tree, spaceDoc) {
  if (!tree || !spaceDoc) return tree
  const id = spaceDoc._id || spaceDoc.id
  if (!id) return tree
  if (!Array.isArray(tree.spaces)) tree.spaces = []
  if (tree.spaces.some((s) => s && s.id === id)) return tree
  tree.spaces.push({
    id,
    name: String(spaceDoc.name || ''),
    isDefault: !!spaceDoc.isDefault,
    locations: []
  })
  return tree
}

/** 同轮链式执行：内存补位置；ensureLocation 已 concat 时可只 markDirty。 */
function patchLocationIntoTree(tree, spaceId, locDoc) {
  if (!tree || !spaceId || !locDoc) return tree
  const locId = locDoc._id || locDoc.id
  if (!locId) return tree
  const space = (tree.spaces || []).find((s) => s && s.id === spaceId)
  if (!space) return tree
  if (!Array.isArray(space.locations)) space.locations = []
  if (space.locations.some((l) => l && l.id === locId)) return tree
  space.locations.push({ id: locId, name: String(locDoc.name || '') })
  return tree
}

function patchTagIntoTree(tree, tagDoc) {
  if (!tree || !tagDoc) return tree
  const id = tagDoc._id || tagDoc.id
  if (!id) return tree
  if (!Array.isArray(tree.tags)) tree.tags = []
  if (tree.tags.some((t) => t && t.id === id)) return tree
  tree.tags.push({ id, name: String(tagDoc.name || '') })
  return tree
}

function removeSpaceFromTree(tree, spaceId) {
  if (!tree || !spaceId || !Array.isArray(tree.spaces)) return tree
  tree.spaces = tree.spaces.filter((s) => s && s.id !== spaceId)
  return tree
}

function removeLocationFromTree(tree, spaceId, locationId) {
  if (!tree || !locationId) return tree
  const spaces = tree.spaces || []
  const space = spaceId
    ? spaces.find((s) => s && s.id === spaceId)
    : spaces.find(
        (s) => s && (s.locations || []).some((l) => l && l.id === locationId)
      )
  if (!space || !Array.isArray(space.locations)) return tree
  space.locations = space.locations.filter((l) => l && l.id !== locationId)
  return tree
}

function removeTagFromTree(tree, tagId) {
  if (!tree || !tagId || !Array.isArray(tree.tags)) return tree
  tree.tags = tree.tags.filter((t) => t && t.id !== tagId)
  return tree
}

/** act 一轮写完/失败后：若结构变过，从 DB 重建一次（真相源，供 replan）。 */
async function flushFamilyTreeIfDirty(ctx) {
  if (!ctx || !ctx.treeDirty) return ctx && ctx.tree
  const tree = await touchFamilyTree(ctx.db, ctx.familyId)
  if (tree) ctx.tree = tree
  ctx.treeDirty = false
  return ctx.tree
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
  markTreeDirty,
  patchSpaceIntoTree,
  patchLocationIntoTree,
  patchTagIntoTree,
  removeSpaceFromTree,
  removeLocationFromTree,
  removeTagFromTree,
  flushFamilyTreeIfDirty,
  deleteFamilyTree,
  renderTreeNames,
  isUsableTree
}
