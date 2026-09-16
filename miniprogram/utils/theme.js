/** 线性渐变：主色 → 副色 → 阴影色 → 透明（底部自然淡出） */
function buildGradientValue(primary, secondary, shadow) {
  const soft = secondary || primary
  const shade = shadow || soft
  return `linear-gradient(167deg, ${primary} 2%, ${soft} 48%, ${shade} 72%, transparent 100%)`
}

const THEME_PRESETS = [
  {
    id: 'orange',
    label: '暖黄橙',
    primary: '#FF5D00',
    secondary: '#FFCD70',
    shadow: '#FFF0DD'
  },
  {
    id: 'red',
    label: '中国红',
    primary: '#FF0000',
    secondary: '#FF7373',
    shadow: '#FFDDDD'
  },
  {
    id: 'blue',
    label: '天空蓝',
    primary: '#0080FF',
    secondary: '#73D0FF',
    shadow: '#DDEDFF'
  }
].map((p) => ({
  ...p,
  preview: buildGradientValue(p.primary, p.secondary, p.shadow)
}))

const DEFAULT_PRESET = THEME_PRESETS[0]

function getPresetById(id) {
  const key = String(id || '').trim()
  if (!key) return null
  return THEME_PRESETS.find((p) => p.id === key) || null
}

function ctaGradient(primary, secondary) {
  const base = primary || DEFAULT_PRESET.primary
  const soft = secondary || DEFAULT_PRESET.secondary
  return `linear-gradient(90deg, ${base} 0%, ${soft} 100%)`
}

function buildThemeFromPreset(preset, background) {
  const p = preset || DEFAULT_PRESET
  return {
    id: p.id,
    label: p.label,
    primary: p.primary,
    secondary: p.secondary,
    shadow: p.shadow,
    // 兼容现有页面内联写法
    themeColor: p.primary,
    themeSoft: p.secondary,
    themeId: p.id,
    gradientId: p.id,
    ctaGradient: ctaGradient(p.primary, p.secondary),
    bgStyle: '',
    bgImage: '',
    lightHeader: false,
    isPhoto: false,
    cssVarStyle: `--theme-primary: ${p.primary}; --theme-secondary: ${p.secondary}; --theme-shadow: ${p.shadow}; --theme-primary-30: ${p.primary}4D;`,
    background: background || { type: 'theme', value: p.id }
  }
}

const DEFAULT_THEME = buildThemeFromPreset(DEFAULT_PRESET)

/**
 * 从家庭 background 解析主题。未知/非法数据回落默认主题，不抛错。
 * @param {{ type?: string, value?: string }|null|undefined} background
 */
function resolveTheme(background) {
  try {
    if (!background || typeof background !== 'object') {
      return { ...DEFAULT_THEME, background: { ...DEFAULT_THEME.background } }
    }
    if (background.type === 'theme') {
      const preset = getPresetById(background.value) || DEFAULT_PRESET
      return buildThemeFromPreset(preset, {
        type: 'theme',
        value: preset.id
      })
    }
    return { ...DEFAULT_THEME, background: { ...DEFAULT_THEME.background } }
  } catch (e) {
    return { ...DEFAULT_THEME, background: { ...DEFAULT_THEME.background } }
  }
}

function applyNavBarColor(theme) {
  try {
    wx.setNavigationBarColor({
      frontColor: theme && theme.lightHeader ? '#ffffff' : '#000000',
      backgroundColor: '#ffffff'
    })
  } catch (e) {
    // ignore
  }
}

function getAppSafe() {
  try {
    return getApp()
  } catch (e) {
    return null
  }
}

/**
 * 写入当前家庭主题到 globalData，供全页共用。
 * @param {object|null} family
 */
function setAppFamily(family) {
  const app = getAppSafe()
  const theme = family ? resolveTheme(family.background) : { ...DEFAULT_THEME }
  if (app) {
    app.globalData.family = family || null
    app.globalData.familyId = family ? family._id : null
    app.globalData.theme = theme
  }
  applyNavBarColor(theme)
  return theme
}

function getAppTheme() {
  const app = getAppSafe()
  if (app && app.globalData && app.globalData.theme) {
    return app.globalData.theme
  }
  return { ...DEFAULT_THEME }
}

/** 当前主题三色（及 id/label），供全局调用 */
function getThemeColors() {
  const theme = getAppTheme()
  return {
    id: theme.id || DEFAULT_PRESET.id,
    label: theme.label || DEFAULT_PRESET.label,
    primary: theme.primary || DEFAULT_PRESET.primary,
    secondary: theme.secondary || DEFAULT_PRESET.secondary,
    shadow: theme.shadow || DEFAULT_PRESET.shadow
  }
}

/**
 * 把全局主题同步到页面 data.theme（供 AppShell 使用）。
 * 主题未变时跳过 theme 字段写入，减少多余 setData。
 */
function bindThemeToPage(page, patch = {}) {
  const theme = getAppTheme()
  const prev = page.data && page.data.theme
  const themeChanged =
    !prev ||
    prev.id !== theme.id ||
    prev.primary !== theme.primary ||
    prev.secondary !== theme.secondary ||
    prev.shadow !== theme.shadow ||
    prev.bgImage !== theme.bgImage ||
    prev.isPhoto !== theme.isPhoto ||
    prev.lightHeader !== theme.lightHeader

  const data = { ...patch }
  if (themeChanged) {
    data.theme = theme
  }

  if (Object.keys(data).length) {
    page.setData(data)
  }
  applyNavBarColor(theme)
  return theme
}

module.exports = {
  THEME_PRESETS,
  DEFAULT_THEME,
  DEFAULT_PRESET,
  buildGradientValue,
  getPresetById,
  resolveTheme,
  setAppFamily,
  getAppTheme,
  getThemeColors,
  bindThemeToPage,
  ctaGradient,
  applyNavBarColor
}
