import { printMessage } from '../../components/printMessage'
import { withGroupFix } from '../../groups'

function normalizePlannerTargetListItem(item, index = 0, deps = {}) {
  if (!item) return null
  if (typeof item === 'string') {
    const [xRaw, yRaw] = String(item).split('|')
    const x = Number(xRaw)
    const y = Number(yRaw)
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null
    return { id: null, x, y, index }
  }
  const x = Number(item?.x)
  const y = Number(item?.y)
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null
  const id = Number(item?.id)
  const hasIncomingQty = Object.prototype.hasOwnProperty.call(item, 'qty')
  const hasIncomingSelected = Object.prototype.hasOwnProperty.call(item, 'selected')
  const hasIncomingDispatchStatus = Object.prototype.hasOwnProperty.call(item, 'dispatchStatus')
  return {
    id: Number.isFinite(id) ? id : null,
    x,
    y,
    index,
    ...(hasIncomingQty ? { qty: Math.max(0, Math.floor(Number(item?.qty) || 0)) } : {}),
    ...(hasIncomingSelected ? { selected: Boolean(item?.selected) } : {}),
    ...(hasIncomingDispatchStatus ? {
      dispatchStatus: deps.plannerTargetsDraftCore?.sanitizeDraftDispatchStatus?.(item?.dispatchStatus || null) || null
    } : {}),
    _hasIncomingQty: hasIncomingQty,
    _hasIncomingSelected: hasIncomingSelected,
    _hasIncomingDispatchStatus: hasIncomingDispatchStatus
  }
}

function getIncomingTargetsList(data, deps = {}) {
  const list = Array.isArray(data?.targets)
    ? data.targets.map((item, index) => normalizePlannerTargetListItem(item, index, deps)).filter(Boolean)
    : []
  if (list.length <= 1) return []
  return list
}

export async function filterIncomingTargetsToExistingVillages(data = null, deps = {}) {
  if (deps.DEBUG_DISABLE_TARGETS_VILLAGES_BRIDGE) return { data, changed: false }
  if (!data || typeof data !== 'object') return { data, changed: false }
  const incomingTargets = Array.isArray(data?.targets) ? data.targets : []
  if (incomingTargets.length <= 1) return { data, changed: false }

  const normalizedByIndex = incomingTargets.map((item, index) => normalizePlannerTargetListItem(item, index, deps))
  const normalizedTargets = normalizedByIndex.filter(Boolean)
  if (normalizedTargets.length <= 1) return { data, changed: false }

  const requestedCoords = Array.from(new Set(
    normalizedTargets
      .map((target) => `${Number(target?.x)}|${Number(target?.y)}`)
      .filter((key) => /^\d+\|\d+$/.test(key))
  ))
  if (requestedCoords.length <= 1) return { data, changed: false }

  try {
    const response = await deps.bringData('tw-apis', { villages: requestedCoords }, {
      timeoutMs: 25000,
      resolveOnPartial: false,
      allowLateResponse: false
    })
    const villages = Array.isArray(response?.villages) ? response.villages : []
    const existingCoords = new Set(
      villages
        .map((village) => `${Number(village?.x)}|${Number(village?.y)}`)
        .filter((key) => /^\d+\|\d+$/.test(key))
    )
    if (!existingCoords.size) {
      return {
        data: {
          ...data,
          targets: []
        },
        changed: true
      }
    }

    const filteredTargets = incomingTargets.filter((_, index) => {
      const normalized = normalizedByIndex[index]
      if (!normalized) return false
      const key = `${Number(normalized?.x)}|${Number(normalized?.y)}`
      return existingCoords.has(key)
    })

    const changed = filteredTargets.length !== incomingTargets.length
    return {
      data: changed ? { ...data, targets: filteredTargets } : data,
      changed
    }
  } catch (error) {
    const message = String(error?.message || error || '').toLowerCase()
    if (!message.includes('timeout')) {
      console.warn('[planner][targets][filter-existing]', error)
    }
    return { data, changed: false }
  }
}

function seedTargetsNavigatorStateFromIncomingTargets(targets = [], deps = {}) {
  const state = deps.state
  ;(Array.isArray(targets) ? targets : []).forEach((target) => {
    const key = deps.getTargetListKey(target)
    if (!/^\d+\|\d+$/.test(key)) return

    if (target?._hasIncomingQty) {
      state.targetsNavigatorQtyByKey.set(key, Math.max(0, Math.floor(Number(target?.qty) || 0)))
    }

    if (target?._hasIncomingSelected) {
      if (target?.selected) state.targetsNavigatorSelectedKeys.add(key)
      else state.targetsNavigatorSelectedKeys.delete(key)
    }

    if (target?._hasIncomingDispatchStatus) {
      const prev = state.targetsNavigatorMetaByKey.get(key) || {}
      state.targetsNavigatorMetaByKey.set(key, {
        ...prev,
        dispatchStatus: deps.plannerTargetsDraftCore?.sanitizeDraftDispatchStatus?.(target?.dispatchStatus || null) || null
      })
    }
  })
}

function calcTargetsNavigatorTotalQty(targets = [], deps = {}) {
  const state = deps.state
  return targets.reduce((sum, target) => {
    const key = deps.getTargetListKey(target)
    const qty = Number(state.targetsNavigatorQtyByKey.get(key) ?? 0)
    return sum + (Number.isFinite(qty) ? Math.max(0, Math.floor(qty)) : 0)
  }, 0)
}

function calcTargetsNavigatorSelectedCount(targets = [], deps = {}) {
  const state = deps.state
  return targets.reduce((sum, target) => {
    const key = deps.getTargetListKey(target)
    return sum + (state.targetsNavigatorSelectedKeys.has(key) ? 1 : 0)
  }, 0)
}

function pruneTargetsNavigatorSelectedKeys(targets = [], deps = {}) {
  const state = deps.state
  const keys = new Set(targets.map(deps.getTargetListKey))
  state.targetsNavigatorSelectedKeys.forEach((key) => {
    if (!keys.has(key)) state.targetsNavigatorSelectedKeys.delete(key)
  })
}

