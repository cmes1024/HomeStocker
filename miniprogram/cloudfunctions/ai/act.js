const { ASSIST_PROMPT_ID, ASSIST_PROMPT_VERSION, ASSIST_PROMPT_V2, CAPABILITY_LIMIT_ASK } = require('./promptAssist')
const { ensureCapabilities, enabledApis, renderCapabilities, isHardDenied } = require('./capabilities')
const { getOrRebuildFamilyTree, renderTreeNames, touchFamilyTree } = require('./familyTree')
const createItemService = require('./itemService')
const createLocationWriter = require('./locationWrite')

function fail(code, message) {
  return { ok: false, code, message }
}

function ok(data) {
  return { ok: true, data }
}

async function ensureAssistPrompt(db) {
  const ref = db.collection('aiPrompts').doc(ASSIST_PROMPT_ID)
  const snap = await ref.get().catch(() => null)
  if (snap && snap.data && snap.data.system && Number(snap.data.version) >= ASSIST_PROMPT_VERSION) {
    return { _id: ASSIST_PROMPT_ID, ...snap.data }
  }
  const doc = {
    version: ASSIST_PROMPT_VERSION,
    system: ASSIST_PROMPT_V2,
    updatedAt: Date.now()
  }
  await ref.set({ data: doc })
  return { _id: ASSIST_PROMPT_ID, ...doc }
}

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

function isShortRef(value) {
  return /^[FPR]\d+$/i.test(String(value || '').trim())
}

function compactItem(item, ref, tree) {
  const space = ((tree && tree.spaces) || []).find((s) => s.id === item.spaceId)
  const loc = space && (space.locations || []).find((l) => l.id === item.locationId)
  return {
    ref,
    itemId: item._id,
    name: item.name || '',
    quantity: item.quantity,
    unit: item.unit || '',
    spaceId: item.spaceId || '',
    locationId: item.locationId || '',
    spaceName: (space && space.name) || item.spaceName || '',
    locationName: (loc && loc.name) || item.locationName || '',
    expireDate: item.expireDate || null,
    productionDate: item.productionDate || null,
    note: item.note || '',
    tagIds: item.tagIds || []
  }
}

function renderFocus(row) {
  if (!row) return '无'
  const place = [row.spaceName, row.locationName].filter(Boolean).join(' / ')
  const qty = `${row.quantity == null ? '' : row.quantity}${row.unit || ''}`
  const expire = row.expireDate ? ` · 过期 ${row.expireDate}` : ''
  return `[${row.ref}] ${row.name} ${qty}${place ? ` · ${place}` : ''}${expire}`
}

const REPLY_CARD_LIMIT = 8

/** 解析物资展示用地点 / 标签（有值才返回） */
function resolveItemDisplay(item, tree) {
  const spaces = (tree && tree.spaces) || []
  const space =
    spaces.find((s) => s && s.id === item.spaceId) ||
    spaces.find((s) => s && s.name === item.spaceName)
  const loc =
    (space && (space.locations || []).find((l) => l && l.id === item.locationId)) ||
    (space && (space.locations || []).find((l) => l && l.name === item.locationName))
  const spaceName = (space && space.name) || item.spaceName || ''
  const locationName = (loc && loc.name) || item.locationName || ''
  const place = [spaceName, locationName].filter(Boolean).join('/')
  const tagNames = []
  const tags = (tree && tree.tags) || []
  ;(item.tagIds || []).forEach((id) => {
    const hit = tags.find((t) => t && t.id === id)
    if (hit && hit.name) tagNames.push(hit.name)
  })
  let subtitle = ''
  if (item.quantity != null && item.quantity !== '') {
    subtitle = `${item.quantity}${item.unit ? item.unit : ''}`
  }
  const facts = []
  if (place) facts.push(place)
  if (item.expireDate) facts.push(`过期 ${item.expireDate}`)
  if (item.note) facts.push(String(item.note))
  return {
    title: item.name || '未命名',
    subtitle,
    facts,
    tags: tagNames,
    itemId: item._id || item.itemId || ''
  }
}

function buildItemCard(item, tree) {
  const d = resolveItemDisplay(item, tree)
  const card = { title: d.title }
  if (d.subtitle) card.subtitle = d.subtitle
  if (d.facts.length) card.facts = d.facts
  if (d.tags.length) card.tags = d.tags
  if (d.itemId) card.itemId = d.itemId
  return card
}

function cardToCompactLine(card) {
  const bits = [card.title]
  if (card.subtitle) bits.push(card.subtitle)
  ;(card.facts || []).forEach((f) => bits.push(f))
  return bits.join(' · ')
}

/** 查库 / 临期列表 → lead + blocks（代码拼，不经模型润色） */
function buildInventoryPresentation(list, tree, prefix, emptyText) {
  const rows = list || []
  const label = prefix || '查询'
  if (!rows.length) {
    const lead = emptyText || `${label}：没有找到匹配的物品`
    return { lead, blocks: [], lines: [lead] }
  }
  const cards = rows.slice(0, REPLY_CARD_LIMIT).map((item) => buildItemCard(item, tree))
  const footer =
    rows.length > REPLY_CARD_LIMIT ? `另有 ${rows.length - REPLY_CARD_LIMIT} 件未展开` : ''
  const block = { cards }
  if (footer) block.footer = footer
  const lead = `${label}：找到 ${rows.length} 件`
  const lines = [lead].concat(cards.map(cardToCompactLine))
  if (footer) lines.push(footer)
  return { lead, blocks: [block], lines }
}

/** 兼容旧调用：返回紧凑纯文本（有 blocks 时作兜底） */
function formatSearchReport(list, tree, prefix) {
  return buildInventoryPresentation(list, tree, prefix).lines.join('\n')
}

function buildDuplicateCards(possibleDuplicates) {
  return (possibleDuplicates || []).map((d) => {
    const place = placeLabel(d.spaceName, d.locationName)
    const card = {
      title: d.name || '物资',
      tone: 'warn'
    }
    const bits = []
    if (place) bits.push(place)
    if (d.count != null) bits.push(`${d.count} 条`)
    if (bits.length) card.subtitle = bits.join(' · ')
    return card
  })
}

/**
 * 执行结果 → lead + blocks。
 * executed 项可带 inventory[]（查库）；否则用 summary 做动作卡。
 */
function buildExecutionPresentation(executed, failed, possibleDuplicates, tree) {
  const exec = executed || []
  const fail = failed || []
  const dups = possibleDuplicates || []
  const blocks = []
  const actionCards = []
  let inventoryLead = ''
  let inventoryLines = []

  exec.forEach((row) => {
    if (row && Array.isArray(row.inventory)) {
      const prefix =
        row.use === 'item.listExpiring'
          ? '临期/过期'
          : row.inventoryPrefix || '查询'
      const emptyText =
        row.use === 'item.listExpiring' ? '没有临期或过期物品' : ''
      const inv = buildInventoryPresentation(row.inventory, tree, prefix, emptyText)
      if (!inventoryLead) inventoryLead = inv.lead
      inventoryLines = inventoryLines.concat(inv.lines)
      ;(inv.blocks || []).forEach((b) => blocks.push(b))
      return
    }
    if (row && row.summary) {
      actionCards.push({ title: String(row.summary), tone: 'ok' })
    }
  })

  fail.forEach((row) => {
    if (row && row.summary) {
      actionCards.push({ title: String(row.summary), tone: 'error' })
    }
  })

  if (actionCards.length) {
    blocks.push({ cards: actionCards })
  }

  if (dups.length) {
    blocks.push({
      title: '可能重复（未合并）',
      tone: 'warn',
      cards: buildDuplicateCards(dups)
    })
  }

  const okCount = actionCards.filter((c) => c.tone === 'ok').length
  let lead = inventoryLead || ''
  if (!lead && okCount > 1) lead = `完成 ${okCount} 项`
  if (!lead && !blocks.length) lead = '没有需要执行的操作'

  const lines = []
  if (inventoryLines.length) {
    inventoryLines.forEach((l) => lines.push(l))
  }
  actionCards.forEach((c) => lines.push(c.title))
  if (dups.length) {
    lines.push(
      '可能重复（未合并）：' +
        dups
          .map((d) => {
            const place = placeLabel(d.spaceName, d.locationName)
            return `${d.name}${place ? `（${place}）` : ''} ${d.count} 条`
          })
          .join('；')
    )
  }
  if (!lines.length && lead) lines.push(lead)

  return { lead, blocks, lines }
}

