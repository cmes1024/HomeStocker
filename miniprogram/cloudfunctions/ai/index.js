const cloud = require('wx-server-sdk')
const axios = require('axios')
const { act } = require('./act')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()

const DEEPSEEK_PROVIDER = 'deepseek'
const DEEPSEEK_BASE_URL = 'https://api.deepseek.com/v1'
const DEEPSEEK_MODEL = 'deepseek-chat'
const MAX_KEYS = 3
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
  const names = ['familyAiKeys', 'aiPrompts', 'familyTrees', 'aiCapabilities']
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
    console.info('deepseek try', { hint: maskKey(apiKey), status, ms })
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
    console.info('deepseek try', { hint: maskKey(apiKey), status, ms, retryable: isRetryable(err) })
    err.retryable = isRetryable(err)
    throw err
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
    if (action !== 'act') {
      await ensureCollections()
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
