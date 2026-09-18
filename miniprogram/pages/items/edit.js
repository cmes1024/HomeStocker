const { callItem, callSpace, callTag, callFamily } = require('../../utils/cloud')
const { bindThemeToPage } = require('../../utils/theme')
const { requestExpireSubscribe } = require('../../utils/subscribeExpire')
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
    expireReminderEnabled: false
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
    bindThemeToPage(this, {
      itemId,
      isEdit,
      preferredSpaceId,
      loading: true,
      headerTitle: isEdit ? copy.edit.titleEdit : copy.edit.titleCreate
    })
    this.syncLoadingColors()
    this.bootstrap(itemId)
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
      let item = null
      if (itemId) {
        item = await callItem('get', { itemId })
      }
      const preferredSpaceId =
        (item && item.spaceId) || this.data.preferredSpaceId || ''
      await Promise.all([
        this.loadSpaces(preferredSpaceId),
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
          loading: false
        })
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
    this.setData({ name: e.detail.value })
  },

  onQuantity(e) {
    this.setData({ quantity: e.detail.value })
  },

  onUnit(e) {
    this.setData({ unit: e.detail.value })
  },

  onNote(e) {
    this.setData({ note: e.detail.value })
  },

  onProductionDate(e) {
    this.setData({ productionDate: e.detail.value || '' })
  },

  onExpireDate(e) {
    this.setData({ expireDate: e.detail.value || '' })
  },

  clearProductionDate() {
    this.setData({ productionDate: '' })
  },

  clearExpireDate() {
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
      creatingLocation: false
    })
  },

  closeNewLocation() {
    if (this.data.creatingLocation) return
    this.setData({
      showNewLocation: false,
      newLocationName: '',
      modalError: ''
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
      const loc = await callSpace('createLocation', {
        spaceId: this.data.spaceId,
        name
      })
      await this.loadLocations(this.data.spaceId, loc._id)
      this.setData({
        showNewLocation: false,
        newLocationName: '',
        creatingLocation: false
      })
      wx.showToast({ title: copy.edit.locCreatedToast, icon: 'success' })
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
