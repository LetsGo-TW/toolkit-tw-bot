import { hasPayloadForNextPhase } from "../helpers/commandValidation";
import { markCaptchaInterruption, parseExecutionError } from "../helpers/errors";
import { isSuspiciousPayloadExecutionError } from "../helpers/twBotProtectionProbe";
import { awaitPlannerSendRunning } from "../helpers/runtime";
import { postAjaxCommandPopup } from "../../../requests/postAjaxCommandPopup";
import { appendExecutionLog, createExecutionLogEntry } from "../../../send/utils";
import { getWorldUnitsOrder } from "../../../unit";

const TRAIN_INPUT_RE = /^train\[(\d+)\]\[([^\]]+)\]$/
const MAX_ATTACKS_PER_COMMAND = 5

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

function countAttacksInConfirmPayload(payloadConfirm, worldUnits = []) {
  const entries = toPayloadEntries(payloadConfirm)
  if (!entries.length || !worldUnits.length) return 0
  let hasBaseAttack = false
  const trainAttackIndexSet = new Set()
  entries.forEach(([rawName, rawValue]) => {
    const name = String(rawName || '')
    if (worldUnits.includes(name)) {
      if (toPositiveQty(rawValue) > 0) hasBaseAttack = true
      return
    }
    const trainMatch = name.match(TRAIN_INPUT_RE)
    if (!trainMatch) return
    const trainIndex = Number(trainMatch[1])
    const unit = String(trainMatch[2] || '')
    if (!Number.isFinite(trainIndex) || trainIndex <= 1) return
    if (!worldUnits.includes(unit)) return
    if (toPositiveQty(rawValue) <= 0) return
    trainAttackIndexSet.add(trainIndex)
  })
  return (hasBaseAttack ? 1 : 0) + trainAttackIndexSet.size
}

function formatDispatchDelayDetail(delayMs = 0) {
  const value = Number(delayMs)
  if (!Number.isFinite(value) || value <= 0) return 'sem pausa'
  return `${Math.floor(value)}ms`
}

