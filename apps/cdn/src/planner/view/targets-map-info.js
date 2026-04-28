function formatPtBrInt(value) {
  const num = Number(value)
  if (!Number.isFinite(num)) return '---'
  return Math.round(num).toLocaleString('pt-BR')
}

function getTwMapVillageBonusIdByTargetId(targetId = null) {
  const normalizedTargetId = Number(targetId)
  if (!Number.isFinite(normalizedTargetId) || normalizedTargetId <= 0) return null
  const twVillages = window?.TWMap?.villages
  if (!twVillages || typeof twVillages !== 'object') return null

  const byKey = twVillages[String(Math.trunc(normalizedTargetId))] ?? twVillages[Math.trunc(normalizedTargetId)]
  if (byKey && typeof byKey === 'object') {
    const candidate = Number(byKey?.bonus_id ?? byKey?.bonusId)
    if (Number.isFinite(candidate) && candidate > 0) return Math.trunc(candidate)
  }

  const values = Array.isArray(twVillages) ? twVillages : Object.values(twVillages)
  for (const item of values) {
    if (!item || typeof item !== 'object') continue
    const id = Number(item?.id ?? item?.village_id ?? item?.villageId)
    if (!Number.isFinite(id) || Math.trunc(id) !== Math.trunc(normalizedTargetId)) continue
    const candidate = Number(item?.bonus_id ?? item?.bonusId)
    if (Number.isFinite(candidate) && candidate > 0) return Math.trunc(candidate)
  }
  return null
}

export function buildPlannerTargetCardVillageFromNavigatorPreview(target = null, meta = null, deps = {}) {
  if (!target || typeof target !== 'object') return null
  const {
    getCachedAjaxMapInfo,
    parseFiniteNumber,
    calcContinentFromCoords,
    onlyNumbers,
    resolveTargetMoraleFromStateOrCache,
    formatMoralePercent,
    resolveTargetNightBonusConfigFromStateOrCache,
    parseNightBonusFromCurrentInterval,
    resolveEffectiveNightBonusConfig,
    buildNightBonusTargetLabel,
    nightBonusConfigWorld
  } = deps
  if (
    typeof getCachedAjaxMapInfo !== 'function'
    || typeof parseFiniteNumber !== 'function'
    || typeof calcContinentFromCoords !== 'function'
    || typeof onlyNumbers !== 'function'
    || typeof resolveTargetMoraleFromStateOrCache !== 'function'
    || typeof formatMoralePercent !== 'function'
    || typeof resolveTargetNightBonusConfigFromStateOrCache !== 'function'
    || typeof parseNightBonusFromCurrentInterval !== 'function'
    || typeof resolveEffectiveNightBonusConfig !== 'function'
    || typeof buildNightBonusTargetLabel !== 'function'
  ) {
    return null
  }

  const villageMeta = (meta?.village && typeof meta.village === 'object') ? meta.village : null
  const playerMeta = (meta?.player && typeof meta.player === 'object') ? meta.player : null
  const targetId = Number.isFinite(Number(villageMeta?.id ?? target?.id)) ? Number(villageMeta?.id ?? target?.id) : null
  const cachedMapInfo = targetId ? (getCachedAjaxMapInfo(targetId) || null) : null
  const x = Number(villageMeta?.x ?? target?.x)
  const y = Number(villageMeta?.y ?? target?.y)
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null
  const rawPoints = villageMeta?.points
  const pointsFromRaw = Number(rawPoints)
  const points = Number.isFinite(pointsFromRaw)
    ? Math.max(0, Math.floor(pointsFromRaw))
    : Math.max(0, Math.floor(Number(onlyNumbers(String(rawPoints || '0'))) || 0))
  const moraleFromMeta = Number(meta?.morale)
  const moraleFromMapInfo = Number(cachedMapInfo?.morale)
  const moraleFromState = resolveTargetMoraleFromStateOrCache({ target, fallbackMeta: meta })
  const twMapBonusId = getTwMapVillageBonusIdByTargetId(targetId)
  const moraleLabel = (
    Number.isFinite(Number(moraleFromState)) && Number(moraleFromState) > 0
      ? `${Math.round(Number(moraleFromState))}%`
      : (
    Number.isFinite(moraleFromMeta) && moraleFromMeta > 0
      ? `${Math.round(moraleFromMeta)}%`
      : (
        Number.isFinite(moraleFromMapInfo) && moraleFromMapInfo > 0
          ? formatMoralePercent(moraleFromMapInfo)
          : null
      )
      )
  )
  const targetNightBonusConfigFromCache = resolveTargetNightBonusConfigFromStateOrCache({
    target,
    fallbackMeta: meta
  }) || parseNightBonusFromCurrentInterval(cachedMapInfo?.night_bonus?.current_interval)
  const effectiveNightBonusConfigFromCache = targetNightBonusConfigFromCache
    ? resolveEffectiveNightBonusConfig({
      worldConfig: nightBonusConfigWorld,
      targetConfig: targetNightBonusConfigFromCache
    })
    : null
  const nightBonusLabel = String(
    meta?.nightBonusLabel
    || buildNightBonusTargetLabel({
      worldConfig: nightBonusConfigWorld,
      targetConfig: targetNightBonusConfigFromCache,
      effectiveConfig: effectiveNightBonusConfigFromCache
    })
    || ''
  ).trim() || null
  const reservation = meta?.reservation || cachedMapInfo?.reservation || null
  return {
    id: targetId,
    x,
    y,
    k: parseFiniteNumber(villageMeta?.k) ?? calcContinentFromCoords(x, y) ?? null,
    name: String(villageMeta?.name || target?.name || '---').trim() || '---',
    image: String(villageMeta?.image || 'https://dsbr.innogamescdn.com/asset/c645ceed/graphic/map/icon/v5_icon.webp'),
    bonusId: Number.isFinite(Number(villageMeta?.bonusId ?? villageMeta?.bonus_id ?? cachedMapInfo?.bonusId ?? cachedMapInfo?.bonus_id ?? twMapBonusId ?? target?.bonusId))
      ? Number(villageMeta?.bonusId ?? villageMeta?.bonus_id ?? cachedMapInfo?.bonusId ?? cachedMapInfo?.bonus_id ?? twMapBonusId ?? target?.bonusId)
      : null,
    playerId: parseFiniteNumber(villageMeta?.playerId ?? villageMeta?.player_id ?? playerMeta?.id ?? target?.playerId) ?? null,
    owner: parseFiniteNumber(villageMeta?.owner ?? villageMeta?.playerId ?? villageMeta?.player_id ?? playerMeta?.id ?? target?.owner) ?? null,
    player_name: String(playerMeta?.name || villageMeta?.player_name || '').trim() || null,
    playerTitle: playerMeta ? `(${formatPtBrInt(playerMeta?.rank)}.|${formatPtBrInt(playerMeta?.points)} P|${formatPtBrInt(playerMeta?.villages)} V)` : '',
    allyTitle: (meta?.ally && typeof meta.ally === 'object')
      ? `${meta.ally?.tag || ''} (${formatPtBrInt(meta.ally?.rank)}.|${formatPtBrInt(meta.ally?.all_points)}P)`
      : '',
    points,
    textPoints: points > 0 ? points.toLocaleString('pt-BR') : (rawPoints ? String(rawPoints) : '---'),
    moraleLabel,
    nightBonusLabel,
    reservation
  }
}

