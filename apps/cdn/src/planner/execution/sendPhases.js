import {
  createExecutionCadence,
  getExecutionCadenceDelayMs,
  isCaptchaError,
  sleep
} from "./helpers/runtime";
import { markCaptchaInterruption } from "./helpers/errors";
import { probeTwBotProtectionByOverviewGet } from "./helpers/twBotProtectionProbe";
import { executeSendPhaseOneCollectPayloads } from "./phases/executeSendPhaseOneCollectPayloads";
import { executeSendPhaseTwoConfirmPayloads } from "./phases/executeSendPhaseTwoConfirmPayloads";
import { executeSendPhaseThreeDispatchCommands } from "./phases/executeSendPhaseThreeDispatchCommands";
import { getWorldUnitsOrder } from "../../unit";
import { applyNightBonusGuardAfterConfirm } from "./helpers/nightBonusGuard";

const ENABLE_PHASE_TWO = true
const ENABLE_PHASE_THREE = true
const TRAIN_INPUT_RE = /^train\[(\d+)\]\[([^\]]+)\]$/

function parseFiniteNumber(value) {
  if (value == null || value === '') return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function calcContinentFromCoords(x, y) {
  const numX = parseFiniteNumber(x)
  const numY = parseFiniteNumber(y)
  if (numX == null || numY == null) return null
  return (Math.floor(numY / 100) * 10) + Math.floor(numX / 100)
}

function toPayloadEntries(payloadCommand) {
  if (Array.isArray(payloadCommand)) {
    return payloadCommand.reduce((acc, entry) => {
      if (!Array.isArray(entry) || entry.length < 2) return acc
      const [name, value] = entry
      if (!name) return acc
      acc.push([String(name), value ?? ''])
      return acc
    }, [])
  }
  if (payloadCommand && typeof payloadCommand === 'object') {
    return Object.entries(payloadCommand).reduce((acc, [name, value]) => {
      if (!name) return acc
      acc.push([String(name), value ?? ''])
      return acc
    }, [])
  }
  return []
}

function toPositiveQty(value) {
  const qty = Number(value)
  if (!Number.isFinite(qty) || qty <= 0) return 0
  return Math.floor(qty)
}

function extractSentUnitsFromConfirmPayload(payloadConfirm, worldUnits = []) {
  const entries = toPayloadEntries(payloadConfirm)
  if (!entries.length || !worldUnits.length) return []
  const unitIndexByName = new Map(worldUnits.map((unit, index) => [unit, index]))
  const totals = Array(worldUnits.length).fill(0)
  entries.forEach(([rawName, rawValue]) => {
    const name = String(rawName || '')
    const qty = toPositiveQty(rawValue)
    if (qty <= 0) return
    if (unitIndexByName.has(name)) {
      const index = unitIndexByName.get(name)
      totals[index] += qty
      return
    }
    const trainMatch = name.match(TRAIN_INPUT_RE)
    if (!trainMatch) return
    const trainIndex = Number(trainMatch[1])
    const unit = String(trainMatch[2] || '')
    if (!Number.isFinite(trainIndex) || trainIndex <= 1) return
    if (!unitIndexByName.has(unit)) return
    const index = unitIndexByName.get(unit)
    totals[index] += qty
  })
  return totals
}

function collectSentUnitsByVillage(preparedQueue, worldUnits = []) {
  const totalsByVillageId = new Map()
  const queue = Array.isArray(preparedQueue) ? preparedQueue : []
  queue.forEach((queueItem) => {
    const resultItem = queueItem?.resultItem
    if (!resultItem?.sendOk) return
    const villageId = Number(queueItem?.sender?.villageId ?? resultItem?.villageId)
    if (!Number.isFinite(villageId)) return
    const confirmPayload = resultItem?.result?.confirm?.payload
    const unitsSent = extractSentUnitsFromConfirmPayload(confirmPayload, worldUnits)
    if (!unitsSent.length || unitsSent.every((value) => !Number.isFinite(value) || value <= 0)) return
    if (!totalsByVillageId.has(villageId)) {
      totalsByVillageId.set(villageId, Array(worldUnits.length).fill(0))
    }
    const acc = totalsByVillageId.get(villageId)
    unitsSent.forEach((value, index) => {
      const qty = toPositiveQty(value)
      if (qty <= 0) return
      acc[index] += qty
    })
  })
  return Array.from(totalsByVillageId.entries()).map(([villageId, units]) => ({
    villageId,
    units
  }))
}

function trimMessage(value) {
  return String(value || '').trim()
}

function pushUniqueMessage(list, message, max = 3) {
  if (!Array.isArray(list) || list.length >= max) return
  const normalized = trimMessage(message)
  if (!normalized) return
  if (list.includes(normalized)) return
  list.push(normalized)
}

function classifyErrorDetail(errorMessage = '', resultItem = null) {
  const message = trimMessage(errorMessage).toLowerCase()
  return {
    payloadMissing: (
      message.includes('payload')
      || (resultItem?.hasPayload === false)
    ),
    noAttack: (
      message.includes('sem ataque')
      || (resultItem?.hasAtLeastOneAttack === false)
    )
  }
}

function toExecutionAttackCount(value) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed <= 0) return 0
  return Math.floor(parsed)
}

