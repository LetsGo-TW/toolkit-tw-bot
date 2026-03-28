require('./index.css')

const DEFAULT_TOOLTIP_ID = 'go-tooltip'
const DEFAULT_OFFSET_X = 10
const DEFAULT_OFFSET_Y = 10
const DEFAULT_VIEWPORT_PADDING = 8
const DEFAULT_LOADING_HTML = '<span class="go-tooltip-spinner" aria-hidden="true"></span>'

function isPromiseLike(value) {
  return Boolean(value) && typeof value.then === 'function'
}

function resolveScopeElement(containerEl) {
  if (containerEl instanceof Document) {
    return containerEl.documentElement
  }

  return containerEl instanceof Element ? containerEl : null
}

function resolveMatchingElement(target, selector, containerEl) {
  if (!(target instanceof Element)) {
    return null
  }

  const matched = target.closest(selector)
  const scopeEl = resolveScopeElement(containerEl)

  if (!matched || !scopeEl || !scopeEl.contains(matched)) {
    return null
  }

  return matched
}

function createAttributeTooltipRenderer(attributeName = 'data-title') {
  return (el) => {
    const value = String(el?.getAttribute?.(attributeName) || '').trim()
    return value || null
  }
}

function bindAttributeTooltip(containerEl, selector, options = {}) {
  const {
    tooltip = new Tooltip(options),
    attributeName = 'data-title',
    renderFn = createAttributeTooltipRenderer(attributeName),
  } = options

  return tooltip.bind(containerEl, selector, renderFn)
}

class Tooltip {
  #el = null

  #options = null

  constructor(options = {}) {
    this.#options = {
      tooltipId: DEFAULT_TOOLTIP_ID,
      root: document.body,
      className: '',
      offsetX: DEFAULT_OFFSET_X,
      offsetY: DEFAULT_OFFSET_Y,
      loadingHtml: DEFAULT_LOADING_HTML,
      viewportPadding: DEFAULT_VIEWPORT_PADDING,
      ...options,
    }

