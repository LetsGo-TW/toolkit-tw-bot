import { hasPayloadForNextPhase, validateCommandForNextPhase } from "../helpers/commandValidation";
import { markCaptchaInterruption, parseExecutionError } from "../helpers/errors";
import { isSuspiciousPayloadExecutionError } from "../helpers/twBotProtectionProbe";
import { awaitPlannerSendRunning } from "../helpers/runtime";
import { postAjaxCommandConfirm } from "../../../requests/postAjaxCommandConfirm";
import { appendExecutionLog, createExecutionLogEntry } from "../../../send/utils";
import { useGoTiming } from "../../../hooks/useGoTiming";

export async function executeSendPhaseTwoConfirmPayloads({
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
  let interruptedByCaptcha = false
  let interruptedMessage = ''
  const phaseTwoTotal = preparedQueue.length
  view?.info?.(`Fase 2: confirmando ${phaseTwoTotal} payload(s)...`, 1500)
  for (let index = 0; index < phaseTwoTotal; index += 1) {
    await awaitPlannerSendRunning()

    const delayMs = Number(getPhaseDelayMs?.('phase2') || 0)
    if (delayMs > 0) await sleep(delayMs)
    await awaitPlannerSendRunning()

    const current = index + 1
    const queueItem = preparedQueue[index]
    const { sender, execId, title, resultItem } = queueItem
    const sourceData = resultItem?.result?.source
    const validation = validateCommandForNextPhase(sourceData)
    if (!validation.ok) {
      resultItem.ok = false
      resultItem.confirmOk = false
      resultItem.sendOk = false
      resultItem.captchaDetected = false
      resultItem.hasPayload = validation.hasPayload
      resultItem.hasAtLeastOneAttack = validation.hasAtLeastOneAttack
      resultItem.error = validation.errorMessage
      appendExecutionLog(
        createExecutionLogEntry({
          mode: 'send',
          phase: 'phase2',
          status: 'error',
          villageId: sender?.villageId,
          target: { x: targetX, y: targetY },
          message: 'Falha ao confirmar comando na fase 2.',
          error: validation.errorMessage
        })
      )
      view?.feedUpsert?.({
        id: execId,
        status: 'error',
        title,
        detail: `Erro ${current}/${phaseTwoTotal} | ${validation.errorMessage}`,
        finalStatus: true
      })
      onResultResolved?.(resultItem)
      continue
    }
    const sourcePayload = sourceData?.payload
    const sourcePayloadSize = Array.isArray(sourcePayload) ? sourcePayload.length : 0
    view?.feedSetProgress?.({ current, total: phaseTwoTotal })
    view?.feedUpsert?.({
      id: '__exec:last__',
      status: 'info',
      title: `Fase 2/3 | Confirm ${current}/${phaseTwoTotal}`,
      detail: title
    })
    view?.feedUpsert?.({
      id: execId,
      status: 'running',
      title,
      detail: `Enviando confirm... (${current}/${phaseTwoTotal}) | origem: ${sourcePayloadSize} campos`
    })
    view?.setLabel?.(`Fase 2 ${current}/${phaseTwoTotal}`)
    try {
      const dispatchMode = String(sourceData?.templateNormalized?.meta?.mode || 'send').toLowerCase() === 'schedule'
        ? 'schedule'
        : 'send'
      const confirmData = await postAjaxCommandConfirm(sourcePayload, {
        templateNormalized: sourceData?.templateNormalized,
        attackName: sourceData?.attackName,
        dispatchMode,
        scheduledCommandId: sourceData?.scheduledCommandId
      })
      const confirmPayload = confirmData?.payload
      if (!hasPayloadForNextPhase(confirmPayload)) {
        throw new Error('TW retornou confirmação sem payload final.')
      }
      resultItem.ok = true
      resultItem.confirmOk = true
      resultItem.sendOk = false
      resultItem.captchaDetected = false
      resultItem.error = ''
      resultItem.confirmDurationSecond = Number.isFinite(Number(confirmData?.durationSecond))
        ? Number(confirmData.durationSecond)
        : null
      resultItem.confirmAtMs = Number(useGoTiming?.getServerNowMs?.() || Date.now())
      resultItem.payloadConfirmSize = Array.isArray(confirmData?.payload)
        ? confirmData.payload.length
        : 0
      resultItem.result.confirm = confirmData
      appendExecutionLog(
        createExecutionLogEntry({
          mode: 'send',
          phase: 'phase2',
          status: 'success',
          villageId: sender?.villageId,
          target: { x: targetX, y: targetY },
          message: 'Confirm gerado com sucesso.',
          meta: {
            payloadConfirmSize: resultItem.payloadConfirmSize,
            confirmDurationSecond: resultItem.confirmDurationSecond
          }
        })
      )
      view?.feedUpsert?.({
        id: execId,
        status: 'success',
        title,
        detail: Number.isFinite(Number(resultItem.confirmDurationSecond))
          ? `ok ${current}/${phaseTwoTotal} | confirm: ${resultItem.payloadConfirmSize} campos | duração: ${resultItem.confirmDurationSecond}s`
          : `ok ${current}/${phaseTwoTotal} | confirm: ${resultItem.payloadConfirmSize} campos`
      })
    } catch (error) {
      let resolvedError = error
      if (!isCaptchaError(error) && isSuspiciousPayloadExecutionError(error)) {
        try {
          await probeBotProtection?.({ force: true })
        } catch (probeError) {
          if (isCaptchaError(probeError)) {
            resolvedError = probeError
          } else {
            console.error('[planner][captcha-probe][phase2]', probeError)
          }
        }
      }
      const { errorMsg, captchaDetected } = parseExecutionError(resolvedError, isCaptchaError)
      resultItem.ok = false
      resultItem.confirmOk = false
      resultItem.sendOk = false
      resultItem.captchaDetected = captchaDetected
      resultItem.error = errorMsg
      appendExecutionLog(
        createExecutionLogEntry({
          mode: 'send',
          phase: 'phase2',
          status: 'error',
          villageId: sender?.villageId,
          target: { x: targetX, y: targetY },
          message: captchaDetected
            ? 'Captcha detectado durante confirm. Execução interrompida.'
            : 'Falha ao confirmar comando na fase 2.',
          error: errorMsg
        })
      )
      view?.feedUpsert?.({
        id: execId,
        status: 'error',
        title,
        detail: `Erro ${current}/${phaseTwoTotal} | ${errorMsg}`,
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
    interruptedMessage
  }
}
