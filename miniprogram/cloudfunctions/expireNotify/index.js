const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()
const _ = db.command

/**
 * 商品过期提醒模板（编号 2201）
 * thing1 商品名称 / date3 过期日期 / short_thing8 所属仓库 /
 * thing9 商品位置 / thing10 备注
 *
 * 环境变量 EXPIRE_SUBSCRIBE_TMPL_ID 可覆盖默认 tmplId。
 */
const EXPIRE_TMPL_ID =
  process.env.EXPIRE_SUBSCRIBE_TMPL_ID ||
  '_oheW_DGsoqUxKsFIQrWSYIuoo4stYvsJv-JNf_uAiQ'

function sliceThing(value, max) {
  const s = String(value == null || value === '' ? '—' : value).trim() || '—'
  return s.slice(0, max)
}

function shanghaiTodayYmd(now = Date.now()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(new Date(now))
  const y = parts.find((p) => p.type === 'year').value
  const m = parts.find((p) => p.type === 'month').value
  const d = parts.find((p) => p.type === 'day').value
  return `${y}-${m}-${d}`
}

function addDaysYmd(ymd, days) {
  const [y, m, d] = ymd.split('-').map(Number)
  const utc = Date.UTC(y, m - 1, d) + days * 86400000
  const dt = new Date(utc)
  const yy = dt.getUTCFullYear()
  const mm = String(dt.getUTCMonth() + 1).padStart(2, '0')
  const dd = String(dt.getUTCDate()).padStart(2, '0')
  return `${yy}-${mm}-${dd}`
}

async function loadFamilyIdsWithReminderOn() {
  const res = await db.collection('families').limit(100).get()
  return (res.data || [])
    .filter((f) => f.expireReminderEnabled !== false)
    .map((f) => f._id)
}

async function findCandidateItems(familyId, dates) {
  const res = await db
    .collection('items')
    .where({
      familyId,
      expireReminderEnabled: true,
      expireDate: _.in(dates)
    })
    .limit(100)
    .get()
    .catch(async () => {
      const all = await db
        .collection('items')
        .where({ familyId, expireReminderEnabled: true })
        .limit(100)
        .get()
      const set = {}
      dates.forEach((d) => {
        set[d] = true
      })
      return {
        data: (all.data || []).filter((item) => item.expireDate && set[item.expireDate])
      }
    })
  return res.data || []
}

async function membersWithGrant(familyId) {
  const res = await db
    .collection('memberships')
    .where({ familyId })
    .limit(100)
    .get()
  return (res.data || []).filter((m) => m.subscribeExpireGrantedAt)
}

async function resolvePlaceNames(item) {
  let spaceName = '—'
  let locationName = '—'
  if (item.spaceId) {
    const space = await db
      .collection('spaces')
      .doc(item.spaceId)
      .get()
      .catch(() => null)
    if (space && space.data && space.data.name) {
      spaceName = space.data.name
    }
  }
  if (item.locationId) {
    const loc = await db
      .collection('locations')
      .doc(item.locationId)
      .get()
      .catch(() => null)
    if (loc && loc.data && loc.data.name) {
      locationName = loc.data.name
    }
  }
  return { spaceName, locationName }
}

async function sendOne(openid, item) {
  const { spaceName, locationName } = await resolvePlaceNames(item)
  const data = {
    thing1: { value: sliceThing(item.name || '物品', 20) },
    date3: { value: String(item.expireDate || '') },
    short_thing8: { value: sliceThing(spaceName, 5) },
    thing9: { value: sliceThing(locationName, 20) },
    thing10: { value: sliceThing(item.note || '请留意保质期', 20) }
  }
  try {
    await cloud.openapi.subscribeMessage.send({
      touser: openid,
      templateId: EXPIRE_TMPL_ID,
      page: `packageBrowse/items/detail?id=${item._id}`,
      data,
      miniprogramState: 'formal'
    })
    return { sent: true }
  } catch (e) {
    const errMsg = (e && (e.errMsg || e.message)) || String(e)
    console.warn('[expireNotify] send failed', openid, item._id, errMsg)
    return { sent: false, error: errMsg }
  }
}

exports.main = async () => {
  const today = shanghaiTodayYmd()
  const dates = [today, addDaysYmd(today, 1), addDaysYmd(today, 3)]
  console.log('[expireNotify] start', {
    today,
    dates,
    tmplId: EXPIRE_TMPL_ID
  })

  const familyIds = await loadFamilyIdsWithReminderOn()
  let candidateCount = 0
  let sendAttempts = 0
  let sentCount = 0
  let failCount = 0
  let lastError = ''

  for (let i = 0; i < familyIds.length; i++) {
    const familyId = familyIds[i]
    const items = await findCandidateItems(familyId, dates)
    if (!items.length) continue
    candidateCount += items.length
    const members = await membersWithGrant(familyId)
    if (!members.length) {
      console.log('[expireNotify] no granted members', familyId, items.length)
      continue
    }
    for (let j = 0; j < items.length; j++) {
      const item = items[j]
      for (let k = 0; k < members.length; k++) {
        sendAttempts += 1
        const result = await sendOne(members[k].openid, item)
        if (result.sent) {
          sentCount += 1
        } else {
          failCount += 1
          if (result.error) lastError = result.error
        }
      }
    }
  }

  const summary = {
    today,
    dates,
    familyCount: familyIds.length,
    candidateCount,
    sendAttempts,
    sentCount,
    failCount,
    lastError: lastError || undefined
  }
  console.log('[expireNotify] done', summary)
  return {
    ok: failCount === 0,
    data: summary
  }
}
