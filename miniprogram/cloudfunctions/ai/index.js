const cloud = require('wx-server-sdk')
const axios = require('axios')
const crypto = require('crypto')
const { EXTRACT_PROMPT_ID, EXTRACT_PROMPT_V1 } = require('./prompt')
const { ensureCapabilities } = require('./capabilities')
const { act } = require('./act')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()

const DEEPSEEK_PROVIDER = 'deepseek'
const DEEPSEEK_BASE_URL = 'https://api.deepseek.com/v1'
const DEEPSEEK_MODEL = 'deepseek-chat'
const MAX_KEYS = 3
const MAX_ROWS = 9
const HTTP_TIMEOUT_MS = 45000
const ACT_HTTP_TIMEOUT_MS = 20000
const ACT_MAX_TOKENS = 800
const WEEKDAYS = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六']

function ok(data) {
  return { ok: true, data }
}

function fail(code, message) {
  return { ok: false, code, message }
}

function membershipId(openid, familyId) {
  return `${openid}_${familyId}`
}

function maskKey(apiKey) {
  const s = String(apiKey || '')
  const last = s.slice(-4)
  if (!last) return '…'
  if (s.startsWith('sk-')) return `sk-…${last}`
  return `…${last}`
}

function publicKey(doc) {
  return {
    _id: doc._id,
    provider: doc.provider,
    label: doc.label,
    model: doc.model,
    isDefault: !!doc.isDefault,
    keyHint: maskKey(doc.apiKey),
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt
  }
}

/** 鉴权只信 OPENID → currentFamilyId → membership；忽略客户端伪造的 familyId。 */
async function resolveFamilyContext(openid) {
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

let collectionsReady = false
async function ensureCollections() {
  if (collectionsReady) return
  const names = ['familyAiKeys', 'aiPrompts', 'itemMedia', 'familyTrees', 'aiCapabilities']
  await Promise.all(
    names.map(async (name) => {
      try {
        await db.createCollection(name)
      } catch (e) {
        // 已存在
      }
    })
  )
  collectionsReady = true
}

const EXTRACT_PROMPT_VERSION = 3

async function ensureExtractPrompt() {
  const ref = db.collection('aiPrompts').doc(EXTRACT_PROMPT_ID)
  const snap = await ref.get().catch(() => null)
  if (snap && snap.data && snap.data.system && Number(snap.data.version) >= EXTRACT_PROMPT_VERSION) {
    return { _id: EXTRACT_PROMPT_ID, ...snap.data }
  }
  const doc = {
    version: EXTRACT_PROMPT_VERSION,
    system: EXTRACT_PROMPT_V1,
    updatedAt: Date.now()
  }
  await ref.set({ data: doc })
  return { _id: EXTRACT_PROMPT_ID, ...doc }
}

async function listKeyDocs(familyId) {
  const res = await db
    .collection('familyAiKeys')
    .where({ familyId })
    .limit(MAX_KEYS)
    .get()
  const list = res.data || []
  list.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0))
  return list
}

async function listKeys(openid) {
  const ctx = await resolveFamilyContext(openid)
  if (ctx.error) return ctx.error
  const list = await listKeyDocs(ctx.familyId)
  return ok({ list: list.map(publicKey) })
}

async function addKey(openid, event) {
  const ctx = await resolveFamilyContext(openid)
  if (ctx.error) return ctx.error

  const apiKey = String((event && event.apiKey) || '').trim()
  if (apiKey.length < 8) return fail('INVALID_KEY', '密钥无效')
  if (apiKey.length > 256) return fail('INVALID_KEY', '密钥过长')

  const labelRaw = event && event.label != null ? String(event.label).trim() : ''
  const label = (labelRaw || 'DeepSeek').slice(0, 20)

  const existing = await listKeyDocs(ctx.familyId)
  if (existing.length >= MAX_KEYS) {
    return fail('KEY_LIMIT', '每家最多 3 把密钥')
  }

  const now = Date.now()
  const isDefault = existing.length === 0
  const doc = {
    familyId: ctx.familyId,
    provider: DEEPSEEK_PROVIDER,
    label,
    baseUrl: DEEPSEEK_BASE_URL,
    model: DEEPSEEK_MODEL,
    apiKey,
    isDefault,
    createdBy: openid,
    createdAt: now,
    updatedAt: now
  }
  const addRes = await db.collection('familyAiKeys').add({ data: doc })
  return ok(publicKey({ _id: addRes._id, ...doc }))
}