export function applyMapInfoToTargetsNavigatorMeta(target = null, mapInfo = null, deps = {}) {
  if (!target || !mapInfo || typeof mapInfo !== 'object') return false
  const {
    getTargetListKey,
    targetsNavigatorMetaByKey,
    applyMapInfoToPlayerNightMoralState,
    normalizeMoralePercent,
    resolveTargetNightBonusConfigFromStateOrCache,
    parseNightBonusFromCurrentInterval,
    resolveEffectiveNightBonusConfig,
    buildNightBonusTargetLabel,
    nightBonusConfigWorld
  } = deps
  if (
    typeof getTargetListKey !== 'function'
    || !(targetsNavigatorMetaByKey instanceof Map)
    || typeof applyMapInfoToPlayerNightMoralState !== 'function'
    || typeof normalizeMoralePercent !== 'function'
    || typeof resolveTargetNightBonusConfigFromStateOrCache !== 'function'
    || typeof parseNightBonusFromCurrentInterval !== 'function'
    || typeof resolveEffectiveNightBonusConfig !== 'function'
    || typeof buildNightBonusTargetLabel !== 'function'
  ) {
    return false
  }

  const key = getTargetListKey(target)
  if (!/^\d+\|\d+$/.test(key)) return false
  const prev = targetsNavigatorMetaByKey.get(key) || {}
  const prevVillage = (prev?.village && typeof prev.village === 'object') ? prev.village : null
  applyMapInfoToPlayerNightMoralState({ target, fallbackMeta: prev, mapInfo })
  const moraleRaw = Number(mapInfo?.morale)
  const morale = Number.isFinite(moraleRaw) && moraleRaw > 0 ? normalizeMoralePercent(moraleRaw) : null
  const targetNightBonusConfig = (
    resolveTargetNightBonusConfigFromStateOrCache({ target, fallbackMeta: prev })
    || parseNightBonusFromCurrentInterval(mapInfo?.night_bonus?.current_interval)
  )
  const effectiveNightBonusConfig = targetNightBonusConfig
    ? resolveEffectiveNightBonusConfig({
      worldConfig: nightBonusConfigWorld,
      targetConfig: targetNightBonusConfig
    })
    : null
  const nightBonusLabel = String(buildNightBonusTargetLabel({
    worldConfig: nightBonusConfigWorld,
    targetConfig: targetNightBonusConfig,
    effectiveConfig: effectiveNightBonusConfig
  }) || '').trim() || null
  const nextVillage = prevVillage ? {
    ...prevVillage,
    ...(Number.isFinite(Number(mapInfo?.bonusId ?? mapInfo?.bonus_id))
      ? { bonusId: Number(mapInfo?.bonusId ?? mapInfo?.bonus_id) }
      : {})
  } : prevVillage

  const next = {
    ...prev,
    ...(nextVillage ? { village: nextVillage } : {}),
    morale,
    nightBonusLabel,
    reservation: mapInfo?.reservation ?? null
  }
  const prevSignature = JSON.stringify({
    morale: prev?.morale ?? null,
    nightBonusLabel: prev?.nightBonusLabel ?? null,
    reservation: prev?.reservation ?? null,
    bonusId: prevVillage?.bonusId ?? prevVillage?.bonus_id ?? null
  })
  const nextSignature = JSON.stringify({
    morale: next?.morale ?? null,
    nightBonusLabel: next?.nightBonusLabel ?? null,
    reservation: next?.reservation ?? null,
    bonusId: nextVillage?.bonusId ?? nextVillage?.bonus_id ?? null
  })
  if (prevSignature === nextSignature) return false
  targetsNavigatorMetaByKey.set(key, next)
  return true
}

