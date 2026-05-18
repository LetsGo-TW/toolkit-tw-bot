import { getGameData } from '@toolkit-tw-bot/document'
import { createHCaptchaBotViewSection } from '../../hCaptcha/config/bot-view-section'
import { createSearchBarbariansConfigSection } from '../../map/config-sections'
import { createFarmMaxBotViewSection } from '../../farm-max/view/bot-view-section';
import { createExchangeBotViewSection } from '../../market/exchange/view/bot-view-section';
import { insertNotify, getNotifyBadgeState } from '../../notify';
import { insertConfigCopyToClipboard, getClipboardBadgeState } from '../../clipboard/view';

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

/**
 * Section type used by the new composer menu.
 *
 * `renderMode: "detail"`:
 * - stays in the primary menu as a simple row
 * - clicking the row opens the secondary dropdown/panel
 * - the section content is mounted only inside that secondary panel
 *
 * `renderMode: "row-action"`:
 * - clicking the row executes an action directly
 * - used for cases like "settings", where the real UI is injected into the TW page
 *
 * `renderMode: "button-action"`:
 * - row stays in the primary menu
 * - a small action button ("Ir") is rendered on the row itself
 * - used for `others`, because those should not open the secondary panel
 */
function createMenuSection({
  id,
  label,
  groupId = '',
  statusLabel = '',
  statusTone = '',
  statusTooltip = '',
  disabled = false,
  youtubeLink = '',
  renderMode = 'detail',
  mount = null,
  onAction = null,
  actionLabel = '',
} = {}) {
  return {
    id: String(id || '').trim(),
    label: String(label || id || '').trim(),
    groupId: String(groupId || '').trim(),
    statusLabel: String(statusLabel || '').trim(),
    statusTone: String(statusTone || '').trim().toLowerCase(),
    statusTooltip: String(statusTooltip || '').trim(),
    disabled: !!disabled,
    youtubeLink: String(youtubeLink || '').trim(),
    renderMode: String(renderMode || 'detail').trim().toLowerCase(),
    mount: typeof mount === 'function' ? mount : null,
    onAction: typeof onAction === 'function' ? onAction : null,
    actionLabel: String(actionLabel || '').trim(),
  }
}

async function createInlineSection(entry, context = {}) {
  switch (String(entry?.id || '').trim()) {
    case 'hcaptcha': {
      const section = await createHCaptchaBotViewSection(context)
      return createMenuSection({
        ...section,
        renderMode: 'detail',
      })
    }

    case 'search-barbarians': {
      const section = createSearchBarbariansConfigSection(context)
      return createMenuSection({
        ...section,
        renderMode: 'detail',
      })
    }

    case 'farm-max': {
      const section = await createFarmMaxBotViewSection(context)
      return createMenuSection({
        ...section,
        renderMode: 'detail',
      })
    }

    case 'exchange': {
      const section = await createExchangeBotViewSection(context)
      return createMenuSection({
        ...section,
        renderMode: 'detail',
      })
    }

    case 'notify': {
      const badgeState = await getNotifyBadgeState()
      return createMenuSection({
        ...entry,
        statusLabel: badgeState.statusLabel,
        statusTone: badgeState.statusTone,
        statusTooltip: badgeState.statusTooltip,
        renderMode: 'detail',
        mount: (container, sectionApi) => {
          let destroyFn = null
          const popoverDetail = container.closest('.go-bot-view-config-popover')

          if (popoverDetail) {
            popoverDetail.classList.add('go-notify-override')
            if (!document.getElementById('go-notify-override-style')) {
              const styleSheet = document.createElement('style')
              styleSheet.id = 'go-notify-override-style'
              styleSheet.innerHTML = `
                .go-notify-override {
                  top: 210px !important;
                  min-width: 640px !important;
                  max-width: min(640px, calc(100vw - 24px)) !important;
                }
              `
              document.head.appendChild(styleSheet)
            }
          }

          insertNotify(container, sectionApi).then(fn => {
            destroyFn = fn
          })
          return {
            destroy: () => {
              if (popoverDetail) {
                popoverDetail.classList.remove('go-notify-override')
              }
              destroyFn?.()
            }
          }
        }
      })
    }

    case 'clipboard': {
      const badgeState = await getClipboardBadgeState()
      return createMenuSection({
        ...entry,
        statusLabel: badgeState.statusLabel,
        statusTone: badgeState.statusTone,
        renderMode: 'detail',
        mount: (container, sectionApi) => {
          const destroyFn = insertConfigCopyToClipboard(container, sectionApi)
          return {
            destroy: () => destroyFn?.()
          }
        }
      })
    }

    default:
      return null
  }
}

function createPageActionSection(entry, {
  groupId = '',
} = {}) {
  const id = String(entry?.id || '').trim()
  const label = String(entry?.label || id).trim() || id

  switch (id) {
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

  return createMenuSection({
    id: `${id}-goto`,
    label,
    groupId,
    renderMode: 'button-action',
    actionLabel: 'Ir',
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

    if (type === 'auto') {
      if (viewMode === 'inline') {
        const section = await createInlineSection(entry, context)
        if (section) {
          section.groupId = section.groupId || 'auto'
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
    /**
     * Globals always exist in the menu.
     * If they are `inline`, they open in the secondary panel.
     * If they are page-based in the future, they act directly on click.
     */
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

    /**
     * Screen scripts have 2 behaviors:
     * - in the matching screen:
     *   - `inline` => opens the secondary panel
     *   - `page`   => toggles a TW-page injected UI directly
     * - outside the matching screen:
     *   - falls back to `Others` with a direct "Ir" button
     */
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