async function removeKey(openid, event) {
  const ctx = await resolveFamilyContext(openid)
  if (ctx.error) return ctx.error

  const keyId = String((event && event.keyId) || '').trim()
  if (!keyId) return fail('INVALID_ID', '缺少密钥')

  const snap = await db.collection('familyAiKeys').doc(keyId).get().catch(() => null)
  if (!snap || !snap.data || snap.data.familyId !== ctx.familyId) {
    return fail('NOT_FOUND', '密钥不存在')
  }

  const wasDefault = !!snap.data.isDefault
  await db.collection('familyAiKeys').doc(keyId).remove()

  if (wasDefault) {
    const remain = await listKeyDocs(ctx.familyId)
    if (remain.length) {
      await db.collection('familyAiKeys').doc(remain[0]._id).update({
        data: { isDefault: true, updatedAt: Date.now() }
      })
    }
  }
  return ok({ removed: true })
}

async function setDefaultKey(openid, event) {
  const ctx = await resolveFamilyContext(openid)
  if (ctx.error) return ctx.error

  const keyId = String((event && event.keyId) || '').trim()
  if (!keyId) return fail('INVALID_ID', '缺少密钥')

  const snap = await db.collection('familyAiKeys').doc(keyId).get().catch(() => null)
  if (!snap || !snap.data || snap.data.familyId !== ctx.familyId) {
    return fail('NOT_FOUND', '密钥不存在')
  }

  const list = await listKeyDocs(ctx.familyId)
  const now = Date.now()
  await Promise.all(
    list.map((doc) =>
      db.collection('familyAiKeys').doc(doc._id).update({
        data: {
          isDefault: doc._id === keyId,
          updatedAt: now
        }
      })
    )
  )
  return ok({ keyId, isDefault: true })
}

function shanghaiToday() {
  const now = new Date()
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(now)
  const y = parts.find((p) => p.type === 'year').value
  const m = parts.find((p) => p.type === 'month').value
  const d = parts.find((p) => p.type === 'day').value
  const ymd = `${y}-${m}-${d}`
  const utc = Date.UTC(Number(y), Number(m) - 1, Number(d))
  const weekday = WEEKDAYS[new Date(utc).getUTCDay()]
  return { ymd, weekday }
}

function formatCatalog(spaces, locations) {
  const bySpace = {}
  ;(locations || []).forEach((loc) => {
    if (!loc || !loc.spaceId) return
    if (!bySpace[loc.spaceId]) bySpace[loc.spaceId] = []
    bySpace[loc.spaceId].push(loc.name || '')
  })
  const lines = []
  ;(spaces || []).forEach((space) => {
    const title = space.isDefault ? `${space.name}（默认）` : space.name
    lines.push(`- ${title}`)
    const names = bySpace[space._id] || []
    if (!names.length) {
      lines.push('  - （无位置）')
    } else {
      names.forEach((n) => lines.push(`  - ${n}`))
    }
  })
  return lines.join('\n') || '- （无空间）'
}

async function loadCatalog(familyId) {
  const [spacesRes, locsRes, tagsRes, famSnap] = await Promise.all([
    db.collection('spaces').where({ familyId }).limit(100).get(),
    db.collection('locations').where({ familyId }).limit(200).get(),
    db.collection('tags').where({ familyId }).limit(100).get(),
    db.collection('families').doc(familyId).get().catch(() => null)
  ])
  const spaces = spacesRes.data || []
  spaces.sort((a, b) => {
    if (a.isDefault && !b.isDefault) return -1
    if (!a.isDefault && b.isDefault) return 1
    return (a.createdAt || 0) - (b.createdAt || 0)
  })
  const locations = locsRes.data || []
  const tags = tagsRes.data || []
  const familyName = (famSnap && famSnap.data && famSnap.data.name) || '家庭'
  return { spaces, locations, tags, familyName }
}

