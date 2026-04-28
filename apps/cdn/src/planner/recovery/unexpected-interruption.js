import {
  clearPlannerPendingSendSession,
  readPlannerPendingSendSession
} from "./pendingSession";

function pickInt(value) {
  return Math.max(0, Math.floor(Number(value) || 0))
}

function trimText(value) {
  return String(value || '').trim()
}

function clone(value) {
  return JSON.parse(JSON.stringify(value))
}

function getReportSettings(report = null) {
  return (report?.settings && typeof report.settings === 'object') ? report.settings : {}
}

function getReportDistributedCount(report = null) {
  const settings = getReportSettings(report)
  const meta = (report?.distribution?.meta && typeof report.distribution.meta === 'object') ? report.distribution.meta : {}
  return Math.max(
    pickInt(settings.distributedCount),
    pickInt(meta.assignedCount),
    pickInt(meta.commandsCount)
  )
}

function getReportErrorCount(report = null) {
  const settings = getReportSettings(report)
  const execution = (report?.execution && typeof report.execution === 'object') ? report.execution : {}
  return Math.max(
    pickInt(settings.errorCount),
    pickInt(execution.failed) + pickInt(execution.pending)
  )
}

function getReportSentCount(report = null) {
  const settings = getReportSettings(report)
  const execution = (report?.execution && typeof report.execution === 'object') ? report.execution : {}
  return Math.max(
    pickInt(settings.sentCount),
    pickInt(execution.success)
  )
}

function getReportCaptchaErrorCount(report = null) {
  return pickInt(getReportSettings(report).captchaErrorCount)
}

function getReportUnexpectedErrorCount(report = null) {
  return pickInt(getReportSettings(report).unexpectedErrorCount)
}

function getDraftRefFromReport(report = null) {
  const settings = getReportSettings(report)
  const draftId = trimText(settings.targetsDraftId || settings.draftId)
  return draftId || null
}

function buildPendingCommandsByTargetKey(commands = []) {
  return (Array.isArray(commands) ? commands : []).reduce((acc, command) => {
    const targetKey = trimText(command?.targetKey)
    if (!targetKey) return acc
    acc.set(targetKey, pickInt(acc.get(targetKey)) + 1)
    return acc
  }, new Map())
}

function buildUnexpectedDiagnostics(prevDiagnostics = null, count = 0) {
  const nextCount = pickInt(count)
  const prev = (prevDiagnostics && typeof prevDiagnostics === 'object') ? clone(prevDiagnostics) : {}
  const send = (prev.send && typeof prev.send === 'object') ? prev.send : {}
  const causes = (prev.causes && typeof prev.causes === 'object') ? prev.causes : {}
  const messages = Array.isArray(send.messages) ? send.messages.map((item) => trimText(item)).filter(Boolean) : []
  if (!messages.includes('Interrupção inesperada.')) messages.push('Interrupção inesperada.')
  return {
    ...prev,
    send: {
      ...send,
      errorCount: pickInt(send.errorCount) + nextCount,
      messages: messages.slice(0, 6)
    },
    causes: {
      ...causes,
      unexpectedCount: pickInt(causes.unexpectedCount) + nextCount
    }
  }
}

function getTargetUnexpectedPendingCount(item = null) {
  const status = (item?.dispatchStatus && typeof item.dispatchStatus === 'object') ? item.dispatchStatus : {}
  const distributedQty = pickInt(status.distributedQty)
  const sendOkQty = pickInt(status.sendOkQty)
  const sendFailQty = pickInt(status.sendFailQty)
  const sendPendingQty = pickInt(status.sendPendingQty)
  return Math.max(sendPendingQty, Math.max(0, distributedQty - sendOkQty - sendFailQty))
}

function updateDraftItemUnexpected(item = null, unexpectedCountOverride = null) {
  if (!item || typeof item !== 'object') return { changed: false, item, unexpectedCount: 0 }
  const status = (item.dispatchStatus && typeof item.dispatchStatus === 'object') ? clone(item.dispatchStatus) : null
  if (!status) return { changed: false, item, unexpectedCount: 0 }
  const unexpectedCount = pickInt(unexpectedCountOverride) || getTargetUnexpectedPendingCount(item)
  if (unexpectedCount <= 0) return { changed: false, item, unexpectedCount: 0 }
  const remainingQty = pickInt(status.remainingQty)
  const prevFailQty = pickInt(status.sendFailQty)
  const prevPendingQty = pickInt(status.sendPendingQty)
  status.sendFailQty = prevFailQty + unexpectedCount
  status.sendPendingQty = Math.max(0, prevPendingQty - unexpectedCount)
  status.retryQty = remainingQty + status.sendFailQty + status.sendPendingQty
  status.diagnostics = buildUnexpectedDiagnostics(status.diagnostics || null, unexpectedCount)
  return {
    changed: true,
    unexpectedCount,
    item: {
      ...item,
      dispatchStatus: status
    }
  }
}

