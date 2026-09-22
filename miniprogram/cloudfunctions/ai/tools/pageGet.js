const {
  getPage,
  renderIndex,
  renderPageContract,
  buildNavUrl,
  listEnabled,
  MAX_GETS_PER_ACT
} = require('../pages')

const id = 'page.get'

function wantOpen(call) {
  if (!call) return false
  if (call.open === true || call.open === 1 || call.open === 'true') return true
  if (String(call.action || '').trim().toLowerCase() === 'open') return true
  return false
}

async function run(ctx, call, step) {
  ctx._pageGetCount = (ctx._pageGetCount || 0) + 1
  if (ctx._pageGetCount > MAX_GETS_PER_ACT) {
    return {
      ok: false,
      summary: `第 ${step} 步：本轮页面读取已达上限，请下轮再试`
    }
  }

  const pageId = String((call && (call.pageId || call.id || call.name)) || '').trim()
  const open = wantOpen(call)
  const query = Object.assign({}, (call && call.query) || {})
  if (call && call.ref != null && call.ref !== '' && query.ref == null) {
    query.ref = call.ref
  }
  if (call && call.itemId != null && call.itemId !== '' && query.id == null) {
    query.id = call.itemId
  }

  if (open) {
    if (!pageId) {
      return { ok: false, summary: `第 ${step} 步：打开页面前请指定 pageId` }
    }
    const built = buildNavUrl(pageId, query, ctx.refs || {})
    if (!built.ok) {
      return {
        ok: false,
        summary: `第 ${step} 步：无法打开「${pageId}」——${built.error}`
      }
    }
    const label = String((call && call.label) || '').trim() || built.label
    return {
      ok: true,
      summary: label,
      ui: 'navLinks',
      navLinks: [
        {
          label,
          url: built.url,
          pageId: built.pageId
        }
      ]
    }
  }

  if (!pageId) {
    const index = renderIndex()
    const pages = listEnabled().map((p) => ({
      pageId: p.pageId,
      hint: p.hint || '',
      path: p.path
    }))
    return {
      ok: true,
      summary: '已取回可直达页面目录',
      pages,
      pageDoc: {
        kind: 'index',
        body: index
      }
    }
  }

  const page = getPage(pageId)
  if (!page) {
    return {
      ok: false,
      summary: `第 ${step} 步：没有「${pageId}」这个页面，请只用目录里的 pageId`
    }
  }

  const body = renderPageContract(page)
  return {
    ok: true,
    summary: `已取回页面说明：${page.pageId}`,
    page: {
      pageId: page.pageId,
      path: page.path,
      hint: page.hint || '',
      required: page.required || [],
      optional: page.optional || [],
      allowRefAsId: !!page.allowRefAsId
    },
    pageDoc: {
      kind: 'page',
      pageId: page.pageId,
      body
    }
  }
}

module.exports = { id, run }
