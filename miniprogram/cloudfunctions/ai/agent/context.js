const { ensureCapabilities, renderCapabilities, enabledApis } = require('../capabilities')
const { getOrRebuildFamilyTree, renderTreeNames } = require('../familyTree')
const { ensureAssistPrompt, sanitizeHistory, renderHistory, fillAssistPrompt, ASSIST_PROMPT_V2 } = require('./model')
const { loadFocus } = require('./itemsQuery')
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
 * V3: FOCUS only from focusItemId；本轮 P* 由 probe/search 灌入；无跨轮操作袋。
 */
async function buildActContext(env, openid, event, familyCtx) {
  const { db, shanghaiToday } = env
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
  const focus = await loadFocus(db, familyId, tree, event && event.focusItemId)
  if (focus) refs[focus.ref] = focus

  const vars = {
    today: today.ymd,
    weekday: today.weekday,
    familyName,
    capabilities: renderCapabilities(catalog),
    tree: renderTreeNames(tree),
    history: renderHistory(history),
    focus: renderFocusList([focus].filter(Boolean)),
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
    turnRows: [],
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
