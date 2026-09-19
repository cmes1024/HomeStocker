function matchSpace(tree, name) {
  const n = String(name || '').trim()
  const spaces = (tree && tree.spaces) || []
  if (!n) return null
  const exact = spaces.find((s) => s && s.name === n)
  if (exact) return exact
  return spaces.find((s) => s && s.name && (s.name.indexOf(n) >= 0 || n.indexOf(s.name) >= 0)) || null
}

function matchLocation(space, name) {
  const n = String(name || '').trim()
  const locs = (space && space.locations) || []
  if (!n) return null
  const exact = locs.find((l) => l && l.name === n)
  if (exact) return exact
  return locs.find((l) => l && l.name && (l.name.indexOf(n) >= 0 || n.indexOf(l.name) >= 0)) || null
}

function matchTag(tree, name) {
  const n = String(name || '').trim()
  if (!n) return null
  const tags = (tree && tree.tags) || []
  return tags.find((t) => t && t.name === n) || null
}

function resolveTagIds(tree, tagNames) {
  const names = Array.isArray(tagNames) ? tagNames : []
  const ids = []
  const resolved = []
  names.forEach((raw) => {
    const tag = matchTag(tree, raw)
    if (tag && ids.indexOf(tag.id) < 0) {
      ids.push(tag.id)
      resolved.push(tag.name)
    }
  })
  return { tagIds: ids, tagNames: resolved }
}

function placeLabel(spaceName, locationName) {
  return [spaceName, locationName].filter(Boolean).join(' / ')
}

function placeNamesForItem(item, tree) {
  const spaces = (tree && tree.spaces) || []
  const space =
    spaces.find((s) => s && s.id === item.spaceId) ||
    spaces.find((s) => s && s.name === item.spaceName)
  const loc =
    (space && (space.locations || []).find((l) => l && l.id === item.locationId)) ||
    (space && (space.locations || []).find((l) => l && l.name === item.locationName))
  return {
    spaceName: (space && space.name) || item.spaceName || '',
    locationName: (loc && loc.name) || item.locationName || ''
  }
}

module.exports = {
  matchSpace,
  matchLocation,
  matchTag,
  resolveTagIds,
  placeLabel,
  placeNamesForItem
}
