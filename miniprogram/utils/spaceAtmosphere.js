const { DEFAULT_THEME, getAppTheme } = require('./theme')

/**
 * 空间封面预设图。仅登记真实存在的本地/CDN 资源；
 * 未登记的 coverKey 视为「无预设」，落到家庭氛围。
 * 例：'default-indoor': '/assets/space-default-indoor.jpg'
 */
const SPACE_COVER_IMAGES = {
  // 暂无打包氛围图；有文件后再挂 key → 路径
}

const FALLBACK_GRADIENT =
  'linear-gradient(165deg, #E8F1F2 0%, #C5D9DE 48%, #8FB3BC 100%)'

/**
 * 空间页背景优先级：
 * 1. 空间 coverKey 对应的预设图片
 * 2. 当前家庭氛围（照片 / 渐变 / 纯色）
 * 3. 默认渐变兜底
 */
function resolveSpaceAtmosphere(space, familyTheme) {
  const theme = familyTheme || getAppTheme() || DEFAULT_THEME
  const coverKey = space && space.coverKey
  const coverSrc = coverKey && SPACE_COVER_IMAGES[coverKey]

  if (coverSrc) {
    return {
      bgStyle: 'background: #d8d2c8;',
      bgImage: coverSrc,
      lightHeader: false,
      isPhoto: true,
      themeColor: theme.themeColor || DEFAULT_THEME.themeColor,
      source: 'space-cover'
    }
  }

  if (theme && (theme.bgImage || theme.bgStyle)) {
    return {
      bgStyle: theme.bgStyle || `background: ${FALLBACK_GRADIENT};`,
      bgImage: theme.bgImage || '',
      lightHeader: !!theme.lightHeader,
      isPhoto: !!theme.isPhoto,
      themeColor: theme.themeColor || DEFAULT_THEME.themeColor,
      source: 'family'
    }
  }

  return {
    bgStyle: `background: ${FALLBACK_GRADIENT};`,
    bgImage: '',
    lightHeader: false,
    isPhoto: false,
    themeColor: DEFAULT_THEME.themeColor,
    source: 'fallback'
  }
}

module.exports = {
  SPACE_COVER_IMAGES,
  resolveSpaceAtmosphere
}