function attachPresentation(payload, presentation) {
  const p = presentation || { lead: '', blocks: [], lines: [] }
  const report = Object.assign({}, (payload && payload.report) || {}, {
    lead: p.lead || '',
    blocks: p.blocks || [],
    lines: p.lines && p.lines.length ? p.lines : (payload.report && payload.report.lines) || []
  })
  return Object.assign({}, payload, {
    lead: p.lead || '',
    blocks: p.blocks || [],
    report
  })
}

function textOnlyPresentation(text) {
  const lead = String(text || '').trim()
  return { lead, blocks: [], lines: lead ? [lead] : [] }
}

function renderFocusList(rows) {
  const list = (rows || []).filter(Boolean)
  if (!list.length) return '无'
  return list.map((row) => renderFocus(row)).join('\n')
}

function sanitizeHistory(raw) {
  if (!Array.isArray(raw)) return []
  const out = []
  for (let i = 0; i < raw.length && out.length < 15; i++) {
    const row = raw[i]
    if (!row || typeof row !== 'object') continue
    const role = row.role === 'assistant' ? 'assistant' : row.role === 'user' ? 'user' : ''
    if (!role) continue
    const text = String(row.text || row.content || '').trim().slice(0, 200)
    if (!text) continue
    out.push({ role, text })
  }
  return out
}

function renderHistory(rows) {
  if (!rows || !rows.length) return '无'
  return rows
    .map((row) => `${row.role === 'user' ? '家人' : '助手'}：${row.text}`)
    .join('\n')
}

function sanitizeRecentIds(raw) {
  if (!Array.isArray(raw)) return []
  const out = []
  const seen = {}
  for (let i = 0; i < raw.length && out.length < 6; i++) {
    const id = String(raw[i] || '').trim()
    if (!id || id.length > 64 || seen[id]) continue
    seen[id] = true
    out.push(id)
  }
  return out
}

function publicRecentItems(rows) {
  const out = []
  const seen = {}
  ;(rows || []).forEach((row) => {
    const itemId = row && (row.itemId || row._id)
    if (!itemId || seen[itemId]) return
    seen[itemId] = true
    out.push({ itemId, name: row.name || '' })
  })
  return out.slice(0, 6)
}

function renderProbe(rows) {
  if (!rows || !rows.length) return '无'
  return rows.map((row) => renderFocus(row)).join('\n')
}

function fillAssistPrompt(system, vars) {
  return String(system || '')
    .replace(/\{\{TODAY\}\}/g, vars.today || '')
    .replace(/\{\{WEEKDAY\}\}/g, vars.weekday || '')
    .replace(/\{\{FAMILY_NAME\}\}/g, vars.familyName || '家庭')
    .replace(/\{\{CAPABILITIES\}\}/g, vars.capabilities || '')
    .replace(/\{\{TREE\}\}/g, vars.tree || '')
    .replace(/\{\{FOCUS\}\}/g, vars.focus || '无')
    .replace(/\{\{PROBE\}\}/g, vars.probe || '无')
    .replace(/\{\{HISTORY\}\}/g, vars.history || '无')
}

function optionChoice(label, value) {
  const l = String(label || '').trim()
  const v = String(value || '').trim()
  if (!l && !v) return null
  const useLabel = l || v
  const machine = /^[a-z][a-z0-9_-]*$/i.test(v) && v.length <= 32
  return { label: useLabel, value: machine || !v ? useLabel : v }
}

function normalizeAsk(raw) {
  if (!raw) return []
  const list = Array.isArray(raw) ? raw : [raw]
  return list
    .map((item) => {
      if (item == null || item === '') return null
      if (typeof item === 'string') {
        const question = item.trim()
        return question ? { question, options: [] } : null
      }
      const question = String(item.question || item.text || item.prompt || '').trim()
      if (!question) return null
      const options = Array.isArray(item.options)
        ? item.options
            .map((opt) => {
              if (opt == null) return null
              if (typeof opt === 'string') {
                return optionChoice(opt, opt)
              }
              return optionChoice(opt.label || opt.value, opt.value || opt.label)
            })
            .filter(Boolean)
        : []
      return { question, options }
    })
    .filter(Boolean)
}

function normalizeProbe(raw) {
  if (!raw || typeof raw !== 'object') return null
  const spaceName = String(raw.spaceName || '').trim()
  const locationName = String(raw.locationName || '').trim()
  const name = String(raw.name || '').trim()
  // list:true / scope:family = 扫当前家庭物资（品类/全家问）；允许无地点
  const listAll = raw.list === true || String(raw.scope || '').trim() === 'family'
  if (!spaceName && !locationName && !name && !listAll) return null
  return { spaceName, locationName, name, listAll: !!listAll }
}

/** 生活品类口吻：需要先拉库存，再靠常识从名单里归纳（不能只追问空间） */
function isCategoryInventoryIntent(text) {
  const t = String(text || '').trim()
  if (!t) return false
  return /吃的|能吃|可吃|喝的|能喝|零食|食品|食材|菜[啊吗嘛呢]?$|做[饭菜]|水果|饮料|酒|药品|吃药|常备药|日用品|日用|清洁|洗护|洗衣液|衣服|衣物|穿的|工具/.test(
    t
  )
}

/** 全家盘点口吻（未点名某处）；勿把「家里有哪些地方/空间」当成查库存 */
function isWholeHomeInventoryIntent(text) {
  const t = String(text || '').trim()
  if (!t) return false
  if (isStructureOnlyIntent(t)) return false
  if (/(有哪些|有多少|有几个|哪些|什么)(个)?(地方|位置|空间|房间)/.test(t)) return false
  if (/(冰箱|橱柜|柜子|冷冻|冷藏|抽屉|架子)/.test(t)) return false
  return /家里有(什么|哪些)|家中有(什么|哪些)|家里还有(什么|哪些)|有什么存货|存货有什么|库存有(什么|哪些)|家里都有什么/.test(
    t
  )
}

function familyWideProbe(name) {
  return {
    spaceName: '',
    locationName: '',
    name: String(name || '').trim(),
    listAll: true
  }
}

/** 点名了存放点却对不上树 → 仍应追问；品类/全家问除外 */
function shouldAskPlaceForInventory(text, tree, history) {
  if (isCategoryInventoryIntent(text) || isWholeHomeInventoryIntent(text)) return false
  if (inferProbeFromText(text, tree, history)) return false
  const t = String(text || '')
  if (hasInsideInventoryCue(t) && !/家里/.test(t)) return true
  if (/(冰箱|橱柜|柜子|冷冻|冷藏|抽屉|架子)/.test(t)) return true
  return false
}

function normalizeReply(raw) {
  const text = String(raw || '').trim()
  if (!text) return ''
  return text.slice(0, 800)
}

function parsePlan(text) {
  const raw = String(text || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')
  const parsed = JSON.parse(raw)
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('invalid plan shape')
  }
  const ask = normalizeAsk(parsed.ask)
  const probe = normalizeProbe(parsed.probe)
  const calls = Array.isArray(parsed.calls)
    ? parsed.calls.filter((c) => c && typeof c === 'object')
    : []
  let reply = normalizeReply(parsed.reply || parsed.answer || parsed.message)
  // ask / calls 优先：有澄清或要执行时丢掉 reply，避免双通道
  if (ask.length || calls.length) reply = ''
  return { ask, probe, calls, reply }
}

function draftFromCalls(calls) {
  const create = (calls || []).find((c) => c && c.use === 'item.create') || (calls || [])[0] || {}
  return {
    name: String(create.name || '').trim(),
    quantity: create.quantity,
    unit: String(create.unit || '').trim(),
    note: String(create.note || '').trim(),
    spaceName: String(create.spaceName || '').trim(),
    locationName: String(create.locationName || '').trim(),
    expireDate: create.expireDate || '',
    productionDate: create.productionDate || ''
  }
}

