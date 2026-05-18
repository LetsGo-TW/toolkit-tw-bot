import viewHtml from "./index.html"
import viewCss from "./style.css"
import { getConfig, saveConfig } from "../config"
import { hydrateGroupsSelect } from "../../../groups/hydrateGroupSelect";

const EXCHANGE_VIEW_STYLE_ID = "go-exchange-view-style"
const PERCENT_FIELDS = new Set([
  "buy.storageLimit",
  "sell.minStorageReserve",
])

function ensureViewStyle() {
  if (document.getElementById(EXCHANGE_VIEW_STYLE_ID)) {
    return
  }

  const style = document.createElement("style")
  style.id = EXCHANGE_VIEW_STYLE_ID
  style.innerHTML = viewCss
  document.head.appendChild(style)
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value))
}

function getValueByPath(source = {}, path = "") {
  return String(path || "")
    .split(".")
    .reduce((current, key) => (
      current && typeof current === "object" && key in current
        ? current[key]
        : undefined
    ), source)
}

function setValueByPath(target = {}, path = "", value) {
  const keys = String(path || "").split(".").filter(Boolean)
  let current = target

  keys.forEach((key, index) => {
    if (index === keys.length - 1) {
      current[key] = value
      return
    }

    current[key] = current[key] || {}
    current = current[key]
  })
}

function toFormNumber(name = "", value = 0) {
  const normalized = Number(value || 0)

  if (!Number.isFinite(normalized)) {
    return 0
  }

  if (PERCENT_FIELDS.has(name)) {
    return normalized * 100
  }

  return normalized
}

function fromFormNumber(name = "", value = "") {
  const raw = String(value || "").trim()
  const parsed = raw.includes(".")
    ? parseFloat(raw)
    : parseInt(raw, 10)

  if (!Number.isFinite(parsed)) {
    return 0
  }

  if (PERCENT_FIELDS.has(name)) {
    return parsed / 100
  }

  return parsed
}

function updateCardInputsState(cardElement, isActive) {
  if (!cardElement) return

  const cardBody = cardElement.querySelector(".go-exchange-card-body")

  if (!cardBody) return

  cardBody.classList.toggle("disabled", !isActive)

  cardBody.querySelectorAll("input, select").forEach((input) => {
    input.disabled = !isActive
  })
}

function updateCardVisibility({
  marketType = "trade",
  buyConfig = null,
  sellConfig = null,
} = {}) {
  switch (marketType) {
    case "sprinter":
      buyConfig?.classList.remove("hidden")
      sellConfig?.classList.add("hidden")
      break
    case "premium":
      buyConfig?.classList.add("hidden")
      sellConfig?.classList.remove("hidden")
      break
    case "trade":
    default:
      buyConfig?.classList.remove("hidden")
      sellConfig?.classList.remove("hidden")
      break
  }
}

function populateForm(form, config = {}) {
  Array.from(form.elements || []).forEach((element) => {
    if (!element?.name) return

    const value = getValueByPath(config, element.name)

    if (typeof value === "undefined") {
      return
    }

    switch (element.type) {
      case "checkbox":
        element.checked = Boolean(value)
        break
      case "radio":
        element.checked = element.value === String(value)
        break
      case "number":
        element.value = String(toFormNumber(element.name, value))
        break
      case 'select-one':
        if (element.id === 'exchange-group') {
          element.dataset.pendingValue = String(value ?? 0)
        }
        element.value = String(value);
        break;
      default:
        element.value = String(value)
        break
    }
  })
}

function collectFormConfig(form, baseConfig = {}) {
  const nextConfig = cloneJson(baseConfig || {})

  Array.from(form.elements || []).forEach((element) => {
    if (!element?.name) return

    let value

    switch (element.type) {
      case "checkbox":
        value = element.checked
        break
      case "number":
        value = fromFormNumber(element.name, element.value)
        break
      case "radio":
        if (!element.checked) return
        value = element.value
        break
      case 'select-one':
        if (element.dataset.loading === 'true' && element.dataset.pendingValue) {
          value = parseInt(element.dataset.pendingValue, 10);
        } else {
          value = parseInt(element.value, 10);
        }
        break;
      default:
        value = element.value
        break
    }

    setValueByPath(nextConfig, element.name, value)
  })
  return nextConfig
}

export async function render(container, sectionApi = {}) {
  if (!(container instanceof HTMLElement)) {
    return null
  }

  ensureViewStyle()
  container.innerHTML = viewHtml

  const root = container.querySelector(".go-exchange-config-container")
  const form = root?.querySelector("#market-config-form")

  if (!(root instanceof HTMLElement) || !(form instanceof HTMLFormElement)) {
    return null
  }

  const marketTypeContainer = root.querySelector("#market-type-selectors")
  const buyConfig = root.querySelector("#buy-config")
  const sellConfig = root.querySelector("#sell-config")
  const buyActiveToggle = buyConfig?.querySelector('[name="buy.active"]')
  const sellActiveToggle = sellConfig?.querySelector('[name="sell.active"]')
  const exchangeGroup = root.querySelector("#exchange-group")

  let currentConfig = await getConfig()

  const syncSectionStatus = (config = currentConfig) => {
    if (typeof sectionApi?.setStatus !== "function") {
      return
    }

    sectionApi.setStatus(
      config?.active ? "Ativo" : "Desligado",
      config?.active ? "active" : "danger",
    )
  }

  const applyCurrentConfig = (config = currentConfig) => {
    currentConfig = config
    populateForm(form, currentConfig)
    updateCardVisibility({
      marketType: currentConfig.marketType,
      buyConfig,
      sellConfig,
    })
    updateCardInputsState(buyConfig, currentConfig?.buy?.active === true)
    updateCardInputsState(sellConfig, currentConfig?.sell?.active === true)
    syncSectionStatus(currentConfig)
  }

  const handleSubmit = async(event) => {
    event.preventDefault()
    currentConfig = collectFormConfig(form, currentConfig)
    await saveConfig(currentConfig)
    applyCurrentConfig(currentConfig)
  }

  const handleMarketTypeChange = async(event) => {
    if (event.target.name !== "marketType") return

    currentConfig.marketType = event.target.value

    switch (currentConfig.marketType) {
      case "sprinter":
        currentConfig.buy.active = true
        currentConfig.sell.active = false
        break
      case "premium":
        currentConfig.buy.active = false
        currentConfig.sell.active = true
        break
      case "trade":
      default:
        currentConfig.buy.active = true
        currentConfig.sell.active = true
        break
    }

    await saveConfig(currentConfig)
    applyCurrentConfig(currentConfig)
  }

  const handleBuyActiveToggle = (event) => updateCardInputsState(buyConfig, event.target.checked)
  const handleSellActiveToggle = (event) => updateCardInputsState(sellConfig, event.target.checked)

  applyCurrentConfig(currentConfig)

  form.addEventListener("submit", handleSubmit)
  marketTypeContainer?.addEventListener("change", handleMarketTypeChange)
  buyActiveToggle?.addEventListener("change", handleBuyActiveToggle)
  sellActiveToggle?.addEventListener("change", handleSellActiveToggle)
  void hydrateGroupsSelect(exchangeGroup)

  return {
    destroy() {
      form.removeEventListener("submit", handleSubmit)
      marketTypeContainer?.removeEventListener("change", handleMarketTypeChange)
      buyActiveToggle?.removeEventListener("change", handleBuyActiveToggle)
      sellActiveToggle?.removeEventListener("change", handleSellActiveToggle)
      container.innerHTML = ""
    },
  }
}

export default {
  render,
}
