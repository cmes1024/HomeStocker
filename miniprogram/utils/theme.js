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
  },
  {
    id: 'matcha',
    label: '抹茶绿',
    primary: '#3FAE6A',
    secondary: '#8ED9A8',
    shadow: '#E3F6E9'
  },
  {
    id: 'milk',
    label: '奶油白',
    primary: '#C89B5A',
    secondary: '#F2D9A8',
    shadow: '#FBF3E4'
  },
  {
    id: 'taro',
    label: '香芋紫',
    primary: '#8A6FD1',
    secondary: '#C3B2F0',
    shadow: '#EFEAFB'
  },
  {
    id: 'sakura',
    label: '樱花粉',
    primary: '#F06A9A',
    secondary: '#FFB3CC',
    shadow: '#FFE8F0'
  },
  {
    id: 'coral',
    label: '珊瑚橘',
    primary: '#FF7A45',
    secondary: '#FFB08A',
    shadow: '#FFEDE3'
  },
  {
    id: 'mint',
    label: '薄荷青',
    primary: '#2BB8A8',
    secondary: '#82DED2',
    shadow: '#E0F7F4'
  },
  {
    id: 'warm-gray',
    label: '暖灰',
    primary: '#7A6F66',
    secondary: '#B8AEA5',
    shadow: '#F0ECE8'
  },
  {
    id: 'indigo',
    label: '靛青',
    primary: '#3D5AFE',
    secondary: '#8C9EFF',
    shadow: '#E4E8FF'
  },
  {
    id: 'amber',
    label: '琥珀黄',
    primary: '#D99A00',
    secondary: '#F3C95C',
    shadow: '#FFF6D9'
  },
  {
    id: 'forest',
    label: '森林绿',
    primary: '#2F7D5B',
    secondary: '#7BBF9A',
    shadow: '#E2F3EA'
  },
  {
    id: 'berry',
    label: '莓果红',
    primary: '#C93A5B',
    secondary: '#F08AA2',
    shadow: '#FCE4EA'
  },
  {
    id: 'clay',
    label: '陶土棕',
    primary: '#B46A4C',
    secondary: '#E0A88F',
    shadow: '#F7E8E1'
  },
  {
    id: 'lavender',
    label: '薰衣草',
    primary: '#6C63FF',
    secondary: '#B4B0FF',
    shadow: '#ECEBFF'
  },
  {
    id: 'olive',
    label: '橄榄绿',
    primary: '#7A8B3A',
    secondary: '#B7C77A',
    shadow: '#F0F4DC'
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