export async function getUnexpectedInterruptionState({
  report = null,
  draftCore = null
} = {}) {
  if (!report || typeof report !== 'object' || !draftCore) return null
  await draftCore.ready?.()
  const distributedCount = getReportDistributedCount(report)
  const sentCount = getReportSentCount(report)
  const errorCount = getReportErrorCount(report)
  const missingCount = Math.max(0, distributedCount - (sentCount + errorCount))
  if (missingCount <= 0) return null
  const pendingSession = await readPlannerPendingSendSession()
  const pendingCommands = trimText(pendingSession?.reportId) === trimText(report?.reportId)
    ? (Array.isArray(pendingSession?.commands) ? pendingSession.commands : [])
    : []
  const draftId = getDraftRefFromReport(report)
  const draft = draftId
    ? draftCore.readNamedDraft?.(draftId)
    : draftCore.readDraft?.()
  return {
    report,
    draft: draft || null,
    draftId,
    distributedCount,
    sentCount,
    errorCount,
    missingCount,
    pendingCommands
  }
}

export function matchesUnexpectedInterruptionState(state = null, draftId = null) {
  if (!state || typeof state !== 'object') return false
  const expectedDraftId = trimText(state?.draftId)
  const incomingDraftId = trimText(draftId)
  if (expectedDraftId) return expectedDraftId === incomingDraftId
  return !incomingDraftId
}

export async function applyUnexpectedInterruptionRecovery({
  state = null,
  draftCore = null,
  writeReport = null
} = {}) {
  if (!state || typeof state !== 'object' || !draftCore || typeof writeReport !== 'function') {
    return { applied: false, unexpectedCount: 0, draft: null, report: null }
  }

  const draft = state?.draft && typeof state.draft === 'object' ? clone(state.draft) : null
  let unexpectedCount = 0
  let nextDraft = draft
  const pendingCommands = Array.isArray(state?.pendingCommands) ? state.pendingCommands : []
  const pendingByTargetKey = buildPendingCommandsByTargetKey(pendingCommands)

  if (draft && Array.isArray(draft.targets)) {
    nextDraft = {
      ...draft,
      targets: draft.targets.map((item) => {
        const targetKey = `${Number(item?.x)}|${Number(item?.y)}`
        const result = updateDraftItemUnexpected(item, pendingByTargetKey.get(targetKey))
        unexpectedCount += result.unexpectedCount
        return result.item
      })
    }
    if (state?.draftId) draftCore.writeDraft?.(nextDraft, { draftId: state.draftId })
    else draftCore.writeDraft?.(nextDraft)
  }

  const report = clone(state.report || {})
  const settings = getReportSettings(report)
  const previousErrorCount = getReportErrorCount(report)
  const previousUnexpectedCount = getReportUnexpectedErrorCount(report)
  const nextUnexpectedCount = Math.max(
    previousUnexpectedCount,
    unexpectedCount || pickInt(pendingCommands.length || state.missingCount)
  )
  const nextErrorCount = Math.max(previousErrorCount, previousErrorCount + Math.max(0, nextUnexpectedCount - previousUnexpectedCount))
  const nextExecution = (report.execution && typeof report.execution === 'object') ? clone(report.execution) : {}
  nextExecution.failed = pickInt(nextExecution.failed) + Math.max(0, nextUnexpectedCount - previousUnexpectedCount)
  nextExecution.pending = 0
  nextExecution.unexpectedErrorCount = nextUnexpectedCount

  const nextReport = await writeReport({
    ...report,
    settings: {
      ...settings,
      errorCount: nextErrorCount,
      unexpectedErrorCount: nextUnexpectedCount,
      sentCount: getReportSentCount(report),
      distributedCount: getReportDistributedCount(report)
    },
    execution: nextExecution
  })
  await clearPlannerPendingSendSession({ reportId: trimText(state?.report?.reportId) || null })

  return {
    applied: true,
    unexpectedCount: nextUnexpectedCount,
    draft: nextDraft,
    report: nextReport
  }
}