function fillPrompt(system, catalog, today) {
  const tagsLine =
    (catalog.tags || [])
      .map((t) => t.name)
      .filter(Boolean)
      .join('、') || '（无）'
  return String(system || '')
    .replace(/\{\{TODAY\}\}/g, today.ymd)
    .replace(/\{\{WEEKDAY\}\}/g, today.weekday)
    .replace(/\{\{FAMILY_NAME\}\}/g, catalog.familyName)
    .replace(/\{\{SPACES_AND_LOCATIONS\}\}/g, formatCatalog(catalog.spaces, catalog.locations))
    .replace(/\{\{TAGS\}\}/g, tagsLine)
}

function parseModelJson(text) {
  const raw = String(text || '').trim()
  const stripped = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')
  const parsed = JSON.parse(stripped)
  const items = Array.isArray(parsed) ? parsed : parsed && parsed.items
  if (!Array.isArray(items)) {
    throw new Error('invalid json shape')
  }
  return items
}

function isYmd(value) {
  const s = String(value || '').trim()
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null
}

function matchSpace(spaces, name) {
  const n = String(name || '').trim()
  if (!n) return null
  const exact = spaces.find((s) => s && s.name === n)
  if (exact) return exact
  return spaces.find((s) => s && s.name && (s.name.indexOf(n) >= 0 || n.indexOf(s.name) >= 0)) || null
}

function defaultSpace(spaces) {
  return (
    (spaces || []).find((s) => s && s.isDefault) ||
    (spaces || []).find((s) => s && s.name === '仓库') ||
    (spaces || [])[0] ||
    null
  )
}

function matchLocation(locations, spaceId, name) {
  const n = String(name || '').trim()
  if (!n || !spaceId) return null
  const inSpace = (locations || []).filter((l) => l && l.spaceId === spaceId)
  const exact = inSpace.find((l) => l.name === n)
  if (exact) return exact
  return inSpace.find((l) => l.name && (l.name.indexOf(n) >= 0 || n.indexOf(l.name) >= 0)) || null
}

function mapDraft(raw, rowIndex, catalog) {
  const name = String((raw && raw.name) || '').trim()
  const qtyNum = Number(raw && raw.quantity)
  const quantity = Number.isFinite(qtyNum) && qtyNum >= 0 ? qtyNum : 1
  const unit = String((raw && raw.unit) || '').trim().slice(0, 10)
  const spaceName = String((raw && raw.spaceName) || '').trim()
  const locationName = String((raw && raw.locationName) || '').trim()
  const note = String((raw && raw.note) || '')
  const tagNamesIn = Array.isArray(raw && raw.tagNames) ? raw.tagNames : []

  const spaces = catalog.spaces || []
  let space = matchSpace(spaces, spaceName)
  let spaceFallback = false
  if (!space) {
    space = defaultSpace(spaces)
    spaceFallback = true
  }

  const loc = matchLocation(catalog.locations, space && space._id, locationName)
  const willCreateLocation = !!(locationName && !loc)

  const tagIds = []
  const tagNames = []
  const tags = catalog.tags || []
  tagNamesIn.forEach((tn) => {
    const want = String(tn || '').trim()
    if (!want) return
    const hit = tags.find((t) => t && t.name === want)
    if (hit && tagIds.indexOf(hit._id) < 0) {
      tagIds.push(hit._id)
      tagNames.push(hit.name)
    }
  })

  return {
    index: rowIndex,
    name,
    quantity,
    unit,
    spaceName: (space && space.name) || spaceName || '',
    spaceId: (space && space._id) || '',
    spaceFallback,
    locationName: locationName || '',
    locationId: (loc && loc._id) || '',
    willCreateLocation,
    tagIds,
    tagNames,
    expireDate: isYmd(raw && raw.expireDate),
    productionDate: isYmd(raw && raw.productionDate),
    note,
    error: null
  }
}

