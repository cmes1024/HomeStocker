/**
 * 产品页注册表（代码源；给 page.get 渐进拉取）。
 * path 须与 app.json 产品路由一致；禁止 demo/chat。
 */

const MAX_GETS_PER_ACT = 3

const PAGES = [
  {
    pageId: 'items.list',
    path: '/pages/items/index',
    hint: '全家物资清单首页',
    required: [],
    optional: [],
    label: '打开清单'
  },
  {
    pageId: 'items.edit',
    path: '/pages/items/edit',
    hint: '新建或编辑物资表单；有 id 为编辑，无 id 为新建（可预填字段）',
    required: [],
    optional: [
      'id',
      'spaceId',
      'name',
      'quantity',
      'unit',
      'note',
      'spaceName',
      'locationName',
      'expireDate',
      'productionDate'
    ],
    label: '去编辑物资',
    allowRefAsId: true
  },
  {
    pageId: 'items.detail',
    path: '/packageBrowse/items/detail',
    hint: '物资详情；必须带物资 id（或本轮 F*/P* 短号 ref）',
    required: ['id'],
    optional: [],
    label: '查看物资详情',
    allowRefAsId: true
  },
  {
    pageId: 'spaces.list',
    path: '/packageBrowse/spaces/index',
    hint: '家庭空间列表',
    required: [],
    optional: [],
    label: '打开空间'
  },
  {
    pageId: 'spaces.detail',
    path: '/packageBrowse/spaces/detail',
    hint: '单个空间详情与其中物资；必须带空间 id',
    required: ['id'],
    optional: ['name'],
    label: '查看空间'
  },
  {
    pageId: 'family.home',
    path: '/pages/family/index',
    hint: '家庭页（钥匙、工具、切换家）',
    required: [],
    optional: [],
    label: '打开家庭'
  },
  {
    pageId: 'family.tags',
    path: '/pages/family/tags',
    hint: '家庭标签管理（新建/整理标签名）',
    required: [],
    optional: [],
    label: '打开标签管理'
  },
  {
    pageId: 'family.messages',
    path: '/pages/family/messages',
    hint: '家庭消息中心',
    required: [],
    optional: [],
    label: '打开消息'
  },
  {
    pageId: 'ai.keys',
    path: '/packageAi/keys/index',
    hint: '家庭 AI 密钥设置（BYOK）',
    required: [],
    optional: [],
    label: '设置 AI 密钥'
  },
  {
    pageId: 'onboarding',
    path: '/pages/onboarding/index',
    hint: '创建或加入家庭；可带邀请码',
    required: [],
    optional: ['inviteCode'],
    label: '创建或加入家庭'
  }
]

/** 模型从 family.tags 类推出的 id → 注册表正式 id；不开放第二条 path */
const PAGE_ALIASES = {
  'family.keys': 'ai.keys'
}

const BY_ID = {}
PAGES.forEach((p) => {
  if (p && p.pageId) BY_ID[p.pageId] = p
})

function resolvePageId(pageId) {
  const id = String(pageId || '').trim()
  if (!id) return ''
  return PAGE_ALIASES[id] || id
}

function listEnabled() {
  return PAGES.filter((p) => p && p.pageId && p.enabled !== false)
}

function getPage(pageId) {
  const id = resolvePageId(pageId)
  if (!id) return null
  const page = BY_ID[id]
  if (!page || page.enabled === false) return null
  return page
}

/** 短目录：仅 id + hint，给 page.get 无 pageId 时 / 注入用 */
function renderIndex() {
  const rows = listEnabled()
  if (!rows.length) return '无'
  return rows.map((p) => `- ${p.pageId}：${p.hint || ''}`).join('\n')
}

function renderPageContract(page) {
  if (!page) return ''
  const req = (page.required || []).length
    ? `必填 query：${page.required.join(', ')}`
    : '必填 query：无'
  const opt = (page.optional || []).length
    ? `可选 query：${page.optional.join(', ')}`
    : '可选 query：无'
  const refHint = page.allowRefAsId
    ? '物资页可用本轮短号 ref（F*/P*）代替 id。'
    : ''
  return [
    `pageId：${page.pageId}`,
    `path：${page.path}`,
    `用途：${page.hint || ''}`,
    req,
    opt,
    refHint
  ]
    .filter(Boolean)
    .join('\n')
}

function normalizeQuery(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {}
  const out = {}
  Object.keys(raw).forEach((k) => {
    const key = String(k || '').trim()
    if (!key) return
    const v = raw[k]
    if (v == null || v === '') return
    out[key] = String(v).trim()
  })
  return out
}

/**
 * 解析 query：允许 ref→id（物资 detail/edit）。
 * @returns {{ ok: true, query } | { ok: false, error }}
 */
function resolveQuery(page, rawQuery, refs) {
  const query = normalizeQuery(rawQuery)
  if (page.allowRefAsId) {
    const refRaw = String(query.ref || '').trim()
    if (refRaw && !query.id) {
      const { lookupRef } = require('../agent/refs')
      const row = lookupRef({ ref: refRaw }, refs || {})
      if (!row || !row.itemId) {
        return {
          ok: false,
          error: `短号 ${refRaw.toUpperCase()} 本轮无效，请先 probe/search 或带详情关注`
        }
      }
      query.id = String(row.itemId)
    }
    delete query.ref
  } else if (query.ref) {
    delete query.ref
  }

  const allowed = {}
  ;(page.required || []).forEach((k) => {
    allowed[k] = true
  })
  ;(page.optional || []).forEach((k) => {
    allowed[k] = true
  })

  const unknown = Object.keys(query).filter((k) => !allowed[k])
  if (unknown.length) {
    return { ok: false, error: `不支持的参数：${unknown.join(', ')}` }
  }

  for (let i = 0; i < (page.required || []).length; i++) {
    const k = page.required[i]
    if (!query[k]) {
      return { ok: false, error: `缺少必填参数 ${k}` }
    }
  }

  return { ok: true, query }
}

/**
 * 拼白名单 URL（path?k=v）。
 * @returns {{ ok: true, url, label, pageId } | { ok: false, error }}
 */
function buildNavUrl(pageId, rawQuery, refs) {
  const page = getPage(pageId)
  if (!page) {
    return { ok: false, error: `没有「${pageId || ''}」这个页面` }
  }
  const resolved = resolveQuery(page, rawQuery, refs)
  if (!resolved.ok) return resolved

  const q = resolved.query
  const parts = Object.keys(q).map(
    (k) => `${encodeURIComponent(k)}=${encodeURIComponent(q[k])}`
  )
  const url = parts.length ? `${page.path}?${parts.join('&')}` : page.path
  return {
    ok: true,
    url,
    label: page.label || page.hint || page.pageId,
    pageId: page.pageId,
    path: page.path
  }
}

module.exports = {
  PAGES,
  PAGE_ALIASES,
  MAX_GETS_PER_ACT,
  listEnabled,
  getPage,
  resolvePageId,
  renderIndex,
  renderPageContract,
  resolveQuery,
  buildNavUrl
}
