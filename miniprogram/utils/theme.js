const DEFAULT_GRADIENT =
  'linear-gradient(165deg, #E8F1F2 0%, #C5D9DE 48%, #8FB3BC 100%)'

const GRADIENT_PRESETS = [
  {
    id: 'mist',
    label: '青雾',
    value: 'linear-gradient(165deg, #E8F1F2 0%, #C5D9DE 48%, #8FB3BC 100%)',
    accent: '#3F7A88'
  },
  {
    id: 'dawn',
    label: '暖阳',
    value: 'linear-gradient(165deg, #FFF1E6 0%, #FFD8B8 48%, #E8A882 100%)',
    accent: '#C8784A'
  },
  {
    id: 'sage',
    label: '松绿',
    value: 'linear-gradient(165deg, #EAF2EA 0%, #C8D9C6 48%, #8FA888 100%)',
    accent: '#5F8A5E'
  },
  {
    id: 'sand',
    label: '浅沙',
    value: 'linear-gradient(165deg, #F7F3EC 0%, #E8DFD0 48%, #C9B9A0 100%)',
    accent: '#9A8060'
  }
]

const SOLID_PRESETS = [
  { id: 'cream', value: '#F5F0E8', accent: '#8B7355' },
  { id: 'sky', value: '#E8EEF5', accent: '#4A6FA5' },
  { id: 'blush', value: '#F0E8E8', accent: '#A56666' },
  { id: 'mint', value: '#E8F0EC', accent: '#4F8A6E' },
  { id: 'stone', value: '#F0F0EC', accent: '#6E6E5C' }
]

const DEFAULT_THEME = {
  bgStyle: `background: ${DEFAULT_GRADIENT};`,
  bgImage: '',
  lightHeader: false,
  isPhoto: false,
  themeColor: '#3F7A88',
  ctaGradient: '',
  background: {
    type: 'gradient',
    value: DEFAULT_GRADIENT
  }
}

function clamp(n) {
  return Math.max(0, Math.min(255, Math.round(n)))
}

function hexToRgb(hex) {
  const raw = String(hex || '').replace('#', '')
  if (!/^[0-9A-Fa-f]{6}$/.test(raw)) return null
  return [
    parseInt(raw.slice(0, 2), 16),
    parseInt(raw.slice(2, 4), 16),
    parseInt(raw.slice(4, 6), 16)
  ]
}

function rgbToHex(r, g, b) {
  const h = (c) => clamp(c).toString(16).padStart(2, '0')
  return `#${h(r)}${h(g)}${h(b)}`
}

function hexToHsl(hex) {
  const rgb = hexToRgb(hex)
  if (!rgb) return null
  const r = rgb[0] / 255
  const g = rgb[1] / 255
  const b = rgb[2] / 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const l = (max + min) / 2
  if (max === min) return { h: 0, s: 0, l }
  const d = max - min
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
  let h
  if (max === r) h = (g - b) / d + (g < b ? 6 : 0)
  else if (max === g) h = (b - r) / d + 2
  else h = (r - g) / d + 4
  return { h: h / 6, s, l }
}

function hueToRgb(p, q, t) {
  let x = t
  if (x < 0) x += 1
  if (x > 1) x -= 1
  if (x < 1 / 6) return p + (q - p) * 6 * x
  if (x < 1 / 2) return q
  if (x < 2 / 3) return p + (q - p) * (2 / 3 - x) * 6
  return p
}

function hslToHex(h, s, l) {
  if (s === 0) {
    const v = l * 255
    return rgbToHex(v, v, v)
  }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s
  const p = 2 * l - q
  return rgbToHex(
    hueToRgb(p, q, h + 1 / 3) * 255,
    hueToRgb(p, q, h) * 255,
    hueToRgb(p, q, h - 1 / 3) * 255
  )
}

/**
 * 主按钮渐变：形态参考 90deg、左深右浅；色相跟主题色。
 * 参考 #0b5db3 → #8ec5ff：同色相，明度大约 +0.4，饱和度抬向更亮的一端。
 */
