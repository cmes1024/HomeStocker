const entitlements = require('../entitlements')
const { getPack, loadTopic, MAX_GETS_PER_ACT } = require('../knowledge')

const id = 'knowledge.get'

async function loadCapacityLiveFacts(ctx) {
  const { db, familyId } = ctx
  const now = Date.now()
  let sub = null
  try {
    const snap = await db.collection('familySubscriptions').doc(familyId).get()
    if (snap && snap.data) sub = snap.data
  } catch (e) {
    sub = null
  }
  const effective = entitlements.resolveEffectiveFromSub(sub, now)

  let itemCount = 0
  let memberCount = 0
  try {
    const fam = await db.collection('families').doc(familyId).get()
    if (fam && fam.data) {
      if (fam.data.itemCount != null && Number.isFinite(Number(fam.data.itemCount))) {
        itemCount = Math.max(0, Number(fam.data.itemCount))
      } else {
        try {
          const counted = await db.collection('items').where({ familyId }).count()
          itemCount = Math.max(0, Number(counted && counted.total) || 0)
          await db.collection('families').doc(familyId).update({
            data: { itemCount }
          })
        } catch (e) {
          itemCount = 0
        }
      }
      if (fam.data.memberCount != null && Number.isFinite(Number(fam.data.memberCount))) {
        memberCount = Math.max(0, Number(fam.data.memberCount))
      }
    }
  } catch (e) {
    // ignore
  }

  const facts = []
  if (effective.active && effective.expiresAt) {
    const d = new Date(Number(effective.expiresAt))
    const ymd = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
      d.getDate()
    ).padStart(2, '0')}`
    facts.push(`加强版有效中，约至 ${ymd}；家数/人数/物资不限。`)
  } else {
    facts.push('当前未开通加强版（按免费档）。')
  }

  const itemBit =
    effective.itemLimit == null
      ? `${itemCount} 件 · 不限`
      : `${itemCount} / ${effective.itemLimit} 件`
  const memberBit =
    effective.memberLimit == null
      ? `${memberCount} 人 · 不限`
      : `${memberCount} / ${effective.memberLimit} 人`
  facts.push(`用量：${itemBit}；${memberBit}`)
  return facts
}

async function run(ctx, call, step) {
  ctx._knowledgeGetCount = (ctx._knowledgeGetCount || 0) + 1
  if (ctx._knowledgeGetCount > MAX_GETS_PER_ACT) {
    return {
      ok: false,
      summary: `第 ${step} 步：本轮知识读取已达上限，请下轮再问`
    }
  }

  const topicId = String((call && (call.topicId || call.id || call.name)) || '').trim()
  if (!topicId) {
    return { ok: false, summary: `第 ${step} 步：请指定 topicId（见知识目录）` }
  }
  if (!getPack(topicId)) {
    return {
      ok: false,
      summary: `第 ${step} 步：没有「${topicId}」这条知识，请只使用目录里的 topicId`
    }
  }

  let liveFacts = null
  if (topicId === 'capacity') {
    try {
      liveFacts = await loadCapacityLiveFacts(ctx)
    } catch (e) {
      liveFacts = ['（本家用量暂时读不到，规则说明仍有效。）']
    }
  }

  const doc = loadTopic(topicId, liveFacts)
  if (!doc) {
    return { ok: false, summary: `第 ${step} 步：知识加载失败` }
  }

  return {
    ok: true,
    summary: doc.text,
    knowledge: {
      topicId: doc.topicId,
      title: doc.title,
      version: doc.version
    }
  }
}

module.exports = { id, run }