function renderTargetsNavigatorRowContent(target, meta, deps = {}) {
  const escapeHtml = (value) => String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
  const gameData = (() => {
    try {
      return deps.getGameData()
    } catch (_) {
      return null
    }
  })()
  const activeVillageId = Number(gameData?.village?.id || window?.game_data?.village?.id)
  const targetVillageId = Number(target?.id)
  const village = meta?.village || null
  const player = meta?.player || null
  const ally = meta?.ally || null
  const x = Number(target?.x)
  const y = Number(target?.y)
  const k = deps.calcContinentFromCoords(x, y)
  const villageName = String(village?.name || target?.name || '---').trim() || '---'
  const villageCoordText = `(${x}|${y})${Number.isFinite(k) ? ` K${k}` : ''}`
  const villageHref = (
    Number.isFinite(activeVillageId) && activeVillageId > 0
    && Number.isFinite(targetVillageId) && targetVillageId > 0
  )
    ? withGroupFix(`/game.php?village=${Math.floor(activeVillageId)}&screen=info_village&id=${Math.floor(targetVillageId)}`)
    : ''
  const villagePoints = village?.points
  const reservation = meta?.reservation || null
  const morale = Number(meta?.morale)
  const nightBonusLabel = String(meta?.nightBonusLabel || '').trim()
  const bonusId = Number(village?.bonusId ?? village?.bonus_id ?? target?.bonusId)
  const hasBonus = Number.isFinite(bonusId) && bonusId > 0
  const villageTitle = [
    villageName,
    Number(villagePoints) > 0 ? `Pontos: ${deps.formatPtBrInt(villagePoints)}` : ''
  ].filter(Boolean).join('<br>')
  const ownerTitle = player
    ? [
      player?.name || '---',
      `(${deps.formatPtBrInt(player?.rank)}.|${deps.formatPtBrInt(player?.points)} P|${deps.formatPtBrInt(player?.villages)} V)`,
      (Number.isFinite(morale) && morale > 0) ? `Moral: ${Math.round(morale)}%` : '',
      nightBonusLabel ? `BN: ${nightBonusLabel}` : ''
    ].filter(Boolean).join('<br>')
    : [
      '---',
      (Number.isFinite(morale) && morale > 0) ? `Moral: ${Math.round(morale)}%` : '',
      nightBonusLabel ? `BN: ${nightBonusLabel}` : ''
    ].filter(Boolean).join('<br>')
  const allyTitle = ally
    ? [
      ally?.name || '---',
      `${ally?.tag || ''} (${deps.formatPtBrInt(ally?.rank)}.|${deps.formatPtBrInt(ally?.all_points)}P)`
    ].filter(Boolean).join('<br>')
    : ''
  const dispatchStatus = (meta?.dispatchStatus && typeof meta.dispatchStatus === 'object') ? meta.dispatchStatus : null
  const requestedQty = Math.max(0, Math.floor(Number(dispatchStatus?.requestedQty) || 0))
  const distributedQty = Math.max(0, Math.floor(Number(dispatchStatus?.distributedQty) || 0))
  const remainingQty = Math.max(0, Math.floor(Number(dispatchStatus?.remainingQty) || 0))
  const sendOkQty = Math.max(0, Math.floor(Number(dispatchStatus?.sendOkQty) || 0))
  const sendFailQty = Math.max(0, Math.floor(Number(dispatchStatus?.sendFailQty) || 0))
  const sendPendingQty = Math.max(0, Math.floor(Number(dispatchStatus?.sendPendingQty) || 0))
  const retryQty = Math.max(0, Math.floor(Number(dispatchStatus?.retryQty) || 0))
  const bnBlockedCount = Math.max(0, Math.floor(Number(dispatchStatus?.bnBlockedCount) || 0))
  const hasDispatchStatus = [requestedQty, distributedQty, remainingQty, sendOkQty, sendFailQty, sendPendingQty, retryQty, bnBlockedCount].some((v) => v > 0)
  const dispatchStatusFormatted = hasDispatchStatus
    ? deps.formatDispatchDiagnosticsItemLocal(deps.buildDispatchDiagnosticsFormatItemFromStatus({
      target,
      requestedQty,
      distributedQty,
      remainingQty,
      sendOkQty,
      sendFailQty,
      sendPendingQty,
      retryQty,
      bnBlockedCount,
      diagnostics: dispatchStatus?.diagnostics
    }))
    : null
  const dispatchStatusTitle = String(dispatchStatusFormatted?.formatted?.titleHtml || '').trim()
  const dispatchStatusBadgeVariant = String(dispatchStatusFormatted?.formatted?.badgeVariant || '').trim() || 'ok'
  const dispatchStatusBadgeLabel = String(dispatchStatusFormatted?.formatted?.badgeLabel || '').trim()
  const dispatchStatusHtml = hasDispatchStatus && dispatchStatusBadgeLabel
    ? `<div class="go-targets-nav-item-status is-inline" ${dispatchStatusTitle ? `data-title="${dispatchStatusTitle}"` : ''}>
      <span class="go-targets-status-badge is-${escapeHtml(dispatchStatusBadgeVariant)}">${escapeHtml(dispatchStatusBadgeLabel)}</span>
    </div>`
    : ''
  return {
    bodyHtml: `
      <div class="go-targets-nav-item-main">
        <div class="go-targets-nav-item-name" ${villageTitle ? `data-title="${villageTitle}"` : ''}>
          ${villageHref
            ? `<a class="go-targets-nav-item-name-link go-name-ellipsis" href="${villageHref}">${escapeHtml(villageName)}</a>`
            : `<span class="go-targets-nav-item-name-link go-name-ellipsis">${escapeHtml(villageName)}</span>`
          }
          <span class="go-targets-nav-item-coord">${escapeHtml(villageCoordText)}</span>
          ${hasBonus ? `<span class="bonus_icon bonus_icon_${bonusId}"></span>` : ''}
          ${reservation ? '<span class="go-target-reservation-lock icon header reserve" aria-label="Reserva ativa"></span>' : ''}
        </div>
      </div>
      <div class="go-targets-nav-item-meta-row">
        <div class="go-targets-nav-item-line go-targets-nav-item-owner" ${ownerTitle ? `data-title="${ownerTitle}"` : ''}>
          <strong>Prop:</strong> <span class="go-name-ellipsis">${player?.name || '---'}</span>
        </div>
        <div class="go-targets-nav-item-line go-targets-nav-item-tribe" ${allyTitle ? `data-title="${allyTitle}"` : ''}>
          <strong>Tribo:</strong> <span class="go-name-ellipsis">${ally?.name || '---'}</span>
        </div>
      </div>
    `,
    dispatchStatusHtml
  }
}

