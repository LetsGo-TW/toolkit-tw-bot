const RUNTIME_ID = "go-runtime"

const ensureRuntimeRoot = () => {
  const existing = document.getElementById(RUNTIME_ID)
  if (existing) return existing

  const root = document.createElement("div")
  root.id = RUNTIME_ID
  root.hidden = true
  root.setAttribute("aria-hidden", "true")
  root.style.display = "none"
  document.documentElement.appendChild(root)
  return root
}

const writeDatasetValue = (target, key, value) => {
  if (!target) return

  if (value === null || value === undefined || value === "") {
    delete target.dataset[key]
    return
  }

  target.dataset[key] = String(value)
}

export const writeGroupIntentRuntimeState = (state = {}) => {
  const root = ensureRuntimeRoot()
  if (!root) return null

  writeDatasetValue(root, "goGroupIntentStatus", state.status)
  writeDatasetValue(root, "goGroupIntentReason", state.reason)
  writeDatasetValue(root, "goGroupIntentSource", state.source)
  writeDatasetValue(root, "goGroupIntentFix", state.group_id)
  writeDatasetValue(root, "goGroupIntentScanned", state.scanned)
  writeDatasetValue(root, "goGroupIntentRewritten", state.rewritten)
  writeDatasetValue(root, "goGroupIntentHref", state.href)
  writeDatasetValue(root, "goGroupIntentUpdatedAt", Date.now())

  if (state.skipped && typeof state.skipped === "object") {
    writeDatasetValue(root, "goGroupIntentSkipped", JSON.stringify(state.skipped))
  } else {
    writeDatasetValue(root, "goGroupIntentSkipped", "")
  }

  if (Array.isArray(state.samples)) {
    writeDatasetValue(root, "goGroupIntentSamples", JSON.stringify(state.samples))
  } else {
    writeDatasetValue(root, "goGroupIntentSamples", "")
  }

  return root
}

export default {
  writeGroupIntentRuntimeState
}