const MAX_SPLITS_PER_ROW = 6

function emptyDraft(rowIndex, error) {
  return {
    index: rowIndex,
    name: '',
    quantity: 1,
    unit: '',
    spaceName: '',
    spaceId: '',
    spaceFallback: false,
    locationName: '',
    locationId: '',
    willCreateLocation: false,
    tagIds: [],
    tagNames: [],
    expireDate: null,
    productionDate: null,
    note: '',
    error: error || null
  }
}

function buildDrafts(modelItems, rows, catalog) {
  const drafts = []
  rows.forEach((row) => {
    const matched = (modelItems || []).filter(
      (it) => Number(it && it.index) === Number(row.index)
    )
    if (!matched.length) {
      drafts.push(emptyDraft(row.index, '这一行没有识别结果'))
      return
    }
    matched.slice(0, MAX_SPLITS_PER_ROW).forEach((raw) => {
      drafts.push(mapDraft(raw, row.index, catalog))
    })
  })
  return drafts
}

function isRetryable(err) {
  if (!err) return false
  if (err.code === 'ECONNABORTED') return true
  const msg = String(err.message || '')
  if (/timeout/i.test(msg)) return true
  const status = err.response && err.response.status
  if (!status) return true
  if (status === 401 || status === 402 || status === 429) return true
  if (status >= 500) return true
  return false
}

function orderKeys(list) {
  const def = list.filter((k) => k.isDefault)
  const rest = list.filter((k) => !k.isDefault)
  return def.concat(rest)
}

async function callDeepSeek(apiKey, system, userText, options = {}) {
  const started = Date.now()
  const timeout = Number(options.timeout) > 0 ? Number(options.timeout) : HTTP_TIMEOUT_MS
  const body = {
    model: DEEPSEEK_MODEL,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: userText }
    ],
    response_format: { type: 'json_object' },
    stream: false,
    temperature: 0
  }
  if (Number(options.maxTokens) > 0) body.max_tokens = Number(options.maxTokens)
  try {
    const res = await axios.post(
      `${DEEPSEEK_BASE_URL}/chat/completions`,
      body,
      {
        timeout,
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        }
      }
    )
    const ms = Date.now() - started
    const status = (res && res.status) || 200
    console.info('extract try', { hint: maskKey(apiKey), status, ms })
    const content =
      res &&
      res.data &&
      res.data.choices &&
      res.data.choices[0] &&
      res.data.choices[0].message &&
      res.data.choices[0].message.content
    return { content, status, ms }
  } catch (err) {
    const ms = Date.now() - started
    const status = (err.response && err.response.status) || 0
    console.info('extract try', { hint: maskKey(apiKey), status, ms, retryable: isRetryable(err) })
    err.retryable = isRetryable(err)
    throw err
  }
}