    this.#el = this.#ensureTooltip()
  }

  hide() {
    this.#hide()
  }

  bind(containerEl, selector, renderFn) {
    if (!containerEl || typeof containerEl.addEventListener !== 'function') {
      throw new TypeError('Tooltip.bind requires a container element or document.')
    }

    if (typeof selector !== 'string' || !selector.trim()) {
      throw new TypeError('Tooltip.bind requires a non-empty selector.')
    }

    if (typeof renderFn !== 'function') {
      throw new TypeError('Tooltip.bind requires a render function.')
    }

    let ctrl = null
    let token = 0
    let activeEl = null
    let lastPoint = null

    const abortCurrentRender = () => {
      ctrl?.abort()
      ctrl = null
    }

    const getElementPoint = (el) => {
      const rect = el.getBoundingClientRect()

      return {
        x: rect.left + (rect.width / 2),
        y: rect.bottom,
      }
    }

    const showForElement = async (el, point) => {
      abortCurrentRender()
      ctrl = new AbortController()
      activeEl = el
      lastPoint = point

      const myToken = ++token

      try {
        const rendered = renderFn(el, { signal: ctrl.signal })
        let content = rendered

        if (isPromiseLike(rendered)) {
          if (this.#options.loadingHtml) {
            this.#el.classList.add('is-loading')
            this.#showContent(this.#options.loadingHtml)
            this.#move(point.x, point.y)
          }

          content = await rendered
        }

        if (myToken !== token || activeEl !== el) {
          return
        }

        this.#el.classList.remove('is-loading')

        if (!content) {
          this.#hide()
          return
        }

        this.#showContent(content)
        this.#move(lastPoint?.x ?? point.x, lastPoint?.y ?? point.y)
      } catch (error) {
        if (error?.name === 'AbortError') {
          return
        }

        this.#el.classList.remove('is-loading')
        this.#hide()
        console.error('[tooltip]', error)
      }
    }

    const clearActive = () => {
      abortCurrentRender()
      activeEl = null
      lastPoint = null
      this.#hide()
    }

    const onOver = (event) => {
      const el = resolveMatchingElement(event.target, selector, containerEl)

      if (!el) {
        return
      }

      const from = event.relatedTarget

      if (from instanceof Node && el.contains(from)) {
        return
      }

      showForElement(el, {
        x: event.clientX,
        y: event.clientY,
      })
    }

    const onMove = (event) => {
      if (this.#el.hidden || !activeEl) {
        return
      }

      const el = resolveMatchingElement(event.target, selector, containerEl)

      if (!el || el !== activeEl) {
        return
      }

      lastPoint = {
        x: event.clientX,
        y: event.clientY,
      }

      this.#move(lastPoint.x, lastPoint.y)
    }

    const onOut = (event) => {
      const el = resolveMatchingElement(event.target, selector, containerEl)

      if (!el) {
        return
      }

      const to = event.relatedTarget

      if (to instanceof Node && el.contains(to)) {
        return
      }

      if (activeEl && activeEl !== el) {
        return
      }

      clearActive()
    }

    const onFocusIn = (event) => {
      const el = resolveMatchingElement(event.target, selector, containerEl)

      if (!el) {
        return
      }

      showForElement(el, getElementPoint(el))
    }

    const onFocusOut = (event) => {
      const el = resolveMatchingElement(event.target, selector, containerEl)

      if (!el) {
        return
      }

      const next = event.relatedTarget

      if (next instanceof Node && el.contains(next)) {
        return
      }

      if (activeEl && activeEl !== el) {
        return
      }

      clearActive()
    }

    containerEl.addEventListener('mouseover', onOver, true)
    containerEl.addEventListener('mousemove', onMove, true)
    containerEl.addEventListener('mouseout', onOut, true)
    containerEl.addEventListener('focusin', onFocusIn, true)
    containerEl.addEventListener('focusout', onFocusOut, true)

    return () => {
      clearActive()
      containerEl.removeEventListener('mouseover', onOver, true)
      containerEl.removeEventListener('mousemove', onMove, true)
      containerEl.removeEventListener('mouseout', onOut, true)
      containerEl.removeEventListener('focusin', onFocusIn, true)
      containerEl.removeEventListener('focusout', onFocusOut, true)
    }
  }

  #showContent(content) {
    if (typeof content === 'string') {
      this.#el.innerHTML = content
    } else if (content instanceof Node) {
      this.#el.replaceChildren(content)
    } else {
      this.#el.textContent = String(content)
    }

    this.#el.hidden = false
  }

  #move(x, y) {
    const {
      offsetX,
      offsetY,
      viewportPadding,
    } = this.#options

    let left = Number(x) + Number(offsetX)
    let top = Number(y) + Number(offsetY)

    this.#el.style.left = `${left}px`
    this.#el.style.top = `${top}px`

    const rect = this.#el.getBoundingClientRect()
    const maxLeft = window.innerWidth - rect.width - Number(viewportPadding)
    const maxTop = window.innerHeight - rect.height - Number(viewportPadding)

    if (left > maxLeft) {
      left = Math.max(Number(viewportPadding), Number(x) - rect.width - Number(offsetX))
    }

    if (top > maxTop) {
      top = Math.max(Number(viewportPadding), Number(y) - rect.height - Number(offsetY))
    }

    this.#el.style.left = `${left}px`
    this.#el.style.top = `${top}px`
  }

  #hide() {
    this.#el.hidden = true
    this.#el.classList.remove('is-loading')
  }

  #ensureTooltip() {
    const {
      tooltipId,
      className,
      root,
    } = this.#options

    let tip = document.getElementById(tooltipId)

    if (!tip) {
      tip = document.createElement('div')
      tip.id = tooltipId
      tip.hidden = true
      ;(root || document.body).appendChild(tip)
    }

    tip.classList.add('go-tooltip-root')

    if (className) {
      tip.classList.add(...String(className).split(/\s+/).filter(Boolean))
    }

    return tip
  }
}

module.exports = Tooltip
module.exports.default = Tooltip
module.exports.Tooltip = Tooltip
module.exports.bindAttributeTooltip = bindAttributeTooltip
module.exports.createAttributeTooltipRenderer = createAttributeTooltipRenderer