function ctaGradient(themeColor) {
  const base = themeColor || DEFAULT_THEME.themeColor
  const hsl = hexToHsl(base)
  if (!hsl) {
    return `linear-gradient(90deg, ${DEFAULT_THEME.themeColor} -3%, #c5d9de 100%)`
  }
  const right = hslToHex(
    hsl.h,
    Math.min(1, Math.max(hsl.s, 0.45) + 0.12),
    Math.min(0.82, hsl.l + 0.4)
  )
  return `linear-gradient(90deg, ${base} -3%, ${right} 100%)`
}

DEFAULT_THEME.ctaGradient = ctaGradient(DEFAULT_THEME.themeColor)

function darkenHex(hex, ratio = 0.42) {
  const raw = String(hex || '').replace('#', '')
  if (!/^[0-9A-Fa-f]{6}$/.test(raw)) return '#5A6A72'
  const r = parseInt(raw.slice(0, 2), 16)
  const g = parseInt(raw.slice(2, 4), 16)
  const b = parseInt(raw.slice(4, 6), 16)
  const to = (c) => clamp(c * (1 - ratio))
  const h = (c) => to(c).toString(16).padStart(2, '0')
  return `#${h(r)}${h(g)}${h(b)}`
}

function accentForBackground(background) {
  if (!background || !background.type) {
    return DEFAULT_THEME.themeColor
  }
  if (background.type === 'solid') {
    const hit = SOLID_PRESETS.find((p) => p.value.toLowerCase() === String(background.value || '').toLowerCase())
    return hit ? hit.accent : darkenHex(background.value)
  }
  if (background.type === 'gradient') {
    const hit = GRADIENT_PRESETS.find((p) => p.value === background.value)
    return hit ? hit.accent : DEFAULT_THEME.themeColor
  }
  if (background.type === 'image') {
    return '#C8784A'
  }
  return DEFAULT_THEME.themeColor
}

function resolveTheme(background) {
  if (!background || !background.type || !background.value) {
    return { ...DEFAULT_THEME, background: { ...DEFAULT_THEME.background } }
  }

  const themeColor = accentForBackground(background)

  if (background.type === 'solid') {
    return {
      bgStyle: `background: ${background.value};`,
      bgImage: '',
      lightHeader: false,
      isPhoto: false,
      themeColor,
      ctaGradient: ctaGradient(themeColor),
      background: { type: 'solid', value: background.value }
    }
  }

  if (background.type === 'image') {
    // 照片背景：浅色蒙层 + 深色字，避免明暗不均导致字看不清
    return {
      bgStyle: 'background: #d8d2c8;',
      bgImage: background.value,
      lightHeader: false,
      isPhoto: true,
      themeColor,
      ctaGradient: ctaGradient(themeColor),
      background: { type: 'image', value: background.value }
    }
  }

  return {
    bgStyle: `background: ${background.value};`,
    bgImage: '',
    lightHeader: false,
    isPhoto: false,
    themeColor,
    ctaGradient: ctaGradient(themeColor),
    background: { type: 'gradient', value: background.value }
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

/**
 * 把全局主题同步到页面 data.theme（供 AppShell 使用）。
 * 主题未变时跳过 theme 字段写入，减少多余 setData。
 */
function bindThemeToPage(page, patch = {}) {
  const theme = getAppTheme()
  const prev = page.data && page.data.theme
  const themeChanged =
    !prev ||
    prev.themeColor !== theme.themeColor ||
    prev.ctaGradient !== theme.ctaGradient ||
    prev.bgImage !== theme.bgImage ||
    prev.bgStyle !== theme.bgStyle ||
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
  GRADIENT_PRESETS,
  SOLID_PRESETS,
  DEFAULT_THEME,
  resolveTheme,
  setAppFamily,
  getAppTheme,
  bindThemeToPage,
  ctaGradient,
  applyNavBarColor
}
