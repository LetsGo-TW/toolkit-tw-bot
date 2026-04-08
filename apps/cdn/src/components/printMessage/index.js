import "./style.css"

class PrintMessage {
  colors = {
    success: ["#204900", "#19a903 0%,#159002 44%,#0f6e00"],
    error: ["#000", "#a90329 0%,#8f0222 44%,#6d0019"],
    warn: ["#492f00", "#b59110 0%,#907102 44%,#6e3800"]
  }

  nodeId = "go-print-message"
  contentClass = "go-print-message__content"
  dragHoldMs = 180
  dragMoveThresholdPx = 4
  removeTime = null
  target = null
  suppressClick = false
  dragState = null
  lastPosition = null

  constructor() {}

  normalizeOptions = (options) => {
    if (typeof options === "boolean") {
      return { allowHtml: options }
    }

    if (options && typeof options === "object") {
      return { allowHtml: Boolean(options.allowHtml) }
    }

    return { allowHtml: false }
  }

  run = (message, time, color, options) => {
    this.message = message
    this.time = Number(time) > 0 ? Number(time) : 3000
    this.color = color
    this.options = this.normalizeOptions(options)

    const target = this.insert()
    if (!target) return

    target.style.setProperty("--go-print-message-border", this.color?.[0] || "#204900")
    target.style.setProperty("--go-print-message-bg", this.color?.[1] || "#19a903 0%,#159002 44%,#0f6e00")

    let content = target.querySelector(`.${this.contentClass}`)
    if (!content) {
      content = document.createElement("p")
      content.className = this.contentClass
      target.append(content)
    }

    if (this.options.allowHtml) {
      content.innerHTML = String(this.message || "")
    } else {
      content.textContent = String(this.message || "")
    }

    clearTimeout(this.removeTime)
    this.removeTime = setTimeout(() => {
      this.remove()
    }, this.time)
  }

  getTarget = () => {
    if (this.target?.isConnected) return this.target

    const target = document.querySelector(`#${this.nodeId}`)
    this.target = target || null
    return this.target
  }

  clampPosition = (target, left, top) => {
    const width = Number(target?.offsetWidth) || 0
    const height = Number(target?.offsetHeight) || 0
    const maxLeft = Math.max(0, window.innerWidth - width)
    const maxTop = Math.max(0, window.innerHeight - height)

    return {
      left: Math.min(Math.max(0, Math.round(left)), maxLeft),
      top: Math.min(Math.max(0, Math.round(top)), maxTop)
    }
  }

  applyPosition = (target, position = null) => {
    if (!target || !position) return
    const next = this.clampPosition(target, position.left, position.top)
    target.style.left = `${next.left}px`
    target.style.top = `${next.top}px`
    target.style.margin = "0"
    target.style.transform = "none"
  }

  startDrag = (event) => {
    const target = this.getTarget()
    if (!target) return

    const rect = target.getBoundingClientRect()
    this.dragState = {
      pointerId: event.pointerId,
      startedAt: Date.now(),
      startX: Number(event.clientX) || 0,
      startY: Number(event.clientY) || 0,
      initialLeft: rect.left,
      initialTop: rect.top,
      dragEnabled: false,
      moved: false,
      holdTimer: null
    }

    target.classList.add("go-print-message--pressing")

    this.dragState.holdTimer = window.setTimeout(() => {
      const state = this.dragState
      if (!state || state.pointerId !== event.pointerId) return
      state.dragEnabled = true
      target.classList.add("go-print-message--dragging")
      this.applyPosition(target, { left: state.initialLeft, top: state.initialTop })
      try {
        target.setPointerCapture(event.pointerId)
      } catch (_) {}
    }, this.dragHoldMs)
  }

  moveDrag = (event) => {
    const target = this.getTarget()
    const state = this.dragState
    if (!target || !state || state.pointerId !== event.pointerId) return

    const dx = (Number(event.clientX) || 0) - state.startX
    const dy = (Number(event.clientY) || 0) - state.startY
    const distance = Math.hypot(dx, dy)
    if (distance > this.dragMoveThresholdPx) {
      state.moved = true
    }

    if (!state.dragEnabled) return

    event.preventDefault()
    const next = this.clampPosition(
      target,
      state.initialLeft + dx,
      state.initialTop + dy
    )
    this.applyPosition(target, next)
  }

  endDrag = (event) => {
    const target = this.getTarget()
    const state = this.dragState
    if (!state || state.pointerId !== event.pointerId) return

    if (state.holdTimer) {
      clearTimeout(state.holdTimer)
    }

    const heldForMs = Date.now() - state.startedAt
    const wasDragIntent = Boolean(state.dragEnabled || state.moved || heldForMs >= this.dragHoldMs)

    if (target) {
      target.classList.remove("go-print-message--pressing")
      target.classList.remove("go-print-message--dragging")
      if (state.dragEnabled) {
        const rect = target.getBoundingClientRect()
        const next = this.clampPosition(target, rect.left, rect.top)
        this.applyPosition(target, next)
        this.lastPosition = next
      }
      try {
        if (target.hasPointerCapture?.(event.pointerId)) {
          target.releasePointerCapture(event.pointerId)
        }
      } catch (_) {}
    }

    this.dragState = null
    if (wasDragIntent) {
      this.suppressClick = true
    }
  }

  onPointerDown = (event) => {
    if (event.button !== 0) return
    this.startDrag(event)
  }

  onPointerMove = (event) => {
    this.moveDrag(event)
  }

  onPointerUp = (event) => {
    this.endDrag(event)
  }

  onPointerCancel = (event) => {
    this.endDrag(event)
  }

  onClick = (event) => {
    if (this.suppressClick) {
      this.suppressClick = false
      event.preventDefault()
      event.stopPropagation()
      return
    }
    this.remove()
  }

  initInteractions = (target) => {
    if (!target || target.dataset.goPrintMessageReady === "1") return
    target.dataset.goPrintMessageReady = "1"
    target.addEventListener("click", this.onClick)
    target.addEventListener("pointerdown", this.onPointerDown)
    target.addEventListener("pointermove", this.onPointerMove)
    target.addEventListener("pointerup", this.onPointerUp)
    target.addEventListener("pointercancel", this.onPointerCancel)
    target.addEventListener("lostpointercapture", this.onPointerCancel)
    if (this.lastPosition) {
      this.applyPosition(target, this.lastPosition)
    }
  }

  insert() {
    const mounted = this.getTarget()
    if (mounted) {
      this.initInteractions(mounted)
      return mounted
    }

    const parent = document.querySelector("body") || document.documentElement
    if (!parent) return null

    const target = document.createElement("div")
    target.id = this.nodeId
    target.className = "go-print-message"

    parent.append(target)

    this.target = target
    this.initInteractions(target)

    return target
  }

  remove = () => {
    clearTimeout(this.removeTime)
    this.removeTime = null

    const target = this.getTarget()
    if (!target) return

    target.removeEventListener("click", this.onClick)
    target.removeEventListener("pointerdown", this.onPointerDown)
    target.removeEventListener("pointermove", this.onPointerMove)
    target.removeEventListener("pointerup", this.onPointerUp)
    target.removeEventListener("pointercancel", this.onPointerCancel)
    target.removeEventListener("lostpointercapture", this.onPointerCancel)
    target.remove()

    if (this.target === target) {
      this.target = null
    }
  }

  success = (message, time, options) => this.run(message, time, this.colors.success, options)

  error = (message, time, options) => this.run(message, time, this.colors.error, options)

  warn = (message, time, options) => this.run(message, time, this.colors.warn, options)
}

export const printMessage = new PrintMessage()
