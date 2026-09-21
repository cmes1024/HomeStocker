function placePhrase(row) {
  const space = String((row && row.spaceName) || '').trim()
  const loc = String((row && row.locationName) || '').trim()
  if (space && loc) return `${space}${loc}`
  return space || loc
}

function itemLabel(row, unnamed) {
  const name = String((row && row.itemName) || '').trim() || unnamed
  if (!row || row.action !== 'update') return name
  if (row.quantity === undefined || row.quantity === null || row.quantity === '') {
    return name
  }
  const n = Number(row.quantity)
  if (!Number.isFinite(n)) return name
  return `${name}x${n}`
}

function actionVerb(action, copy) {
  if (action === 'create' || action === 'create_batch') return copy.actionCreate
  if (action === 'remove') return copy.actionRemove
  return copy.actionUpdate
}

function formatActivityLine(row, copy) {
  const actor =
    (row && row.actorNickname && String(row.actorNickname).trim()) ||
    copy.actorFallback
  const unnamed = copy.unnamedItem || '一件物品'
  const verb = actionVerb(row && row.action, copy)

  if (row && row.action === 'create_batch') {
    const names = String((row && row.itemName) || '').trim() || unnamed
    const n = Number(row.batchCount)
    const count = Number.isFinite(n) && n > 0 ? n : 0
    if (count > 0 && copy.actionCreateBatch) {
      return `${actor}${copy.actionCreateBatch(names, count)}`
    }
    if (count > 0) return `${actor}${verb}${names}${count}件物品`
    return `${actor}${verb}${names}`
  }

  const item = itemLabel(row, unnamed)
  const place = placePhrase(row)
  if (place) return `${actor}在${place}里${verb}${item}`
  return `${actor}${verb}${item}`
}

module.exports = {
  formatActivityLine,
  placePhrase
}
