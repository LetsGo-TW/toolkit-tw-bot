import copyToClipboardTextHtml from './index.html'
import shadowCssText from './style.shadow.css'

const COPY_TO_CLIPBOARD_SHADOW_HOST_ID = 'go-config-copy-to-clipboard-shadow-host'

const COPY_TO_CLIPBOARD_SHADOW_CSS = shadowCssText

function createClipboardShadowContent(shadowRoot) {
  if (!(shadowRoot instanceof ShadowRoot)) {
    return null
  }

  shadowRoot.replaceChildren()

  const style = document.createElement('style')
  style.textContent = COPY_TO_CLIPBOARD_SHADOW_CSS
  shadowRoot.append(style)

  const template = document.createElement('template')
  template.innerHTML = copyToClipboardTextHtml.trim()
  shadowRoot.append(template.content.cloneNode(true))

  return shadowRoot
}

export function mountClipboardShadowRoot(mountTarget) {
  if (!(mountTarget instanceof HTMLElement)) {
    return null
  }

  const existingHost = mountTarget.querySelector(`#${COPY_TO_CLIPBOARD_SHADOW_HOST_ID}`)
  const host = existingHost instanceof HTMLElement
    ? existingHost
    : document.createElement('div')

  if (!existingHost) {
    host.id = COPY_TO_CLIPBOARD_SHADOW_HOST_ID
    mountTarget.append(host)
  }

  const shadowRoot = host.shadowRoot || host.attachShadow({ mode: 'open' })
  createClipboardShadowContent(shadowRoot)

  const menu = shadowRoot.querySelector('#go-config-copy-to-clipboard-menu')
  const content = shadowRoot.querySelector('#go-config-copy-to-clipboard-content')

  return {
    host,
    shadowRoot,
    menu,
    content,
    destroy() {
      host.remove()
    },
  }
}
