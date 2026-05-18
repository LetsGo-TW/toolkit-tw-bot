import { getGameData } from "@toolkit-tw-bot/document"
import { resolveExchangeViewRequirements } from ".."
import { getConfig, saveConfig } from "../config"
import exchangeView from "./index"

const EXCHANGE_YOUTUBE_URL = ""
const EXCHANGE_DETAIL_OVERRIDE_CLASS = "go-exchange-detail-override"
const EXCHANGE_DETAIL_OVERRIDE_STYLE_ID = "go-exchange-detail-override-style"
const EXCHANGE_HEADER_STYLE_ID = "go-exchange-header-style"

function ensureExchangeDetailOverrideStyle() {
  if (document.getElementById(EXCHANGE_DETAIL_OVERRIDE_STYLE_ID)) {
    return
  }

  const styleSheet = document.createElement("style")
  styleSheet.id = EXCHANGE_DETAIL_OVERRIDE_STYLE_ID
  styleSheet.innerHTML = `
    .${EXCHANGE_DETAIL_OVERRIDE_CLASS} {
      min-width: min-content !important;
      max-width: min(420px, calc(100vw - 24px)) !important;
    }
  `
  document.head.appendChild(styleSheet)
}

function ensureExchangeHeaderStyle() {
  if (document.getElementById(EXCHANGE_HEADER_STYLE_ID)) {
    return
  }

  const styleSheet = document.createElement("style")
  styleSheet.id = EXCHANGE_HEADER_STYLE_ID
  styleSheet.innerHTML = `
    .go-exchange-header-toggle {
      display: inline-flex;
      align-items: center;
      gap: 0.45rem;
      white-space: nowrap;
    }

    .go-exchange-header-toggle .go-label {
      color: rgba(215, 222, 207, 0.92);
      font: 700 11px/1.2 Verdana, Arial, sans-serif;
      cursor: pointer;
    }
  `
  document.head.appendChild(styleSheet)
}

function buildPremiumActivationUrl(gameData) {
  if (!gameData?.link_base_pure) {
    return null
  }

  const url = new URL(gameData.link_base_pure, window.location.origin)
  url.searchParams.set("screen", "premium")
  url.searchParams.set("mode", "use")
  return url
}

function renderMissingRequirements({
  container,
  sectionApi,
  message = "",
  showPremiumActivation = false,
  gameData = null,
} = {}) {
  if (!(container instanceof HTMLElement)) {
    return { destroy: () => {} }
  }

  if (typeof sectionApi?.setStatus === "function") {
    sectionApi.setStatus("Sem requerimentos", "danger", message)
  }

  const currentUrl = new URL(window.location.href)
  const activationUrl = showPremiumActivation
    ? buildPremiumActivationUrl(gameData)
    : null
  const shouldShowActivationLink = Boolean(
    activationUrl
    && !(
      currentUrl.searchParams.get("screen") === "premium"
      && currentUrl.searchParams.get("mode") === "use"
    )
  )

  container.innerHTML = `
    <div class="go-bvcp-missing-reqs">
      <div class="go-bvcp-missing-reqs-text">${String(message || "").trim()}</div>
      ${shouldShowActivationLink ? (`
        <a href="${activationUrl.toString()}" class="btn go-bvcp-action-button">Ativar</a>
      `) : ""}
    </div>
  `

  return {
    destroy() {
      container.innerHTML = ""
    },
  }
}

function mountExchangeConfig(container, sectionApi = {}) {
  const popoverDetail = container.closest(".go-bot-view-config-popover") || document.querySelector("div.go-bot-view-config-popover.go-bot-view-config-popover-detail")
  let isDestroyed = false
  let destroyExchangeView = null

  ensureExchangeDetailOverrideStyle()
  ensureExchangeHeaderStyle()

  if (typeof sectionApi.setYoutubeLink === "function") {
    sectionApi.setYoutubeLink(EXCHANGE_YOUTUBE_URL)
  }

  if (popoverDetail) {
    popoverDetail.classList.add(EXCHANGE_DETAIL_OVERRIDE_CLASS)
  }

  const toggleWrap = document.createElement("span")
  toggleWrap.className = "go-exchange-header-toggle"

  const toggleLabel = document.createElement("label")
  toggleLabel.className = "go-label"
  toggleLabel.htmlFor = "go-exchange-header-active"
  toggleLabel.textContent = "Auto-Exchange"

  const switchLabel = document.createElement("label")
  switchLabel.className = "go-switch-toggle"

  const toggleCheckbox = document.createElement("input")
  toggleCheckbox.type = "checkbox"
  toggleCheckbox.id = "go-exchange-header-active"

  const switchSlider = document.createElement("span")
  switchSlider.className = "go-slider-toggle"

  switchLabel.append(toggleCheckbox, switchSlider)
  toggleWrap.append(toggleLabel, switchLabel)

  getConfig().then((config) => {
    if (isDestroyed) return
    toggleCheckbox.checked = !!config?.active
  })

  const onChangeToggleCheckbox = async(event) => {
    const active = !!event.target.checked
    const config = await getConfig()
    config.active = active
    await saveConfig(config)

    if (typeof sectionApi.setStatus === "function") {
      sectionApi.setStatus(active ? "Ativo" : "Desligado", active ? "active" : "danger")
    }
  }

  toggleCheckbox.addEventListener("change", onChangeToggleCheckbox)
  sectionApi.setHeaderControls?.([toggleWrap])

  exchangeView.render(container, sectionApi).then((handle) => {
    if (isDestroyed) {
      handle?.destroy?.()
      return
    }

    destroyExchangeView = handle?.destroy || null
  })

  return {
    destroy() {
      isDestroyed = true
      toggleCheckbox.removeEventListener("change", onChangeToggleCheckbox)
      sectionApi.setHeaderControls?.([])
      destroyExchangeView?.()
      if (popoverDetail) {
        popoverDetail.classList.remove(EXCHANGE_DETAIL_OVERRIDE_CLASS)
      }
    },
  }
}

export async function createExchangeBotViewSection() {
  const gameData = getGameData()
  const viewRequirements = await resolveExchangeViewRequirements()

  if (viewRequirements.state === "world-unsupported") {
    return {
      id: "exchange",
      label: "Premium Exchange",
      groupId: "auto",
      disabled: true,
      statusLabel: viewRequirements.statusLabel,
      statusTone: viewRequirements.statusTone,
      statusTooltip: viewRequirements.message,
      youtubeLink: EXCHANGE_YOUTUBE_URL,
      mount: () => ({ destroy: () => {} }),
    }
  }

  if (viewRequirements.state === "missing-premium") {
    return {
      id: "exchange",
      label: "Premium Exchange",
      groupId: "auto",
      statusLabel: viewRequirements.statusLabel,
      statusTone: viewRequirements.statusTone,
      statusTooltip: viewRequirements.message,
      youtubeLink: EXCHANGE_YOUTUBE_URL,
      mount: (container, sectionApi) => renderMissingRequirements({
        container,
        sectionApi,
        message: viewRequirements.message,
        showPremiumActivation: true,
        gameData,
      }),
    }
  }

  return {
    id: "exchange",
    label: "Premium Exchange",
    groupId: "auto",
    statusLabel: viewRequirements.statusLabel,
    statusTone: viewRequirements.statusTone,
    statusTooltip: viewRequirements.statusTooltip,
    youtubeLink: EXCHANGE_YOUTUBE_URL,
    mount: (container, sectionApi) => mountExchangeConfig(container, sectionApi),
  }
}

export default createExchangeBotViewSection