function isExecutionTimeoutMessage(message = '') {
  const text = trimMessage(message).toLowerCase()
  return (
    text.includes('timeout')
    || text.includes('time out')
    || text.includes('timed out')
    || text.includes('tempo esgotado')
    || text.includes('tempo limite')
  )
}

function isExecutionCaptchaMessage(message = '') {
  const text = trimMessage(message).toLowerCase()
  return (
    text.includes('captcha')
    || text.includes('bot protect')
    || text.includes('bot-protect')
    || text.includes('bot protection')
    || text.includes('bot_check')
    || text.includes('bot check')
  )
}

function isExecutionNightBonusMessage(message = '') {
  const text = trimMessage(message).toLowerCase()
  return (
    text.includes('night bonus')
    || text.includes('bônus noturno')
    || text.includes('bonus noturno')
    || text.includes('bn bloqueou')
    || text.includes('bloqueado por bn')
    || text.includes('janela de bn')
  )
}

function isExecutionTroopsMessage(message = '') {
  const text = trimMessage(message).toLowerCase()
  return (
    text.includes('tropa')
    || text.includes('troops')
    || text.includes('unidades insuficientes')
    || text.includes('faltam unidades')
    || text.includes('insufficient units')
    || text.includes('sem tropas')
  )
}

function isExecutionLimitMessage(message = '') {
  const text = trimMessage(message).toLowerCase()
  return (
    text.includes('limite')
    || text.includes('máximo')
    || text.includes('maximo')
    || text.includes('fake limit')
    || text.includes('unidade mais lenta')
    || text.includes('ataques disponíveis')
  )
}

function inferExecutionResultCauseTags(item = null) {
  const source = (item && typeof item === 'object') ? item : {}
  const tags = []
  const errorMessage = trimMessage(source?.error)
  const errorDetails = classifyErrorDetail(errorMessage, source)
  const resolutions = Array.isArray(source?.resolutions) ? source.resolutions : []
  const resolutionTypes = new Set(
    resolutions
      .map((entry) => String(entry?.type || '').trim().toLowerCase())
      .filter(Boolean)
  )

  if (source?.blockedByNightBonus) tags.push('bn')
  if (isExecutionNightBonusMessage(errorMessage)) tags.push('bn')
  if (source?.captchaDetected || isExecutionCaptchaMessage(errorMessage)) tags.push('captcha')
  if (isExecutionTimeoutMessage(errorMessage)) tags.push('timeout')
  if (resolutionTypes.has('troops') || isExecutionTroopsMessage(errorMessage)) tags.push('troops')
  if (
    resolutionTypes.has('fakelimit')
    || resolutionTypes.has('fakeLimit')
    || resolutionTypes.has('slowestunit')
    || resolutionTypes.has('slowestUnit')
    || resolutionTypes.has('attacks')
    || isExecutionLimitMessage(errorMessage)
  ) {
    tags.push('limit')
  }
  if (errorDetails.payloadMissing) tags.push('payload')
  if (errorDetails.noAttack) tags.push('noAttack')

  return Array.from(new Set(tags))
}