function placeLabel(spaceName, locationName) {
  return [spaceName, locationName].filter(Boolean).join(' / ')
}

async function listItemsCompact(db, familyId, opts = {}) {
  const where = { familyId }
  if (opts.spaceId) where.spaceId = opts.spaceId
  if (opts.locationId) where.locationId = opts.locationId
  let list = []
  try {
    const res = await db
      .collection('items')
      .where(where)
      .orderBy('updatedAt', 'desc')
      .limit(opts.limit || 40)
      .get()
    list = res.data || []
  } catch (e) {
    // 缺复合索引时 orderBy 会失败；降级为不过排序 / 内存过滤
    try {
      const res = await db
        .collection('items')
        .where(where)
        .limit(opts.limit || 40)
        .get()
      list = res.data || []
    } catch (e2) {
      const res = await db.collection('items').where({ familyId }).limit(100).get()
      list = (res.data || []).filter((item) => {
        if (opts.spaceId && item.spaceId !== opts.spaceId) return false
        if (opts.locationId && item.locationId !== opts.locationId) return false
        return true
      })
    }
  }
  const kw = String(opts.name || '').trim().toLowerCase()
  if (kw) {
    list = list.filter((item) => String(item.name || '').toLowerCase().includes(kw))
  }
  return list
}

function isExpireSubscribeIntent(text) {
  const t = String(text || '').trim()
  if (!t) return false
  // 「快过期有哪些」是查临期，不是开订阅
  if (
    /有哪些|有什么|查一下|看看|快过期|临期的|过期的|哪些临期/.test(t) &&
    !/订阅|打开|开启|关掉|关闭|帮我开/.test(t)
  ) {
    return false
  }
  return (
    /消息订阅|订阅消息|(临期|过期).{0,6}(消息)?订阅|(打开|开启|关掉|关闭|帮我开).{0,10}(临期|过期).{0,8}(消息|提醒|订阅)|(临期|过期)提醒/.test(
      t
    ) || /订阅.*(临期|过期|提醒)/.test(t)
  )
}

