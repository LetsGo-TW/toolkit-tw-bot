const INCOMINGS_SELECTOR = '#incomings_amount'
const OBSERVER_DEBOUNCE_MS = 180

export type IncomingObservedDetail = {
  observedAt: number
  previousCount: number
  currentCount: number
  diffCount: number
}

type InstallIncomingObserverOptions = {
  root?: ParentNode | null
  onObserved?: ((detail: IncomingObservedDetail) => void | Promise<void>) | null
}

function normalizeIncomingsAmount(value = ''): number | null {
  const onlyDigits = String(value || '').replace(/[^\d]/g, '')
  if (!onlyDigits) return null

  const amount = Number(onlyDigits)
  return Number.isFinite(amount) ? amount : null
}

function resolveObservedNode(
  mutations: MutationRecord[] = [],
  root: ParentNode = document,
): HTMLElement | null {
  for (const mutation of Array.isArray(mutations) ? mutations : []) {
    const target = mutation?.target
    if (!target) continue

    if (target instanceof HTMLElement && target.id === 'incomings_amount') {
      return target
    }

    const element = target instanceof Element
      ? target
      : target.parentElement

    const closest = element?.closest(INCOMINGS_SELECTOR)
    if (closest instanceof HTMLElement) return closest
  }

  const fallback = root.querySelector(INCOMINGS_SELECTOR)
  return fallback instanceof HTMLElement ? fallback : null
}

function readCurrentAmount(
  node: HTMLElement | null = null,
  root: ParentNode = document,
): number | null {
  const sourceNode = node || root.querySelector(INCOMINGS_SELECTOR)
  if (!sourceNode) return null

  return normalizeIncomingsAmount(sourceNode.textContent)
}

export function installIncomingWatchObserver({
  root = document,
  onObserved = null,
}: InstallIncomingObserverOptions = {}) {
  const observedRoot: ParentNode = root ?? document
  const incomingNode = observedRoot.querySelector(INCOMINGS_SELECTOR)

  if (!(incomingNode instanceof HTMLElement)) {
    return () => {}
  }

  let lastKnownAmount = readCurrentAmount(incomingNode, observedRoot)
  let debounceTimer: ReturnType<typeof setTimeout> | null = null

  const processIncomingsChange = async(node: HTMLElement | null = null) => {
    const currentAmount = readCurrentAmount(node, observedRoot)
    if (currentAmount === null) return

    if (lastKnownAmount === null) {
      lastKnownAmount = currentAmount
      return
    }

    if (currentAmount === lastKnownAmount) return

    const previousAmount = lastKnownAmount
    lastKnownAmount = currentAmount

    if (typeof onObserved === 'function') {
      await onObserved({
        observedAt: Date.now(),
        previousCount: previousAmount,
        currentCount: currentAmount,
        diffCount: currentAmount - previousAmount,
      })
    }
  }

  const observer = new MutationObserver((mutations = []) => {
    const node = resolveObservedNode(mutations, observedRoot)
    if (!node) return

    if (debounceTimer) {
      clearTimeout(debounceTimer)
    }

    debounceTimer = setTimeout(() => {
      debounceTimer = null
      void processIncomingsChange(node)
    }, OBSERVER_DEBOUNCE_MS)
  })

  observer.observe(incomingNode, {
    childList: true,
    characterData: true,
    subtree: true,
    attributeOldValue: true,
  })

  return () => {
    if (debounceTimer) {
      clearTimeout(debounceTimer)
      debounceTimer = null
    }

    observer.disconnect()
  }
}

export default installIncomingWatchObserver
