const CAPABILITY_ID = 'assist-act-v3'
const CAPABILITY_VERSION = 27

const HARD_DENY = {
  'family.create': true,
  'family.join': true,
  'family.leave': true,
  'family.switchFamily': true,
  'family.dissolve': true,
  'family.updateBackground': true,
  'family.updateExpireReminder': true,
  'family.recordSubscribeExpire': true,
  'ai.addKey': true,
  'ai.removeKey': true,
  'ai.listKeys': true,
  'ai.setDefaultKey': true
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
      hint: '按名称搜索当前家庭物资，可带 spaceName/locationName。只读。'
    },
    {
      id: 'item.listExpiring',
      fn: 'item',
      action: 'listExpiring',
      enabled: true,
      confirm: false,
      args: '',
      hint: '列出即将过期和已过期的物资。只读。'
    },
    {
      id: 'item.create',
      fn: 'item',
      action: 'create',
      enabled: true,
      confirm: false,
      args: 'name, quantity?, unit?, spaceName, locationName?, tagNames?, expireDate?, productionDate?, note?',
      hint: '新开一条台账，须 spaceName。quantity 为该行数量。本轮须已按名 probe。'
    },
    {
      id: 'item.createMany',
      fn: 'item',
      action: 'createMany',
      enabled: true,
      confirm: false,
      args: 'items[{ name, quantity?, unit?, spaceName, locationName?, tagNames?, expireDate?, productionDate?, note? }]',
      hint: '一次新开 2～20 条台账，每条须 spaceName。本轮须已按名 probe。'
    },
    {
      id: 'item.update',
      fn: 'item',
      action: 'update',
      enabled: true,
      confirm: false,
      args: 'ref, name?, quantity?, unit?, spaceName?, locationName?, tagNames?, expireDate?, productionDate?, note?',
      hint: '改已有物资。quantity 为改成后的绝对值，须大于 0。用本轮 F*/P*。'
    },
    {
      id: 'item.remove',
      fn: 'item',
      action: 'remove',
      enabled: true,
      confirm: true,
      args: 'ref',
      hint: '删除一件物资。执行前须用户确认。'
    },
    {
      id: 'item.removeMany',
      fn: 'item',
      action: 'removeMany',
      enabled: true,
      confirm: true,
      args: 'refs[]',
      hint: '一次删除 2～20 件，refs 为本轮短号。执行前须用户确认。'
    },
    {
      id: 'space.create',
      fn: 'space',
      action: 'create',
      enabled: true,
      confirm: false,
      args: 'name',
      hint: '新建一个空间。本版不能改已有空间名。'
    },
    {
      id: 'space.createMany',
      fn: 'space',
      action: 'createMany',
      enabled: true,
      confirm: false,
      args: 'spaces[{ name }]',
      hint: '一次新建 2～20 个空间。本版不能改名。'
    },
    {
      id: 'space.createLocation',
      fn: 'space',
      action: 'createLocation',
      enabled: true,
      confirm: false,
      args: 'spaceName, locationName',
      hint: '在已有空间下新建一个位置，须 spaceName。'
    },
    {
      id: 'space.createLocationMany',
      fn: 'space',
      action: 'createLocationMany',
      enabled: true,
      confirm: false,
      args: 'locations[{ spaceName, locationName }]',
      hint: '一次在已有空间下新建 2～20 个位置。'
    },
    {
      id: 'space.remove',
      fn: 'space',
      action: 'remove',
      enabled: true,
      confirm: true,
      args: 'spaceName',
      hint: '删除一个空间。执行前须用户确认。默认仓库不能删。'
    },
    {
      id: 'space.removeMany',
      fn: 'space',
      action: 'removeMany',
      enabled: true,
      confirm: true,
      args: 'spaces[{ name }] 或 names[]',
      hint: '一次删除 2～20 个空间。执行前须用户确认。默认仓库不能删。'
    },
    {
      id: 'space.removeLocation',
      fn: 'space',
      action: 'removeLocation',
      enabled: true,
      confirm: true,
      args: 'spaceName, locationName',
      hint: '删除某个空间下的一个位置。执行前须用户确认。物资留在该空间。'
    },
    {
      id: 'space.removeLocationMany',
      fn: 'space',
      action: 'removeLocationMany',
      enabled: true,
      confirm: true,
      args: 'locations[{ spaceName, locationName }]',
      hint: '一次删除 2～20 个位置。执行前须用户确认。物资留在所属空间。'
    },
    {
      id: 'tag.create',
      fn: 'tag',
      action: 'create',
      enabled: true,
      confirm: false,
      args: 'name',
      hint: '新建一个家庭级标签名。给物资挂签用 item.update 的 tagNames。'
    },
    {
      id: 'tag.createMany',
      fn: 'tag',
      action: 'createMany',
      enabled: true,
      confirm: false,
      args: 'tags[{ name }] 或 names[]',
      hint: '一次新建 2～20 个家庭级标签。给物资挂签用 item.update 的 tagNames。'
    },
    {
      id: 'tag.remove',
      fn: 'tag',
      action: 'remove',
      enabled: true,
      confirm: true,
      args: 'name',
      hint: '删除一个家庭级标签。执行前须用户确认。本版不能改标签名。'
    },
    {
      id: 'tag.removeMany',
      fn: 'tag',
      action: 'removeMany',
      enabled: true,
      confirm: true,
      args: 'names[] 或 tags[{ name }]',
      hint: '一次删除 2～20 个家庭级标签。执行前须用户确认。本版不能改名。'
    },
    {
      id: 'item.merge',
      fn: 'item',
      action: 'merge',
      enabled: true,
      confirm: true,
      args: 'refs[], name?',
      hint: '把多条已有物资合成一条并加总数量。refs 至少两条；同空间、单位须一致。执行前须用户确认。'
    },
    {
      id: 'item.expireSubscribePanel',
      fn: 'ai',
      action: 'expireSubscribePanel',
      enabled: true,
      confirm: false,
      args: '',
      hint: '打开临期消息订阅面板。不能代开微信订阅。'
    },
    {
      id: 'knowledge.get',
      fn: 'ai',
      action: 'knowledgeGet',
      enabled: true,
      confirm: false,
      args: 'topicId',
      hint: '按知识目录 topicId 取一篇。一次一个。不要编目录外内容，不要用来写库。'
    },
    {
      id: 'page.get',
      fn: 'ai',
      action: 'pageGet',
      enabled: true,
      confirm: false,
      args: 'pageId?, query?, open?, label?, ref?',
      hint: '按需取页面目录或契约。无 pageId 或未知 pageId 返回目录。跳转须 open:true。禁止臆造 path。'
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
      id: 'tag.update',
      fn: 'tag',
      action: 'update',
      enabled: false,
      confirm: false,
      args: 'name',
      hint: '改标签名。本版关闭。'
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
