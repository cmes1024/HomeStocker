const copy = require('../../utils/copy')

Component({
  options: {
    virtualHost: true
  },

  properties: {
    itemId: {
      type: String,
      value: ''
    },
    name: {
      type: String,
      value: ''
    },
    quantity: {
      type: null,
      value: 0
    },
    unit: {
      type: String,
      value: ''
    },
    expireStatus: {
      type: String,
      value: ''
    },
    animate: {
      type: Boolean,
      value: false
    },
    delay: {
      type: Number,
      value: 0
    },
    place: {
      type: String,
      value: ''
    },
    selectable: {
      type: Boolean,
      value: false
    },
    selected: {
      type: Boolean,
      value: false
    },
    image: {
      type: String,
      value: ''
    },
    images: {
      type: Array,
      value: []
    }
  },

  data: {
    badgeExpired: copy.items.badgeExpired,
    badgeSoon: copy.items.badgeSoon,
    photos: [],
    autoplay: false
  },

  observers: {
    'image, images': function (image, images) {
      const list =
        images && images.length
          ? images.map((id) => String(id || '').trim()).filter(Boolean).slice(0, 3)
          : image
            ? [String(image).trim()].filter(Boolean)
            : []
      const autoplay = list.length > 1
      const key = list.join('|')
      if (this._photosKey === key && this.data.autoplay === autoplay) return
      this._photosKey = key
      this.setData({ photos: list, autoplay })
    }
  },

  methods: {
    onTap() {
      this.triggerEvent('tap', { id: this.properties.itemId })
    }
  }
})