export async function executeSendPhaseThreeDispatchCommands({
  preparedQueue,
  targetX,
  targetY,
  view,
  sleep,
  getPhaseDelayMs,
  isCaptchaError,
  probeBotProtection,
  onResultResolved = null
}) {
  const worldUnits = getWorldUnitsOrder().filter((unit) => Boolean(unit))
  let interruptedByCaptcha = false
  let interruptedMessage = ''
  const phaseThreeQueue = (Array.isArray(preparedQueue) ? preparedQueue : [])
    .filter((queueItem) => {
      const payload = queueItem?.resultItem?.result?.confirm?.payload
      return hasPayloadForNextPhase(payload)
    })
  const phaseThreeTotal = phaseThreeQueue.length
  view?.info?.(`Fase 3: enviando ${phaseThreeTotal} comando(s)...`, 1500)
  for (let index = 0; index < phaseThreeTotal; index += 1) {
    await awaitPlannerSendRunning()

    const current = index + 1
    const queueItem = phaseThreeQueue[index]
    const { sender, execId, title, resultItem } = queueItem
    const sourceTemplateNormalized = resultItem?.result?.source?.templateNormalized
    const confirmPayload = resultItem?.result?.confirm?.payload
    const attackCount = countAttacksInConfirmPayload(confirmPayload, worldUnits)
    resultItem.finalAttackCount = attackCount
    const nextDelayMs = Number(getPhaseDelayMs?.('phase3', attackCount) || 0)
    if (!hasPayloadForNextPhase(confirmPayload)) {
      resultItem.ok = false
      resultItem.sendOk = false
      resultItem.captchaDetected = false
      resultItem.error = 'Payload de envio final ausente.'
      appendExecutionLog(
        createExecutionLogEntry({
          mode: 'send',
          phase: 'phase3',
          status: 'error',
          villageId: sender?.villageId,
          target: { x: targetX, y: targetY },
          message: 'Falha ao enviar comando na fase 3.',
          error: resultItem.error
        })
      )
      view?.feedUpsert?.({
        id: execId,
        status: 'error',
        title,
        detail: `Erro ${current}/${phaseThreeTotal} | ${resultItem.error}`,
        finalStatus: true
      })
      onResultResolved?.(resultItem)
      continue
    }
    if (attackCount <= 0) {
      resultItem.ok = false
      resultItem.sendOk = false
      resultItem.captchaDetected = false
      resultItem.error = 'Comando inválido para envio final: sem ataque no payload.'
      appendExecutionLog(
        createExecutionLogEntry({
          mode: 'send',
          phase: 'phase3',
          status: 'error',
          villageId: sender?.villageId,
          target: { x: targetX, y: targetY },
          message: 'Falha ao enviar comando na fase 3.',
          error: resultItem.error
        })
      )
      view?.feedUpsert?.({
        id: execId,
        status: 'error',
        title,
        detail: `Erro ${current}/${phaseThreeTotal} | ${resultItem.error}`,
        finalStatus: true
      })
      onResultResolved?.(resultItem)
      continue
    }
    if (attackCount > MAX_ATTACKS_PER_COMMAND) {
      resultItem.ok = false
      resultItem.sendOk = false
      resultItem.captchaDetected = false
      resultItem.error = `Comando inválido: máximo ${MAX_ATTACKS_PER_COMMAND} ataques por comando (recebido: ${attackCount}).`
      appendExecutionLog(
        createExecutionLogEntry({
          mode: 'send',
          phase: 'phase3',
          status: 'error',
          villageId: sender?.villageId,
          target: { x: targetX, y: targetY },
          message: 'Falha ao enviar comando na fase 3.',
          error: resultItem.error
        })
      )
      view?.feedUpsert?.({
        id: execId,
        status: 'error',
        title,
        detail: `Erro ${current}/${phaseThreeTotal} | ${resultItem.error}`,
        finalStatus: true
      })
      onResultResolved?.(resultItem)
      continue
    }
    view?.feedSetProgress?.({ current, total: phaseThreeTotal })
    view?.feedUpsert?.({
      id: '__exec:last__',
      status: 'info',
      title: `Fase 3/3 | Envio ${current}/${phaseThreeTotal}`,
      detail: title
    })
    view?.feedUpsert?.({
      id: execId,
      status: 'running',
      title,
      detail: `Enviando comando... (${current}/${phaseThreeTotal}) | ataques: ${attackCount}`
    })
    view?.setLabel?.(`Fase 3 ${current}/${phaseThreeTotal}`)
    if (nextDelayMs > 0) {
      view?.feedUpsert?.({
        id: '__exec:next__',
        status: 'info',
        title: `Cadência ${current}/${phaseThreeTotal}`,
        detail: `Aguardando ${formatDispatchDelayDetail(nextDelayMs)} antes do envio | ${attackCount} ataque(s)`
      })
      await sleep(nextDelayMs)
    }
    await awaitPlannerSendRunning()

    try {
      const responseData = await postAjaxCommandPopup(confirmPayload, {
        templateNormalized: sourceTemplateNormalized
      })
      resultItem.ok = true
      resultItem.sendOk = true
      resultItem.captchaDetected = false
      resultItem.error = ''
      resultItem.result.send = responseData
      appendExecutionLog(
        createExecutionLogEntry({
          mode: 'send',
          phase: 'phase3',
          status: 'success',
          villageId: sender?.villageId,
          target: { x: targetX, y: targetY },
          message: 'Comando enviado com sucesso.',
          meta: {
            attackCount,
            nextDelayMs,
            timeGenerated: responseData?.timeGenerated ?? null,
            message: responseData?.message || ''
          }
        })
      )
      view?.feedUpsert?.({
        id: execId,
        status: 'success',
        title,
        detail: `ok ${current}/${phaseThreeTotal} | enviado (${attackCount} ataque(s))`,
        finalStatus: true
      })
      onResultResolved?.(resultItem)
    } catch (error) {
      let resolvedError = error
      if (!isCaptchaError(error) && isSuspiciousPayloadExecutionError(error)) {
        try {
          await probeBotProtection?.({ force: true })
        } catch (probeError) {
          if (isCaptchaError(probeError)) {
            resolvedError = probeError
          } else {
            console.error('[planner][captcha-probe][phase3]', probeError)
          }
        }
      }
      const { errorMsg, captchaDetected } = parseExecutionError(resolvedError, isCaptchaError)
      resultItem.ok = false
      resultItem.sendOk = false
      resultItem.captchaDetected = captchaDetected
      resultItem.error = errorMsg
      appendExecutionLog(
        createExecutionLogEntry({
          mode: 'send',
          phase: 'phase3',
          status: 'error',
          villageId: sender?.villageId,
          target: { x: targetX, y: targetY },
          message: captchaDetected
            ? 'Captcha detectado durante envio final. Execução interrompida.'
            : 'Falha ao enviar comando na fase 3.',
          error: errorMsg
        })
      )
      view?.feedUpsert?.({
        id: execId,
        status: 'error',
        title,
        detail: `Erro ${current}/${phaseThreeTotal} | ${errorMsg}`,
        finalStatus: true
      })
      onResultResolved?.(resultItem)
      if (captchaDetected) {
        interruptedByCaptcha = true
        interruptedMessage = markCaptchaInterruption(view)
        break
      }
    }
  }
  return {
    interruptedByCaptcha,
    interruptedMessage,
    phaseThreeTotal
  }
}