async function extract(openid, event) {
  const ctx = await resolveFamilyContext(openid)
  if (ctx.error) return ctx.error

  const incoming = (event && event.rows) || []
  if (!Array.isArray(incoming)) {
    return fail('INVALID_ROWS', '缺少识别行')
  }
  const rows = []
  const seen = {}
  for (let i = 0; i < incoming.length; i++) {
    const row = incoming[i] || {}
    const index = Number(row.index)
    const text = String(row.text || '').trim()
    if (!text || !Number.isFinite(index)) continue
    if (seen[index]) continue
    seen[index] = true
    rows.push({ index, text })
  }
  if (!rows.length) {
    return fail('INVALID_ROWS', '需要语音或文字才能识别')
  }
  if (rows.length > MAX_ROWS) {
    return fail('INVALID_ROWS', '一次最多识别 9 行')
  }

  const keys = orderKeys(await listKeyDocs(ctx.familyId))
  if (!keys.length) {
    return fail('NO_AI_KEY', '请先配置家庭 AI 密钥')
  }

  const promptDoc = await ensureExtractPrompt()
  const catalog = await loadCatalog(ctx.familyId)
  const today = shanghaiToday()
  const system = fillPrompt(promptDoc.system || EXTRACT_PROMPT_V1, catalog, today)
  const userText = rows.map((r) => `[${r.index}] ${r.text}`).join('\n')

  const providerTried = []
  let lastMessage = '识别失败，请稍后重试'

  for (let i = 0; i < keys.length; i++) {
    const key = keys[i]
    if (key.provider && providerTried.indexOf(key.provider) < 0) {
      providerTried.push(key.provider)
    } else if (!key.provider && providerTried.indexOf(DEEPSEEK_PROVIDER) < 0) {
      providerTried.push(DEEPSEEK_PROVIDER)
    }
    try {
      const result = await callDeepSeek(key.apiKey, system, userText)
      const modelItems = parseModelJson(result.content)
      const drafts = buildDrafts(modelItems, rows, catalog)
      return ok({ drafts, providerTried })
    } catch (err) {
      lastMessage = '识别失败，请稍后重试'
      const retryable = err.retryable === true || typeof err.retryable === 'undefined'
      if (!retryable) {
        return fail('EXTRACT_FAILED', lastMessage)
      }
    }
  }

  return fail('EXTRACT_FAILED', lastMessage)
}

async function attachMedia(openid, event) {
  const ctx = await resolveFamilyContext(openid)
  if (ctx.error) return ctx.error

  const itemId = String((event && event.itemId) || '').trim()
  const fileID = String((event && event.fileID) || '').trim()
  if (!itemId || !fileID) return fail('INVALID_ID', '缺少物品或文件')

  const itemSnap = await db.collection('items').doc(itemId).get().catch(() => null)
  if (!itemSnap || !itemSnap.data) {
    return fail('NOT_FOUND', '物品不存在')
  }
  if (itemSnap.data.familyId !== ctx.familyId) {
    return fail('FORBIDDEN', '物品不属于当前家庭')
  }

  const existing = await db
    .collection('itemMedia')
    .where({ familyId: ctx.familyId, itemId })
    .limit(1)
    .get()
  const now = Date.now()
  const prev = (existing.data && existing.data[0]) || null

  // V1：一件物资一封面。再次 attach 覆盖 fileID，并尽力删掉旧文件。
  if (prev) {
    const oldFile = prev.fileID
    await db.collection('itemMedia').doc(prev._id).update({
      data: { fileID, createdAt: now }
    })
    if (oldFile && oldFile !== fileID) {
      try {
        await cloud.deleteFile({ fileList: [oldFile] })
      } catch (e) {
        console.warn('attachMedia old file delete failed')
      }
    }
    return ok({ _id: prev._id, familyId: ctx.familyId, itemId, fileID, createdAt: now })
  }

  const doc = {
    familyId: ctx.familyId,
    itemId,
    fileID,
    createdAt: now
  }
  const addRes = await db.collection('itemMedia').add({ data: doc })
  return ok({ _id: addRes._id, ...doc })
}

function sha256Hex(s) {
  return crypto.createHash('sha256').update(s, 'utf8').digest('hex')
}

function hmac(key, s) {
  return crypto.createHmac('sha256', key).update(s, 'utf8').digest()
}

