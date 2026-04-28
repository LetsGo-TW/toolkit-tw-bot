export function createExecutionView({ root, feedController } = {}) {
  const labelEl = root?.querySelector?.('[data-dispatch-label]') || null
  const feed = feedController || null

  const getLabel = () => labelEl?.textContent || ''
  const setLabel = (text) => {
    if (!labelEl) return
    labelEl.textContent = String(text || '')
  }

  const notify = (status, message) => {
    const detail = String(message || '').trim()
    if (!detail) return
    const normalizedStatus = status === 'error' || status === 'success' ? status : 'running'
    const title = normalizedStatus === 'error'
      ? 'Execução'
      : normalizedStatus === 'success'
        ? 'Execução'
        : 'Andamento'
    feed?.upsert?.({
      id: '__exec:notice__',
      status: normalizedStatus,
      title,
      detail
    })
  }

  const info = (message) => {
    notify('running', message)
  }

  const error = (message) => {
    notify('error', message)
  }

  const success = (message) => {
    notify('success', message)
  }

  const feedStart = (payload) => {
    feed?.start?.(payload)
    feed?.startDuration?.('send')
  }
  const feedSetProgress = (payload) => feed?.setProgress?.(payload)
  const feedSetPhase = (payload) => feed?.setPhase?.(payload)
  const feedUpsert = (payload) => feed?.upsert?.(payload)
  const feedFinish = (payload) => {
    feed?.stopDuration?.('send')
    feed?.finish?.(payload)
  }

  const publishPhaseOneSummary = ({ targetX, targetY, results }) => {
    window.__GO_PLANNER_SEND_PHASE1__ = {
      createdAt: Date.now(),
      mode: 'send',
      target: { x: targetX, y: targetY },
      results
    }
    console.groupCollapsed('[planner][send][phase1]')
    console.table((Array.isArray(results) ? results : []).map((item) => ({
      villageId: item.villageId,
      ok: item.ok,
      sourceOk: item.sourceOk ?? false,
      confirmOk: item.confirmOk ?? false,
      sendOk: item.sendOk ?? false,
      rows: item.rows ?? 0,
      payloadSize: item.payloadSize ?? 0,
      payloadConfirmSize: item.payloadConfirmSize ?? 0,
      confirmDurationSecond: item.confirmDurationSecond ?? null,
      error: item.error || ''
    })))
    console.log(window.__GO_PLANNER_SEND_PHASE1__)
    console.groupEnd()
  }

  return {
    getLabel,
    setLabel,
    info,
    error,
    success,
    feedStart,
    feedSetProgress,
    feedSetPhase,
    feedUpsert,
    feedFinish,
    publishPhaseOneSummary
  }
}
