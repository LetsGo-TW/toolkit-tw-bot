function trimText(value = '') {
  return String(value ?? '').trim()
}

function hasOwn(source, key) {
  return Boolean(source) && Object.prototype.hasOwnProperty.call(source, key)
}

function extractCandidateValue(candidate = null) {
  if (candidate == null) return ''
  if (typeof candidate === 'string' || typeof candidate === 'number') {
    return trimText(candidate)
  }
  if (Array.isArray(candidate)) {
    for (const item of candidate) {
      const nextValue = extractCandidateValue(item)
      if (nextValue) return nextValue
    }
    return ''
  }
  if (typeof candidate !== 'object') return ''

  const preferredKeys = [
    'catapult_target_name',
    'catapultTargetName',
    'target_building_name',
    'targetBuildingName',
    'building_target_name',
    'buildingTargetName',
    'build_target_name',
    'buildTargetName',
    'catapult_target',
    'catapultTarget',
    'target_building',
    'targetBuilding',
    'building_target',
    'buildingTarget',
    'target_build',
    'targetBuild',
    'build_target',
    'buildTarget',
    'attack_building',
    'attackBuilding',
    'building',
    'target',
    'name',
    'label',
    'title',
    'text',
    'value',
    'id'
  ]

  for (const key of preferredKeys) {
    if (!hasOwn(candidate, key)) continue
    const nextValue = extractCandidateValue(candidate[key])
    if (nextValue) return nextValue
  }

  return ''
}

function extractValueByKeys(source = null, keys = []) {
  if (!source || typeof source !== 'object') return ''
  for (const key of keys) {
    if (!hasOwn(source, key)) continue
    const nextValue = extractCandidateValue(source[key])
    if (nextValue) return nextValue
  }
  return ''
}

function extractRawCatapultTarget(commandData = {}) {
  const directKeys = [
    'catapult_target_name',
    'catapultTargetName',
    'target_building_name',
    'targetBuildingName',
    'building_target_name',
    'buildingTargetName',
    'build_target_name',
    'buildTargetName',
    'catapult_target',
    'catapultTarget',
    'target_building',
    'targetBuilding',
    'building_target',
    'buildingTarget',
    'target_build',
    'targetBuild',
    'build_target',
    'buildTarget',
    'attack_building',
    'attackBuilding',
    'building'
  ]
  const directValue = extractValueByKeys(commandData, directKeys)
  if (directValue) return directValue

  const catapultScopes = [
    commandData?.catapult,
    commandData?.catapult_target,
    commandData?.catapultTarget
  ]

  for (const scope of catapultScopes) {
    const nextValue = extractCandidateValue(scope)
    if (nextValue) return nextValue
  }

  const containerScopes = [
    commandData?.command,
    commandData?.details,
    commandData?.info,
    commandData?.data
  ]

  for (const scope of containerScopes) {
    const directScopedValue = extractValueByKeys(scope, directKeys)
    if (directScopedValue) return directScopedValue
    const nestedCatapultValue = extractCandidateValue(
      scope?.catapult || scope?.catapult_target || scope?.catapultTarget
    )
    if (nestedCatapultValue) return nestedCatapultValue
  }

  return ''
}

function normalizeBuildingLabel(rawTarget = '', buildingLabels = {}) {
  const value = trimText(rawTarget)
  if (!value) return ''
  const buildingKey = value.replace(/^building:/i, '').trim().toLowerCase()
  const translatedEntry = buildingLabels?.[buildingKey]
  const translatedValue = (
    translatedEntry && typeof translatedEntry === 'object'
      ? trimText(translatedEntry?.trans || translatedEntry?.name || translatedEntry?.label)
      : trimText(translatedEntry)
  )
  return translatedValue || value
}

export function hasCatapultInCommand(commandData = {}) {
  return Number(commandData?.units?.catapult?.count || 0) > 0
}

export function resolveCommandCatapultTargetLabel(commandData = {}, { buildingLabels = {} } = {}) {
  if (!hasCatapultInCommand(commandData)) return ''
  const rawTarget = extractRawCatapultTarget(commandData)
  return normalizeBuildingLabel(rawTarget, buildingLabels)
}
