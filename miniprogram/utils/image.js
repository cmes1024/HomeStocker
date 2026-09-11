const MAX_EDGE = 1600
const COMPRESS_QUALITY = 78

function promisify(fn, options) {
  return new Promise((resolve, reject) => {
    fn({
      ...options,
      success: resolve,
      fail: reject
    })
  })
}

function getCompressedSize(width, height) {
  const safeWidth = Number(width) || 0
  const safeHeight = Number(height) || 0
  const longest = Math.max(safeWidth, safeHeight)
  if (!longest || longest <= MAX_EDGE) {
    return null
  }
  const ratio = MAX_EDGE / longest
  return {
    width: Math.max(1, Math.round(safeWidth * ratio)),
    height: Math.max(1, Math.round(safeHeight * ratio))
  }
}

async function compressAtmosphereImage(filePath) {
  if (!filePath) {
    throw new Error('缺少图片路径')
  }

  const info = await promisify(wx.getImageInfo, { src: filePath })
  const size = getCompressedSize(info.width, info.height)
  const options = {
    src: filePath,
    quality: COMPRESS_QUALITY
  }

  if (size) {
    options.compressedWidth = size.width
    options.compressedHeight = size.height
  }

  try {
    const result = await promisify(wx.compressImage, options)
    return result && result.tempFilePath ? result.tempFilePath : filePath
  } catch (error) {
    // 压缩失败时回退原图，不阻断主流程。
    return filePath
  }
}

module.exports = {
  compressAtmosphereImage,
  MAX_EDGE,
  COMPRESS_QUALITY
}
