export default class Running {
  static get ALLOW_CONCURRENT_WITH_FOREGROUND() {
    return ['farmHandler', 'farmSchedules']
  }

  static get STATUS() {
    return {
      RUNNING: 'running',
      PAUSED: 'paused',
    }
  }

  constructor(name = 'running') {
    this.node = Running.ensureNode()
    this.name = name
    this.prefix = 'goRunning'
  }

  static ensureNode() {
    let node = document.querySelector('#go-runtime')

    if (node) return node

    const parent = document.body || document.documentElement
    if (!parent) return null

    node = document.createElement('div')
    node.id = 'go-runtime'
    node.hidden = true
    node.setAttribute('aria-hidden', 'true')
    node.style.display = 'none'
    parent.append(node)

    return node
  }

  toDatasetKey = (script = this.name) => `${this.prefix}${String(script)
    .replace(/[^a-zA-Z0-9]+(.)?/g, (_, chr) => chr ? chr.toUpperCase() : '')
    .replace(/^[A-Z]/, (chr) => chr.toLowerCase())}`

  fromDatasetKey = (key) => key
    .replace(new RegExp(`^${this.prefix}`), '')
    .replace(/^[A-Z]/, (chr) => chr.toLowerCase())

  parseValue = (value) => {
    if (value === 'true') return true
    if (value === 'false') return false

    try {
      return JSON.parse(value)
    } catch {
      return value
    }
  }

  normalizeEntry = (value) => {
    if (value === true) {
      return {
        active: true,
        status: Running.STATUS.RUNNING,
      }
    }

    if (!value || value === false) {
      return {
        active: false,
        status: null,
      }
    }

    if (typeof value === 'object') {
      const active = value.active !== false
      const status = value.status || (active ? Running.STATUS.RUNNING : null)

      return {
        ...value,
        active,
        status,
      }
    }

    return {
      active: Boolean(value),
      status: Boolean(value) ? Running.STATUS.RUNNING : null,
      value,
    }
  }

  get = () => {
    if (!this.node?.dataset) return {}

    return Object.entries(this.node.dataset).reduce((obj, [key, value]) => {
      if (!key.startsWith(this.prefix)) return obj

      obj[this.fromDatasetKey(key)] = this.parseValue(value)

      return obj
    }, {})
  }

  getState = (script = this.name) => this.normalizeEntry(this.get()[script])

  is_active = (script) => {
    const all = this.get()

    if (typeof script === 'string') return this.normalizeEntry(all[script]).active

    const exclude = Array.isArray(script)
      ? script
      : Array.isArray(script?.exclude)
      ? script.exclude
      : []

    if (!exclude.length) {
      return Object.values(all).some((value) => this.normalizeEntry(value).active)
    }

    const excluded = new Set(exclude.map((key) => String(key)))

    return Object.entries(all).some(([key, value]) => {
      if (excluded.has(key)) return false

      return this.normalizeEntry(value).active
    })
  }

  is_running = (script = this.name) => {
    const state = this.getState(script)

    return state.active && state.status === Running.STATUS.RUNNING
  }

  is_paused = (script = this.name) => {
    const state = this.getState(script)

    return state.active && state.status === Running.STATUS.PAUSED
  }

  setState(script = this.name, payload = {}) {
    if (!this.node?.dataset) return

    const state = this.normalizeEntry({
      ...this.getState(script),
      ...payload,
    })

    this.node.dataset[this.toDatasetKey(script)] = JSON.stringify(state)
  }

  activate(script = this.name) {
    this.setState(script, {
      active: true,
      status: Running.STATUS.RUNNING,
    })
  }

  pause(script = this.name, payload = {}) {
    this.setState(script, {
      ...payload,
      active: true,
      status: Running.STATUS.PAUSED,
    })
  }

  togglePause(script = this.name, payload = {}) {
    if (this.is_paused(script)) {
      this.resume(script, payload)
    } else if (this.is_running(script)) {
      this.pause(script, payload)
    }
  }

  resume(script = this.name, payload = {}) {
    this.setState(script, {
      ...payload,
      active: true,
      status: Running.STATUS.RUNNING,
    })
  }

  ['continue'](script = this.name, payload = {}) {
    this.resume(script, payload)
  }

  remove(script = this.name) {
    if (!this.node?.dataset) return

    delete this.node.dataset[this.toDatasetKey(script)]
  }
}
