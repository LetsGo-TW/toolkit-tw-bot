import { getGameData } from '@toolkit-tw-bot/document'
import { createHCaptchaBotViewSection } from '../../hCaptcha/config/bot-view-section'
import { createSearchBarbariansConfigSection } from '../../map/config-sections'
import { SETTINGS_CONFIG_TOGGLE_EVENT } from '../../settings/events'

function getCurrentUrl() {
  return new URL(window.location.href)
}

function getCurrentScreen() {
  return String(getCurrentUrl().searchParams.get('screen') || '').trim()
}

function normalizeRecord(value) {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value
    : null
}

function matchesEntry(entry, screen = getCurrentScreen()) {
  const match = normalizeRecord(entry?.match)

  if (!match) {
    return false
  }

  return Object.entries(match).every(([key, value]) => {
    const currentValue = String(getCurrentUrl().searchParams.get(key) || '').trim()
    return currentValue === String(value || '').trim()
  })
}

function buildGoToUrl(goTo = {}) {
  const source = normalizeRecord(goTo)
  const screen = String(source?.screen || '').trim()
  const gameData = getGameData()

  if (!source || !screen || !gameData?.link_base_pure) {
    return null
  }

  const url = new URL(
    `${gameData.link_base_pure}${screen}`,
    window.location.origin,
  )

  Object.entries(source).forEach(([key, value]) => {
    if (key === 'screen') {
      return
    }

    const safeValue = String(value || '').trim()

    if (!safeValue) {
      url.searchParams.delete(key)
      return
    }

    url.searchParams.set(key, safeValue)
  })

  return url.toString()
}

function createActionSection({
  id,
  label,
  groupId = '',
  buttonLabel = 'Abrir',
  onAction = null,
  copy = '',
} = {}) {
  return {
    id,
    label,
    groupId,
    mount: (container, sectionApi = {}) => {
      if (!(container instanceof HTMLElement)) {
        return null
      }

      const root = document.createElement('div')
      root.className = 'go-bvcp-action'

      if (copy) {
        const text = document.createElement('p')
        text.className = 'go-bvcp-action-copy'
        text.textContent = copy
        root.append(text)
      }

      const button = document.createElement('button')
      button.type = 'button'
      button.className = 'go-bvcp-action-button'
      button.textContent = buttonLabel
      root.append(button)
      container.append(root)

      const onClick = (event) => {
        event.preventDefault()
        event.stopPropagation()
        onAction?.()
        sectionApi?.close?.()
      }

      button.addEventListener('click', onClick, true)

      return {
        destroy() {
          button.removeEventListener('click', onClick, true)
          root.remove()
        },
      }
    },
  }
}

async function createInlineSection(entry, context = {}) {
  switch (String(entry?.id || '').trim()) {
    case 'hcaptcha':
      return await createHCaptchaBotViewSection(context)
    case 'search-barbarians':
      return createSearchBarbariansConfigSection(context)
    default:
      return null
  }
}

function createPageActionSection(entry, {
  groupId = '',
} = {}) {
  const id = String(entry?.id || '').trim()
  const label = String(entry?.label || id).trim() || id
  const actionLabel = String(entry?.actionLabel || 'Abrir').trim() || 'Abrir'

  switch (id) {
    case 'settings-config':
      return createActionSection({
        id,
        label,
        groupId,
        buttonLabel: actionLabel,
        onAction: () => {
          window.dispatchEvent(new CustomEvent(SETTINGS_CONFIG_TOGGLE_EVENT, {
            detail: {
              action: 'toggle',
            },
          }))
        },
      })
    default:
      return null
  }
}

function createGoToSection(entry, {
  groupId = 'others',
} = {}) {
  const id = String(entry?.id || '').trim()
  const label = String(entry?.label || id).trim() || id
  const nextUrl = buildGoToUrl(entry?.goTo)

  if (!nextUrl) {
    return null
  }

  return createActionSection({
    id: `${id}-goto`,
    label,
    groupId,
    buttonLabel: 'Ir',
    onAction: () => {
      window.location.assign(nextUrl)
    },
  })
}

export async function createComposerSectionsFromRegistry(registry = [], context = {}) {
  const screen = getCurrentScreen()
  const sections = []

  for (const entry of Array.isArray(registry) ? registry : []) {
    const id = String(entry?.id || '').trim()
    const type = String(entry?.type || '').trim().toLowerCase()
    const viewMode = String(entry?.viewMode || '').trim().toLowerCase()
    const isMatch = matchesEntry(entry, screen)

    if (!id || !type) {
      continue
    }

    if (type === 'global') {
      if (viewMode === 'inline') {
        const section = await createInlineSection(entry, context)
        if (section) {
          section.groupId = section.groupId || 'globals'
          sections.push(section)
        }
        continue
      }

      const pageSection = createPageActionSection(entry, {
        groupId: isMatch ? '' : 'others',
      })
      if (pageSection) {
        sections.push(pageSection)
      }
      continue
    }

    if (type === 'screen') {
      if (isMatch) {
        if (viewMode === 'inline') {
          const section = await createInlineSection(entry, context)
          if (section) {
            sections.push(section)
          }
          continue
        }

        if (viewMode === 'page') {
          const section = createPageActionSection(entry)
          if (section) {
            sections.push(section)
          }
          continue
        }
      }

      const otherSection = createGoToSection(entry)
      if (otherSection) {
        sections.push(otherSection)
      }
    }
  }

  return sections
}

export default createComposerSectionsFromRegistry
