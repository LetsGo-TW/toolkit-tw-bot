export const getChromeRuntimeId = () => {
  try {
    return String(chrome?.runtime?.id || "")
  } catch {
    return ""
  }
}

export const hasExtensionContext = () => Boolean(getChromeRuntimeId())

export const getChromeStorageApi = () => {
  try {
    if (!hasExtensionContext()) return null
    return chrome?.storage || null
  } catch {
    return null
  }
}

export const getChromeStorageArea = (areaName) => {
  try {
    const storage = getChromeStorageApi()
    if (!storage || !areaName) return null
    return storage[areaName] || null
  } catch {
    return null
  }
}

export const hasChromeRuntimeError = () => {
  try {
    return Boolean(chrome?.runtime?.lastError?.message)
  } catch {
    return true
  }
}

export default {
  getChromeRuntimeId,
  getChromeStorageApi,
  getChromeStorageArea,
  hasChromeRuntimeError,
  hasExtensionContext
}