function buildExecutionDiagnostics(results = []) {
  const items = Array.isArray(results) ? results : []
  const diagnostics = {
    preparation: {
      errorCount: 0,
      payloadMissingCount: 0,
      noAttackCount: 0,
      messages: []
    },
    confirmation: {
      errorCount: 0,
      payloadMissingCount: 0,
      noAttackCount: 0,
      bnBlockedCount: 0,
      messages: []
    },
    send: {
      errorCount: 0,
      payloadMissingCount: 0,
      noAttackCount: 0,
      messages: []
    },
    partial: {
      commandsAdjustedCount: 0,
      troopsRedistributedCount: 0,
      attacksReducedCount: 0,
      sentWithAdjustmentsCount: 0,
      sentWithTroopsRedistributedCount: 0,
      sentWithReducedAttacksCount: 0,
      requestedAttackCountMin: 0,
      requestedAttackCountMax: 0,
      reducedAttackDetails: [],
      messages: []
    },
    causes: {
      timeoutCount: 0,
      bnCount: 0,
      troopsCount: 0,
      limitCount: 0,
      captchaCount: 0,
      payloadCount: 0,
      noAttackCount: 0
    }
  }

  items.forEach((item) => {
    const resolutions = Array.isArray(item?.resolutions) ? item.resolutions : []
    const redistributeResolutions = resolutions.filter((entry) => String(entry?.resolution || '').trim().toLowerCase() === 'redistribute')
    const partialResolutions = resolutions.filter((entry) => String(entry?.resolution || '').trim().toLowerCase() === 'partial')
    const troopRedistributeResolutions = redistributeResolutions.filter((entry) => String(entry?.type || '').trim().toLowerCase() === 'troops')
    if (troopRedistributeResolutions.length > 0) {
      diagnostics.partial.troopsRedistributedCount += 1
      if (Boolean(item?.sendOk)) diagnostics.partial.sentWithTroopsRedistributedCount += 1
      troopRedistributeResolutions.forEach((entry) => {
        pushUniqueMessage(diagnostics.partial.messages, entry?.message)
      })
    }
    if (partialResolutions.length > 0) {
      diagnostics.partial.commandsAdjustedCount += 1
      if (Boolean(item?.sendOk)) diagnostics.partial.sentWithAdjustmentsCount += 1
      const hasAttacksReduced = partialResolutions.some((entry) => String(entry?.type || '').trim().toLowerCase() === 'attacks')
      if (hasAttacksReduced) {
        diagnostics.partial.attacksReducedCount += 1
        if (Boolean(item?.sendOk)) diagnostics.partial.sentWithReducedAttacksCount += 1
        const requestedAttackCount = toExecutionAttackCount(item?.requestedAttackCount)
        const finalAttackCount = toExecutionAttackCount(item?.finalAttackCount ?? item?.preparedAttackCount ?? item?.rows)
        if (requestedAttackCount > 0) {
          diagnostics.partial.requestedAttackCountMin = diagnostics.partial.requestedAttackCountMin > 0
            ? Math.min(diagnostics.partial.requestedAttackCountMin, requestedAttackCount)
            : requestedAttackCount
          diagnostics.partial.requestedAttackCountMax = Math.max(
            diagnostics.partial.requestedAttackCountMax,
            requestedAttackCount
          )
          if (finalAttackCount > 0) {
            pushUniqueMessage(
              diagnostics.partial.reducedAttackDetails,
              `${finalAttackCount}/${requestedAttackCount}`
            )
          }
        }
      }
      partialResolutions.forEach((entry) => {
        pushUniqueMessage(diagnostics.partial.messages, entry?.message)
      })
    }
    if (item?.blockedByNightBonus) {
      diagnostics.confirmation.bnBlockedCount += 1
      pushUniqueMessage(diagnostics.confirmation.messages, item?.error)
    }

    if (!item?.ok && item?.error) {
      inferExecutionResultCauseTags(item).forEach((tag) => {
        if (tag === 'timeout') diagnostics.causes.timeoutCount += 1
        if (tag === 'bn') diagnostics.causes.bnCount += 1
        if (tag === 'troops') diagnostics.causes.troopsCount += 1
        if (tag === 'limit') diagnostics.causes.limitCount += 1
        if (tag === 'captcha') diagnostics.causes.captchaCount += 1
        if (tag === 'payload') diagnostics.causes.payloadCount += 1
        if (tag === 'noAttack') diagnostics.causes.noAttackCount += 1
      })
    }

    if (item?.sourceOk === false && item?.error) {
      diagnostics.preparation.errorCount += 1
      const detail = classifyErrorDetail(item.error, item)
      if (detail.payloadMissing) diagnostics.preparation.payloadMissingCount += 1
      if (detail.noAttack) diagnostics.preparation.noAttackCount += 1
      pushUniqueMessage(diagnostics.preparation.messages, item.error)
      return
    }

    if (item?.sourceOk && !item?.confirmOk && item?.error) {
      diagnostics.confirmation.errorCount += 1
      const detail = classifyErrorDetail(item.error, item)
      if (detail.payloadMissing) diagnostics.confirmation.payloadMissingCount += 1
      if (detail.noAttack) diagnostics.confirmation.noAttackCount += 1
      pushUniqueMessage(diagnostics.confirmation.messages, item.error)
      return
    }

    if (item?.confirmOk && !item?.sendOk && item?.error) {
      diagnostics.send.errorCount += 1
      const detail = classifyErrorDetail(item.error, item)
      if (detail.payloadMissing) diagnostics.send.payloadMissingCount += 1
      if (detail.noAttack) diagnostics.send.noAttackCount += 1
      pushUniqueMessage(diagnostics.send.messages, item.error)
    }
  })

  return diagnostics
}

