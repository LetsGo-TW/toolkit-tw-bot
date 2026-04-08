import { getRunnerByScope } from '../runner-tabs'
import { ensureWorldPlayersLoaded, getWorldPlayer, getWorldPlayerByScopeKey } from '../world-players'
import { runtimeAllowedByLicense } from '../world-players/runtime'
import { getTabContext, getTabContextKey, getTabContextsByScopeKey, getTabIdsByWorldPlayer } from '.'

async function getScopedRunnerTarget(scopeKey: string) {
  const runner = getRunnerByScope(scopeKey)

  if (!runner) {
    return null
  }

  let tab: chrome.tabs.Tab
  try {
    tab = await chrome.tabs.get(runner.tabId)
  } catch {
    return null
  }

  const runnerNow = getRunnerByScope(scopeKey)
  if (
    !runnerNow
    || runnerNow.tabId !== runner.tabId
    || runnerNow.windowId !== runner.windowId
  ) {
    return null
  }

  await ensureWorldPlayersLoaded()
  const worldPlayer = getWorldPlayerByScopeKey(scopeKey)

  if (!worldPlayer) return null

  const tabContext = getTabContext(runnerNow.tabId)
  if (tabContext?.context === 'LOGIN') return null
  if (tabContext?.isBotProtected === true) return null
  
  const enabledByUser = worldPlayer?.enabledByUser === true
  const { isAllowedByLicense } = await runtimeAllowedByLicense(worldPlayer)
  if (!enabledByUser || !isAllowedByLicense) return null

  return {
    runner: runnerNow,
    tab,
    worldPlayer,
  }
}

async function getRecoverableTabCtxTarget(tabId: number) {
  let tab: chrome.tabs.Tab
  try {
    tab = await chrome.tabs.get(tabId)
  } catch {
    return null
  }
  const tabContext = getTabContext(tabId)
  if (!tabContext || !tabContext.scopeKey) return null
  await ensureWorldPlayersLoaded()
  const worldPlayer = getWorldPlayerByScopeKey(tabContext.scopeKey)
  if (!worldPlayer) return null
  const enabledByUser = worldPlayer?.enabledByUser === true
  const { isAllowedByLicense } = await runtimeAllowedByLicense(worldPlayer)
  if (!enabledByUser || !isAllowedByLicense) return null
  return {
    tabContext,
    tab,
    worldPlayer
  }
}

async function getWorldPlayerCtxTarget(world: string, playerId: number) {
  await ensureWorldPlayersLoaded()
  const worldPlayer = getWorldPlayer(world, playerId)
  if (!worldPlayer) return null
  const tabIds = getTabIdsByWorldPlayer(world, playerId)
  if (!tabIds.length) return null
  return {
    worldPlayer,
    tabIds
  }
}

export { getScopedRunnerTarget, getRecoverableTabCtxTarget, getWorldPlayerCtxTarget }
