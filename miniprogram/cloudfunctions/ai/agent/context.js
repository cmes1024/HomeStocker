const { ensureCapabilities, renderCapabilities, enabledApis } = require('../capabilities')
const { getOrRebuildFamilyTree, renderTreeNames } = require('../familyTree')
const { ensureAssistPrompt, sanitizeHistory, sanitizeRecentIds, renderHistory, fillAssistPrompt, ASSIST_PROMPT_V2 } = require('./model')
const { loadFocus, loadRecentItems } = require('./itemsQuery')
const { renderFocusList } = require('./refs')
const { renderIndex } = require('../knowledge')

function enabledMap(catalog) {
  const map = {}
  enabledApis(catalog).forEach((api) => {
    map[api.id] = api
  })
  return map
}

/**
 * Build product context for one act turn (after family auth).
 * Returns catalog, tree, prompt vars, focus/recent, refs bag, etc.
 */
async function buildActContext(env, openid, event, familyCtx) {
  const { db, cloud, shanghaiToday } = env
  const familyId = familyCtx.familyId

  const [catalog, promptDoc, treeDoc, famSnap] = await Promise.all([
    ensureCapabilities(db),
    ensureAssistPrompt(db),
    getOrRebuildFamilyTree(db, familyId),
    db.collection('families').doc(familyId).get().catch(() => null)
  ])

  const tree = treeDoc || { familyId, spaces: [], tags: [] }
  const familyName = (famSnap && famSnap.data && famSnap.data.name) || '家庭'
  const today = shanghaiToday()
  const catalogMap = enabledMap(catalog)
  const refs = {}

  const history = sanitizeHistory(event && event.history)
  const focus = await loadFocus(cloud, db, familyId, tree, event && event.focusItemId)
  if (focus) refs[focus.ref] = focus
  const recentRows = await loadRecentItems(
    db,
    familyId,
    tree,
    sanitizeRecentIds(event && event.recentItemIds),
    refs,
    focus && focus.itemId
  )

  const vars = {
    today: today.ymd,
    weekday: today.weekday,
    familyName,
    capabilities: renderCapabilities(catalog),
    tree: renderTreeNames(tree),
    history: renderHistory(history),
    focus: renderFocusList([focus].concat(recentRows)),
    probe: '无',
    exec: '无',
    knowledgeIndex: renderIndex(),
    knowledge: '无'
  }
  const system = fillAssistPrompt(promptDoc.system || ASSIST_PROMPT_V2, vars)
  const text = String((event && event.text) || '').trim()
  const userText = focus
    ? `${text}\n（当前关注短号 ${focus.ref}：${focus.name}）`
    : text

  return {
    openid,
    familyId,
    familyCtx,
    catalog,
    catalogMap,
    promptDoc,
    tree,
    familyName,
    today,
    refs,
    history,
    focus,
    recentRows,
    sessionRecent: recentRows.slice(),
    vars,
    system,
    text,
    userText
  }
}

module.exports = {
  enabledMap,
  buildActContext
}
