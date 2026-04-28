import { useGoTiming } from "../../../hooks/useGoTiming";
import { validateCommandForNextPhase } from "../helpers/commandValidation";
import { markCaptchaInterruption, parseExecutionError } from "../helpers/errors";
import { isSuspiciousPayloadExecutionError } from "../helpers/twBotProtectionProbe";
import { awaitPlannerSendRunning } from "../helpers/runtime";
import { getAjaxCommandSourceVillage } from "../../../requests/getAjaxCommandSourceVillage";
import { appendExecutionLog, createExecutionLogEntry } from "../../../send/utils";
import { calcUnitDateTime } from "../../view/table/utils/calcDataSendersForDateTime";

function calcContinentFromCoords(x, y) {
  const numX = parseFiniteNumber(x)
  const numY = parseFiniteNumber(y)
  if (numX == null || numY == null) return null
  return (Math.floor(numY / 100) * 10) + Math.floor(numX / 100)
}

function parseFiniteNumber(value) {
  if (value == null || value === '') return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function normalizeConflictTroopsMode(value) {
  const mode = String(value || '').trim().toLowerCase()
  if (mode === 'abort' || mode === 'strict' || mode === 'estrito') return 'abort'
  return 'redistribute'
}

function buildSenderLabel(sender) {
  const fallbackId = Number.isFinite(Number(sender?.villageId))
    ? `Vila ${Number(sender.villageId)}`
    : 'Vila'
  const baseLabel = String(sender?.label || '').trim()
  if (baseLabel) return baseLabel
  const villageName = String(sender?.name || '').trim()
  const x = parseFiniteNumber(sender?.x)
  const y = parseFiniteNumber(sender?.y)
  const hasCoords = x != null && y != null
  const kValue = parseFiniteNumber(sender?.k)
  const continent = Number.isFinite(kValue) ? kValue : calcContinentFromCoords(x, y)
  const hasContinent = continent != null
  if (!villageName && !hasCoords) return fallbackId
  if (!villageName) return hasContinent ? `${x}|${y} K${continent}` : `${x}|${y}`
  if (!hasCoords) return villageName
  return hasContinent
    ? `${villageName} (${x}|${y}) K${continent}`
    : `${villageName} (${x}|${y})`
}

export async function executeSendPhaseOneCollectPayloads({
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
  preparedQueue,
  onResultResolved = null
}) {
  let interruptedByCaptcha = false
  let interruptedMessage = ''
  for (let index = 0; index < total; index += 1) {
    await awaitPlannerSendRunning()

    const delayMs = Number(getPhaseDelayMs?.('phase1') || 0)
    if (delayMs > 0) await sleep(delayMs)
    await awaitPlannerSendRunning()

    const sender = selectedSenders[index]
    const current = index + 1
    const execId = `send:${sender.villageId}:${index}`
    const senderLabel = buildSenderLabel(sender)
    const title = senderLabel
    view?.feedSetProgress?.({ current, total })
    view?.feedUpsert?.({
      id: '__exec:last__',
      status: 'info',
      title: `Fase 1/3 | Preparação ${current}/${total}`,
      detail: title
    })
    view?.feedUpsert?.({
      id: execId,
      status: 'running',
      title,
      detail: `Abrindo praça e conferindo tropas... (${current}/${total})`
    })
    view?.setLabel?.(`Fase 1 ${current}/${total}`)
    try {
      const data = await getAjaxCommandSourceVillage(
        sender.villageId,
        targetX,
        targetY,
        templateForCommand,
        {
          commandType,
          normalizeContext: {
            mode: 'send',
            commandType,
            fakeLimitPercent: Number.isFinite(Number(context?.fakeLimitPercent))
              ? Number(context.fakeLimitPercent)
              : undefined,
            targetPlayerId: Number.isFinite(Number(context?.targetPlayerId))
              ? Number(context.targetPlayerId)
              : undefined,
            minSpyCommand: context?.minSpyCommand && typeof context.minSpyCommand === 'object'
              ? context.minSpyCommand
              : undefined,
            conflictTroops: normalizeConflictTroopsMode(context?.conflictTroopsMode)
          }
        }
      )
      const slowestUnit = String(data?.templateNormalized?.meta?.slowestUnit || '').trim() || null
      const distance = Number(sender?.distance)
      const slowestDurationSeconds = (
        slowestUnit &&
        Number.isFinite(distance) &&
        distance > 0
      )
        ? Number(calcUnitDateTime(slowestUnit, distance, null, useGoTiming.getServerNowMs(), 'send')?.seconds) || null
        : null
      if (slowestUnit) data.slowestUnit = slowestUnit
      if (Number.isFinite(Number(slowestDurationSeconds)) && slowestDurationSeconds > 0) {
        data.slowestDurationSeconds = Math.floor(slowestDurationSeconds)
      }
      const validation = validateCommandForNextPhase(data)
      if (!validation.ok) throw new Error(validation.errorMessage)
      const rows = Array.isArray(data?.templateNormalized?.values)
        ? data.templateNormalized.values.length
        : 0
      const resolutions = Array.isArray(data?.templateNormalized?.meta?.resolutions)
        ? data.templateNormalized.meta.resolutions
        : []
      const resolutionText = resolutions
        .map((item) => String(item?.message || '').trim())
        .filter(Boolean)
        .join(' | ')

      const resultItem = {
        villageId: sender.villageId,
        ok: false,
        sourceOk: true,
        confirmOk: false,
        sendOk: false,
        rows,
        requestedAttackCount: Math.max(0, Math.floor(Number(data?.templateNormalized?.meta?.requestedAttackCount) || rows)),
        preparedAttackCount: Math.max(0, Math.floor(Number(data?.templateNormalized?.meta?.finalAttackCount) || rows)),
        finalAttackCount: 0,
        captchaDetected: false,
        confirmDurationSecond: null,
        confirmAtMs: null,
        slowestUnit,
        slowestDurationSeconds: Number.isFinite(Number(slowestDurationSeconds)) && slowestDurationSeconds > 0
          ? Math.floor(slowestDurationSeconds)
          : null,
        payloadSize: Array.isArray(data?.payload) ? data.payload.length : 0,
        payloadConfirmSize: 0,
        hasPayload: validation.hasPayload,
        hasAtLeastOneAttack: validation.hasAtLeastOneAttack,
        resolutions,
        error: '',
        result: {
          source: data,
          confirm: null,
          send: null
        }
      }
      results.push(resultItem)
      preparedQueue.push({
        sender,
        execId,
        title,
        resultItem
      })

      appendExecutionLog(
        createExecutionLogEntry({
          mode: 'send',
          phase: 'phase1',
          status: 'success',
          villageId: sender.villageId,
          target: { x: targetX, y: targetY },
          message: resolutionText || `Payload preparado com ${rows} linha(s).`,
          meta: {
            rows,
            payloadSize: Array.isArray(data?.payload) ? data.payload.length : 0,
            resolutions,
            slowestUnit,
            slowestDurationSeconds: Number.isFinite(Number(slowestDurationSeconds)) && slowestDurationSeconds > 0
              ? Math.floor(slowestDurationSeconds)
              : null
          }
        })
      )
      view?.feedUpsert?.({
        id: execId,
        status: 'success',
        title,
        detail: resolutionText
          ? `ok ${current}/${total} | ataques: ${rows} | payload: ${resultItem.payloadSize} campos | ${resolutionText}`
          : `ok ${current}/${total} | ataques: ${rows} | payload: ${resultItem.payloadSize} campos`
      })
    } catch (error) {
      let resolvedError = error
      if (!isCaptchaError(error) && isSuspiciousPayloadExecutionError(error)) {
        try {
          await probeBotProtection?.()
        } catch (probeError) {
          if (isCaptchaError(probeError)) {
            resolvedError = probeError
          } else {
            console.error('[planner][captcha-probe][phase1]', probeError)
          }
        }
      }
      const { errorMsg, captchaDetected } = parseExecutionError(resolvedError, isCaptchaError)
      const resultItem = {
        villageId: sender.villageId,
        ok: false,
        sourceOk: false,
        confirmOk: false,
        sendOk: false,
        rows: 0,
        requestedAttackCount: 0,
        preparedAttackCount: 0,
        finalAttackCount: 0,
        captchaDetected: captchaDetected,
        payloadSize: 0,
        payloadConfirmSize: 0,
        hasPayload: false,
        hasAtLeastOneAttack: false,
        confirmDurationSecond: null,
        resolutions: [],
        error: errorMsg
      }
      results.push(resultItem)
      onResultResolved?.(resultItem)
      appendExecutionLog(
        createExecutionLogEntry({
          mode: 'send',
          phase: 'phase1',
          status: 'error',
          villageId: sender.villageId,
          target: { x: targetX, y: targetY },
          message: captchaDetected
            ? 'Captcha detectado. Execução interrompida antes de continuar.'
            : 'Falha ao preparar comando na fase 1.',
          error: errorMsg
        })
      )
      view?.feedUpsert?.({
        id: execId,
        status: 'error',
        title,
        detail: `Erro ${current}/${total} | ${errorMsg}`,
        finalStatus: true
      })
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
