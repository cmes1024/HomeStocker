const { compressImageForUpload } = require('./imageCompress')

function extFromPath(path) {
  const match = /\.(\w+)(\?|$)/.exec(path || '')
  const ext = ((match && match[1]) || 'jpg').toLowerCase()
  if (ext === 'jpeg') return 'jpg'
  if (ext === 'png' || ext === 'webp' || ext === 'gif') return ext
  return 'jpg'
}

function randomSuffix() {
  return Math.random().toString(36).slice(2, 8)
}

/**
 * 选一张图：相册或拍照。
 * @returns {Promise<string>} 本地临时路径
 */
async function chooseLocalImage() {
  if (typeof wx.chooseMedia === 'function') {
    const res = await wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      sizeType: ['compressed']
    })
    const file = res && res.tempFiles && res.tempFiles[0]
    const path = file && file.tempFilePath
    if (path) return path
  }

  const legacy = await wx.chooseImage({
    count: 1,
    sizeType: ['compressed'],
    sourceType: ['album', 'camera']
  })
  const path = legacy && legacy.tempFilePaths && legacy.tempFilePaths[0]
  if (!path) {
    const err = new Error('未选择图片')
    err.code = 'NO_IMAGE'
    throw err
  }
  return path
}

/**
 * 压缩后上传到云存储。
 * @param {string} localPath
 * @param {'item'|'space'|'location'} kind
 * @returns {Promise<string>} cloud:// fileID
 */
async function uploadEntityImage(localPath, kind) {
  const src = await compressImageForUpload(localPath, {
    maxEdge: 1280,
    quality: 72
  })
  const prefix =
    kind === 'space' ? 'space-images' : kind === 'location' ? 'location-images' : 'item-images'
  const cloudPath = `${prefix}/${Date.now()}-${randomSuffix()}.${extFromPath(src)}`
  const up = await wx.cloud.uploadFile({
    cloudPath,
    filePath: src
  })
  if (!up || !up.fileID) {
    const err = new Error('图片上传失败')
    err.code = 'UPLOAD_FAILED'
    throw err
  }
  return up.fileID
}

/**
 * 保存前：有新本地图就上传；用户清空则回空串；未改动则 undefined（云函数不改字段）。
 */
async function resolveImageFileID({ localPath, cleared, kind }) {
  if (localPath) return uploadEntityImage(localPath, kind || 'item')
  if (cleared) return ''
  return undefined
}

const displayUrlCache = {}

/**
 * 把 cloud:// fileID 换成可给 <image> 用的临时链；本地路径 / https 原样返回。
 */
async function resolveDisplayUrl(fileID) {
  const src = String(fileID || '').trim()
  if (!src) return ''
  if (!src.startsWith('cloud://')) return src
  if (displayUrlCache[src]) return displayUrlCache[src]
  try {
    const res = await wx.cloud.getTempFileURL({ fileList: [src] })
    const row = res && res.fileList && res.fileList[0]
    const url = row && row.tempFileURL
    if (url) {
      displayUrlCache[src] = url
      return url
    }
  } catch (e) {
    console.warn('getTempFileURL failed', e)
  }
  return src
}

/**
 * 用系统预览放大看图；cloud:// 会先换成临时链。
 */
async function previewEntityImage(src) {
  const url = await resolveDisplayUrl(src)
  if (!url) return
  wx.previewImage({
    current: url,
    urls: [url]
  })
}

module.exports = {
  chooseLocalImage,
  uploadEntityImage,
  resolveImageFileID,
  resolveDisplayUrl,
  previewEntityImage
}