export function ensureTargetsNavigatorPreviewMapInfo(target = null, deps = {}) {
  const {
    getTargetListKey,
    targetsNavigatorMetaByKey,
    getCachedAjaxMapInfo,
    rerenderTargetsNavigatorRowsCurrent,
    targetsNavigatorMapInfoRequestByKey,
    getNightActiveModeFromWorldConfig,
    getTargetPlayerIdForNightState,
    resolveTargetMoraleFromStateOrCache,
    getAjaxMapInfo
  } = deps
  if (
    typeof getTargetListKey !== 'function'
    || !(targetsNavigatorMetaByKey instanceof Map)
    || typeof getCachedAjaxMapInfo !== 'function'
    || !(targetsNavigatorMapInfoRequestByKey instanceof Set)
    || typeof getNightActiveModeFromWorldConfig !== 'function'
    || typeof getTargetPlayerIdForNightState !== 'function'
    || typeof resolveTargetMoraleFromStateOrCache !== 'function'
    || typeof getAjaxMapInfo !== 'function'
  ) {
    return
  }

  const targetId = Number(target?.id)
  if (!Number.isFinite(targetId) || targetId <= 0) return
  const key = getTargetListKey(target)
  if (!/^\d+\|\d+$/.test(key)) return
  const currentMeta = targetsNavigatorMetaByKey.get(key) || null
  const cachedMapInfo = getCachedAjaxMapInfo(targetId)
  if (applyMapInfoToTargetsNavigatorMeta(target, cachedMapInfo, deps)) {
    rerenderTargetsNavigatorRowsCurrent?.()
  }
  if (targetsNavigatorMapInfoRequestByKey.has(key)) return
  const worldNightMode = getNightActiveModeFromWorldConfig()
  const targetPlayerId = getTargetPlayerIdForNightState(target, currentMeta)
  const moraleKnown = resolveTargetMoraleFromStateOrCache({ target, fallbackMeta: currentMeta }) != null
  const requestIfMissing = (
    (worldNightMode === 2 && Boolean(targetPlayerId))
    || (!moraleKnown && Boolean(targetPlayerId))
  )
  if (!requestIfMissing) return
  targetsNavigatorMapInfoRequestByKey.add(key)
  getAjaxMapInfo(targetId, { requestIfMissing: true })
    .then((mapInfo) => {
      if (applyMapInfoToTargetsNavigatorMeta(target, mapInfo, deps)) {
        rerenderTargetsNavigatorRowsCurrent?.()
      }
    })
    .catch((error) => {
      console.error('[planner][targets][map_info]', error)
    })
    .finally(() => {
      targetsNavigatorMapInfoRequestByKey.delete(key)
    })
}
