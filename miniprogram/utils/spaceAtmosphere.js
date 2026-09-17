const { DEFAULT_THEME, getAppTheme } = require('./theme')

/**
 * 空间封面预设图。仅登记真实存在的本地/CDN 资源；
 * 未登记的 coverKey 视为「无预设」，落到家庭主题氛围。
 */
const SPACE_COVER_IMAGES = {
  // 'default-indoor': '/assets/test.jpg'
}

/**
 * 空间页背景优先级：
 * 1. 空间 coverKey 对应的预设图片
 * 2. 当前家庭主题色（径向渐变由 AppShell / ThemeRadialBg 绘制）
 * 3. 默认主题兜底
 */
function resolveSpaceAtmosphere(space, familyTheme) {
  const theme = familyTheme || getAppTheme() || DEFAULT_THEME
  const coverKey = space && space.coverKey
  const coverSrc = coverKey && SPACE_COVER_IMAGES[coverKey]

  const colors = {
    primary: theme.primary || DEFAULT_THEME.primary,
    secondary: theme.secondary || DEFAULT_THEME.secondary,
    shadow: theme.shadow || DEFAULT_THEME.shadow,
    themeColor: theme.primary || theme.themeColor || DEFAULT_THEME.primary,
    themeSoft: theme.secondary || theme.themeSoft || DEFAULT_THEME.secondary
  }

  if (coverSrc) {
    return {
      bgImage: coverSrc,
      lightHeader: false,
      isPhoto: true,
      ...colors,
      source: 'space-cover'
    }
  }

  return {
    bgImage: '',
    lightHeader: false,
    isPhoto: false,
    ...colors,
    source: theme && theme.id ? 'family' : 'fallback'
  }
}

module.exports = {
  SPACE_COVER_IMAGES,
  resolveSpaceAtmosphere
}
