const CAPABILITY_ID = 'assist-act-v2'
const CAPABILITY_VERSION = 10

const HARD_DENY = {
  'family.create': true,
  'family.join': true,
  'family.leave': true,
  'family.switchFamily': true,
  'family.dissolve': true,
  'family.updateBackground': true,
  'family.updateExpireReminder': true,
  'family.recordSubscribeExpire': true,
  'ai.extract': true,
  'ai.transcribe': true,
  'ai.addKey': true,
  'ai.removeKey': true,
  'ai.listKeys': true,
  'ai.setDefaultKey': true,
  'ai.attachMedia': true
}

const CAPABILITY_SEED = {
  version: CAPABILITY_VERSION,
  apis: [
    {
      id: 'item.search',
      fn: 'item',
      action: 'search',
      enabled: true,
      confirm: false,
      args: 'name?, spaceName?, locationName?',
      hint: '按名称和可选地点搜索当前家庭物资，只读。'
    },
    {
      id: 'item.listExpiring',
      fn: 'item',
      action: 'listExpiring',
      enabled: true,
      confirm: false,
      args: '',
      hint: '列出即将过期和已过期的物资，只读。'
    },
    {
      id: 'item.create',
      fn: 'item',
      action: 'create',
      enabled: true,
      confirm: false,
      args: 'name, quantity?, unit?, spaceName, locationName?, tagNames?, expireDate?, productionDate?, note?',
      hint: '把还没记过的东西写成一条新物资。单件用这个。不要用来改已有条目，也不要用来把几条合成一条。'
    },
    {
      id: 'item.createMany',
      fn: 'item',
      action: 'createMany',
      enabled: true,
      confirm: false,
      args: 'items[{ name, quantity?, unit?, spaceName, locationName?, tagNames?, expireDate?, productionDate?, note? }]',
      hint: '一次记下多条新物资（2～20 件）。同一次要记两件及以上时优先用这个，不要拆成多次 item.create。同名也新开，不改旧数量。'
    },
    {
      id: 'item.update',
      fn: 'item',
      action: 'update',
      enabled: true,
      confirm: false,
      args: 'ref, name?, quantity?, unit?, spaceName?, locationName?, tagNames?, expireDate?, productionDate?, note?',
      hint: '改已有物资的名称、数量、位置或日期。用本轮 FOCUS/PROBE 的 ref（单数，如 P1）；spaceName/locationName 是改到哪，不是用来找物品。'
    },
    {
      id: 'item.remove',
      fn: 'item',
      action: 'remove',
      enabled: true,
      confirm: true,
      args: 'ref',
      hint: '删除物资。必须等家人确认后才执行。'
    },
    {
      id: 'space.create',
      fn: 'space',
      action: 'create',
      enabled: true,
      confirm: false,
      args: 'name',
      hint: '新建一个空间（房间/大区域）。只要建一个空间时用。'
    },
    {
      id: 'space.createMany',
      fn: 'space',
      action: 'createMany',
      enabled: true,
      confirm: false,
      args: 'spaces[{ name }]',
      hint: '一次新建多个空间（2～20）。同一次要建两个及以上空间时优先用这个。'
    },
    {
      id: 'space.createLocation',
      fn: 'space',
      action: 'createLocation',
      enabled: true,
      confirm: false,
      args: 'spaceName, locationName',
      hint: '在已有空间下新建一个位置。只要建一个位置时用。'
    },
    {
      id: 'space.createLocationMany',
      fn: 'space',
      action: 'createLocationMany',
      enabled: true,
      confirm: false,
      args: 'locations[{ spaceName, locationName }]',
      hint: '一次在已有空间下新建多个位置（2～20）。同一次要建两个及以上位置时优先用这个。'
    },
    {
      id: 'item.merge',
      fn: 'item',
      action: 'merge',
      enabled: true,
      confirm: true,
      args: 'refs[], name?',
      hint: '把多条已有物资合成一条并加总数量。refs 为本轮 FOCUS/PROBE 短号，至少两条。须确认后执行。同空间；单位须一致。'
    },
    {
      id: 'item.expireSubscribePanel',
      fn: 'ai',
      action: 'expireSubscribePanel',
      enabled: true,
      confirm: false,
      args: '',
      hint: '打开临期消息订阅面板（列出已设过期日的物资开关）。微信要求家人亲手点开关授权，不能代开订阅。当家人要管理临期/过期提醒订阅时用此接口，calls 里只放这一步即可。'
    },
    {
      id: 'knowledge.get',
      fn: 'ai',
      action: 'knowledgeGet',
      enabled: true,
      confirm: false,
      args: 'topicId',
      hint: '按知识目录的 topicId 读取一条产品说明（如 capacity=加强版/免费档上限）。问 VIP/会员/兑换/家数人数物资上限时用。一次只取一个 topic；不要编造目录外内容。'
    },
    {
      id: 'space.update',
      fn: 'space',
      action: 'update',
      enabled: false,
      confirm: false,
      args: 'name',
      hint: '改空间名。本版关闭。'
    },
    {
      id: 'space.remove',
      fn: 'space',
      action: 'remove',
      enabled: false,
      confirm: false,
      args: '',
      hint: '删除空间。本版关闭。'
    },
    {
      id: 'tag.create',
      fn: 'tag',
      action: 'create',
      enabled: false,
      confirm: false,
      args: 'name',
      hint: '新建标签。本版关闭。'
    },
    {
      id: 'tag.update',
      fn: 'tag',
      action: 'update',
      enabled: false,
      confirm: false,
      args: 'name',
      hint: '改标签。本版关闭。'
    },
    {
      id: 'tag.remove',
      fn: 'tag',
      action: 'remove',
      enabled: false,
      confirm: false,
      args: '',
      hint: '删除标签。本版关闭。'
    }
  ]
}

function isHardDenied(id) {
  const use = String(id || '').trim()
  if (!use) return true
  if (HARD_DENY[use]) return true
  if (use.indexOf('family.') === 0) return true
  if (use.indexOf('ai.') === 0) return true
  return false
}

function enabledApis(doc) {
  return ((doc && doc.apis) || []).filter((api) => api && api.enabled && api.id && !isHardDenied(api.id))
}

function renderCapabilities(doc) {
  return enabledApis(doc)
    .map((api) => {
      const confirm = api.confirm ? '（执行前必须用户确认）' : ''
      const args = api.args ? `\n  参数：${api.args}` : ''
      return `- ${api.id}${confirm}：${api.hint || ''}${args}`
    })
    .join('\n')
}

async function ensureCapabilities(db) {
  try {
    await db.createCollection('aiCapabilities')
  } catch (e) {
    // 已存在
  }
  const ref = db.collection('aiCapabilities').doc(CAPABILITY_ID)
  const snap = await ref.get().catch(() => null)
  if (snap && snap.data && Number(snap.data.version) >= CAPABILITY_VERSION) {
    return { _id: CAPABILITY_ID, ...snap.data }
  }
  const doc = {
    version: CAPABILITY_VERSION,
    apis: CAPABILITY_SEED.apis,
    updatedAt: Date.now()
  }
  await ref.set({ data: doc })
  return { _id: CAPABILITY_ID, ...doc }
}

module.exports = {
  CAPABILITY_ID,
  CAPABILITY_VERSION,
  CAPABILITY_SEED,
  HARD_DENY,
  isHardDenied,
  enabledApis,
  renderCapabilities,
  ensureCapabilities
}