export async function executeSendPhases({
  mode,
  context = {},
  plannerTarget,
  sendersData,
  view,
  onResultResolved = null
}) {
  if (mode !== 'send') {
    view?.info?.('Fase 1 implementada somente para Enviar.', 2500)
    return
  }

  const selectedVillageIds = Array.isArray(context?.selectedVillageIds) ? context.selectedVillageIds : []
  if (!selectedVillageIds.length) {
    view?.error?.('Selecione ao menos uma vila para enviar.', 2500)
    return
  }

  const targetX = Number(plannerTarget?.x)
  const targetY = Number(plannerTarget?.y)
  if (!Number.isFinite(targetX) || !Number.isFinite(targetY)) {
    throw new Error('Target inválido para preparar envio.')
  }

  const templateStats = context?.templateStats
  const templateBase = templateStats?.template
  if (!templateStats?.validation?.isValid || !templateBase) {
    view?.error?.('Modelo inválido para envio. Ajuste o template.', 3000)
    return
  }

  const selectedIdSet = new Set(selectedVillageIds.map((id) => Number(id)).filter(Number.isFinite))
  const selectedSenders = (Array.isArray(sendersData) ? sendersData : [])
    .filter((sender) => selectedIdSet.has(Number(sender?.villageId)))

  if (!selectedSenders.length) {
    view?.error?.('Não foi possível encontrar vilas selecionadas na tabela.', 3000)
    return
  }

  const commandType = String(templateBase?.commandMode || '').trim().toLowerCase() === 'support'
    ? 'support'
    : 'attack'
  const executionCadence = createExecutionCadence(context?.executeConfirmOptions?.executionCadence)
  const getPhaseDelayMs = (phaseName, count = 1) => {
    return getExecutionCadenceDelayMs(executionCadence, phaseName, count)
  }
  const contextAttackName = String(context?.attackName ?? '').trim()
  const contextScheduledCommandId = String(context?.scheduledCommandId ?? '').trim()
  const templateForCommand = {
    ...templateBase,
    mode: 'send',
    ...(contextAttackName ? { attackName: contextAttackName } : {}),
    ...(contextScheduledCommandId ? { scheduledCommandId: contextScheduledCommandId } : {})
  }

  const initialLabel = view?.getLabel?.() || ''
  const total = selectedSenders.length
  const results = []
  const preparedQueue = []
  const worldUnits = getWorldUnitsOrder().filter(Boolean)
  let interruptedByCaptcha = false
  let interruptedMessage = ''
  let phaseTwoSkippedByPhaseOneError = false
  let phaseTwoSkippedByToggle = !ENABLE_PHASE_TWO
  let phaseThreeSkippedByToggle = !ENABLE_PHASE_THREE
  let phaseThreeCandidatesCount = 0
  let botProtectionProbeAttempted = false
  const targetName = String(plannerTarget?.name || '').trim()
  const targetK = parseFiniteNumber(plannerTarget?.k) ?? calcContinentFromCoords(targetX, targetY)
  view?.feedStart?.({
    total,
    title: `Alvo ${targetX}|${targetY}${targetK != null ? ` K${targetK}` : ''} | ${total} vila(s) selecionada(s)`,
    targetName,
    targetX,
    targetY,
    targetK
  })
  view?.feedSetPhase?.({ label: 'Verificando fase 1' })

  view?.info?.(`Fase 1: coletando payloads 0/${total}`, 1200)

  const probeBotProtection = async ({ force = false } = {}) => {
    if (botProtectionProbeAttempted && !force) return { skipped: true }
    botProtectionProbeAttempted = true
    return probeTwBotProtectionByOverviewGet()
  }

  try {
    await probeBotProtection()
  } catch (error) {
    if (!isCaptchaError(error)) throw error
    interruptedByCaptcha = true
    interruptedMessage = markCaptchaInterruption(view)
    view?.feedFinish?.({
      success: 0,
      failed: 0,
      total,
      message: `Pendentes: ${total}.`
    })
    view?.error?.('Captcha detectado antes de iniciar os envios (preflight).', 4500)
    return {
      success: 0,
      failed: 0,
      total,
      pending: total,
      interruptedByCaptcha: true,
      diagnostics: buildExecutionDiagnostics([]),
      results: [],
      worldUnits,
      sentUnitsByVillageId: []
    }
  }

  try {
    const phaseOneResult = await executeSendPhaseOneCollectPayloads({
      selectedSenders,
      total,
      targetX,
      targetY,
      templateForCommand,
      commandType,
      context,
      view,
      sleep,
      getPhaseDelayMs,
      isCaptchaError,
      probeBotProtection,
      results,
      preparedQueue
      ,
      onResultResolved
    })
    interruptedByCaptcha = phaseOneResult.interruptedByCaptcha
    interruptedMessage = phaseOneResult.interruptedMessage

    const hasPhaseOneError = results.some((item) => item?.sourceOk === false)
    if (hasPhaseOneError) {
      phaseTwoSkippedByPhaseOneError = true
      view?.error?.('Erro na fase 1. Fase 2 cancelada por falta de payload.', 3500)
    }

    if (!interruptedByCaptcha && !hasPhaseOneError && preparedQueue.length > 0 && !ENABLE_PHASE_TWO) {
      view?.info?.('Fase 2 desativada temporariamente.', 2500)
    }

    if (!interruptedByCaptcha && !hasPhaseOneError && preparedQueue.length > 0 && ENABLE_PHASE_TWO) {
      view?.feedSetPhase?.({ label: 'Engatilhando fase 2' })
      phaseTwoSkippedByToggle = false
      const phaseTwoResult = await executeSendPhaseTwoConfirmPayloads({
        preparedQueue,
        targetX,
        targetY,
        view,
        sleep,
        getPhaseDelayMs,
        isCaptchaError,
        probeBotProtection
        ,
        onResultResolved
      })
      if (phaseTwoResult.interruptedByCaptcha) {
        interruptedByCaptcha = true
        interruptedMessage = phaseTwoResult.interruptedMessage
      }

      if (!interruptedByCaptcha) {
        applyNightBonusGuardAfterConfirm({
          preparedQueue,
          context,
          plannerTarget,
          view
        })
      }

      const phaseThreeQueue = preparedQueue.filter((queueItem) => {
        if (queueItem?.resultItem?.blockedByNightBonus) return false
        const confirmPayload = queueItem?.resultItem?.result?.confirm?.payload
        return Array.isArray(confirmPayload) && confirmPayload.length > 0
      })
      phaseThreeCandidatesCount = phaseThreeQueue.length

      if (!interruptedByCaptcha && phaseThreeQueue.length > 0 && !ENABLE_PHASE_THREE) {
        view?.info?.('Fase 3 desativada temporariamente.', 2500)
      }

      if (!interruptedByCaptcha && phaseThreeQueue.length > 0 && ENABLE_PHASE_THREE) {
        view?.feedSetPhase?.({ label: 'Enviando fase 3' })
        phaseThreeSkippedByToggle = false
        const phaseThreeResult = await executeSendPhaseThreeDispatchCommands({
          preparedQueue: phaseThreeQueue,
          targetX,
          targetY,
          view,
          sleep,
          getPhaseDelayMs,
          isCaptchaError,
          probeBotProtection
          ,
          onResultResolved
        })
        if (phaseThreeResult.interruptedByCaptcha) {
          interruptedByCaptcha = true
          interruptedMessage = phaseThreeResult.interruptedMessage
        }
      }
    }
  } finally {
    view?.setLabel?.(initialLabel)
  }

  const processed = results.length
  const success = results.filter((item) => item.ok).length
  const failed = results.filter((item) => !item.ok && item.error).length
  const pendingSource = Math.max(0, total - processed)
  const pendingConfirm = (phaseTwoSkippedByPhaseOneError || phaseTwoSkippedByToggle)
    ? preparedQueue.length
    : results.filter((item) => item.sourceOk && !item.confirmOk && !item.error).length
  const pendingSend = phaseThreeSkippedByToggle
    ? phaseThreeCandidatesCount
    : results.filter((item) => item.confirmOk && !item.sendOk && !item.error).length
  const pending = pendingSource + pendingConfirm + pendingSend
  const sentUnitsByVillageId = collectSentUnitsByVillage(preparedQueue, worldUnits)
  const diagnostics = buildExecutionDiagnostics(results)
  if (interruptedByCaptcha) {
    const existingCaptchaCount = Math.max(0, Math.floor(Number(diagnostics?.causes?.captchaCount) || 0))
    diagnostics.causes = {
      ...(diagnostics?.causes || {}),
      captchaCount: Math.max(existingCaptchaCount, Math.max(0, total - success))
    }
  }

  view?.publishPhaseOneSummary?.({
    targetX,
    targetY,
    results
  })

  if (interruptedByCaptcha) {
    const message = `${interruptedMessage} Processados na fase 1: ${processed}/${total}.`
    view?.feedFinish?.({
      success,
      failed,
      total,
      message: pending > 0 ? `Pendentes: ${pending}.` : ''
    })
    view?.error?.(message, 4500)
    return {
      success,
      failed,
      total,
      pending,
      interruptedByCaptcha: true,
      diagnostics,
      results,
      worldUnits,
      sentUnitsByVillageId
    }
  }

  if (failed > 0 || pending > 0) {
    view?.feedFinish?.({ success, failed, total })
    view?.info?.(`Fluxo concluído: ${success} ok, ${failed} com erro, ${pending} pendente(s).`, 4000)
    return {
      success,
      failed,
      total,
      pending,
      interruptedByCaptcha: false,
      diagnostics,
      results,
      worldUnits,
      sentUnitsByVillageId
    }
  }
  view?.feedFinish?.({ success, failed, total })
  view?.success?.(`Fluxo concluído: ${success} comando(s) enviado(s).`, 3000)
  return {
    success,
    failed,
    total,
    pending,
    interruptedByCaptcha: false,
    diagnostics,
    results,
    worldUnits,
    sentUnitsByVillageId
  }
}
