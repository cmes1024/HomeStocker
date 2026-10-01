const { compressImageForUpload } = require('./imageCompress')
const javaApi = require('./javaApi')

const MAX_ITEM_IMAGES = 3

function extFromPath(path) {
  const match = /\.(\w+)(\?|$)/.exec(path || '')
  const ext = ((match && match[1]) || 'jpg').toLowerCase()
  if (ext === 'jpeg') return 'jpg'
  if (ext === 'png' || ext === 'webp' || ext === 'gif') return ext
  return 'jpg'
}

function contentTypeForExt(ext) {
  if (ext === 'png') return 'image/png'
  if (ext === 'webp') return 'image/webp'
  if (ext === 'gif') return 'image/gif'
  return 'image/jpeg'
}

/** 已持久化的图片引用（https / object key；历史 cloud:// 仅占位，不展示） */
function isStoredImageRef(id) {
  const s = String(id || '').trim()
  if (!s) return false
  if (s.startsWith('cloud://')) return true
  if (s.startsWith('http://') || s.startsWith('https://')) return true
  if (s.indexOf('/') > 0 && !s.startsWith('wxfile://') && !s.startsWith('http')) return true
  return false
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

function readFileBuffer(filePath) {
  return new Promise((resolve, reject) => {
    const fs = wx.getFileSystemManager()
    fs.readFile({
      filePath,
      success(res) {
        resolve(res.data)
      },
      fail: reject
    })
  })
}

async function uploadViaPresign(localPath, kind) {
  const ext = extFromPath(localPath)
  const contentType = contentTypeForExt(ext)
  const presign = await javaApi.callModule('storage', 'presign', {
    kind: kind || 'item',
    contentType,
    ext
  })
  const body = await readFileBuffer(localPath)
  await new Promise((resolve, reject) => {
    wx.request({
      url: presign.uploadUrl,
      method: presign.method || 'PUT',
      header: {
        'content-type': contentType
      },
      data: body,
      success(res) {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(res)
        } else {
          const err = new Error('图片上传失败')
          err.code = 'UPLOAD_FAILED'
          err.statusCode = res.statusCode
          reject(err)
        }
      },
      fail: reject
    })
  })
  return presign.publicUrl || presign.objectKey
}

/**
 * 压缩后直传对象存储（MinIO/COS）。云开发 uploadFile 已退役。
 * @param {string} localPath
 * @param {'item'|'space'|'location'|'avatar'} kind
 * @returns {Promise<string>} https publicUrl 或 objectKey
 */
async function uploadEntityImage(localPath, kind) {
  const src = await compressImageForUpload(localPath, {
    maxEdge: 1280,
    quality: 72
  })
  return uploadViaPresign(src, kind || 'item')
}

/**
 * 保存前：有新本地图就上传；用户清空则回空串；未改动则 undefined。
 */
async function resolveImageFileID({ localPath, cleared, kind }) {
  if (localPath) return uploadEntityImage(localPath, kind || 'item')
  if (cleared) return ''
  return undefined
}

/**
 * 物资多图：已有持久化引用保留，本地新图逐张上传，最多 3 张。
 */
async function resolveImageFileIDs({ existingFileIDs, localPaths, clearedAll }) {
  if (clearedAll && !(localPaths && localPaths.length)) return []
  const existing = (existingFileIDs || [])
    .map((id) => String(id || '').trim())
    .filter(isStoredImageRef)
  const locals = (localPaths || []).filter(Boolean)
  const room = Math.max(0, MAX_ITEM_IMAGES - existing.length)
  const uploaded = []
  for (let i = 0; i < locals.length && uploaded.length < room; i++) {
    uploaded.push(await uploadEntityImage(locals[i], 'item'))
  }
  return existing.concat(uploaded).slice(0, MAX_ITEM_IMAGES)
}

/**
 * 展示用 URL：https / object key / 本地原样；历史 cloud:// 返回空。
 */
async function resolveDisplayUrl(fileID) {
  const urls = await resolveDisplayUrls([fileID])
  return urls[0] || ''
}

async function resolveDisplayUrls(fileIDs) {
  const list = (fileIDs || []).map((id) => String(id || '').trim()).filter(Boolean)
  return list.map((src) => {
    if (src.startsWith('cloud://')) {
      return ''
    }
    return src
  })
}

async function previewEntityImage(src) {
  return previewEntityImages([src], src)
}

async function previewEntityImages(srcs, current) {
  const urls = (await resolveDisplayUrls(srcs || [])).filter(Boolean)
  if (!urls.length) {
    wx.showToast({ title: '图片暂不可预览', icon: 'none' })
    return
  }
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