function parseAsrPayload(raw) {
  let data = raw
  for (let i = 0; i < 4; i++) {
    if (typeof data === 'string') {
      const s = data.trim()
      if (!s) return { text: '', error: '' }
      try {
        data = JSON.parse(s)
      } catch (e) {
        return { text: s, error: '' }
      }
      continue
    }
    if (data && typeof data === 'object' && data.data !== undefined && data.Response === undefined) {
      data = data.data
      continue
    }
    break
  }
  if (!data || typeof data !== 'object') return { text: '', error: '' }
  const nested = data.Response || data
  if (nested.Error && (nested.Error.Message || nested.Error.Code)) {
    return { text: '', error: String(nested.Error.Message || nested.Error.Code) }
  }
  const keys = ['Result', 'result', 'Text', 'text', 'voice_text_str']
  for (let i = 0; i < keys.length; i++) {
    const v = nested[keys[i]] || data[keys[i]]
    if (typeof v === 'string' && v.trim()) {
      return { text: v.trim(), error: '' }
    }
  }
  return { text: '', error: '' }
}

/** 接入文档请求示例：SourceType=0 + urlencode 的公网 Url。data 必须是对象，不能 stringify。 */
async function callWeChatServiceMarketAsr(audioUrl, format) {
  const voiceFormat = format === 'mp3' ? 'mp3' : 'wav'
  const encodedUrl = encodeURIComponent(audioUrl)
  if (encodedUrl.length >= 2048) {
    return { text: '', error: '录音地址过长' }
  }
  const payload = {
    Action: 'SentenceRecognitionWX',
    EngSerViceType: '16k_zh',
    SourceType: 0,
    Url: encodedUrl,
    UsrAudioKey: String(Date.now()),
    VoiceFormat: voiceFormat
  }
  try {
    const result = await cloud.openapi.serviceMarket.invokeService({
      service: 'wxa8386175898e12c9',
      api: 'SentenceASR',
      data: payload
    })
    const errCode = result && result.errCode
    const parsed = parseAsrPayload(result)
    console.info('transcribe wechat asr', {
      errCode: errCode || 0,
      hasText: !!parsed.text,
      err: parsed.error || (result && result.errMsg) || '',
      raw: String(JSON.stringify(result) || '').slice(0, 400)
    })
    if (errCode && Number(errCode) !== 0) {
      return { text: '', error: parsed.error || result.errMsg || '语音识别调用失败' }
    }
    return parsed
  } catch (e) {
    const msg = (e && (e.errMsg || e.message)) || ''
    console.info('transcribe wechat asr failed', e && (e.errCode || msg))
    return { text: '', error: msg || '语音识别调用失败' }
  }
}

/** 可选回退：仅当云函数配置了 ASR / 腾讯云密钥时调用。微信云开发通常没有这些变量。 */
async function callTencentAsr(audioBase64, format) {
  const secretId = process.env.ASR_SECRET_ID || process.env.TENCENTCLOUD_SECRETID
  const secretKey = process.env.ASR_SECRET_KEY || process.env.TENCENTCLOUD_SECRETKEY
  const token = process.env.TENCENTCLOUD_SESSIONTOKEN || ''
  if (!secretId || !secretKey) {
    return { heard: false, text: '', skipped: true }
  }

  const host = 'asr.tencentcloudapi.com'
  const service = 'asr'
  const action = 'SentenceRecognition'
  const version = '2019-06-14'
  const region = 'ap-guangzhou'
  const payloadObj = {
    EngSerViceType: '16k_zh',
    SourceType: 1,
    VoiceFormat: format === 'wav' ? 'wav' : 'mp3',
    Data: audioBase64,
    DataLen: Buffer.from(audioBase64, 'base64').length,
    UsrAudioKey: `hs_${Date.now()}`
  }
  const payload = JSON.stringify(payloadObj)

  const timestamp = Math.floor(Date.now() / 1000)
  const date = new Date(timestamp * 1000).toISOString().slice(0, 10)
  const canonicalHeaders = `content-type:application/json; charset=utf-8\nhost:${host}\nx-tc-action:${action.toLowerCase()}\n`
  const signedHeaders = 'content-type;host;x-tc-action'
  const canonicalRequest = [
    'POST',
    '/',
    '',
    canonicalHeaders,
    signedHeaders,
    sha256Hex(payload)
  ].join('\n')
  const credentialScope = `${date}/${service}/tc3_request`
  const stringToSign = [
    'TC3-HMAC-SHA256',
    String(timestamp),
    credentialScope,
    sha256Hex(canonicalRequest)
  ].join('\n')
  const secretDate = hmac(`TC3${secretKey}`, date)
  const secretService = hmac(secretDate, service)
  const secretSigning = hmac(secretService, 'tc3_request')
  const signature = crypto
    .createHmac('sha256', secretSigning)
    .update(stringToSign, 'utf8')
    .digest('hex')
  const authorization = `TC3-HMAC-SHA256 Credential=${secretId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`

  const headers = {
    Authorization: authorization,
    'Content-Type': 'application/json; charset=utf-8',
    Host: host,
    'X-TC-Action': action,
    'X-TC-Timestamp': String(timestamp),
    'X-TC-Version': version,
    'X-TC-Region': region
  }
  if (token) headers['X-TC-Token'] = token

  const started = Date.now()
  const res = await axios.post(`https://${host}`, payload, {
    timeout: 20000,
    headers
  })
  const ms = Date.now() - started
  const result = res && res.data && res.data.Response
  const errMsg = result && result.Error && result.Error.Message
  console.info('transcribe cam asr', {
    status: (res && res.status) || 0,
    ms,
    hasText: !!(result && result.Result),
    err: errMsg || ''
  })
  if (errMsg) {
    return { heard: false, text: '' }
  }
  return { heard: true, text: String((result && result.Result) || '').trim() }
}