async function loadSubscribedItemSet(db, familyId, openid) {
  const res = await db
    .collection('itemExpireSubs')
    .where({ familyId, openid })
    .limit(100)
    .get()
    .catch(() => ({ data: [] }))
  const set = {}
  ;(res.data || []).forEach((row) => {
    if (row && row.itemId) set[row.itemId] = true
  })
  return set
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

async function listExpireSubscribePanel(db, familyId, openid, tree) {
  const [all, subscribed] = await Promise.all([
    listItemsCompact(db, familyId, { limit: 100 }),
    loadSubscribedItemSet(db, familyId, openid)
  ])
  const rows = (all || [])
    .filter((item) => item && item._id && item.expireDate)
    .sort((a, b) => String(a.expireDate).localeCompare(String(b.expireDate)))
    .slice(0, 30)
    .map((item) => {
      const place = placeNamesForItem(item, tree)
      const placeBits = [place.spaceName, place.locationName].filter(Boolean)
      return {
        itemId: item._id,
        name: item.name || '未命名',
        expireDate: item.expireDate,
        spaceName: place.spaceName,
        locationName: place.locationName,
        placeLabel: placeBits.length ? placeBits.join(' / ') : '',
        expireReminderEnabled: !!subscribed[item._id]
      }
    })
  return rows
}

function doneExpireSubscribePanel(items, focus, sessionRecent) {
  const list = items || []
  const text = list.length
    ? '临期提醒要你本人点开关授权。下面是已设过期日的物资，打开即可订阅：'
    : '还没有设置过期日的物资。先给物资加上过期日期，再来订阅临期提醒。'
  return attachPresentation(
    {
      status: 'subscribe',
      ask: [],
      confirm: [],
      calls: [],
      subscribeItems: list,
      report: {
        executed: [],
        failed: [],
        possibleDuplicates: [],
        lines: [text],
        recentItems: [],
        removedItemIds: [],
        wrote: false
      },
      draft: draftFromCalls([]),
      focus: focus && { ref: focus.ref, name: focus.name },
      recentItems: publicRecentItems(sessionRecent || []),
      removedItemIds: [],
      wrote: false
    },
    textOnlyPresentation(text)
  )
}

function isStructureOnlyIntent(text) {
  const t = String(text || '').trim()
  if (!t) return false
  // 「地方」= 位置口语；优先识别纯结构，避免被「有哪些」库存逻辑误伤
  const askingPlaceStructure =
    /(有多少|有几个|有哪些|几个|多少|哪些|什么)(个)?(空间|房间|位置|地方)/.test(t) ||
    /(空间|房间|位置|地方)(有多少|有几个|有哪些|几个|多少|列表)/.test(t) ||
    /什么房间|家里有(多少|几个|哪些)?(个)?(空间|房间)/.test(t)
  if (askingPlaceStructure) {
    // 夹带物资口吻仍算查库存（注意：勿把「家里」的「里」当成「里面」）
    if (/物资|东西|库存|过期|什么货/.test(t)) return false
    if (/(?:^|[^家])里[面边]?.{0,4}(有什么|有哪些|有啥|什么东西)/.test(t)) return false
    return true
  }
  // 明确在问物资 / 某处里有什么 → 不是纯结构
  if (/物资|东西|库存|过期|还有吗|什么货|有什么|里有/.test(t) && !/(空间|房间|位置|地方)/.test(t)) {
    return false
  }
  if (/(冰箱|橱柜|柜子|冷冻|冷藏).{0,8}(有什么|有哪些|里有|什么东西)/.test(t)) return false
  if (/(厨房|客厅|卧室|仓库|卫生间).{0,4}(里|里面|里边)?.{0,4}(有什么|有哪些|什么东西)/.test(t)) {
    return false
  }
  return false
}

/** 「里有」库存口吻；排除「家里有…」误伤 */
function hasInsideInventoryCue(text) {
  return /(?:^|[^家])里[面边]?有/.test(String(text || ''))
}

/** 写台账口吻：挪/改/记/删等，短澄清跟进不应被当成查库存 */
function isWriteLedgerIntent(text) {
  const t = String(text || '')
  return /放到|移到|挪到|改到|记一|记个|记上|添加|删掉|删除|合并|改成|改一下|更新|设置过期|入库/.test(
    t
  )
}

function isClarificationAsk(text) {
  return /你指哪个|哪一个|哪个冰箱|哪个位置|哪个空间|哪间|选一个/.test(String(text || ''))
}

function isListInventoryIntent(text, history) {
  const t = String(text || '').trim()
  if (!t) return false
  if (isStructureOnlyIntent(t)) return false
  // 双保险：问地方/位置/空间数量时绝不走查物资
  if (/(有哪些|有多少|有几个|哪些|什么)(个)?(地方|位置|空间|房间)/.test(t)) return false
  if (/(地方|位置|空间|房间)(有哪些|有多少|有几个)/.test(t)) return false
  if (/怎么用|如何用|怎样记|怎么记|怎么操作/.test(t)) return false
  if (/（澄清[：:]/.test(t) || /^澄清[：:]/.test(t)) return false
  if (isWriteLedgerIntent(t)) return false
  if (/有什么|有哪些|什么东西|哪些东西|库存|还有吗|还有没有|查一下/.test(t)) {
    return true
  }
  if (hasInsideInventoryCue(t)) return true
  if (/看看|查查/.test(t) && /(里|冰箱|橱柜|厨房|客厅|卧室|仓库)/.test(t)) return true
  // 短跟进：上一句已在问库存才续查；若上一句是写台账或助手在澄清，则不是查库存
  if (t.length <= 24 && Array.isArray(history) && history.length) {
    const prevAssistant = [...history]
      .reverse()
      .find((row) => row && row.role === 'assistant' && row.text)
    if (prevAssistant && isClarificationAsk(prevAssistant.text)) return false
    const prevUser = [...history].reverse().find((row) => row && row.role === 'user' && row.text)
    const prev = prevUser ? String(prevUser.text) : ''
    if (isStructureOnlyIntent(prev) || isWriteLedgerIntent(prev)) return false
    if (/有什么|有哪些|什么东西|库存/.test(prev) || hasInsideInventoryCue(prev)) return true
  }
  return false
}

function matchMentionedSpace(tree, text) {
  const t = String(text || '')
  let best = null
  ;((tree && tree.spaces) || []).forEach((space) => {
    if (!space || !space.name) return
    if (t.indexOf(space.name) < 0) return
    if (!best || space.name.length > best.name.length) best = space
  })
  return best
}

/** 仅作模型走错时的兜底；点名空间则只答该空间，不整树倾倒 */
function formatStructureReply(tree, text) {
  const spaces = (tree && tree.spaces) || []
  if (!spaces.length) return '当前家庭还没有空间。'
  const t = String(text || '')
  const mentioned = matchMentionedSpace(tree, t)
  if (mentioned) {
    const locs = (mentioned.locations || []).map((l) => l && l.name).filter(Boolean)
    if (/位置|地方/.test(t)) {
      if (!locs.length) return `「${mentioned.name}」下还没有位置。`
      return `「${mentioned.name}」下有 ${locs.length} 个位置：${locs.join('、')}。`
    }
    if (!locs.length) return `「${mentioned.name}」下还没有位置。`
    return `「${mentioned.name}」下有位置：${locs.join('、')}。`
  }
  const lines = [`当前家庭有 ${spaces.length} 个空间：`]
  spaces.forEach((space) => {
    const title = space.isDefault ? `${space.name}（默认）` : space.name
    const locs = (space.locations || []).map((l) => l && l.name).filter(Boolean)
    if (locs.length) lines.push(`- ${title}：${locs.join('、')}`)
    else lines.push(`- ${title}：（还没有位置）`)
  })
  return lines.join('\n')
}

function doneStructureReport(tree, text, focus, sessionRecent) {
  const reply = formatStructureReply(tree, text)
  return attachPresentation(
    {
      status: 'done',
      ask: [],
      confirm: [],
      calls: [],
      report: {
        executed: [],
        failed: [],
        possibleDuplicates: [],
        lines: [reply],
        recentItems: [],
        removedItemIds: [],
        wrote: false
      },
      draft: draftFromCalls([]),
      focus: focus && { ref: focus.ref, name: focus.name },
      recentItems: publicRecentItems(sessionRecent || []),
      removedItemIds: [],
      wrote: false
    },
    textOnlyPresentation(reply)
  )
}

function inferProbeFromText(text, tree, history) {
  const raw = String(text || '')
  const blob = [raw]
    .concat(
      (history || [])
        .slice(-4)
        .map((row) => String((row && row.text) || ''))
    )
    .join('\n')
  const spaces = (tree && tree.spaces) || []
  let bestSpace = null
  spaces.forEach((s) => {
    if (!s || !s.name) return
    if (blob.indexOf(s.name) < 0) return
    if (!bestSpace || s.name.length > bestSpace.name.length) bestSpace = s
  })
  let bestLoc = null
  let bestLocSpace = bestSpace
  const searchSpaces = bestSpace ? [bestSpace] : spaces
  searchSpaces.forEach((s) => {
    ;(s.locations || []).forEach((l) => {
      if (!l || !l.name) return
      if (raw.indexOf(l.name) < 0 && blob.indexOf(l.name) < 0) return
      if (!bestLoc || l.name.length > bestLoc.name.length) {
        bestLoc = l
        bestLocSpace = s
      }
    })
  })
  // 仅位置名且全树唯一
  if (!bestLoc && raw) {
    const hits = []
    spaces.forEach((s) => {
      ;(s.locations || []).forEach((l) => {
        if (l && l.name && raw.indexOf(l.name) >= 0) hits.push({ space: s, loc: l })
      })
    })
    if (hits.length === 1) {
      bestLoc = hits[0].loc
      bestLocSpace = hits[0].space
      bestSpace = bestSpace || hits[0].space
    }
  }
  if (!bestSpace && !bestLoc) return null
  return {
    spaceName: (bestSpace && bestSpace.name) || (bestLocSpace && bestLocSpace.name) || '',
    locationName: (bestLoc && bestLoc.name) || '',
    name: ''
  }
}

function doneInventoryReport(rows, tree, focus, sessionRecent) {
  const items = (rows || []).map((row) => ({
    _id: row.itemId || row._id,
    name: row.name,
    quantity: row.quantity,
    unit: row.unit,
    spaceId: row.spaceId,
    locationId: row.locationId,
    spaceName: row.spaceName,
    locationName: row.locationName,
    expireDate: row.expireDate,
    productionDate: row.productionDate,
    note: row.note,
    tagIds: row.tagIds || []
  }))
  const presentation = buildInventoryPresentation(items, tree, '查询')
  return attachPresentation(
    {
      status: 'done',
      ask: [],
      confirm: [],
      calls: [{ use: 'item.search' }],
      report: {
        executed: [{ step: 1, use: 'item.search', summary: presentation.lead }],
        failed: [],
        possibleDuplicates: [],
        lines: presentation.lines,
        recentItems: publicRecentItems(rows),
        removedItemIds: [],
        wrote: false
      },
      draft: draftFromCalls([]),
      focus: focus && { ref: focus.ref, name: focus.name },
      recentItems: publicRecentItems(sessionRecent),
      removedItemIds: [],
      wrote: false
    },
    presentation
  )
}

function addDaysYmd(ymd, days) {
  const [y, m, d] = String(ymd || '').split('-').map(Number)
  if (!y || !m || !d) return ymd
  const utc = Date.UTC(y, m - 1, d) + days * 86400000
  const dt = new Date(utc)
  const yy = dt.getUTCFullYear()
  const mm = String(dt.getUTCMonth() + 1).padStart(2, '0')
  const dd = String(dt.getUTCDate()).padStart(2, '0')
  return `${yy}-${mm}-${dd}`
}

async function loadFocus(cloud, db, familyId, tree, itemId) {
  const id = String(itemId || '').trim()
  if (!id) return null
  const snap = await db.collection('items').doc(id).get().catch(() => null)
  if (!snap || !snap.data || snap.data.familyId !== familyId) return null
  return compactItem({ _id: id, ...snap.data }, 'F1', tree)
}

async function loadRecentItems(db, familyId, tree, ids, refs, skipItemId) {
  const unique = (ids || []).filter((id) => id && id !== skipItemId)
  if (!unique.length) return []
  const snaps = await Promise.all(
    unique.map((id) => db.collection('items').doc(id).get().catch(() => null))
  )
  const rows = []
  snaps.forEach((snap, i) => {
    if (!snap || !snap.data || snap.data.familyId !== familyId) return
    const row = compactItem({ _id: unique[i], ...snap.data }, `R${rows.length + 1}`, tree)
    refs[row.ref] = row
    rows.push(row)
  })
  return rows
}

async function runProbe(db, familyId, tree, probe, refs) {
  if (!probe) return []
  let space = matchSpace(tree, probe.spaceName)
  let loc = matchLocation(space, probe.locationName)
  // 只有位置名、或空间没配上时：在树里解析唯一位置
  if (probe.locationName && !loc) {
    const hits = []
    ;((tree && tree.spaces) || []).forEach((s) => {
      const hit = matchLocation(s, probe.locationName)
      if (hit) hits.push({ space: s, loc: hit })
    })
    if (hits.length === 1) {
      space = hits[0].space
      loc = hits[0].loc
    } else if (space) {
      loc = matchLocation(space, probe.locationName)
    }
  }
  if (probe.locationName && !loc) return []
  const familyWide =
    !!probe.listAll || (!probe.spaceName && !probe.locationName && !space && !loc)
  const list = await listItemsCompact(db, familyId, {
    spaceId: space && space.id,
    locationId: loc && loc.id,
    name: probe.name,
    limit: familyWide ? 80 : 40
  })
  const rows = []
  const cap = familyWide ? 40 : 12
  list.slice(0, cap).forEach((item, i) => {
    const row = compactItem(item, `P${i + 1}`, tree)
    refs[row.ref] = row
    rows.push(row)
  })
  return rows
}

function lookupRef(call, refs) {
  const itemId = String((call && call.itemId) || '').trim()
  if (itemId) {
    const hit = Object.keys(refs)
      .map((k) => refs[k])
      .find((row) => row && row.itemId === itemId)
    if (hit) return hit
    return {
      ref: String((call && call.ref) || '').trim() || 'X',
      itemId,
      name: String((call && call.name) || '').trim(),
      spaceName: '',
      locationName: ''
    }
  }
  const raw = String(call.ref || call.itemRef || '').trim()
  if (isShortRef(raw) && refs[raw.toUpperCase()]) return refs[raw.toUpperCase()]
  const upper = raw.toUpperCase()
  if (isShortRef(upper) && refs[upper]) return refs[upper]
  const name = String(call.name || '').trim()
  if (!name) return null
  const keys = Object.keys(refs)
  const spaceName = String(call.spaceName || '').trim()
  const locationName = String(call.locationName || '').trim()
  return (
    keys
      .map((k) => refs[k])
      .find((row) => {
        if (!row || row.name !== name) return false
        if (spaceName && row.spaceName !== spaceName) return false
        if (locationName && row.locationName !== locationName) return false
        return true
      }) || null
  )
}

function bindCallIds(calls, refs) {
  return (calls || []).map((call) => {
    if (!call || typeof call !== 'object') return call
    if (String(call.use || '').trim() === 'item.merge') {
      const refList = Array.isArray(call.refs)
        ? call.refs
        : call.ref
          ? [call.ref]
          : []
      const itemIds = Array.isArray(call.itemIds) ? call.itemIds.slice() : []
      const names = Array.isArray(call.names) ? call.names.slice() : []
      if (!itemIds.length) {
        refList.forEach((raw) => {
          const row = lookupRef({ ref: raw }, refs)
          if (row && row.itemId && itemIds.indexOf(row.itemId) < 0) {
            itemIds.push(row.itemId)
            names.push(row.name || '')
          }
        })
      }
      return {
        ...call,
        refs: refList,
        itemIds,
        names,
        name: call.name || names[0] || ''
      }
    }
    const row = lookupRef(call, refs)
    if (!row || !row.itemId) return call
    return {
      ...call,
      itemId: row.itemId,
      name: row.name || call.name || '',
      ref: call.ref || row.ref
    }
  })
}

async function ensureLocation(writers, openid, tree, space, locationName, enabledSet, familyCtx) {
  const name = String(locationName || '').trim()
  if (!name || !space) return { locationId: null, tree }
  const existing = matchLocation(space, name)
  if (existing) return { locationId: existing.id, locationName: existing.name, tree }
  if (!enabledSet['space.createLocation']) {
    return { error: fail('NO_LOCATION', `位置「${name}」不在「${space.name}」下`) }
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
    return { error: fail(created.code, created.message) }
  }
  const loc = created.data || {}
  const locId = loc._id || loc.id
  space.locations = (space.locations || []).concat([{ id: locId, name }])
  return { locationId: locId, locationName: name, tree, created: true }
}

function enabledMap(catalog) {
  const map = {}
  enabledApis(catalog).forEach((api) => {
    map[api.id] = api
  })
  return map
}

function needsConfirm(calls, catalogMap) {
  return (calls || []).filter((call) => {
    const api = catalogMap[call.use]
    return api && api.confirm
  })
}

function planNeedsUnavailableCapability(calls, catalogMap) {
  return (calls || []).some((call) => {
    const use = String((call && call.use) || '').trim()
    if (!use) return true
    if (isHardDenied(use)) return true
    if (!catalogMap[use]) return true
    return false
  })
}

function capabilityLimitAsk() {
  return [{ question: CAPABILITY_LIMIT_ASK, options: [] }]
}

async function findDuplicates(db, familyId, spaceId, locationId, name) {
  const where = { familyId, name, spaceId }
  if (locationId) where.locationId = locationId
  else where.locationId = null
  const res = await db.collection('items').where(where).limit(10).get()
  return res.data || []
}

async function executeCalls(writers, openid, db, familyId, tree, calls, refs, catalogMap, todayYmd) {
  const executed = []
  const failed = []
  const createdPlaces = []
  const recentItems = []
  const removedItemIds = []
  let currentTree = tree
  const familyCtx = { familyId, openid }

  function remember(row) {
    const itemId = row && (row.itemId || row._id)
    if (!itemId) return
    recentItems.push({
      itemId,
      name: row.name || ''
    })
  }

  for (let i = 0; i < calls.length; i++) {
    const call = calls[i] || {}
    const use = String(call.use || '').trim()
    const step = i + 1

    if (!use || isHardDenied(use) || !catalogMap[use]) {
      failed.push({
        step,
        use: use || 'unknown',
        summary: `第 ${step} 步不能执行${use ? `（${use}）` : ''}`
      })
      break
    }

    try {
      if (use === 'item.search') {
        const space = matchSpace(currentTree, call.spaceName)
        const loc = matchLocation(space, call.locationName)
        const list = await listItemsCompact(db, familyId, {
          spaceId: space && space.id,
          locationId: loc && loc.id,
          name: String(call.name || call.keyword || '').trim(),
          limit: 40
        })
        list.slice(0, 8).forEach((item) => remember(item))
        const inv = buildInventoryPresentation(list, currentTree, '查询')
        executed.push({
          step,
          use,
          summary: inv.lead,
          inventory: list
        })
        continue
      }

      if (use === 'item.listExpiring') {
        const end = addDaysYmd(todayYmd, 3)
        const all = await listItemsCompact(db, familyId, { limit: 100 })
        const list = all
          .filter((item) => item.expireDate && String(item.expireDate) <= end)
          .sort((a, b) => String(a.expireDate).localeCompare(String(b.expireDate)))
          .slice(0, 20)
        list.slice(0, 8).forEach((item) => remember(item))
        const inv = buildInventoryPresentation(
          list,
          currentTree,
          '临期/过期',
          '没有临期或过期物品'
        )
        executed.push({
          step,
          use,
          summary: inv.lead,
          inventory: list
        })
        continue
      }

      if (use === 'space.createLocation') {
        const space = matchSpace(currentTree, call.spaceName)
        if (!space) {
          failed.push({
            step,
            use,
            summary: `第 ${step} 步失败：空间「${call.spaceName || ''}」不在家庭结构里`
          })
          break
        }
        const locRes = await ensureLocation(
          writers,
          openid,
          currentTree,
          space,
          call.locationName || call.name,
          { 'space.createLocation': true },
          familyCtx
        )
        if (locRes.error) {
          failed.push({ step, use, summary: `第 ${step} 步失败：${locRes.error.message}` })
          break
        }
        if (locRes.created) {
          currentTree = (await touchFamilyTree(db, familyId)) || currentTree
        }
        executed.push({
          step,
          use,
          summary: locRes.created
            ? `已在「${space.name}」下新建位置「${locRes.locationName}」`
            : `位置「${locRes.locationName}」已存在`
        })
        continue
      }

      if (use === 'item.create') {
        const name = String(call.name || '').trim()
        if (!name) {
          failed.push({ step, use, summary: `第 ${step} 步失败：缺少物品名称` })
          break
        }
        const space = matchSpace(currentTree, call.spaceName)
        if (!space) {
          failed.push({
            step,
            use,
            summary: `第 ${step} 步失败：空间「${call.spaceName || ''}」不在家庭结构里，未新建空间`
          })
          break
        }
        let locationId = null
        let locationName = ''
        if (String(call.locationName || '').trim()) {
          const locRes = await ensureLocation(
            writers,
            openid,
            currentTree,
            space,
            call.locationName,
            catalogMap,
            familyCtx
          )
          if (locRes.error) {
            failed.push({ step, use, summary: `第 ${step} 步失败：${locRes.error.message}` })
            break
          }
          locationId = locRes.locationId
          locationName = locRes.locationName || call.locationName
          if (locRes.created) {
            currentTree = (await touchFamilyTree(db, familyId)) || currentTree
          }
        }
        const tags = resolveTagIds(currentTree, call.tagNames)
        const payload = {
          name,
          quantity: call.quantity,
          unit: call.unit,
          note: call.note,
          spaceId: space.id,
          locationId,
          tagIds: tags.tagIds,
          expireDate: call.expireDate,
          productionDate: call.productionDate,
          source: 'agent'
        }
        const res = await writers.item.createItem(openid, payload, {
          familyCtx,
          space: { id: space.id, name: space.name, isDefault: !!space.isDefault },
          location: locationId
            ? { id: locationId, name: locationName, spaceId: space.id }
            : null,
          trustTagIds: true
        })
        if (!res.ok) {
          failed.push({
            step,
            use,
            summary: `第 ${step} 步失败：${name} — ${res.message}`
          })
          break
        }
        const qty = `${call.quantity == null ? '' : call.quantity}${call.unit || ''}`
        const place = placeLabel(space.name, locationName)
        executed.push({
          step,
          use,
          summary: `已记下 ${name}${qty ? ` ${qty}` : ''}${place ? `（${place}）` : ''}`
        })
        remember({
          itemId: res.data && (res.data._id || res.data.id),
          name
        })
        createdPlaces.push({
          name,
          spaceId: space.id,
          locationId,
          spaceName: space.name,
          locationName
        })
        continue
      }

      if (use === 'item.update') {
        const row = lookupRef(call, refs)
        if (!row) {
          failed.push({ step, use, summary: `第 ${step} 步失败：找不到要改的物品短号` })
          break
        }
        const payload = { itemId: row.itemId, source: 'agent' }
        if (call.name !== undefined) payload.name = call.name
        if (call.quantity !== undefined) payload.quantity = call.quantity
        if (call.unit !== undefined) payload.unit = call.unit
        if (call.note !== undefined) payload.note = call.note
        if (call.expireDate !== undefined) payload.expireDate = call.expireDate
        if (call.productionDate !== undefined) payload.productionDate = call.productionDate
        if (Array.isArray(call.tagNames)) {
          payload.tagIds = resolveTagIds(currentTree, call.tagNames).tagIds
        }
        const writeOpts = { familyCtx, trustTagIds: Array.isArray(call.tagNames) }
        if (call.spaceName || call.locationName) {
          const space = matchSpace(currentTree, call.spaceName || row.spaceName)
          if (!space) {
            failed.push({
              step,
              use,
              summary: `第 ${step} 步失败：空间「${call.spaceName || ''}」不在家庭结构里`
            })
            break
          }
          payload.spaceId = space.id
          writeOpts.space = { id: space.id, name: space.name, isDefault: !!space.isDefault }
          if (call.locationName) {
            const locRes = await ensureLocation(
              writers,
              openid,
              currentTree,
              space,
              call.locationName,
              catalogMap,
              familyCtx
            )
            if (locRes.error) {
              failed.push({ step, use, summary: `第 ${step} 步失败：${locRes.error.message}` })
              break
            }
            payload.locationId = locRes.locationId
            writeOpts.location = locRes.locationId
              ? {
                  id: locRes.locationId,
                  name: locRes.locationName || call.locationName,
                  spaceId: space.id
                }
              : null
            if (locRes.created) {
              currentTree = (await touchFamilyTree(db, familyId)) || currentTree
            }
          } else {
            payload.locationId = null
          }
        }
        const res = await writers.item.updateItem(openid, payload, writeOpts)
        if (!res.ok) {
          failed.push({ step, use, summary: `第 ${step} 步失败：${row.name} — ${res.message}` })
          break
        }
        executed.push({
          step,
          use,
          summary: `已修改 ${row.name}`
        })
        remember(row)
        continue
      }

      if (use === 'item.remove') {
        const row = lookupRef(call, refs)
        if (!row) {
          failed.push({ step, use, summary: `第 ${step} 步失败：找不到要删的物品短号` })
          break
        }
        const res = await writers.item.removeItem(
          openid,
          {
            itemId: row.itemId,
            source: 'agent'
          },
          { familyCtx }
        )
        if (!res.ok) {
          failed.push({ step, use, summary: `第 ${step} 步失败：${row.name} — ${res.message}` })
          break
        }
        executed.push({
          step,
          use,
          summary: `已删掉 ${row.name}`
        })
        if (row.itemId) removedItemIds.push(row.itemId)
        continue
      }

      if (use === 'item.merge') {
        let itemIds = Array.isArray(call.itemIds)
          ? call.itemIds.map((id) => String(id || '').trim()).filter(Boolean)
          : []
        if (!itemIds.length) {
          const refList = Array.isArray(call.refs)
            ? call.refs
            : call.ref
              ? [call.ref]
              : []
          for (let r = 0; r < refList.length; r++) {
            const row = lookupRef({ ref: refList[r] }, refs)
            if (!row || !row.itemId) {
              failed.push({
                step,
                use,
                summary: `第 ${step} 步失败：找不到要合并的物品短号`
              })
              itemIds = []
              break
            }
            if (itemIds.indexOf(row.itemId) < 0) itemIds.push(row.itemId)
          }
          if (failed.length && failed[failed.length - 1].step === step) break
        }
        if (itemIds.length < 2) {
          failed.push({
            step,
            use,
            summary: `第 ${step} 步失败：合并至少需要两条物资`
          })
          break
        }
        const res = await writers.item.mergeItems(
          openid,
          {
            itemIds,
            name: call.name,
            source: 'agent'
          },
          { familyCtx }
        )
        if (!res.ok) {
          failed.push({
            step,
            use,
            summary: `第 ${step} 步失败：${res.message || '合并失败'}`
          })
          break
        }
        const keptName = (res.data && res.data.name) || call.name || '物资'
        const qty = res.data && res.data.quantity
        const unit = (res.data && res.data.unit) || ''
        executed.push({
          step,
          use,
          summary: `已合并为 ${keptName}${qty != null ? ` ${qty}${unit}` : ''}（${itemIds.length} 条）`
        })
        remember({
          itemId: res.data && res.data._id,
          name: keptName
        })
        ;(res.data && res.data.absorbedIds ? res.data.absorbedIds : []).forEach((id) => {
          if (id) removedItemIds.push(id)
        })
        continue
      }

      failed.push({ step, use, summary: `第 ${step} 步未实现：${use}` })
      break
    } catch (e) {
      failed.push({
        step,
        use,
        summary: `第 ${step} 步失败：${e.message || String(e)}`
      })
      break
    }
  }

  const possibleDuplicates = []
  for (let i = 0; i < createdPlaces.length; i++) {
    const row = createdPlaces[i]
    const hits = await findDuplicates(db, familyId, row.spaceId, row.locationId, row.name)
    if (hits.length >= 2) {
      possibleDuplicates.push({
        name: row.name,
        spaceName: row.spaceName,
        locationName: row.locationName,
        count: hits.length
      })
    }
  }

  const presentation = buildExecutionPresentation(
    executed,
    failed,
    possibleDuplicates,
    currentTree
  )
  const lines =
    presentation.lines && presentation.lines.length
      ? presentation.lines
      : ['没有需要执行的操作']

  return {
    executed: executed.map((row) => ({
      step: row.step,
      use: row.use,
      summary: row.summary
    })),
    failed,
    possibleDuplicates,
    lines,
    lead: presentation.lead,
    blocks: presentation.blocks,
    recentItems: publicRecentItems(recentItems),
    removedItemIds,
    wrote: executed.some((row) =>
      /item\.create|item\.update|item\.remove|item\.merge|space\.createLocation/.test(row.use)
    )
  }
}

async function askModel(deps, system, userText) {
  const { callDeepSeek, keys, timeout, maxTokens } = deps
  const tryKeys = (keys || []).slice(0, 2)
  let lastMessage = '助手暂时不可用，请稍后重试'
  let lastContent = ''
  // 调试：云函数日志里完整打印发给模型的内容（密钥不落日志）
  console.info('[ai.act] >>> system\n' + String(system || ''))
  console.info('[ai.act] >>> user\n' + String(userText || ''))
  for (let i = 0; i < tryKeys.length; i++) {
    const key = tryKeys[i]
    try {
      const result = await callDeepSeek(key.apiKey, system, userText, {
        timeout,
        maxTokens
      })
      lastContent = result.content
      console.info('[ai.act] <<< model\n' + String(result.content || ''))
      return {
        plan: parsePlan(result.content),
        turn: {
          system: String(system || ''),
          user: String(userText || ''),
          model: String(result.content || '')
        }
      }
    } catch (err) {
      lastMessage = '助手暂时不可用，请稍后重试'
      const retryable = err.retryable === true || typeof err.retryable === 'undefined'
      if (!retryable) {
        throw Object.assign(new Error(lastMessage), { code: 'ACT_FAILED' })
      }
    }
  }
  if (lastContent) {
    try {
      return {
        plan: parsePlan(lastContent),
        turn: {
          system: String(system || ''),
          user: String(userText || ''),
          model: String(lastContent || '')
        }
      }
    } catch (e) {
      // fall through
    }
  }
  throw Object.assign(new Error(lastMessage), { code: 'ACT_FAILED' })
}

async function act(env, openid, event) {
  const {
    db,
    cloud,
    resolveFamilyContext,
    listKeyDocs,
    orderKeys,
    callDeepSeek,
    shanghaiToday,
    actHttpTimeoutMs,
    actMaxTokens
  } = env
  const ctx = await resolveFamilyContext(openid)
  if (ctx.error) return ctx.error

  const text = String((event && event.text) || '').trim()
  const confirmed = !!(event && (event.confirmed === true || event.confirmed === 'true'))
  const replayCalls = Array.isArray(event && event.calls) ? event.calls.filter((c) => c && typeof c === 'object') : []

  // 确认删除：直接执行上一轮已绑定 itemId 的计划，不再问模型（否则短号会变，删错/删不掉）
  if (confirmed && replayCalls.length) {
    const [catalog, treeDoc] = await Promise.all([
      ensureCapabilities(db),
      getOrRebuildFamilyTree(db, ctx.familyId)
    ])
    const tree = treeDoc || { familyId: ctx.familyId, spaces: [], tags: [] }
    const catalogMap = enabledMap(catalog)
    const today = shanghaiToday()
    const refs = {}
    const ids = []
    const seenId = {}
    replayCalls.forEach((c) => {
      const list = Array.isArray(c.itemIds) && c.itemIds.length
        ? c.itemIds
        : c.itemId
          ? [c.itemId]
          : []
      list.forEach((id) => {
        const s = String(id || '').trim()
        if (!s || seenId[s]) return
        seenId[s] = true
        ids.push(s)
      })
    })
    await loadRecentItems(db, ctx.familyId, tree, ids, refs, null)
    const writers = {
      item: createItemService(db),
      location: createLocationWriter(db)
    }
    const report = await executeCalls(
      writers,
      openid,
      db,
      ctx.familyId,
      tree,
      replayCalls,
      refs,
      catalogMap,
      today.ymd
    )
    return ok({
      status: 'done',
      ask: [],
      confirm: [],
      calls: replayCalls,
      report,
      lead: report.lead || '',
      blocks: report.blocks || [],
      draft: draftFromCalls(replayCalls),
      focus: null,
      recentItems: publicRecentItems(report.recentItems || []),
      removedItemIds: report.removedItemIds || [],
      wrote: !!report.wrote
    })
  }

  if (!text) return fail('INVALID_TEXT', '请输入一句话')

  // 临期消息订阅：微信要求用户手势授权，助手不能代开 → 列出物资开关面板
  if (isExpireSubscribeIntent(text)) {
    const treeDoc = await getOrRebuildFamilyTree(db, ctx.familyId)
    const tree = treeDoc || { familyId: ctx.familyId, spaces: [], tags: [] }
    const items = await listExpireSubscribePanel(db, ctx.familyId, openid, tree)
    return ok(doneExpireSubscribePanel(items, null, []))
  }

  const keys = orderKeys(await listKeyDocs(ctx.familyId))
  if (!keys.length) {
    return fail('NO_AI_KEY', '请先配置家庭 AI 密钥')
  }

  const [catalog, promptDoc, treeDoc, famSnap] = await Promise.all([
    ensureCapabilities(db),
    ensureAssistPrompt(db),
    getOrRebuildFamilyTree(db, ctx.familyId),
    db.collection('families').doc(ctx.familyId).get().catch(() => null)
  ])
  const tree = treeDoc || { familyId: ctx.familyId, spaces: [], tags: [] }
  const familyName = (famSnap && famSnap.data && famSnap.data.name) || '家庭'
  const today = shanghaiToday()
  const catalogMap = enabledMap(catalog)
  const refs = {}
  const modelOpts = {
    callDeepSeek,
    keys,
    timeout: actHttpTimeoutMs || 20000,
    maxTokens: actMaxTokens || 800
  }

  const history = sanitizeHistory(event && event.history)
  const focus = await loadFocus(cloud, db, ctx.familyId, tree, event && event.focusItemId)
  if (focus) refs[focus.ref] = focus
  const recentRows = await loadRecentItems(
    db,
    ctx.familyId,
    tree,
    sanitizeRecentIds(event && event.recentItemIds),
    refs,
    focus && focus.itemId
  )
  let sessionRecent = recentRows.slice()

  const vars = {
    today: today.ymd,
    weekday: today.weekday,
    familyName,
    capabilities: renderCapabilities(catalog),
    tree: renderTreeNames(tree),
    history: renderHistory(history),
    focus: renderFocusList([focus].concat(recentRows)),
    probe: '无'
  }
  const system = fillAssistPrompt(promptDoc.system || ASSIST_PROMPT_V2, vars)
  const userText = focus
    ? `${text}\n（当前关注短号 ${focus.ref}：${focus.name}）`
    : text

  const modelTurns = []
  let plan
  try {
    const first = await askModel(modelOpts, system, userText)
    plan = first.plan
    modelTurns.push(first.turn)
  } catch (e) {
    return fail(e.code || 'ACT_FAILED', e.message || '助手暂时不可用，请稍后重试')
  }

  function withDebug(payload) {
    // 完整 system/user/model 只打云函数日志，不回传客户端（体积大会导致端上偶发丢结果气泡）
    return payload
  }

  // 品类/全家盘点：模型若又 ask「查哪个空间」→ 丢掉，改走探查（别把常识问收成选房间）
  if (
    plan.ask.length &&
    !isStructureOnlyIntent(text) &&
    (isCategoryInventoryIntent(text) ||
      isWholeHomeInventoryIntent(text) ||
      isListInventoryIntent(text, history)) &&
    !shouldAskPlaceForInventory(text, tree, history)
  ) {
    const limitAsk = plan.ask.some((a) =>
      /能力有限/.test(String((a && a.question) || ''))
    )
    if (!limitAsk) {
      const inferred = inferProbeFromText(text, tree, history)
      plan = {
        ask: [],
        probe: plan.probe || inferred || familyWideProbe(''),
        calls: [],
        reply: ''
      }
    }
  }

  if (plan.ask.length) {
    return ok(
      withDebug({
        status: 'ask',
        ask: plan.ask,
        probe: null,
        calls: [],
        draft: draftFromCalls(plan.calls),
        focus: focus && { ref: focus.ref, name: focus.name },
        recentItems: publicRecentItems(sessionRecent),
        removedItemIds: [],
        wrote: false
      })
    )
  }

  // 结构问答：只答家庭树，禁止 probe / 查库存抢答
  const structureOnly = isStructureOnlyIntent(text)
  if (structureOnly) {
    return ok(withDebug(doneStructureReport(tree, text, focus, sessionRecent)))
  }

  // 模型用 reply 臆造库存时：强制改为探查（TREE 不含物资）
  const categoryIntent = isCategoryInventoryIntent(text)
  const listIntent =
    isListInventoryIntent(text, history) ||
    categoryIntent ||
    isWholeHomeInventoryIntent(text)
  // 品类问却走了无筛选的 item.search：改成全家探查，留给模型按常识归纳
  if (
    categoryIntent &&
    !plan.probe &&
    Array.isArray(plan.calls) &&
    plan.calls.length === 1 &&
    String(plan.calls[0].use || '').trim() === 'item.search'
  ) {
    plan = { ask: [], probe: familyWideProbe(plan.calls[0].name || ''), calls: [], reply: '' }
  }
  if (listIntent && !plan.probe && !(plan.calls && plan.calls.length)) {
    const inferred = inferProbeFromText(text, tree, history)
    if (inferred) {
      plan = { ask: [], probe: inferred, calls: [], reply: '' }
    } else if (shouldAskPlaceForInventory(text, tree, history)) {
      // 点了某处但对不上树：追问地点
      return ok(
        withDebug({
          status: 'ask',
          ask: [
            {
              question: '你想查哪个空间或位置里的物资？',
              options: ((tree && tree.spaces) || [])
                .slice(0, 4)
                .map((s) => ({
                  label: s.name,
                  value: s.name
                }))
                .filter((o) => o.label)
            }
          ],
          probe: null,
          calls: [],
          draft: draftFromCalls([]),
          focus: focus && { ref: focus.ref, name: focus.name },
          recentItems: publicRecentItems(sessionRecent),
          removedItemIds: [],
          wrote: false
        })
      )
    } else {
      // 全家 / 品类 / 泛问「有什么」：先拉台账，勿逼人选房间
      plan = { ask: [], probe: familyWideProbe(''), calls: [], reply: '' }
    }
  }

  let probedRows = []
  if (plan.probe) {
    probedRows = await runProbe(db, ctx.familyId, tree, plan.probe, refs)
    sessionRecent = sessionRecent.concat(probedRows)

    // 地点清单：探查后直接按台账回报。品类问要再问模型一轮做常识筛选。
    if (listIntent && !categoryIntent) {
      return ok(withDebug(doneInventoryReport(probedRows, tree, focus, sessionRecent)))
    }

    const secondVars = { ...vars, probe: renderProbe(probedRows) }
    const secondSystem = fillAssistPrompt(promptDoc.system || ASSIST_PROMPT_V2, secondVars)
    const probeNote = probedRows.length
      ? `探查结果：\n${renderProbe(probedRows)}`
      : '探查结果：无匹配物资'
    const secondUser = categoryIntent
      ? `${userText}\n${probeNote}\n请只根据探查结果，用生活常识归纳答复（如「吃的」只列可食用的）；不要追问空间；不要编造名单外的物资。用 reply 回答，probe/calls 置空。`
      : `${userText}\n${probeNote}`
    try {
      const second = await askModel(modelOpts, secondSystem, secondUser)
      plan = second.plan
      modelTurns.push(second.turn)
    } catch (e) {
      return fail(e.code || 'ACT_FAILED', e.message || '助手暂时不可用，请稍后重试')
    }
    plan.probe = null
    if (plan.ask.length) {
      const limitAsk = plan.ask.some((a) =>
        /能力有限/.test(String((a && a.question) || ''))
      )
      // 品类归纳轮仍追问空间 → 忽略，改用台账原文或已有 reply
      if (categoryIntent && !limitAsk && !shouldAskPlaceForInventory(text, tree, history)) {
        plan.ask = []
        if (!plan.reply && !(plan.calls && plan.calls.length)) {
          return ok(withDebug(doneInventoryReport(probedRows, tree, focus, sessionRecent)))
        }
      } else {
        return ok(
          withDebug({
            status: 'ask',
            ask: plan.ask,
            probe: null,
            calls: [],
            draft: draftFromCalls(plan.calls),
            focus: focus && { ref: focus.ref, name: focus.name },
            recentItems: publicRecentItems(sessionRecent),
            removedItemIds: [],
            wrote: false
          })
        )
      }
    }
    // 品类归纳后若模型既不 reply 也不 calls：退回台账原文，总比沉默强
    if (categoryIntent && !plan.reply && !(plan.calls && plan.calls.length)) {
      return ok(withDebug(doneInventoryReport(probedRows, tree, focus, sessionRecent)))
    }
  }

  // 域内自然语言：不调接口，直接回 reply（查库走 calls，由代码按台账字段汇报）
  if (plan.reply && !(plan.calls && plan.calls.length)) {
    let replyText = plan.reply
    // 探查明明有货，模型却说没有 → 覆盖为台账汇报（品类归纳除外：名单里可能没有「吃的」）
    if (
      probedRows.length &&
      !categoryIntent &&
      /没有|无物资|没(有)?记录|查不到|暂无|目前没有/.test(replyText)
    ) {
      return ok(withDebug(doneInventoryReport(probedRows, tree, focus, sessionRecent)))
    }
    return ok(
      withDebug(
        attachPresentation(
          {
            status: 'done',
            ask: [],
            confirm: [],
            calls: [],
            report: {
              executed: [],
              failed: [],
              possibleDuplicates: [],
              lines: [replyText],
              recentItems: [],
              removedItemIds: [],
              wrote: false
            },
            draft: draftFromCalls([]),
            focus: focus && { ref: focus.ref, name: focus.name },
            recentItems: publicRecentItems(sessionRecent),
            removedItemIds: [],
            wrote: false
          },
          textOnlyPresentation(replyText)
        )
      )
    )
  }

  if (planNeedsUnavailableCapability(plan.calls, catalogMap)) {
    return ok(
      withDebug({
        status: 'ask',
        ask: capabilityLimitAsk(),
        probe: null,
        calls: [],
        draft: draftFromCalls([]),
        focus: focus && { ref: focus.ref, name: focus.name },
        recentItems: publicRecentItems(sessionRecent),
        removedItemIds: [],
        wrote: false
      })
    )
  }

  const confirmCalls = needsConfirm(plan.calls, catalogMap)
  if (confirmCalls.length && !confirmed) {
    const boundCalls = bindCallIds(plan.calls, refs)
    return ok(
      withDebug({
        status: 'confirm',
        ask: [],
        confirm: confirmCalls.map((call) => {
          const bound = bindCallIds([call], refs)[0] || call
          if (String(call.use || '').trim() === 'item.merge') {
            const names =
              (bound.names && bound.names.filter(Boolean).length
                ? bound.names.filter(Boolean)
                : null) ||
              (Array.isArray(bound.itemIds)
                ? bound.itemIds.map((id) => {
                    const row = lookupRef({ itemId: id }, refs)
                    return (row && row.name) || ''
                  })
                : []
              ).filter(Boolean)
            return {
              use: call.use,
              refs: bound.refs || [],
              itemIds: bound.itemIds || [],
              name: bound.name || names[0] || '物资',
              names
            }
          }
          const row = lookupRef(call, refs)
          return {
            use: call.use,
            ref: call.ref || '',
            itemId: (row && row.itemId) || call.itemId || '',
            name: (row && row.name) || call.name || ''
          }
        }),
        calls: boundCalls,
        draft: draftFromCalls(boundCalls),
        focus: focus && { ref: focus.ref, name: focus.name },
        recentItems: publicRecentItems(sessionRecent),
        removedItemIds: [],
        wrote: false
      })
    )
  }

  // 本环境嵌套 callFunction 会丢 OPENID；写路径与 item/space 共用 helper，显式传入当前 openid。
  const writers = {
    item: createItemService(db),
    location: createLocationWriter(db)
  }
  const report = await executeCalls(
    writers,
    openid,
    db,
    ctx.familyId,
    tree,
    plan.calls,
    refs,
    catalogMap,
    today.ymd
  )
  return ok(
    withDebug({
      status: 'done',
      ask: [],
      confirm: [],
      calls: plan.calls,
      report,
      lead: report.lead || '',
      blocks: report.blocks || [],
      draft: draftFromCalls(plan.calls),
      focus: focus && { ref: focus.ref, name: focus.name },
      recentItems: publicRecentItems(sessionRecent.concat(report.recentItems || [])),
      removedItemIds: report.removedItemIds || [],
      wrote: !!report.wrote
    })
  )
}

module.exports = {
  act,
  ensureAssistPrompt
}
