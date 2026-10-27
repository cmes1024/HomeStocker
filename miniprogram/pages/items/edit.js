const { callItem, callSpace, callTag, callFamily } = require('../../utils/cloud')
const { bindThemeToPage } = require('../../utils/theme')
const { requestExpireSubscribe } = require('../../utils/subscribeExpire')
const {
  MAX_ITEM_IMAGES,
  itemImageFileIDs,
  resolveImageFileID,
  resolveImageFileIDs,
  chooseLocalImages,
  localImageDataUrl,
  storedImageDataUrl,
  resolveDisplayUrls,
  previewEntityImages
} = require('../../utils/cloudImage')
const { compressImageForUpload } = require('../../utils/imageCompress')
const { callAi } = require('../../utils/callAi')
const copy = require('../../utils/copy')

function unlockMask(page, id) {
  const mask = page.selectComponent(id)
  if (mask && typeof mask.setStatus === 'function') {
    mask.setStatus(false)
  }
}

function decodeOpt(value) {
  if (value == null || value === '') return ''
  try {
    return decodeURIComponent(String(value))
  } catch (e) {
    return String(value)
  }
}

Page({
  data: {
    copy: copy.edit,
    common: copy.common,
    itemId: '',
    name: '',
    quantity: '1',
    unit: '',
    note: '',
    loading: false,
    saving: false,
    error: '',
    isEdit: false,
    headerTitle: '',
    theme: null,
    loadingColors: ['#C4A484', '#8B6914'],
    spaces: [],
    spaceNames: [],
    spaceIndex: 0,
    spaceId: '',
    locations: [],
    locationNames: [copy.edit.locationNone],
    locationIndex: 0,
    locationId: '',
    showNewLocation: false,
    newLocationName: '',
    creatingLocation: false,
    modalError: '',
    preferredSpaceId: '',
    spaceLabel: '',
    tags: [],
    selectedTagIds: [],
    productionDate: '',
    expireDate: '',
    expireReminderEnabled: false,
    imageSlots: [],
    locImageLocalPath: '',
    locImagePreview: '',
    captureVisible: false,
    capturing: false
  },

  onLoad(options) {
    const itemId = (options && options.id) || ''
    const preferredSpaceId = (options && options.spaceId) || ''
    const isEdit = !!itemId
    this.prefill = {
      name: decodeOpt(options && options.name),
      quantity: decodeOpt(options && options.quantity),
      unit: decodeOpt(options && options.unit),
      note: decodeOpt(options && options.note),
      spaceName: decodeOpt(options && options.spaceName),
      locationName: decodeOpt(options && options.locationName),
      expireDate: decodeOpt(options && options.expireDate),
      productionDate: decodeOpt(options && options.productionDate)
    }
    // 用户在本页手改过的字段：按图识别的结果不得覆盖它们
    this.touched = {}
    bindThemeToPage(this, {
      itemId,
      isEdit,
      preferredSpaceId,
      loading: true,
      headerTitle: isEdit ? copy.edit.titleEdit : copy.edit.titleCreate
    })
    this.syncLoadingColors()
    this.bootstrap(itemId)
    this.probeCaptureCapability()
  },

  /** 按图预填可用性探测：失败或没有视觉密钥都等价于不可用（隐藏入口），不影响任何既有路径。 */
  async probeCaptureCapability() {
    try {
      const data = await callAi('listKeys')
      const visible = !!(data && data.visionAvailable)
      this.setData({ captureVisible: visible })
    } catch (e) {
      this.setData({ captureVisible: false })
    }
  },

  onShow() {
    bindThemeToPage(this, {
      headerTitle: this.data.isEdit ? copy.edit.titleEdit : copy.edit.titleCreate
    })
    this.syncLoadingColors()
  },

  syncLoadingColors() {
    const color = (this.data.theme && this.data.theme.themeColor) || '#C4A484'
    this.setData({ loadingColors: [color, color] })
  },

  notifyDeletedAndBack() {
    wx.showModal({
      title: copy.edit.deletedTitle,
      content: copy.edit.deletedContent,
      showCancel: false,
      success: () => wx.navigateBack()
    })
  },

  async bootstrap(itemId) {
    try {
      const preferredSpaceId = this.data.preferredSpaceId || ''
      try {
        const pack = await callItem('editForm', {
          itemId: itemId || undefined,
          spaceId: preferredSpaceId || undefined
        })
        this.applyEditForm(pack)
        this.syncLoadingColors()
        return
      } catch (e) {
        if (e && (e.code === 'NOT_FOUND' || e.code === 'FORBIDDEN' || e.code === 'NO_FAMILY')) {
          throw e
        }
        // 未部署 item.editForm 时降级
      }

      let item = null
      if (itemId) {
        item = await callItem('get', { itemId })
      }
      const spacePref =
        (item && item.spaceId) || this.data.preferredSpaceId || ''
      await Promise.all([
        this.loadSpaces(spacePref),
        this.loadTags((item && item.tagIds) || [])
      ])
      if (item) {
        const spaceId = item.spaceId || this.data.spaceId
        await this.loadLocations(spaceId, item.locationId || '')
        this.setData({
          name: item.name || '',
          quantity: String(item.quantity != null ? item.quantity : 1),
          unit: item.unit || '',
          note: item.note || '',
          productionDate: item.productionDate || '',
          expireDate: item.expireDate || '',
          expireReminderEnabled: !!item.expireReminderEnabled,
          imageSlots: this.slotsFromItem(item),
          loading: false
        })
        this.hydrateImageSlots()
      } else {
        const prefill = this.prefill || {}
        await this.loadLocations(this.data.spaceId, '', prefill.locationName)
        const patch = { loading: false }
        if (prefill.name) patch.name = prefill.name
        if (prefill.quantity) patch.quantity = String(prefill.quantity)
        if (prefill.unit) patch.unit = prefill.unit
        if (prefill.note) patch.note = prefill.note
        if (prefill.expireDate) patch.expireDate = prefill.expireDate
        if (prefill.productionDate) patch.productionDate = prefill.productionDate
        this.setData(patch)
      }
      this.syncLoadingColors()
    } catch (e) {
      if (e.code === 'NOT_FOUND') {
        this.notifyDeletedAndBack()
        return
      }
      this.setData({
        loading: false,
        error: e.message || copy.common.loadFailed
      })
    }
  },

  applyEditForm(pack) {
    const spaces = (pack && pack.spaces) || []
    const spaceNames = spaces.map((s) => s.name)
    let spaceIndex = 0
    const preferredSpaceId = (pack && pack.spaceId) || this.data.preferredSpaceId || ''
    if (preferredSpaceId) {
      const idx = spaces.findIndex((s) => s && s._id === preferredSpaceId)
      if (idx >= 0) spaceIndex = idx
    } else if (this.prefill && this.prefill.spaceName) {
      const idx = spaces.findIndex((s) => s && s.name === this.prefill.spaceName)
      if (idx >= 0) spaceIndex = idx
    } else {
      const defIdx = spaces.findIndex((s) => s && s.isDefault)
      if (defIdx >= 0) spaceIndex = defIdx
    }
    const spaceId = spaces[spaceIndex] ? spaces[spaceIndex]._id : ''

    const preferredIds = (pack && pack.item && pack.item.tagIds) || []
    const tags = ((pack && pack.tags) || []).map((t) => ({
      ...t,
      selected: preferredIds.indexOf(t._id) >= 0
    }))
    const selectedTagIds = tags.filter((t) => t.selected).map((t) => t._id)

    const none = copy.edit.locationNone
    const locations = (pack && pack.locations) || []
    const locationNames = [none].concat(locations.map((l) => l.name))
    let locationIndex = 0
    const preferredLocationId = (pack && pack.locationId) || ''
    const preferredLocationName =
      (this.prefill && this.prefill.locationName) || ''
    if (preferredLocationId) {
      const idx = locations.findIndex((l) => l && l._id === preferredLocationId)
      if (idx >= 0) locationIndex = idx + 1
    } else if (preferredLocationName) {
      const idx = locations.findIndex((l) => l && l.name === preferredLocationName)
      if (idx >= 0) locationIndex = idx + 1
    }
    const locationId =
      locationIndex > 0 && locations[locationIndex - 1]
        ? locations[locationIndex - 1]._id
        : ''

    const item = pack && pack.item
    const prefill = this.prefill || {}
    const patch = {
      spaces,
      spaceNames,
      spaceIndex,
      spaceId,
      spaceLabel: spaces[spaceIndex] ? spaces[spaceIndex].name : '',
      tags,
      selectedTagIds,
      locations,
      locationNames,
      locationIndex,
      locationId,
      showNewLocation: false,
      newLocationName: '',
      loading: false
    }
    if (item) {
      patch.name = item.name || ''
      patch.quantity = String(item.quantity != null ? item.quantity : 1)
      patch.unit = item.unit || ''
      patch.note = item.note || ''
      patch.productionDate = item.productionDate || ''
      patch.expireDate = item.expireDate || ''
      patch.expireReminderEnabled = !!item.expireReminderEnabled
      patch.imageSlots = this.slotsFromItem(item)
    } else {
      if (prefill.name) patch.name = prefill.name
      if (prefill.quantity) patch.quantity = String(prefill.quantity)
      if (prefill.unit) patch.unit = prefill.unit
      if (prefill.note) patch.note = prefill.note
      if (prefill.expireDate) patch.expireDate = prefill.expireDate
      if (prefill.productionDate) patch.productionDate = prefill.productionDate
    }
    this.lastLocalPath = ''
    this.touched = {}
    this.setData(patch)
    if (item) this.hydrateImageSlots()
  },

  async loadTags(preferredIds) {
    try {
      const ensured = await callTag('ensureDefaults')
      const tags = ((ensured && ensured.list) || []).map((t) => ({
        ...t,
        selected: (preferredIds || []).indexOf(t._id) >= 0
      }))
      const selectedTagIds = tags.filter((t) => t.selected).map((t) => t._id)
      this.setData({ tags, selectedTagIds })
    } catch (e) {
      this.setData({ tags: [], selectedTagIds: [] })
    }
  },

  async loadSpaces(preferredSpaceId) {
    let spaces = []
    try {
      const listed = await callSpace('list')
      spaces = (listed && listed.list) || []
    } catch (e) {
      spaces = []
    }
    if (!spaces.length) {
      const def = await callSpace('ensureDefault')
      spaces = [def]
    }
    const spaceNames = spaces.map((s) => s.name)
    let spaceIndex = 0
    if (preferredSpaceId) {
      const idx = spaces.findIndex((s) => s._id === preferredSpaceId)
      if (idx >= 0) spaceIndex = idx
    } else if (this.prefill && this.prefill.spaceName) {
      const idx = spaces.findIndex((s) => s && s.name === this.prefill.spaceName)
      if (idx >= 0) spaceIndex = idx
    } else {
      const defIdx = spaces.findIndex((s) => s.isDefault)
      if (defIdx >= 0) spaceIndex = defIdx
    }
    const spaceId = spaces[spaceIndex] ? spaces[spaceIndex]._id : ''
    this.setData({
      spaces,
      spaceNames,
      spaceIndex,
      spaceId,
      spaceLabel: spaces[spaceIndex] ? spaces[spaceIndex].name : ''
    })
    return spaceId
  },

  async loadLocations(spaceId, preferredLocationId, preferredLocationName) {
    const none = copy.edit.locationNone
    if (!spaceId) {
      this.setData({
        locations: [],
        locationNames: [none],
        locationIndex: 0,
        locationId: ''
      })
      return
    }
    const listed = await callSpace('listLocations', { spaceId })
    const locations = (listed && listed.list) || []
    const locationNames = [none].concat(locations.map((l) => l.name))
    let locationIndex = 0
    if (preferredLocationId) {
      const idx = locations.findIndex((l) => l._id === preferredLocationId)
      if (idx >= 0) locationIndex = idx + 1
    } else if (preferredLocationName) {
      const idx = locations.findIndex((l) => l && l.name === preferredLocationName)
      if (idx >= 0) locationIndex = idx + 1
    }
    const locationId =
      locationIndex > 0 && locations[locationIndex - 1]
        ? locations[locationIndex - 1]._id
        : ''
    this.setData({
      locations,
      locationNames,
      locationIndex,
      locationId,
      showNewLocation: false,
      newLocationName: ''
    })
  },

  onName(e) {
    this.touched.name = true
    this.setData({ name: e.detail.value })
  },

  onQuantity(e) {
    this.touched.quantity = true
    this.setData({ quantity: e.detail.value })
  },

  onUnit(e) {
    this.touched.unit = true
    this.setData({ unit: e.detail.value })
  },

  onNote(e) {
    this.touched.note = true
    this.setData({ note: e.detail.value })
  },

  onProductionDate(e) {
    this.touched.productionDate = true
    this.setData({ productionDate: e.detail.value || '' })
  },

  onExpireDate(e) {
    this.touched.expireDate = true
    this.setData({ expireDate: e.detail.value || '' })
  },

  clearProductionDate() {
    this.touched.productionDate = true
    this.setData({ productionDate: '' })
  },

  clearExpireDate() {
    this.touched.expireDate = true
    this.setData({ expireDate: '', expireReminderEnabled: false })
  },

  async onToggleReminder(e) {
    if (!this.data.expireDate) {
      this.setData({ expireReminderEnabled: false })
      return
    }
    const enabled = !!(e.detail && e.detail.value)
    this.setData({ expireReminderEnabled: enabled })
    if (enabled) {
      await requestExpireSubscribe(callFamily)
    }
  },

  onToggleTag(e) {
    const id = e.currentTarget.dataset.id
    if (!id) return
    const tags = (this.data.tags || []).map((t) => {
      if (t._id !== id) return t
      return { ...t, selected: !t.selected }
    })
    const selectedTagIds = tags.filter((t) => t.selected).map((t) => t._id)
    this.setData({ tags, selectedTagIds })
  },

  async onSpaceChange(e) {
    const spaceIndex = Number(e.detail.value) || 0
    const space = this.data.spaces[spaceIndex]
    const spaceId = space ? space._id : ''
    this.setData({
      spaceIndex,
      spaceId,
      locationId: '',
      locationIndex: 0,
      spaceLabel: space ? space.name : ''
    })
    try {
      await this.loadLocations(spaceId, '')
    } catch (err) {
      this.setData({ error: err.message || copy.edit.locLoadFailed })
    }
  },

  onLocationChange(e) {
    const locationIndex = Number(e.detail.value) || 0
    const locationId =
      locationIndex > 0 && this.data.locations[locationIndex - 1]
        ? this.data.locations[locationIndex - 1]._id
        : ''
    this.setData({ locationIndex, locationId, showNewLocation: false })
  },

  openNewLocation() {
    if (!this.data.spaceId) {
      this.setData({ error: copy.edit.spaceRequired })
      return
    }
    this.setData({
      showNewLocation: true,
      newLocationName: '',
      modalError: '',
      creatingLocation: false,
      locImageLocalPath: '',
      locImagePreview: ''
    })
  },

  slotsFromItem(item) {
    return itemImageFileIDs(item).map((fileID, i) => ({
      key: fileID || `slot-${i}`,
      fileID,
      preview: fileID,
      localPath: ''
    }))
  },

  async hydrateImageSlots() {
    const slots = this.data.imageSlots || []
    if (!slots.length) return
    const fileIDs = slots.map((slot) => (slot.localPath ? '' : slot.fileID))
    const urls = await resolveDisplayUrls(fileIDs)
    const current = this.data.imageSlots || []
    if (current.length !== slots.length) return
    const next = current.map((slot, i) => {
      if (slot.localPath || slot.fileID !== slots[i].fileID) return slot
      const preview = urls[i] || slot.preview
      if (preview === slot.preview) return slot
      return { ...slot, preview }
    })
    this.setData({ imageSlots: next })
  },

  onPreviewSlot(e) {
    const idx = Number(e.currentTarget.dataset.index)
    const slots = this.data.imageSlots || []
    const current = slots[idx]
    if (!current) return
    previewEntityImages(
      slots.map((slot) => slot.preview),
      current.preview
    )
  },

  async onPickImages() {
    const remain = MAX_ITEM_IMAGES - (this.data.imageSlots || []).length
    if (remain <= 0) return
    try {
      const paths = await chooseLocalImages(remain)
      const stamp = Date.now()
      const added = paths.map((path, i) => ({
        key: `local-${stamp}-${i}`,
        fileID: '',
        preview: path,
        localPath: path
      }))
      this.setData({
        imageSlots: (this.data.imageSlots || []).concat(added).slice(0, MAX_ITEM_IMAGES)
      })
      this.lastLocalPath = paths[paths.length - 1]
    } catch (e) {
      if (e && (e.errMsg || '').indexOf('cancel') >= 0) return
      if (e && e.code === 'NO_IMAGE') return
      wx.showToast({ title: '选图失败', icon: 'none' })
    }
  },

  onClearSlot(e) {
    const idx = Number(e.currentTarget.dataset.index)
    const slots = (this.data.imageSlots || []).slice()
    if (idx < 0 || idx >= slots.length) return
    const removed = slots[idx]
    slots.splice(idx, 1)
    this.setData({ imageSlots: slots })
    if (removed && removed.localPath && removed.localPath === this.lastLocalPath) {
      this.lastLocalPath = ''
    }
  },

  /** 识别用图：优先最近一次新选/新拍的本地图；没有则退回第一张本地图，再退回第一张槽位。 */
  pickCaptureSlot(slots) {
    if (this.lastLocalPath) {
      const hit = slots.find((s) => s.localPath === this.lastLocalPath)
      if (hit) return hit
    }
    return slots.find((s) => s.localPath) || slots[0] || null
  },

  /**
   * 按图预填：无图先拍/选一张并入封面槽；取 data URL 调 ai.capture（只读）；
   * 当前表单一并发给模型，由模型对比照片与表单定夺每个字段；用户手改过的字段不覆盖。
   * capturing 独立于 loading/saving，异常一律 toast 收口，不挡保存。
   */
  async onCapturePrefill() {
    if (this.data.capturing) return
    const slots = this.data.imageSlots || []
    let slot = this.pickCaptureSlot(slots)
    if (!slot) {
      try {
        const paths = await chooseLocalImages(1)
        const path = paths && paths[0]
        if (!path) return
        const added = {
          key: `local-${Date.now()}`,
          fileID: '',
          preview: path,
          localPath: path
        }
        this.setData({ imageSlots: slots.concat([added]) })
        this.lastLocalPath = path
        slot = added
      } catch (e) {
        if (e && (e.code === 'NO_IMAGE' || (e.errMsg || '').indexOf('cancel') >= 0)) return
        wx.showToast({ title: copy.edit.captureFailed, icon: 'none' })
        return
      }
    }
    this.setData({ capturing: true })
    try {
      const dataUrl = slot.localPath
        ? await localImageDataUrl(
            await compressImageForUpload(slot.localPath, { maxEdge: 800, quality: 55 })
          )
        : await storedImageDataUrl(slot.fileID || slot.preview)
      const res = await callAi('capture', {
        image: dataUrl,
        context: this.captureContext()
      })
      this.applyCaptureFields(res && res.fields)
    } catch (e) {
      // 业务错误（无视觉密钥/额度用完/参数不符等）透出服务端文案，用户才知道去哪修；
      // 仅网络类（JAVA_CALL_FAILED，含 60s 超时）用通用「再试一次」。
      const code = e && e.code
      const msg =
        code && code !== 'JAVA_CALL_FAILED' && e.message ? e.message : copy.edit.captureFailed
      wx.showToast({ title: msg, icon: 'none' })
    } finally {
      this.setData({ capturing: false })
    }
  },

  /** 当前表单快照：随图发给 ai.capture，让模型对比照片与已填值定夺每个字段（空串=未填）。 */
  captureContext() {
    const d = this.data
    return {
      name: d.name || '',
      quantity: d.quantity || '',
      unit: d.unit || '',
      note: d.note || '',
      productionDate: d.productionDate || '',
      expireDate: d.expireDate || ''
    }
  },

  /**
   * 模型定夺：fields 是模型对比照片与当前表单后给出的每个字段最终值。
   * 用户手改过的字段（touched）不被覆盖；空返回值不清除原值；字段上限与输入框 maxlength 对齐。
   */
  applyCaptureFields(fields) {
    if (!fields || typeof fields !== 'object') {
      wx.showToast({ title: copy.edit.captureNone, icon: 'none' })
      return
    }
    const patch = {}
    const changed = []
    const apply = (key, label, value, cap) => {
      if (value == null || value === '') return
      if (this.touched[key]) return
      const next = cap ? String(value).slice(0, cap) : String(value)
      if (next === this.data[key]) return
      patch[key] = next
      changed.push(label)
    }
    apply('name', '名称', fields.name, 40)
    apply('quantity', '数量', fields.quantity)
    apply('unit', '单位', fields.unit, 10)
    apply('note', '备注', fields.note, 100)
    apply('productionDate', '生产日期', fields.productionDate)
    apply('expireDate', '过期日期', fields.expireDate)
    if (!changed.length) {
      wx.showToast({ title: copy.edit.captureNone, icon: 'none' })
      return
    }
    this.setData(patch)
    wx.showToast({ title: copy.edit.captureFilled(changed.length), icon: 'none' })
  },

  onLocImageChange(e) {
    const path = (e.detail && e.detail.path) || ''
    if (!path) return
    this.setData({ locImageLocalPath: path, locImagePreview: path })
  },

  onLocImageClear() {
    this.setData({ locImageLocalPath: '', locImagePreview: '' })
  },

  closeNewLocation() {
    if (this.data.creatingLocation) return
    this.setData({
      showNewLocation: false,
      newLocationName: '',
      modalError: '',
      locImageLocalPath: '',
      locImagePreview: ''
    })
  },

  onNewLocationName(e) {
    this.setData({ newLocationName: e.detail.value, modalError: '' })
  },

  async onCreateLocation() {
    if (this.data.creatingLocation) return
    const name = (this.data.newLocationName || '').trim()
    if (!name) {
      this.setData({ modalError: copy.edit.locNameRequired })
      return
    }
    if (!this.data.spaceId) {
      this.setData({ modalError: copy.edit.spaceRequired })
      return
    }
    this.setData({ creatingLocation: true, modalError: '' })
    try {
      const payload = {
        spaceId: this.data.spaceId,
        name
      }
      try {
        const locImageFileID = await resolveImageFileID({
          localPath: this.data.locImageLocalPath,
          kind: 'location'
        })
        if (locImageFileID) payload.imageFileID = locImageFileID
      } catch (uploadErr) {
        this.setData({
          creatingLocation: false,
          modalError: copy.edit.imageUploadFailed
        })
        return
      }
      const loc = await callSpace('createLocation', payload)
      await this.loadLocations(this.data.spaceId, loc._id)
      this.setData({
        showNewLocation: false,
        newLocationName: '',
        creatingLocation: false
      })
      wx.showToast({ title: copy.edit.locCreatedToast, icon: 'none' })
    } catch (e) {
      this.setData({
        creatingLocation: false,
        modalError: e.message || copy.edit.locCreateFailed
      })
    }
  },

  async onSave() {
    if (this.data.saving) return
    const name = (this.data.name || '').trim()
    if (!name) {
      this.setData({ error: copy.edit.nameRequired })
      unlockMask(this, '#saveMask')
      return
    }
    const quantity = Number(this.data.quantity)
    if (!Number.isFinite(quantity) || quantity < 0) {
      this.setData({ error: copy.edit.qtyInvalid })
      unlockMask(this, '#saveMask')
      return
    }
    this.setData({ saving: true, error: '' })
    try {
      const isEdit = this.data.isEdit
      const payload = {
        name,
        quantity,
        unit: (this.data.unit || '').trim(),
        note: this.data.note || '',
        spaceId: this.data.spaceId || undefined,
        locationId: this.data.locationId || null,
        tagIds: this.data.selectedTagIds || [],
        productionDate: this.data.productionDate || null,
        expireDate: this.data.expireDate || null,
        expireReminderEnabled: !!(
          this.data.expireDate && this.data.expireReminderEnabled
        )
      }
      try {
        const slots = this.data.imageSlots || []
        const existing = slots
          .filter((slot) => slot.fileID && !slot.localPath)
          .map((slot) => slot.fileID)
        const locals = slots.filter((slot) => slot.localPath).map((slot) => slot.localPath)
        const imageFileIDs = await resolveImageFileIDs({
          existingFileIDs: existing,
          localPaths: locals
        })
        payload.imageFileIDs = imageFileIDs
        payload.imageFileID = imageFileIDs[0] || ''
      } catch (uploadErr) {
        this.setData({ error: copy.edit.imageUploadFailed })
        return
      }
      if (isEdit) {
        await callItem('update', {
          itemId: this.data.itemId,
          ...payload
        })
      } else {
        await callItem('create', {
          ...payload,
          source: 'ui'
        })
      }
      wx.showToast({ title: copy.edit.savedToast, icon: 'success' })
      setTimeout(() => wx.navigateBack(), 400)
    } catch (e) {
      if (e.code === 'NOT_FOUND') {
        this.notifyDeletedAndBack()
        return
      }
      const msg =
        e.code === 'INVALID_SPACE' ||
        e.code === 'INVALID_LOCATION' ||
        e.code === 'INVALID_TAGS' ||
        e.code === 'INVALID_DATE'
          ? e.message
          : e.message || copy.edit.saveFailed
      this.setData({ error: msg })
    } finally {
      this.setData({ saving: false })
      unlockMask(this, '#saveMask')
    }
  }
})