function applyTargetsNavigatorRows(listEl, targets, options = {}, deps = {}) {
  const state = deps.state
  if (!listEl) return
  const currentX = Number(options?.currentX)
  const currentY = Number(options?.currentY)
  const previewIndex = Number(options?.previewIndex)
  const indexByKey = options?.indexByKey instanceof Map ? options.indexByKey : null
  const frag = document.createDocumentFragment()
  targets.forEach((target, idx) => {
    const key = deps.getTargetListKey(target)
    const targetIndex = Number(indexByKey?.get(key))
    const meta = state.targetsNavigatorMetaByKey.get(key) || null
    const row = document.createElement('div')
    row.className = 'go-targets-multi-item'
    row.setAttribute('data-target-index', String(Number.isFinite(targetIndex) ? targetIndex : idx))
    row.setAttribute('data-target-key', key)
    if (target.x === currentX && target.y === currentY) row.classList.add('is-current')
    if ((Number.isFinite(targetIndex) ? targetIndex : idx) === previewIndex) row.classList.add('is-preview')

    const selectWrap = document.createElement('div')
    selectWrap.className = 'go-targets-nav-item-select'
    const selectInput = document.createElement('input')
    selectInput.type = 'checkbox'
    selectInput.className = 'go-targets-nav-select-input'
    selectInput.checked = state.targetsNavigatorSelectedKeys.has(key)
    selectInput.setAttribute('data-select-target-key', key)
    selectInput.setAttribute('aria-label', `Selecionar target ${target.x}|${target.y}`)
    selectWrap.insertAdjacentElement('beforeend', selectInput)

    const qtyWrap = document.createElement('div')
    qtyWrap.className = 'go-targets-nav-item-qty'
    const qtyInput = document.createElement('input')
    qtyInput.type = 'number'
    qtyInput.min = '0'
    qtyInput.step = '1'
    qtyInput.inputMode = 'numeric'
    qtyInput.className = 'go-targets-nav-qty-input'
    qtyInput.value = String(state.targetsNavigatorQtyByKey.get(key) ?? 0)
    qtyInput.setAttribute('data-qty-target-key', key)
    qtyInput.setAttribute('aria-label', `Quantidade de ataques para ${target.x}|${target.y}`)
    qtyWrap.insertAdjacentElement('beforeend', qtyInput)

    const removeWrap = document.createElement('div')
    removeWrap.className = 'go-targets-nav-item-remove'
    const removeBtn = document.createElement('img')
    removeBtn.src = 'https://dsbr.innogamescdn.com/asset/98f3b7c4/graphic/delete_14.png'
    removeBtn.alt = 'Excluir target'
    removeBtn.className = 'go-targets-nav-remove-btn go-dd-delete'
    removeBtn.setAttribute('data-remove-target-key', key)
    removeBtn.setAttribute('data-remove-target-index', String(Number.isFinite(targetIndex) ? targetIndex : idx))
    removeBtn.setAttribute('data-title', 'Excluir target da lista')
    if ((Number.isFinite(targetIndex) ? targetIndex : idx) === previewIndex) {
      removeBtn.setAttribute('aria-disabled', 'true')
      removeBtn.setAttribute('data-title', 'Não é possível excluir o target atual')
    }
    removeWrap.insertAdjacentElement('beforeend', removeBtn)

    const rowContent = renderTargetsNavigatorRowContent(target, meta, deps)

    const body = document.createElement('div')
    body.className = 'go-targets-nav-item-grid'
    body.innerHTML = rowContent.bodyHtml

    const statusWrap = document.createElement('div')
    statusWrap.className = 'go-targets-nav-item-status-wrap'
    if (rowContent.dispatchStatusHtml) {
      statusWrap.innerHTML = rowContent.dispatchStatusHtml
    } else {
      statusWrap.classList.add('is-empty')
    }

    row.insertAdjacentElement('beforeend', body)
    row.insertAdjacentElement('beforeend', statusWrap)
    row.insertAdjacentElement('beforeend', selectWrap)
    row.insertAdjacentElement('beforeend', qtyWrap)
    row.insertAdjacentElement('beforeend', removeWrap)
    frag.appendChild(row)
  })
  listEl.replaceChildren(frag)
}

function scheduleTargetsNavigatorEnrichment(targets, listEl, getPreviewIndex, getCurrentTarget, deps = {}) {
  const state = deps.state
  if (deps.DEBUG_DISABLE_TARGETS_VILLAGES_BRIDGE) return
  const coords = targets.map((t) => `${t.x}|${t.y}`)
  const signature = coords.join(',')
  if (!coords.length) return
  const hasVillageMetaForAllTargets = targets.every((target) => {
    const key = deps.getTargetListKey(target)
    return Boolean(state.targetsNavigatorMetaByKey.get(key)?.village)
  })
  if (state.targetsNavigatorSignature === signature && hasVillageMetaForAllTargets) {
    applyTargetsNavigatorRows(listEl, targets, {
      previewIndex: getPreviewIndex?.(),
      currentX: getCurrentTarget?.()?.x,
      currentY: getCurrentTarget?.()?.y
    }, deps)
    const previewIndex = Number(getPreviewIndex?.())
    const preview = targets[Number.isFinite(previewIndex) ? previewIndex : 0] || targets[0] || null
    const previewMeta = preview ? (state.targetsNavigatorMetaByKey.get(deps.getTargetListKey(preview)) || null) : null
    state.syncPlannerTargetCardPreviewCurrent?.({
      target: preview,
      meta: previewMeta,
      index: Number.isFinite(previewIndex) ? previewIndex : 0,
      total: targets.length,
      source: 'enrich-cache'
    })
  }

  state.targetsNavigatorSignature = signature
  const seq = (state.targetsNavigatorEnrichSeq || 0) + 1
  state.targetsNavigatorEnrichSeq = seq
  const setInitialLoadingUi = (active) => {
    if (!listEl?.classList) return
    listEl.classList.toggle('is-targets-meta-loading', Boolean(active))
  }
  const shouldStartInLoadingState = !hasVillageMetaForAllTargets
  setInitialLoadingUi(shouldStartInLoadingState)
  let ownersFallbackRequested = false

  const fetchOwnersFallback = async (villages = []) => {
    try {
      if (seq !== state.targetsNavigatorEnrichSeq) return
      const playerIds = Array.from(new Set(
        villages
          .map((village) => Number(village?.playerId))
          .filter((id) => Number.isFinite(id) && id > 0)
      ))
      if (!playerIds.length) return

      const playersResponse = await deps.bringData('tw-apis', { players: playerIds }, {
        resolveOnPartial: false,
        allowLateResponse: false
      })
      if (seq !== state.targetsNavigatorEnrichSeq) return

      const players = Array.isArray(playersResponse?.players) ? playersResponse.players : []
      const allyIds = Array.from(new Set(
        players
          .map((player) => Number(player?.allyId))
          .filter((id) => Number.isFinite(id) && id > 0)
      ))

      let allys = []
      if (allyIds.length) {
        const allysResponse = await deps.bringData('tw-apis', { allys: allyIds }, {
          resolveOnPartial: false,
          allowLateResponse: false
        })
        if (seq !== state.targetsNavigatorEnrichSeq) return
        allys = Array.isArray(allysResponse?.allys) ? allysResponse.allys : []
      }

      apply({ villages, players, allys }, { isFinal: false })
    } catch (error) {
      console.warn('[planner][targets][owners-fallback]', error)
    }
  }

  const apply = (payload = {}, { isFinal = false } = {}) => {
    if (seq !== state.targetsNavigatorEnrichSeq) return
    const villages = Array.isArray(payload?.villages) ? payload.villages : []
    const players = Array.isArray(payload?.players) ? payload.players : []
    const allys = Array.isArray(payload?.allys) ? payload.allys : []
    if (isFinal || villages.length || players.length || allys.length) {
      setInitialLoadingUi(false)
    }
    if (
      !ownersFallbackRequested
      && villages.length
      && !players.length
      && !allys.length
      && villages.some((village) => Number(village?.playerId) > 0)
    ) {
      ownersFallbackRequested = true
      void fetchOwnersFallback(villages)
    }
    if (isFinal && Array.isArray(targets) && targets.length > 1) {
      const existingCoordSet = new Set(
        villages
          .map((village) => `${Number(village?.x)}|${Number(village?.y)}`)
          .filter((key) => /^\d+\|\d+$/.test(key))
      )
      if (existingCoordSet.size > 0) {
        const filteredTargets = targets.filter((target) => existingCoordSet.has(deps.getTargetListKey(target)))
        if (filteredTargets.length !== targets.length) {
          const invalidCoords = targets
            .map((target) => deps.getTargetListKey(target))
            .filter((coord) => !existingCoordSet.has(coord))
          const removedCount = Math.max(0, invalidCoords.length)
          if (removedCount > 0) {
            const previewLines = invalidCoords.slice(0, 5).map((coord) => `${coord}: coordenada não existe`)
            const moreLine = removedCount > 5 ? `<br>+${removedCount - 5} coordenada(s)` : ''
            printMessage.warn(
              `${removedCount} coordenada(s) ignorada(s) (não existem no mundo).<br>${previewLines.join('<br>')}${moreLine}`,
              4000
            )
          }
          const targetContent = listEl?.closest?.('#go-target-content')
          const currentTarget = getCurrentTarget?.() || null
          if (targetContent) {
            insertTargetsAccordion(targetContent, {
              x: Number(currentTarget?.x),
              y: Number(currentTarget?.y),
              targets: filteredTargets
            }, deps)
            return
          }
        }
      }
    }
    const playerById = new Map(players.map((p) => [Number(p?.id), p]))
    const allyById = new Map(allys.map((a) => [Number(a?.id), a]))
    villages.forEach((village) => {
      const key = `${Number(village?.x)}|${Number(village?.y)}`
      if (!/^\d+\|\d+$/.test(key)) return
      const player = playerById.get(Number(village?.playerId)) || null
      const ally = player ? (allyById.get(Number(player?.allyId)) || null) : null
      const prev = state.targetsNavigatorMetaByKey.get(key) || {}
      state.targetsNavigatorMetaByKey.set(key, {
        ...prev,
        village,
        player,
        ally
      })
    })
    applyTargetsNavigatorRows(listEl, targets, {
      previewIndex: getPreviewIndex?.(),
      currentX: getCurrentTarget?.()?.x,
      currentY: getCurrentTarget?.()?.y
    }, deps)
    const previewIndex = Number(getPreviewIndex?.())
    const preview = targets[Number.isFinite(previewIndex) ? previewIndex : 0] || targets[0] || null
    const previewMeta = preview ? (state.targetsNavigatorMetaByKey.get(deps.getTargetListKey(preview)) || null) : null
    state.syncPlannerTargetCardPreviewCurrent?.({
      target: preview,
      meta: previewMeta,
      index: Number.isFinite(previewIndex) ? previewIndex : 0,
      total: targets.length,
      source: 'enrich-apply'
    })
    if (deps.getNightActiveModeFromWorldConfig() === 2) {
      void deps.prefetchPlayerNightMoralStateForTargets(targets).then(() => {
        if (seq !== state.targetsNavigatorEnrichSeq) return
        state.rerenderTargetsNavigatorRowsCurrent?.()
      }).catch((error) => {
        console.error('[planner][targets][prefetch-player-night]', error)
      })
    }
  }

  deps.bringData('tw-apis', { villages: coords, expandOwners: true }, {
    resolveOnPartial: false,
    onPartial: (payload) => apply(payload, { isFinal: false }),
    onFinal: (payload) => apply(payload, { isFinal: true })
  }).catch((error) => {
    setInitialLoadingUi(false)
    console.error('[planner][targets][bringData]', error)
  })
}

