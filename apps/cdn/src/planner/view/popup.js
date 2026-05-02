import plannerTextHtml from './index.html'
import Tooltip from '@toolkit-tw-bot/document/tooltip'
import { printMessage } from '../../components/printMessage'
import { extensionId } from '@toolkit-tw-bot/release';

const DEFAULT_BOT_ICON_URL = `chrome-extension://${extensionId}/icons/ico.green.128.png`;

function bindEsc(callback, cancelEvents) {
  const onKeyPress = (event) => {
    if (event.repeat) return

    const isEsc = event.key === 'Escape' || event.key === 'Esc' || event.keyCode === 27
    if (!isEsc) return

    callback(event)
    document.removeEventListener('keydown', onKeyPress, true)
  }

  document.addEventListener('keydown', onKeyPress, true)
  cancelEvents.cancelEsc = () => document.removeEventListener('keydown', onKeyPress, true)
}

export async function showPopUpPlanner(data, deps = {}) {
  const {
    state,
    cancelEvents,
    commandCache,
    inFlight,
    dataUnits,
    loadPlannerTargetModules,
    getTargeSelection,
    setPlannerPopupLoading,
    onlyNumbers,
    calcContinentFromCoords,
    readNightBonusConfigFromSource,
    resolveEffectiveNightBonusConfig,
    parseFiniteNumber,
    syncCurrentTargetScopeSelectorUi,
    syncCurrentPlannerTargetDispatchStatusUi,
    ensureTargetsNavigatorPreviewMapInfo,
    buildPlannerTargetCardVillageFromNavigatorPreview,
    updateTargetReservationLock,
    syncPlannerActiveTargetFromPreview,
    insertTargetsAccordion,
    ensurePlannerLastReportIndicator,
    buildNightBonusTargetLabel,
    formatMoralePercent,
    applyMapInfoToPlayerNightMoralState,
    resolveTargetNightBonusConfigFromStateOrCache,
    parseNightBonusFromCurrentInterval,
    buildNightBonusSignature,
    getCachedAjaxMapInfo,
    renderPlannerSendersTable,
    getNightActiveModeFromWorldConfig,
    getTargetPlayerIdForNightState,
    readPlayerNightBonusConfigFromState,
    normalizeMoralePercent,
    getAjaxMapInfo,
    normalizeNightBonusConfig,
    bringData,
    resetPlayerNightMoralState
  } = deps
  const targetApi = await loadPlannerTargetModules()
  const resolveSafeIconUrl = (value = '') => {
    const url = String(value || '').trim()
    if (!url) return ''
    if (/^chrome-extension:\/\/invalid\/?/i.test(url)) return ''
    if (/^chrome-extension:\/\/[a-p]{32}\//i.test(url)) return url
    if (/^https?:\/\//i.test(url)) return url
    if (/^data:image\//i.test(url)) return url
    return ''
  }
  const x = Number(data?.x)
  const y = Number(data?.y)
  let popUpBoxContent = document.querySelector('.popup_box_content')
  if (!popUpBoxContent) {
    const villageSelection = await getTargeSelection(x, y)
    if (!villageSelection || typeof villageSelection !== 'object') {
      printMessage.error(`${x}|${y}: coordenada não existe`, 3000)
      throw new Error(`Coordenada inexistente no mundo: ${x}|${y}`)
    }

    document.querySelector('#ds_body').insertAdjacentHTML('beforeend', plannerTextHtml)
    setPlannerPopupLoading(true)
    document.dispatchEvent(new CustomEvent('go:planner:open', {
      detail: { x, y }
    }))
    const safeGoLogoUrl = resolveSafeIconUrl(DEFAULT_BOT_ICON_URL)
    if (safeGoLogoUrl) {
      document.querySelector('#go-logo').src = safeGoLogoUrl
    }
    popUpBoxContent = document.querySelector('.popup_box_content')
    const village = { ...villageSelection, x, y }
    village.id = Number(villageSelection.id)
    village.playerId = Number(villageSelection.player_id)
    village.bonusId = Number(villageSelection.bonus_id)
    village.textPoints = villageSelection.points
    village.points = Number(onlyNumbers(villageSelection.points))
    village.k = calcContinentFromCoords(village.x, village.y)
    const selectionNightBonusConfig = readNightBonusConfigFromSource(villageSelection)
    if (selectionNightBonusConfig) {
      state.nightBonusConfigTarget = selectionNightBonusConfig
      state.nightBonusConfig = resolveEffectiveNightBonusConfig({
        worldConfig: state.nightBonusConfigWorld,
        targetConfig: state.nightBonusConfigTarget
      })
    }
    if (state.plannerTargetCurrent) {
      state.plannerTargetCurrent = {
        ...state.plannerTargetCurrent,
        name: String(village?.name || '').trim() || state.plannerTargetCurrent?.name || null,
        playerId: parseFiniteNumber(village?.playerId) ?? state.plannerTargetCurrent?.playerId ?? null,
        k: parseFiniteNumber(village?.k)
          ?? calcContinentFromCoords(village?.x, village?.y)
          ?? state.plannerTargetCurrent?.k
          ?? null
      }
    }
    const plannerTargetNode = targetApi.plannerTargetView(village)
    popUpBoxContent.insertAdjacentElement('beforeend', plannerTargetNode)
    const targetContent = popUpBoxContent.querySelector('#go-target-content')
    targetContent.setAttribute('class', 'go-ml')
    targetContent.setAttribute('data-go-target-preview-key', `${Number(village?.x)}|${Number(village?.y)}`)
    syncCurrentTargetScopeSelectorUi(targetContent)
    syncCurrentPlannerTargetDispatchStatusUi(targetContent, state.plannerTargetCurrent || village)
    state.syncPlannerTargetCardPreviewCurrent = ({ target, meta } = {}) => {
      ensureTargetsNavigatorPreviewMapInfo(target)
      const nextVillage = buildPlannerTargetCardVillageFromNavigatorPreview(target, meta)
      if (!nextVillage) return
      const nextPreviewKey = `${Number(nextVillage?.x)}|${Number(nextVillage?.y)}`
      const currentPreviewKey = String(targetContent?.getAttribute?.('data-go-target-preview-key') || '').trim()
      const hasVillageMeta = Boolean(meta?.village && typeof meta.village === 'object')
      const hasExtraMeta = (
        Number.isFinite(Number(meta?.morale))
        || Boolean(meta?.nightBonusLabel)
        || Boolean(meta?.reservation)
      )
      if (!hasVillageMeta && !hasExtraMeta && currentPreviewKey === nextPreviewKey) return
      const nextAlly = (meta?.ally && typeof meta.ally === 'object') ? meta.ally : null
      targetContent.setAttribute('data-go-target-preview-key', nextPreviewKey)
      targetApi.updatePlannerTargetCard(targetContent, nextVillage, nextAlly)
      syncCurrentTargetScopeSelectorUi(targetContent)
      syncCurrentPlannerTargetDispatchStatusUi(targetContent, target || state.plannerTargetCurrent || nextVillage)
      updateTargetReservationLock(targetContent, nextVillage?.reservation || null)
      syncPlannerActiveTargetFromPreview({
        village: nextVillage,
        target,
        source: 'targets-navigator:preview'
      })
      targetContent.dispatchEvent(new CustomEvent('go:planner:target:preview-change', {
        detail: {
          village: nextVillage,
          ally: nextAlly,
          target,
          meta
        }
      }))
    }
    insertTargetsAccordion(targetContent, data)
    cancelEvents.unbindActionIncomingTarget = targetApi.actionIncomingTargetInit(targetContent, village)
    targetApi.actionSchedulesTargetInit(targetContent, village)
    targetApi.actionSchedulesSenderInit(targetContent, village)
    const popUpMapPlanner = document.querySelector('#go-popup-map-planner')
    const popUpBoxClose = document.querySelector('a.popup_box_close')
    state.syncPlannerLastReportIndicatorUiCurrent = () => {
      ensurePlannerLastReportIndicator()
    }
    ensurePlannerLastReportIndicator()
    let latestPlayers = []
    let latestAllys = []
    let targetMoralePercent = null
    let targetReservation = null
    let isTargetMapInfoLoading = false
    let hasTargetMapInfoLoaded = false
    const isSeedPreviewActive = () => {
      const displayedPreviewKey = String(targetContent?.getAttribute?.('data-go-target-preview-key') || '').trim()
      const seedPreviewKey = `${Number(village?.x)}|${Number(village?.y)}`
      return !displayedPreviewKey || displayedPreviewKey === seedPreviewKey
    }

    const updateVillageInfo = ({ players, allys } = {}) => {
      if (Array.isArray(players)) latestPlayers = players
      if (Array.isArray(allys)) latestAllys = allys
      const displayedPreviewKey = String(targetContent?.getAttribute?.('data-go-target-preview-key') || '').trim()
      const seedPreviewKey = `${Number(village?.x)}|${Number(village?.y)}`
      if (displayedPreviewKey && displayedPreviewKey !== seedPreviewKey) return
      const player = latestPlayers?.find?.((p) => p.id === village?.playerId)
      const ally = latestAllys?.find?.((a) => a.id === player?.allyId)
      const allyName = String(ally?.name || '').trim()
      const villageItemInfo = plannerTargetNode.querySelector('.village-info')
      if (!villageItemInfo) return
      villageItemInfo.classList.add('go-target-village-info')
      const nightBonusLabel = buildNightBonusTargetLabel({
        worldConfig: state.nightBonusConfigWorld,
        targetConfig: state.nightBonusConfigTarget,
        effectiveConfig: state.nightBonusConfig
      })
      const moraleLabel = formatMoralePercent(targetMoralePercent)
      villageItemInfo.innerHTML = `
        <span><strong>Pontos:</strong> ${village?.points.toLocaleString('pt-BR')}</span>
        ${player ? (`
            <span data-title="(${player?.rank?.toLocaleString('pt-BR')}.|${player?.points.toLocaleString('pt-BR')} P|${player?.villages.toLocaleString('pt-BR')} V)"><strong>Proprietário:</strong> ${player?.name}</span>
          `) : (`
            <span><strong>Proprietário:</strong> ---</span>
          `)
        }
        ${allyName ? (`
          <span data-title="${ally?.tag} (${ally?.rank?.toLocaleString('pt-BR')}.|${ally?.all_points?.toLocaleString('pt-BR')}P)"><strong>Tribo:</strong> ${ally?.name}</span>
        `
        ) : ''}
        ${moraleLabel ? (`
          <span><strong>Moral:</strong> ${moraleLabel}</span>
        `) : ''}
        ${nightBonusLabel ? (`
          <span><strong>Bônus noturno:</strong> ${nightBonusLabel}</span>
        `) : ''}
      `
      updateTargetReservationLock(plannerTargetNode, targetReservation)
    }

    const applyMapInfoToTarget = (mapInfo) => {
      if (!mapInfo || typeof mapInfo !== 'object') return false
      hasTargetMapInfoLoaded = true
      applyMapInfoToPlayerNightMoralState({ target: village, mapInfo })
      const moraleRaw = Number(mapInfo?.morale)
      if (Number.isFinite(moraleRaw) && moraleRaw > 0) targetMoralePercent = moraleRaw
      targetReservation = mapInfo?.reservation ?? null
      const nextTargetNightBonus = (
        resolveTargetNightBonusConfigFromStateOrCache({ target: village, fallbackMeta: village })
        || parseNightBonusFromCurrentInterval(mapInfo?.night_bonus?.current_interval)
      )
      if (nextTargetNightBonus && isSeedPreviewActive()) {
        const currentTargetSignature = buildNightBonusSignature(state.nightBonusConfigTarget)
        const nextTargetSignature = buildNightBonusSignature(nextTargetNightBonus)
        if (currentTargetSignature !== nextTargetSignature) {
          state.nightBonusConfigTarget = nextTargetNightBonus
          state.nightBonusConfig = resolveEffectiveNightBonusConfig({
            worldConfig: state.nightBonusConfigWorld,
            targetConfig: state.nightBonusConfigTarget
          })
        }
      }
      return true
    }
    const cachedMapInfoOnLoad = getCachedAjaxMapInfo(village.id)
    if (applyMapInfoToTarget(cachedMapInfoOnLoad)) {
      updateVillageInfo()
    }

    const rerenderPlannerTable = () => {
      renderPlannerSendersTable({ preserveSelection: true })
    }

    const ensureTargetMapInfoForNightBonus = async () => {
      const worldMode = getNightActiveModeFromWorldConfig()
      if (isTargetMapInfoLoading || hasTargetMapInfoLoaded) return
      const hasPlayer = Boolean(getTargetPlayerIdForNightState(village))
      const hasNightForPlayer = Boolean(readPlayerNightBonusConfigFromState(village?.playerId)?.active)
      const hasMoraleForPlayer = normalizeMoralePercent(targetMoralePercent) != null
      const requestIfMissing = (
        (worldMode === 2 && hasPlayer && !hasNightForPlayer)
        || (hasPlayer && !hasMoraleForPlayer)
      )
      if (!requestIfMissing) return
      isTargetMapInfoLoading = true
      try {
        const mapInfo = await getAjaxMapInfo(village.id, { requestIfMissing: true })
        if (!mapInfo) return
        const prevNightSignature = buildNightBonusSignature(state.nightBonusConfigTarget)
        applyMapInfoToTarget(mapInfo)
        const nextNightSignature = buildNightBonusSignature(state.nightBonusConfigTarget)
        if (prevNightSignature !== nextNightSignature) rerenderPlannerTable()
        updateVillageInfo()
      } catch (error) {
        console.error('[planner][getAjaxMapInfo]', error)
      } finally {
        isTargetMapInfoLoading = false
      }
    }

    const updatePlayerNightBonusConfig = () => {
      if (!isSeedPreviewActive()) return
      const nextTargetNightBonusConfig = resolveTargetNightBonusConfigFromStateOrCache({
        target: village,
        fallbackMeta: village
      })
      if (!nextTargetNightBonusConfig) return
      const nextNightBonusConfig = resolveEffectiveNightBonusConfig({
        worldConfig: state.nightBonusConfigWorld,
        targetConfig: nextTargetNightBonusConfig
      })
      const nextTargetNightBonusSignature = buildNightBonusSignature(nextTargetNightBonusConfig)
      const currentTargetNightBonusSignature = buildNightBonusSignature(state.nightBonusConfigTarget)
      const nextEffectiveNightBonusSignature = buildNightBonusSignature(nextNightBonusConfig)
      const currentEffectiveNightBonusSignature = buildNightBonusSignature(state.nightBonusConfig)
      const targetNightBonusChanged = currentTargetNightBonusSignature !== nextTargetNightBonusSignature
      const effectiveNightBonusChanged = currentEffectiveNightBonusSignature !== nextEffectiveNightBonusSignature
      if (!targetNightBonusChanged && !effectiveNightBonusChanged) return
      state.nightBonusConfigTarget = nextTargetNightBonusConfig
      state.nightBonusConfig = nextNightBonusConfig
      updateVillageInfo()
      rerenderPlannerTable()
    }

    const updateWorldConfig = (payload) => {
      const nextSpeed = Number(payload?.config?.speed)
      const nextUnitSpeed = Number(payload?.config?.unit_speed)
      const nextNightRaw = payload?.config?.night
      if (Number.isFinite(nextSpeed) || Number.isFinite(nextUnitSpeed) || nextNightRaw) {
        state.manyToManyWorldConfigCurrent = {
          ...(state.manyToManyWorldConfigCurrent && typeof state.manyToManyWorldConfigCurrent === 'object' ? state.manyToManyWorldConfigCurrent : {}),
          ...(Number.isFinite(nextSpeed) ? { speed: nextSpeed } : {}),
          ...(Number.isFinite(nextUnitSpeed) ? { unit_speed: nextUnitSpeed } : {}),
          ...(nextNightRaw ? { night: { ...nextNightRaw } } : {})
        }
      }
      const nextFakeLimit = Number(payload?.config?.game?.fake_limit)
      const hasFakeLimit = Number.isFinite(nextFakeLimit)
      const nextSnobMaxDistanceRaw = Number(payload?.config?.snob?.max_dist)
      const nextSnobMaxDistance = (
        Number.isFinite(nextSnobMaxDistanceRaw) &&
        nextSnobMaxDistanceRaw > 0
      )
        ? Math.floor(nextSnobMaxDistanceRaw)
        : null
      const nextNightBonusConfigWorld = normalizeNightBonusConfig(payload?.config?.night)
      const nextNightBonusConfig = resolveEffectiveNightBonusConfig({
        worldConfig: nextNightBonusConfigWorld,
        targetConfig: state.nightBonusConfigTarget
      })
      const nextNightBonusSignature = buildNightBonusSignature(nextNightBonusConfig)
      const currentNightBonusSignature = buildNightBonusSignature(state.nightBonusConfig)
      const fakeLimitChanged = hasFakeLimit && state.fakeLimitPercent !== nextFakeLimit
      const snobMaxDistanceChanged = state.snobMaxDistance !== nextSnobMaxDistance
      const nightBonusChanged = currentNightBonusSignature !== nextNightBonusSignature
      if (!fakeLimitChanged && !snobMaxDistanceChanged && !nightBonusChanged) return
      if (hasFakeLimit) state.fakeLimitPercent = nextFakeLimit
      state.snobMaxDistance = nextSnobMaxDistance
      state.nightBonusConfigWorld = nextNightBonusConfigWorld
      state.nightBonusConfig = nextNightBonusConfig
      updateVillageInfo()
      rerenderPlannerTable()
      void ensureTargetMapInfoForNightBonus()
    }

    bringData('tw-apis', { players: [village.playerId], config: ['speed', 'unit_speed', 'snob', 'commands', 'night', 'game'] }, {
      resolveOnPartial: false,
      onPartial: (payload) => {
        updateVillageInfo(payload)
        updatePlayerNightBonusConfig(payload)
        updateWorldConfig(payload)
      },
      onFinal: (payload) => {
        updateVillageInfo(payload)
        updatePlayerNightBonusConfig(payload)
        updateWorldConfig(payload)
      }
    }).catch((error) => {
      console.error('[planner][bringData]', error)
      return null
    })

    const renderDataTitle = (el) => {
      const dataTitle = el.dataset.title
      return dataTitle
    }
    const tooltip = new Tooltip()
    cancelEvents.unbindDatatitle = tooltip.bind(popUpMapPlanner, '[data-title]', renderDataTitle)
    const tooltipDropdown = new Tooltip()
    cancelEvents.unbindDatatitleDropdown = tooltipDropdown.bind(
      document.body,
      '.go-dd [data-title], .go-dd[data-title]',
      renderDataTitle
    )
    const closePopUp = () => {
      document.dispatchEvent(new CustomEvent('go:popup:close', {
        detail: {
          popupId: 'go-popup-map-planner'
        }
      }))
      popUpMapPlanner?.remove()
      popUpBoxClose?.removeEventListener('click', closePopUp)
      Object.keys(cancelEvents).forEach((key) => {
        const handler = cancelEvents[key]
        if (typeof handler === 'function') {
          handler()
          delete cancelEvents[key]
        } else if (handler) {
          delete cancelEvents[key]
        }
      })
      commandCache.clear()
      inFlight.clear()
      dataUnits.clear()
      state.senderVillageByIdCache = null
      state.targetsNavigatorQtyByKey = new Map()
      state.targetsNavigatorMetaByKey = new Map()
      state.targetsNavigatorEnrichSeq = 0
      state.targetsNavigatorSignature = null
      state.targetsNavigatorCurrentTargets = []
      state.targetsNavigatorMapInfoRequestByKey = new Set()
      state.dispatchTargetScope = 'current'
      state.syncDispatchScopeUiCurrent = null
      state.syncTargetsNavigatorTogglePreviewUiCurrent = null
      state.rerenderTargetsNavigatorRowsCurrent = null
      state.syncPlannerLastReportIndicatorUiCurrent = null
      state.syncPlannerTargetCardPreviewCurrent = null
      state.plannerDataCurrent = null
      state.plannerSeedTargetCurrent = null
      state.targetsNavigatorActiveKeyCurrent = null
      state.targetsDraftPersistSignatureCurrent = null
      state.snobMaxDistance = null
      state.manyToManyWorldConfigCurrent = null
      state.nightBonusConfigWorld = null
      state.nightBonusConfigTarget = null
      state.nightBonusConfig = null
      resetPlayerNightMoralState()
      document.dispatchEvent(new CustomEvent('go:planner:close', {
        detail: {
          popupId: 'go-popup-map-planner'
        }
      }))
    }

    bindEsc(closePopUp, cancelEvents)
    popUpBoxClose?.addEventListener('click', closePopUp)
  }
}
