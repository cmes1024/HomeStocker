const CAPABILITY_ID = 'assist-act-v2'
const CAPABILITY_VERSION = 5

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
      hint: '把还没记过的东西写成一条新物资。不要用来改已有条目，也不要用来把几条合成一条。'
    },
    {
      id: 'item.update',
      fn: 'item',
      action: 'update',
      enabled: true,
      confirm: false,
      args: 'ref, name?, quantity?, unit?, spaceName?, locationName?, tagNames?, expireDate?, productionDate?, note?',
      hint: '改已有物资的名称、数量、位置或日期。ref 只能用本轮 FOCUS/PROBE 短号。'
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
      id: 'space.createLocation',
      fn: 'space',
      action: 'createLocation',
      enabled: true,
      confirm: false,
      args: 'spaceName, locationName',
      hint: '在已有空间下新建位置。不要新建空间。'
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
      id: 'space.create',
      fn: 'space',
      action: 'create',
      enabled: false,
      confirm: false,
      args: 'name',
      hint: '新建空间。本版关闭。'
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