async function transcribe(openid, event) {
  const ctx = await resolveFamilyContext(openid)
  if (ctx.error) return ctx.error

  const audioUrl = String((event && event.audioUrl) || '').trim()
  const format = String((event && event.format) || 'wav').toLowerCase()
  if (!audioUrl || audioUrl.indexOf('https://') !== 0) {
    return fail('INVALID_AUDIO', '录音地址无效')
  }

  try {
    const wechat = await callWeChatServiceMarketAsr(audioUrl, format)
    if (wechat.text) return ok({ text: wechat.text })
    if (wechat.error) return fail('ASR', wechat.error)
    return fail('NO_STT', '没听清，请再说一次或改用打字')
  } catch (e) {
    console.info('transcribe failed', e && e.message)
    return fail('NO_STT', '语音转文字暂时不可用，请手打文字')
  }
}

function callerOpenid() {
  const ctx = cloud.getWXContext()
  return ctx.OPENID || ctx.FROM_OPENID || ''
}

exports.main = async (event) => {
  const OPENID = callerOpenid()
  if (!OPENID) {
    return fail('UNAUTHORIZED', '未登录')
  }

  const action = event && event.action
  try {
    if (action !== 'transcribe' && action !== 'act') {
      await ensureCollections()
    }
    if (action === 'extract' || action === 'listKeys' || action === 'addKey') {
      await ensureExtractPrompt()
    }
    switch (action) {
      case 'listKeys':
        return await listKeys(OPENID)
      case 'addKey':
        return await addKey(OPENID, event)
      case 'removeKey':
        return await removeKey(OPENID, event)
      case 'setDefaultKey':
        return await setDefaultKey(OPENID, event)
      case 'extract':
        return await extract(OPENID, event)
      case 'transcribe':
        return await transcribe(OPENID, event)
      case 'attachMedia':
        return await attachMedia(OPENID, event)
      case 'act':
        return await act(
          {
            db,
            cloud,
            resolveFamilyContext,
            listKeyDocs,
            orderKeys,
            callDeepSeek,
            shanghaiToday,
            actHttpTimeoutMs: ACT_HTTP_TIMEOUT_MS,
            actMaxTokens: ACT_MAX_TOKENS
          },
          OPENID,
          event
        )
      default:
        return fail('UNKNOWN_ACTION', `未知 action: ${action}`)
    }
  } catch (e) {
    console.error('ai error', action, e && e.message)
    return fail('INTERNAL', e.message || String(e))
  }
}
