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
    }
  },

  data: {
    badgeExpired: copy.items.badgeExpired,
    badgeSoon: copy.items.badgeSoon
  },

  methods: {
    onTap() {
      this.triggerEvent('tap', { id: this.properties.itemId })
    }
  }
})
