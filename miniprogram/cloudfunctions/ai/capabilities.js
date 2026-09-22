const CAPABILITY_ID = 'assist-act-v3'
const CAPABILITY_VERSION = 20

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
      hint: '新开一条台账。仅当家里还没有这件、要新记时用；不要用来给已有库存「加数量」。'
    },
    {
      id: 'item.createMany',
      fn: 'item',
      action: 'createMany',
      enabled: true,
      confirm: false,
      args: 'items[{ name, quantity?, unit?, spaceName, locationName?, tagNames?, expireDate?, productionDate?, note? }]',
      hint: '一次新开多条台账（2～20）。同一次要新记两件及以上时优先用。不要用来给已有行「各加 N」。'
    },
    {
      id: 'item.update',
      fn: 'item',
      action: 'update',
      enabled: true,
      confirm: false,
      args: 'ref, name?, quantity?, unit?, spaceName?, locationName?, tagNames?, expireDate?, productionDate?, note?',
      hint: '改已有物资的名称、数量、位置或日期。quantity 为改成后的绝对值（加/减须先有本轮 FOCUS/PROBE 当前量再算）。用本轮 F*/P* 短号；spaceName/locationName 是改到哪，不是用来找物品。'
    },
    {
      id: 'item.remove',
      fn: 'item',
      action: 'remove',
      enabled: true,
      confirm: true,
      args: 'ref',
      hint: '删除一件物资。必须等家人确认后才执行。只删一件时用这个。'
    },
    {
      id: 'item.removeMany',
      fn: 'item',
      action: 'removeMany',
      enabled: true,
      confirm: true,
      args: 'refs[]',
      hint: '一次删除多件已有物资（2～20）。refs 为本轮 FOCUS/PROBE 短号，至少两条。同一次要删两件及以上时优先用这个，不要拆成多次 item.remove。须确认后执行。'
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
      id: 'space.remove',
      fn: 'space',
      action: 'remove',
      enabled: true,
      confirm: true,
      args: 'spaceName',
      hint: '删除一个空间。默认仓库不能删。空间里的物资会迁到默认仓库并去掉具体位置。须确认后执行。只删一个时用。'
    },
    {
      id: 'space.removeMany',
      fn: 'space',
      action: 'removeMany',
      enabled: true,
      confirm: true,
      args: 'spaces[{ name }] 或 names[]',
      hint: '一次删除多个空间（2～20）。默认仓库不能删；至少保留一个空间。物资迁到保留的默认仓。≥2 优先用这个。须确认。'
    },
    {
      id: 'space.removeLocation',
      fn: 'space',
      action: 'removeLocation',
      enabled: true,
      confirm: true,
      args: 'spaceName, locationName',
      hint: '删除某个空间下的一个位置。物资保留在该空间，只清空具体位置。须确认。'
    },
    {
      id: 'space.removeLocationMany',
      fn: 'space',
      action: 'removeLocationMany',
      enabled: true,
      confirm: true,
      args: 'locations[{ spaceName, locationName }]',
      hint: '一次删除多个位置（2～20）。物资保留所属空间，只清空具体位置。≥2 优先。须确认。'
    },
    {
      id: 'tag.create',
      fn: 'tag',
      action: 'create',
      enabled: true,
      confirm: false,
      args: 'name',
      hint: '新建一个家庭级标签名。只要建一个时用。'
    },
    {
      id: 'tag.createMany',
      fn: 'tag',
      action: 'createMany',
      enabled: true,
      confirm: false,
      args: 'tags[{ name }] 或 names[]',
      hint: '一次新建多个家庭级标签（2～20）。≥2 优先。不要用来给物资挂签。'
    },
    {
      id: 'tag.remove',
      fn: 'tag',
      action: 'remove',
      enabled: true,
      confirm: true,
      args: 'name',
      hint: '删除一个家庭级标签；物资上的该标签会一起去掉。须确认。只删一个时用。'
    },
    {
      id: 'tag.removeMany',
      fn: 'tag',
      action: 'removeMany',
      enabled: true,
      confirm: true,
      args: 'names[] 或 tags[{ name }]',
      hint: '一次删除多个家庭级标签（2～20）；物资上的这些标签会一起去掉。≥2 优先。须确认。'
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
      id: 'page.get',
      fn: 'ai',
      action: 'pageGet',
      enabled: true,
      confirm: false,
      args: 'pageId?, query?, open?, label?, ref?',
      hint: '按需拉可直达产品页并出跳转按钮。无 pageId=目录；有 pageId=契约；要按钮须 open:true（如 family.tags 标签管理、ai.keys 密钥、family.messages 消息、spaces.list 空间）。家人说打开某某页/怎么改标签或密钥时优先用，不要只口头指路，也不要因此说还没学会。物资详情可用 query.ref=本轮 F*/P*。禁止臆造 path。'
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
