/**
 * 氛围图等上传前压缩：限制边长与质量，失败则回退原图。
 * @param {string} src 本地临时路径
 * @param {{ maxEdge?: number, quality?: number }} [opts]
 * @returns {Promise<string>} 可用的本地路径
 */
async function compressImageForUpload(src, opts = {}) {
  const maxEdge = opts.maxEdge || 1600
  const quality = opts.quality || 72
  if (!src) return src

  try {
    if (typeof wx.compressImage === 'function') {
      const res = await wx.compressImage({
        src,
        quality,
        compressedWidth: maxEdge
      })
      if (res && res.tempFilePath) return res.tempFilePath
    }
  } catch (e) {
    console.warn('compressImage failed, use original', e)
  }

  return src
}

module.exports = {
  compressImageForUpload
}