export function insertTargetsAccordion(targetContent, data, deps = {}) {
  const state = deps.state
  const cancelEvents = deps.cancelEvents || {}
  if (!targetContent) return
  cancelEvents.cancelTargetsNavigatorOutside?.()
  cancelEvents.cancelTargetsNavigatorOutside = null
  state.syncTargetsNavigatorTogglePreviewUiCurrent = null
  state.rerenderTargetsNavigatorRowsCurrent = null
  targetContent.querySelector('.go-targets-multi')?.remove()

  const targets = getIncomingTargetsList(data, deps)
  state.targetsNavigatorCurrentTargets = targets
  seedTargetsNavigatorStateFromIncomingTargets(targets, deps)
  const hasMultiTargets = targets.length > 1
  if (!hasMultiTargets) {
    deps.setDispatchTargetScope('current')
  } else {
    deps.applyDispatchTargetScopeDefaultForTargetsList()
  }

  const currentX = Number(data?.x)
  const currentY = Number(data?.y)
  const currentIndex = Math.max(0, targets.findIndex((t) => t.x === currentX && t.y === currentY))
  const savedActiveKey = String(state.targetsNavigatorActiveKeyCurrent || '').trim()
  const savedActiveIndex = savedActiveKey
    ? targets.findIndex((t) => deps.getTargetListKey(t) === savedActiveKey)
    : -1
  let previewIndex = savedActiveIndex >= 0 ? savedActiveIndex : currentIndex
  pruneTargetsNavigatorSelectedKeys(targets, deps)

  const wrap = document.createElement('div')
  wrap.className = 'go-targets-multi'
  wrap.innerHTML = `
    <div class="go-targets-multi-nav">
      <div class="go-targets-multi-nav-cluster">
        <button type="button" class="go-targets-multi-nav-btn" data-targets-first aria-label="Primeiro target">«</button>
        <button type="button" class="go-targets-multi-nav-btn" data-targets-prev aria-label="Target anterior">‹</button>
        <span class="go-targets-multi-page" data-targets-page></span>
        <button type="button" class="go-targets-multi-nav-btn" data-targets-next aria-label="Próximo target">›</button>
        <button type="button" class="go-targets-multi-nav-btn" data-targets-last aria-label="Último target">»</button>
      </div>
      <button type="button" class="go-targets-multi-scope-btn" data-dispatch-scope-selector="multi" aria-label="Usar todos os alvos">
        <input type="radio" class="go-dispatch-scope-native-radio" name="go-dispatch-scope" tabindex="-1" aria-hidden="true">
        <span class="go-targets-multi-toggle-current" data-targets-current>Todos os Alvos</span>
        <span class="go-targets-multi-toggle-side">
          <span class="go-targets-multi-toggle-badge" data-targets-preview-inline data-title="Preview"></span>
          <span class="go-targets-multi-toggle-total" data-targets-total-inline></span>
        </span>
      </button>
      <button type="button" class="go-targets-multi-nav-btn go-targets-multi-list-btn" data-targets-toggle aria-label="Abrir/fechar lista de targets">
        <span class="go-targets-multi-chevron" data-targets-chevron>▾</span>
      </button>
    </div>
    <div class="go-targets-multi-list" data-targets-list hidden>
      <div class="go-targets-multi-list-tools">
        <div class="go-targets-multi-list-tools-left">
          <span class="go-targets-multi-list-tools-filter-icon go-filter-btn" aria-hidden="true"></span>
          <select class="go-targets-multi-list-tools-filter" data-targets-filter-owner aria-label="Filtrar por proprietário">
            <option value="">Prop: todos</option>
          </select>
          <select class="go-targets-multi-list-tools-filter" data-targets-filter-ally aria-label="Filtrar por tribo">
            <option value="">Tribo: todas</option>
          </select>
        </div>
        <div class="go-targets-multi-list-tools-right">
          <button type="button" class="go-targets-multi-list-tools-retry" data-targets-retry-diff data-title="Preencher qty com a diferença (faltou + erro envio)">Refazer Dif.</button>
          <button type="button" class="go-targets-multi-list-tools-apply" data-targets-global-apply>Aplicar</button>
          <label class="go-targets-multi-list-tools-check" data-go-title="Selecionar todos os alvos">
            <input type="checkbox" data-targets-select-all aria-label="Selecionar todos os alvos">
          </label>
          <input
            id="go-targets-global-qty"
            type="number"
            min="0"
            step="1"
            inputmode="numeric"
            class="go-targets-multi-list-tools-input"
            data-targets-global-qty
            value="0"
            aria-label="Quantidade de ataques para aplicar nos alvos selecionados"
          >
          <img
            src="https://dsbr.innogamescdn.com/asset/98f3b7c4/graphic/delete_14.png"
            alt="Excluir alvos selecionados"
            class="go-targets-multi-list-tools-delete go-dd-delete"
            data-targets-remove-selected
            data-title="Excluir alvos selecionados"
          >
        </div>
      </div>
      <div class="go-targets-multi-list-items" data-targets-list-items></div>
    </div>
  `

  const listPanelEl = wrap.querySelector('[data-targets-list]')
  const listEl = wrap.querySelector('[data-targets-list-items]')
  const pageEl = wrap.querySelector('[data-targets-page]')
  const currentLabelEl = wrap.querySelector('[data-targets-current]')
  const previewInlineEl = wrap.querySelector('[data-targets-preview-inline]')
  const totalInlineEl = wrap.querySelector('[data-targets-total-inline]')
  const multiScopeBtn = wrap.querySelector('[data-dispatch-scope-selector="multi"]')
  const ownerFilterEl = wrap.querySelector('[data-targets-filter-owner]')
  const allyFilterEl = wrap.querySelector('[data-targets-filter-ally]')
  const selectAllEl = wrap.querySelector('[data-targets-select-all]')
  const globalQtyInputEl = wrap.querySelector('[data-targets-global-qty]')
  const globalQtyApplyEl = wrap.querySelector('[data-targets-global-apply]')
  const retryDiffEl = wrap.querySelector('[data-targets-retry-diff]')
  const removeSelectedEl = wrap.querySelector('[data-targets-remove-selected]')
  const firstBtn = wrap.querySelector('[data-targets-first]')
  const prevBtn = wrap.querySelector('[data-targets-prev]')
  const nextBtn = wrap.querySelector('[data-targets-next]')
  const lastBtn = wrap.querySelector('[data-targets-last]')
  const targetsListFilters = {
    owner: '',
    ally: ''
  }
  const getTargetOwnerFilterLabel = (target) => {
    const meta = state.targetsNavigatorMetaByKey.get(deps.getTargetListKey(target)) || null
    return String(meta?.player?.name || meta?.village?.player_name || '---').trim() || '---'
  }
  const getTargetAllyFilterLabel = (target) => {
    const meta = state.targetsNavigatorMetaByKey.get(deps.getTargetListKey(target)) || null
    return String(meta?.ally?.name || '---').trim() || '---'
  }
  const getFilteredTargets = () => targets.filter((target) => {
    const ownerLabel = getTargetOwnerFilterLabel(target)
    const allyLabel = getTargetAllyFilterLabel(target)
    if (targetsListFilters.owner && ownerLabel !== targetsListFilters.owner) return false
    if (targetsListFilters.ally && allyLabel !== targetsListFilters.ally) return false
    return true
  })
  const syncTargetFiltersUi = () => {
    const ownerPrevValue = String(ownerFilterEl?.value || '')
    const allyPrevValue = String(allyFilterEl?.value || '')
    const ownerOptions = Array.from(new Set(targets.map((target) => getTargetOwnerFilterLabel(target)))).sort((a, b) => a.localeCompare(b, 'pt-BR'))
    const allyOptions = Array.from(new Set(targets.map((target) => getTargetAllyFilterLabel(target)))).sort((a, b) => a.localeCompare(b, 'pt-BR'))
    if (ownerFilterEl) {
      ownerFilterEl.replaceChildren()
      const allOption = document.createElement('option')
      allOption.value = ''
      allOption.textContent = 'Prop: todos'
      ownerFilterEl.appendChild(allOption)
      ownerOptions.forEach((label) => {
        const option = document.createElement('option')
        option.value = label
        option.textContent = `Prop: ${label}`
        ownerFilterEl.appendChild(option)
      })
      ownerFilterEl.value = ownerOptions.includes(targetsListFilters.owner) ? targetsListFilters.owner : ''
      if (!ownerFilterEl.value && ownerOptions.includes(ownerPrevValue)) ownerFilterEl.value = ownerPrevValue
      targetsListFilters.owner = ownerFilterEl.value
    }
    if (allyFilterEl) {
      allyFilterEl.replaceChildren()
      const allOption = document.createElement('option')
      allOption.value = ''
      allOption.textContent = 'Tribo: todas'
      allyFilterEl.appendChild(allOption)
      allyOptions.forEach((label) => {
        const option = document.createElement('option')
        option.value = label
        option.textContent = `Tribo: ${label}`
        allyFilterEl.appendChild(option)
      })
      allyFilterEl.value = allyOptions.includes(targetsListFilters.ally) ? targetsListFilters.ally : ''
      if (!allyFilterEl.value && allyOptions.includes(allyPrevValue)) allyFilterEl.value = allyPrevValue
      targetsListFilters.ally = allyFilterEl.value
    }
  }
  const syncTargetsListScrollbarOffset = () => {
    if (!listEl) return
    const scrollbarWidth = Math.max(0, (listEl.offsetWidth || 0) - (listEl.clientWidth || 0))
    wrap.style.setProperty('--go-targets-list-scrollbar-width', `${scrollbarWidth}px`)
  }
  const rerenderTargetsList = () => {
    const filteredTargets = getFilteredTargets()
    const indexByKey = new Map(targets.map((target, index) => [deps.getTargetListKey(target), index]))
    applyTargetsNavigatorRows(listEl, filteredTargets, {
      previewIndex,
      currentX,
      currentY,
      indexByKey
    }, deps)
    syncTargetsListScrollbarOffset()
  }
  syncTargetFiltersUi()
  rerenderTargetsList()

  const toggleBtn = wrap.querySelector('[data-targets-toggle]')
  const chevron = wrap.querySelector('[data-targets-chevron]')
  const syncTargetsTogglePreviewUi = () => {
    const { totalSelectableRows, selectedSelectableCount } = deps.getSendersSelectablePreviewState()
    const totalTargets = targets.length
    const villagesPerTarget = totalTargets > 0 ? Math.floor(totalSelectableRows / totalTargets) : 0
    const remainingVillages = totalTargets > 0 ? (totalSelectableRows % totalTargets) : 0
    const totalCommands = Math.max(0, Math.floor(Number(totalInlineEl?.textContent || 0) || 0))
    const dispatchSummary = targets.reduce((acc, target) => {
      const status = deps.getTargetDispatchStatus(target)
      if (!status) return acc
      acc.hasDispatchStatus = true
      acc.totalCommands += Math.max(0, Math.floor(Number(status?.requestedQty) || 0))
      acc.sent += Math.max(0, Math.floor(Number(status?.sendOkQty) || 0))
      acc.errors += Math.max(0, Math.floor(Number(status?.retryQty) || 0))
      const normalized = deps.formatDispatchDiagnosticsItemLocal(deps.buildDispatchDiagnosticsFormatItemFromStatus({
        target,
        requestedQty: Math.max(0, Math.floor(Number(status?.requestedQty) || 0)),
        distributedQty: Math.max(0, Math.floor(Number(status?.distributedQty) || 0)),
        remainingQty: Math.max(0, Math.floor(Number(status?.remainingQty) || 0)),
        sendOkQty: Math.max(0, Math.floor(Number(status?.sendOkQty) || 0)),
        sendFailQty: Math.max(0, Math.floor(Number(status?.sendFailQty) || 0)),
        sendPendingQty: Math.max(0, Math.floor(Number(status?.sendPendingQty) || 0)),
        retryQty: Math.max(0, Math.floor(Number(status?.retryQty) || 0)),
        bnBlockedCount: Math.max(0, Math.floor(Number(status?.bnBlockedCount) || 0)),
        diagnostics: status?.diagnostics
      }))
      if (String(normalized?.formatted?.badgeVariant || '') === 'partial') {
        acc.warnings += 1
      }
      return acc
    }, {
      hasDispatchStatus: false,
      totalCommands: 0,
      sent: 0,
      errors: 0,
      warnings: 0
    })
    if (currentLabelEl) {
      currentLabelEl.textContent = 'Todos os Alvos'
    }
    if (previewInlineEl) {
      const hasDispatchStatus = Boolean(dispatchSummary.hasDispatchStatus)
      const diffCount = Math.max(0, dispatchSummary.totalCommands - dispatchSummary.sent)
      previewInlineEl.textContent = hasDispatchStatus ? `${diffCount}` : ''
      previewInlineEl.hidden = !hasDispatchStatus
      if (hasDispatchStatus) {
        previewInlineEl.setAttribute(
          'data-title',
          [
            `Total: ${dispatchSummary.totalCommands}`,
            `Enviados: ${dispatchSummary.sent}`,
            `Diferenças: ${diffCount}`,
            dispatchSummary.warnings > 0 ? `Atenção: ${dispatchSummary.warnings}` : ''
          ].filter(Boolean).join('<br>')
        )
      } else {
        previewInlineEl.removeAttribute('data-title')
      }
      previewInlineEl.classList.toggle('is-danger', hasDispatchStatus && diffCount > 0)
      if (pageEl) {
        pageEl.setAttribute(
          'data-title',
          [
            'Preview:',
            `${totalSelectableRows}/${totalTargets} = ${villagesPerTarget} (vilas/alvo)`,
            `Sobra ${remainingVillages} vila${remainingVillages === 1 ? '' : 's'}`
          ].filter(Boolean).join('<br>')
        )
      }
    }
    if (totalInlineEl) {
      const isZeroCommands = totalCommands <= 0
      const exceedsSelected = totalCommands > selectedSelectableCount
      totalInlineEl.setAttribute(
        'data-title',
        [
          `Total de comandos: ${totalCommands}`,
          `Vilas selecionadas: ${selectedSelectableCount}`
        ].filter(Boolean).join('<br>')
      )
      totalInlineEl.classList.toggle('is-danger', isZeroCommands || exceedsSelected)
      totalInlineEl.classList.remove('is-warn')
      totalInlineEl.classList.remove('is-success')
    }
    if (multiScopeBtn) {
      multiScopeBtn.disabled = !hasMultiTargets
      multiScopeBtn.setAttribute(
        'data-title',
        hasMultiTargets
          ? 'Usa a lista de alvos e quantidades (qty > 0)'
          : 'Disponível quando houver lista de alvos'
      )
    }
    if (toggleBtn) {
      toggleBtn.disabled = !hasMultiTargets
      toggleBtn.setAttribute(
        'data-title',
        hasMultiTargets
          ? (wrap.classList.contains('is-open') ? 'Ocultar lista de alvos' : 'Mostrar lista de alvos')
          : 'Disponível quando houver lista de alvos'
      )
    }
  }
  state.syncTargetsNavigatorTogglePreviewUiCurrent = syncTargetsTogglePreviewUi
  const syncPreviewUi = () => {
    let effectivePreviewIndex = previewIndex
    let preview = targets[effectivePreviewIndex] || targets[0]
    if (preview) {
      const previewHasId = Number.isFinite(Number(preview?.id)) && Number(preview?.id) > 0
      if (!previewHasId && targets.length > 1) {
        for (let step = 1; step < targets.length; step += 1) {
          const nextIdx = (effectivePreviewIndex + step) % targets.length
          const nextTarget = targets[nextIdx]
          const nextHasId = Number.isFinite(Number(nextTarget?.id)) && Number(nextTarget?.id) > 0
          if (nextHasId) {
            effectivePreviewIndex = nextIdx
            previewIndex = nextIdx
            preview = nextTarget
            break
          }
        }
      }
    }
    state.targetsNavigatorActiveKeyCurrent = preview ? deps.getTargetListKey(preview) : null
    const previewMeta = preview ? (state.targetsNavigatorMetaByKey.get(deps.getTargetListKey(preview)) || null) : null
    if (pageEl && preview) {
      pageEl.innerHTML = `
        <span class="go-targets-multi-page-current">${effectivePreviewIndex + 1}</span>
        <span class="go-targets-multi-page-sep">/</span>
        <span class="go-targets-multi-page-total">${targets.length}</span>
      `
    }
    const totalQty = calcTargetsNavigatorTotalQty(targets, deps)
    const selectedCount = calcTargetsNavigatorSelectedCount(targets, deps)
    const visibleTargets = getFilteredTargets()
    const selectedVisibleCount = visibleTargets.reduce((sum, target) => {
      const key = deps.getTargetListKey(target)
      return sum + (state.targetsNavigatorSelectedKeys.has(key) ? 1 : 0)
    }, 0)
    if (totalInlineEl) totalInlineEl.textContent = `${totalQty}`
    if (selectAllEl) {
      selectAllEl.checked = !!visibleTargets.length && selectedVisibleCount === visibleTargets.length
      selectAllEl.indeterminate = selectedVisibleCount > 0 && selectedVisibleCount < visibleTargets.length
      selectAllEl.disabled = !hasMultiTargets || !visibleTargets.length
    }
    if (removeSelectedEl) {
      const enabled = hasMultiTargets && selectedVisibleCount > 0
      removeSelectedEl.style.opacity = enabled ? '1' : '.4'
      removeSelectedEl.style.pointerEvents = enabled ? 'auto' : 'none'
      removeSelectedEl.setAttribute(
        'data-title',
        enabled
          ? 'Excluir selecionadas'
          : 'Selecione alvos para excluir'
      )
    }
    if (globalQtyApplyEl) {
      const enabled = hasMultiTargets && selectedVisibleCount > 0
      globalQtyApplyEl.disabled = !enabled
      globalQtyApplyEl.classList.toggle('is-disabled', !enabled)
      globalQtyApplyEl.setAttribute(
        'data-title',
        enabled
          ? 'Aplicar a quantidade nas selecionadas'
          : 'Selecione alvos para aplicar'
      )
    }
    if (retryDiffEl) {
      const hasRetry = hasMultiTargets && targets.some((target) => {
        const retryQty = deps.getTargetRetryQtyFromDispatchStatus(deps.getTargetDispatchStatus(target))
        return retryQty > 0
      })
      retryDiffEl.disabled = !hasRetry
      retryDiffEl.classList.toggle('is-disabled', !hasRetry)
    }
    syncTargetsTogglePreviewUi()
    listEl.querySelectorAll('[data-target-index]').forEach((el) => {
      const idx = Number(el.getAttribute('data-target-index'))
      el.classList.toggle('is-preview', idx === effectivePreviewIndex)
      const removeBtn = el.querySelector('[data-remove-target-index]')
      if (!removeBtn) return
      if (idx === effectivePreviewIndex) {
        removeBtn.setAttribute('aria-disabled', 'true')
        removeBtn.setAttribute('data-title', 'Não é possível excluir o target atual')
      } else {
        removeBtn.removeAttribute('aria-disabled')
        removeBtn.setAttribute('data-title', 'Excluir target da lista')
      }
    })
    syncTargetsListScrollbarOffset()
    deps.syncDispatchScopeSelectorUi()
    state.syncDispatchScopeUiCurrent?.()
    state.syncPlannerTargetCardPreviewCurrent?.({
      target: preview,
      meta: previewMeta,
      index: effectivePreviewIndex,
      total: targets.length,
      source: 'preview-sync'
    })
    deps.updateDispatchButtonsState()
    deps.persistPlannerTargetsDraftFromNavigatorState()
    void selectedCount
  }
  const setOpen = (isOpen) => {
    if (!hasMultiTargets) {
      wrap.classList.remove('is-open')
      listPanelEl.hidden = true
      if (chevron) chevron.textContent = '▾'
      return
    }
    wrap.classList.toggle('is-open', isOpen)
    listPanelEl.hidden = !isOpen
    if (chevron) chevron.textContent = isOpen ? '▴' : '▾'
    if (toggleBtn) toggleBtn.setAttribute('data-title', isOpen ? 'Ocultar lista de alvos' : 'Mostrar lista de alvos')
    if (isOpen) requestAnimationFrame(() => syncTargetsListScrollbarOffset())
  }
  const hasTargetId = (target) => Number.isFinite(Number(target?.id)) && Number(target?.id) > 0
  const setPreviewIndex = (nextIndex, source = 'toggle') => {
    if (!Number.isFinite(nextIndex)) return
    if (!targets.length) return
    const normalized = ((nextIndex % targets.length) + targets.length) % targets.length
    let resolvedIndex = normalized
    const hasAnyTargetWithId = targets.some((target) => hasTargetId(target))
    if (hasAnyTargetWithId && !hasTargetId(targets[resolvedIndex])) {
      let foundIndex = -1
      for (let step = 1; step < targets.length; step += 1) {
        const candidateIndex = (normalized + step) % targets.length
        if (hasTargetId(targets[candidateIndex])) {
          foundIndex = candidateIndex
          break
        }
      }
      if (foundIndex < 0) return
      resolvedIndex = foundIndex
    }
    previewIndex = resolvedIndex
    syncPreviewUi()
    const preview = targets[previewIndex]
    deps.consoleDev({
      event: 'planner:targets:preview',
      source,
      index: previewIndex,
      total: targets.length,
      target: preview
    }, { label: '[planner:targets]' })
  }
  setOpen(false)
  state.rerenderTargetsNavigatorRowsCurrent = () => {
    syncTargetFiltersUi()
    rerenderTargetsList()
    syncPreviewUi()
  }
  syncPreviewUi()
  const onTargetsOutsidePointerDown = (event) => {
    if (!wrap?.isConnected) {
      cancelEvents.cancelTargetsNavigatorOutside?.()
      cancelEvents.cancelTargetsNavigatorOutside = null
      return
    }
    if (!wrap.classList.contains('is-open')) return
    const targetNode = event.target
    if (targetNode && wrap.contains(targetNode)) return
    setOpen(false)
  }
  document.addEventListener('pointerdown', onTargetsOutsidePointerDown, true)
  cancelEvents.cancelTargetsNavigatorOutside = () => {
    document.removeEventListener('pointerdown', onTargetsOutsidePointerDown, true)
  }
  multiScopeBtn?.addEventListener('click', () => {
    if (multiScopeBtn.disabled) return
    deps.setDispatchTargetScope('multi')
    deps.updateDispatchButtonsState()
  })
  toggleBtn?.addEventListener('click', () => {
    const nextOpen = !wrap.classList.contains('is-open')
    setOpen(nextOpen)
    deps.consoleDev({
      event: 'planner:targets:toggle',
      open: nextOpen,
      total: targets.length,
      targets
    }, { label: '[planner:targets]' })
  })
  firstBtn?.addEventListener('click', () => setPreviewIndex(0, 'first'))
  prevBtn?.addEventListener('click', () => setPreviewIndex(previewIndex - 1, 'prev'))
  nextBtn?.addEventListener('click', () => setPreviewIndex(previewIndex + 1, 'next'))
  lastBtn?.addEventListener('click', () => setPreviewIndex(targets.length - 1, 'last'))
  ;[firstBtn, prevBtn, nextBtn, lastBtn].forEach((btn) => {
    if (!btn) return
    btn.disabled = !hasMultiTargets
    btn.setAttribute(
      'data-title',
      hasMultiTargets
        ? (btn.getAttribute('aria-label') || '')
        : 'Disponível quando houver lista de alvos'
    )
  })
  selectAllEl?.addEventListener('change', (event) => {
    const checked = !!event.target?.checked
    getFilteredTargets().forEach((target) => {
      const key = deps.getTargetListKey(target)
      if (checked) state.targetsNavigatorSelectedKeys.add(key)
      else state.targetsNavigatorSelectedKeys.delete(key)
    })
    rerenderTargetsList()
    syncPreviewUi()
    deps.consoleDev({
      event: 'planner:targets:select-all',
      checked,
      selected: calcTargetsNavigatorSelectedCount(targets, deps),
      total: targets.length
    }, { label: '[planner:targets]' })
  })
  listEl?.addEventListener('input', (event) => {
    const input = event.target?.closest?.('[data-qty-target-key]')
    if (!input) return
    const key = String(input.getAttribute('data-qty-target-key') || '')
    const value = Math.max(0, Math.floor(Number(input.value || 0) || 0))
    state.targetsNavigatorQtyByKey.set(key, value)
    input.value = String(value)
    deps.consoleDev({
      event: 'planner:targets:qty',
      key,
      value
    }, { label: '[planner:targets]' })
    syncPreviewUi()
  })
  listEl?.addEventListener('change', (event) => {
    const checkbox = event.target?.closest?.('[data-select-target-key]')
    if (!checkbox) return
    const key = String(checkbox.getAttribute('data-select-target-key') || '')
    if (!key) return
    if (checkbox.checked) state.targetsNavigatorSelectedKeys.add(key)
    else state.targetsNavigatorSelectedKeys.delete(key)
    syncPreviewUi()
  })
  ownerFilterEl?.addEventListener('change', () => {
    targetsListFilters.owner = String(ownerFilterEl.value || '')
    rerenderTargetsList()
    syncPreviewUi()
  })
  allyFilterEl?.addEventListener('change', () => {
    targetsListFilters.ally = String(allyFilterEl.value || '')
    rerenderTargetsList()
    syncPreviewUi()
  })
  globalQtyApplyEl?.addEventListener('click', (event) => {
    event.preventDefault?.()
    event.stopPropagation?.()
    const nextValue = Math.max(0, Math.floor(Number(globalQtyInputEl?.value || 0) || 0))
    if (globalQtyInputEl) globalQtyInputEl.value = String(nextValue)
    const selectedTargets = targets.filter((target) => {
      const key = deps.getTargetListKey(target)
      return state.targetsNavigatorSelectedKeys.has(key)
    })
    if (!selectedTargets.length) {
      printMessage.error('Selecione alvos para aplicar a quantidade.')
      return
    }
    selectedTargets.forEach((target) => {
      const key = deps.getTargetListKey(target)
      state.targetsNavigatorQtyByKey.set(key, nextValue)
    })
    rerenderTargetsList()
    syncPreviewUi()
    deps.consoleDev({
      event: 'planner:targets:qty:global',
      value: nextValue,
      targets: selectedTargets.length
    }, { label: '[planner:targets]' })
  })
  retryDiffEl?.addEventListener('click', (event) => {
    event.preventDefault?.()
    event.stopPropagation?.()
    const result = deps.applyRetryQtyFromDispatchStatus()
    if (!result?.changed && !(result?.totalRetry > 0)) {
      printMessage.warn('Nenhuma diferença para refazer.')
      return
    }
    printMessage.warn(`Diferença aplicada: ${result.totalRetry || 0} comando(s).`)
  })
  removeSelectedEl?.addEventListener('click', (event) => {
    event.preventDefault?.()
    event.stopPropagation?.()
    event.stopImmediatePropagation?.()
    const currentKey = deps.getTargetListKey(targets[previewIndex] || null)
    const toRemoveKeys = new Set(
      targets
        .map((target) => deps.getTargetListKey(target))
        .filter((key) => state.targetsNavigatorSelectedKeys.has(key) && key !== currentKey)
    )
    if (!toRemoveKeys.size) {
      printMessage.error('Selecione alvos (exceto o atual) para excluir.')
      return
    }
    const keep = []
    const removed = []
    targets.forEach((target) => {
      const key = deps.getTargetListKey(target)
      if (toRemoveKeys.has(key)) removed.push(target)
      else keep.push(target)
    })
    removed.forEach((target) => {
      const key = deps.getTargetListKey(target)
      state.targetsNavigatorSelectedKeys.delete(key)
      state.targetsNavigatorQtyByKey.delete(key)
      state.targetsNavigatorMetaByKey.delete(key)
    })
    targets.splice(0, targets.length, ...keep)
    if (Array.isArray(data?.targets)) {
      data.targets = targets.map((t) => ({ id: t?.id ?? null, x: t.x, y: t.y }))
    }
    if (!targets.length || targets.length <= 1) {
      deps.writePlannerTargetsDraft(null)
      state.syncTargetsNavigatorTogglePreviewUiCurrent = null
      state.rerenderTargetsNavigatorRowsCurrent = null
      wrap.remove()
      state.targetsNavigatorCurrentTargets = []
      deps.setDispatchTargetScope('current')
      deps.consoleDev({
        event: 'planner:targets:remove-selected',
        removedCount: removed.length,
        remaining: targets.length
      }, { label: '[planner:targets]' })
      return
    }
    previewIndex = Math.max(0, Math.min(previewIndex, targets.length - 1))
    pruneTargetsNavigatorSelectedKeys(targets, deps)
    state.targetsNavigatorCurrentTargets = targets
    deps.applyDispatchTargetScopeDefaultForTargetsList()
    syncTargetFiltersUi()
    rerenderTargetsList()
    syncPreviewUi()
    scheduleTargetsNavigatorEnrichment(
      targets,
      listEl,
      () => previewIndex,
      () => ({ x: currentX, y: currentY }),
      deps
    )
    deps.consoleDev({
      event: 'planner:targets:remove-selected',
      removedCount: removed.length,
      remaining: targets.length
    }, { label: '[planner:targets]' })
  })
  listEl?.addEventListener('click', (event) => {
    const removeBtn = event.target?.closest?.('[data-remove-target-index]')
    if (removeBtn) {
      event.preventDefault?.()
      event.stopPropagation?.()
      event.stopImmediatePropagation?.()
      if (String(removeBtn.getAttribute('aria-disabled')) === 'true') {
        printMessage.error('Não é possível excluir o target atual nesta etapa.')
        return
      }
      const idx = Number(removeBtn.getAttribute('data-remove-target-index'))
      if (!Number.isFinite(idx) || idx < 0 || idx >= targets.length) return
      const removed = targets[idx]
      const removedKey = deps.getTargetListKey(removed)
      targets.splice(idx, 1)
      if (Array.isArray(data?.targets)) {
        data.targets = targets.map((t) => ({ id: t?.id ?? null, x: t.x, y: t.y }))
      }
      state.targetsNavigatorSelectedKeys.delete(removedKey)
      state.targetsNavigatorQtyByKey.delete(removedKey)
      state.targetsNavigatorMetaByKey.delete(removedKey)
      if (!targets.length || targets.length <= 1) {
        deps.writePlannerTargetsDraft(null)
        state.syncTargetsNavigatorTogglePreviewUiCurrent = null
        state.rerenderTargetsNavigatorRowsCurrent = null
        wrap.remove()
        state.targetsNavigatorCurrentTargets = []
        deps.setDispatchTargetScope('current')
        deps.consoleDev({
          event: 'planner:targets:remove',
          removed,
          remaining: targets.length
        }, { label: '[planner:targets]' })
        return
      }
      previewIndex = Math.max(0, Math.min(previewIndex, targets.length - 1))
      state.targetsNavigatorCurrentTargets = targets
      deps.applyDispatchTargetScopeDefaultForTargetsList()
      pruneTargetsNavigatorSelectedKeys(targets, deps)
      syncTargetFiltersUi()
      rerenderTargetsList()
      syncPreviewUi()
      scheduleTargetsNavigatorEnrichment(
        targets,
        listEl,
        () => previewIndex,
        () => ({ x: currentX, y: currentY }),
        deps
      )
      deps.consoleDev({
        event: 'planner:targets:remove',
        removed,
        remaining: targets.length,
        targets
      }, { label: '[planner:targets]' })
      return
    }
    if (event.target?.closest?.('input, button, label, a')) return
    const row = event.target?.closest?.('[data-target-index]')
    if (!row) return
    const idx = Number(row.getAttribute('data-target-index'))
    if (!Number.isFinite(idx)) return
    setPreviewIndex(idx, 'list')
  })

  const targetRowEl = targetContent.querySelector(':scope > .go-row')
  const multiSlotEl = targetContent.querySelector('[data-targets-multi-slot]')
  if (multiSlotEl?.parentElement) {
    multiSlotEl.replaceChildren(wrap)
  } else if (targetRowEl?.parentElement === targetContent) {
    targetRowEl.insertAdjacentElement('afterend', wrap)
  } else {
    targetContent.insertAdjacentElement('afterbegin', wrap)
  }
  scheduleTargetsNavigatorEnrichment(
    targets,
    listEl,
    () => previewIndex,
    () => ({ x: currentX, y: currentY }),
    deps
  )
}
