const { compressImageForUpload } = require('./imageCompress')

const MAX_ITEM_IMAGES = 3

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
 * 读路径：有 imageFileIDs 用它，否则把旧单张 imageFileID 收成数组。
 */
function itemImageFileIDs(item) {
  if (!item) return []
  if (Array.isArray(item.imageFileIDs) && item.imageFileIDs.length) {
    return item.imageFileIDs
      .map((id) => String(id || '').trim())
      .filter(Boolean)
      .slice(0, MAX_ITEM_IMAGES)
  }
  const one = String(item.imageFileID || '').trim()
  return one ? [one] : []
}

function itemCoverFileID(item) {
  return itemImageFileIDs(item)[0] || ''
}

/**
 * 选若干张图：相册或拍照。
 * @param {number} count 1–3
 * @returns {Promise<string[]>} 本地临时路径
 */
async function chooseLocalImages(count) {
  const n = Math.max(1, Math.min(MAX_ITEM_IMAGES, Number(count) || 1))
  if (typeof wx.chooseMedia === 'function') {
    const res = await wx.chooseMedia({
      count: n,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      sizeType: ['compressed']
    })
    const paths = ((res && res.tempFiles) || [])
      .map((file) => file && file.tempFilePath)
      .filter(Boolean)
    if (paths.length) return paths
  }

  const legacy = await wx.chooseImage({
    count: n,
    sizeType: ['compressed'],
    sourceType: ['album', 'camera']
  })
  const paths = (legacy && legacy.tempFilePaths) || []
  if (!paths.length) {
    const err = new Error('未选择图片')
    err.code = 'NO_IMAGE'
    throw err
  }
  return paths
}

/**
 * 选一张图：相册或拍照。
 * @returns {Promise<string>} 本地临时路径
 */
async function chooseLocalImage() {
  const paths = await chooseLocalImages(1)
  return paths[0]
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

/**
 * 物资多图：已有 cloud:// 保留，本地新图逐张上传，最多 3 张。
 */
async function resolveImageFileIDs({ existingFileIDs, localPaths, clearedAll }) {
  if (clearedAll && !(localPaths && localPaths.length)) return []
  const existing = (existingFileIDs || [])
    .map((id) => String(id || '').trim())
    .filter((id) => id.startsWith('cloud://'))
  const locals = (localPaths || []).filter(Boolean)
  const room = Math.max(0, MAX_ITEM_IMAGES - existing.length)
  const uploaded = []
  for (let i = 0; i < locals.length && uploaded.length < room; i++) {
    uploaded.push(await uploadEntityImage(locals[i], 'item'))
  }
  return existing.concat(uploaded).slice(0, MAX_ITEM_IMAGES)
}

const displayUrlCache = {}

/**
 * 把 cloud:// fileID 换成可给 <image> 用的临时链；本地路径 / https 原样返回。
 */
async function resolveDisplayUrl(fileID) {
  const urls = await resolveDisplayUrls([fileID])
  return urls[0] || ''
}

async function resolveDisplayUrls(fileIDs) {
  const list = (fileIDs || []).map((id) => String(id || '').trim()).filter(Boolean)
  if (!list.length) return []
  const result = new Array(list.length)
  const need = []
  list.forEach((src, i) => {
    if (!src.startsWith('cloud://')) {
      result[i] = src
      return
    }
    if (displayUrlCache[src]) {
      result[i] = displayUrlCache[src]
      return
    }
    need.push({ src, i })
  })
  if (!need.length) return result
  try {
    const res = await wx.cloud.getTempFileURL({ fileList: need.map((row) => row.src) })
    const rows = (res && res.fileList) || []
    need.forEach((row, idx) => {
      const url = rows[idx] && rows[idx].tempFileURL
      if (url) {
        displayUrlCache[row.src] = url
        result[row.i] = url
      } else {
        result[row.i] = row.src
      }
    })
  } catch (e) {
    console.warn('getTempFileURL failed', e)
    need.forEach((row) => {
      if (!result[row.i]) result[row.i] = row.src
    })
  }
  return result
}

/**
 * 用系统预览放大看图；cloud:// 会先换成临时链。
 */
async function previewEntityImage(src) {
  return previewEntityImages([src], src)
}

async function previewEntityImages(srcs, current) {
  const urls = (await resolveDisplayUrls(srcs || [])).filter(Boolean)
  if (!urls.length) return
  const cur = current ? await resolveDisplayUrl(current) : ''
  wx.previewImage({
    current: cur && urls.indexOf(cur) >= 0 ? cur : urls[0],
    urls
  })
}

module.exports = {
  MAX_ITEM_IMAGES,
  itemImageFileIDs,
  itemCoverFileID,
  chooseLocalImage,
  chooseLocalImages,
  uploadEntityImage,
  resolveImageFileID,
  resolveImageFileIDs,
  resolveDisplayUrl,
  resolveDisplayUrls,
  previewEntityImage,
  previewEntityImages
}
