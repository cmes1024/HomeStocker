const FALLBACK_HEIGHT_RPX = 280
/** 竖图只比原来的横条略高，避免顶满第一屏 */
const PORTRAIT_HEIGHT_RPX = 400

/**
 * 一组图共用一个高度。
 * 有竖图、或还有没量到的图时用竖图高度；全部确认是横图才用矮条。
 */
function photoStageHeightForSet(sizes) {
  const list = sizes || []
  if (!list.length) return PORTRAIT_HEIGHT_RPX
  const allLandscape = list.every((size) => {
    const width = Number(size && size.width) || 0
    const height = Number(size && size.height) || 0
    return width > 0 && height > 0 && height <= width
  })
  return allLandscape ? FALLBACK_HEIGHT_RPX : PORTRAIT_HEIGHT_RPX
}

module.exports = {
  FALLBACK_HEIGHT_RPX,
  PORTRAIT_HEIGHT_RPX,
  photoStageHeightForSet
}
