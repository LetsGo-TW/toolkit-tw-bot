import { useGoTiming } from '../../hooks/useGoTiming'
import './style.css'

const STATUS_TEXT = {
  pending: 'pendente',
  running: 'executando',
  success: 'sucesso',
  warn: 'atenção',
  error: 'erro',
  info: 'info'
}

const PHASE_LABELS = {
  phase1: 'Preparação',
  phase2: 'Confirmação',
  phase3: 'Envio'
}

const EXEC_DURATION_KEYS = new Set(['distribution', 'send'])

function createRowHtml(entry) {
  const status = String(entry?.status || 'pending')
  const statusLabel = STATUS_TEXT[status] || status
  const title = String(entry?.title || '').trim()
  const detail = String(entry?.detail || '').trim()
  return `
    <li class="go-ef-row" data-exec-id="${entry.id}">
      <div class="go-ef-status-col">
        <span class="go-ef-status is-${status}">${statusLabel}</span>
      </div>
      <div class="go-ef-content">
        <span class="go-ef-title">${title}</span>
        ${detail ? `<span class="go-ef-detail">${detail}</span>` : ''}
      </div>
    </li>
  `
}

function normalizeText(value) {
  return String(value || '').trim()
}

function toLower(value) {
  return normalizeText(value).toLowerCase()
}

function stripTargetPrefix(text = '') {
  return normalizeText(text).replace(/^Alvo:\s*/i, '').trim()
}

function isUsableTargetLabel(text = '') {
  const normalized = normalizeText(text)
  if (!normalized) return false
  const lower = normalized.toLowerCase()
  if (lower.includes('vários alvos')) return false
  if (/\b0\|0\b/.test(normalized)) return false
  return true
}

function inferPhaseKey({ title = '', detail = '', phaseText = '' } = {}) {
  const hay = `${toLower(title)} | ${toLower(detail)} | ${toLower(phaseText)}`
  if (hay.includes('fase 1') || hay.includes('abrindo praça') || hay.includes('payload')) return 'phase1'
  if (hay.includes('fase 2') || hay.includes('confirm')) return 'phase2'
  if (hay.includes('fase 3') || hay.includes('enviando comando') || hay.includes('enviado')) return 'phase3'
  return null
}

function parseAttackCount(detail = '') {
  const text = normalizeText(detail)
  const patterns = [
    /ataques:\s*(\d+)/i,
    /enviado\s*\((\d+)\s*ataque/i,
    /comando atual:\s*(\d+)\s*ataque/i
  ]
  for (const rx of patterns) {
    const match = text.match(rx)
    if (match) {
      const count = Number(match[1])
      if (Number.isFinite(count) && count > 0) return Math.floor(count)
    }
  }
  return null
}

function parseDurationSeconds(detail = '') {
  const text = normalizeText(detail)
  const patterns = [
    /dura[çc][aã]o:\s*(\d+)s/i,
    /b[oô]nus noturno\s*\((\d+)s\)/i,
    /\((\d+)s\)/
  ]
  for (const rx of patterns) {
    const match = text.match(rx)
    if (match) {
      const seconds = Number(match[1])
      if (Number.isFinite(seconds) && seconds > 0) return Math.floor(seconds)
    }
  }
  return null
}

function formatArrivalDateTimeFromMs(value) {
  const ms = Number(value)
  if (!Number.isFinite(ms) || ms <= 0) return ''
  const date = new Date(ms)
  const pad = (n) => String(n).padStart(2, '0')
  return `${pad(date.getDate())}/${pad(date.getMonth() + 1)} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
}

function getTwNowMsSafe() {
  try {
    const offsetMs = Number(useGoTiming?.getOffsetMs?.())
    if (Number.isFinite(offsetMs)) {
      const nowByOffset = Date.now() + offsetMs
      if (Number.isFinite(nowByOffset) && nowByOffset > 0) return nowByOffset
    }
  } catch (_) {}
  try {
    const nowMs = Number(useGoTiming?.getServerNowMs?.())
    if (Number.isFinite(nowMs) && nowMs > 0) return nowMs
  } catch (_) {}
  return Date.now()
}

function formatDurationMmSs(valueMs = 0) {
  const safeMs = Math.max(0, Math.floor(Number(valueMs) || 0))
  const totalSeconds = Math.floor(safeMs / 1000)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}

function formatDurationSeconds3(valueMs = 0) {
  const safeMs = Math.max(0, Math.floor(Number(valueMs) || 0))
  return `${(safeMs / 1000).toFixed(3)}s`
}

function isWarnReductionText(detail = '') {
  const text = toLower(detail)
  if (!text) return false
  return (
    text.includes('limite')
    || text.includes('snob')
    || text.includes('reduz')
    || text.includes('ajust')
    || text.includes('conflito')
    || text.includes('insuficient')
  )
}

function buildPhaseLine(phaseKey, state = {}) {
  const label = PHASE_LABELS[phaseKey] || phaseKey
  const attackCount = Number.isFinite(Number(state.attackCount)) ? Number(state.attackCount) : null
  const amountText = attackCount && attackCount > 0 ? ` ${attackCount}/${attackCount}` : ''
  if (state.status === 'error') {
    const msg = normalizeText(state.errorText)
    return `${label}:${amountText}${msg ? ` ${msg}` : ' erro'}`
  }
  if (state.status === 'running' || state.status === 'pending') {
    return `${label}:${amountText} ...`
  }
  if (state.status === 'success' || state.status === 'warn') {
    if (phaseKey === 'phase3') return `${label}:${amountText} OK`
    if (phaseKey === 'phase2') return `${label}:${amountText} OK`
    return `${label}: OK`
  }
  return `${label}: ...`
}

function presentEntry(entry, rowState, { targetText = '', phaseText = '' } = {}) {
  const rawTitle = normalizeText(entry?.title || '')
  const rawDetail = normalizeText(entry?.detail || '')
  if (rawTitle) rowState.senderTitle = rawTitle
  const inferredTarget = stripTargetPrefix(targetText)
  if (isUsableTargetLabel(inferredTarget)) rowState.targetLabel = inferredTarget
  if (isWarnReductionText(rawDetail)) rowState.warn = true

  const phaseKey = inferPhaseKey({ title: rawTitle, detail: rawDetail, phaseText })
  if (phaseKey) {
    const phase = rowState.phases[phaseKey] || {}
    let nextStatus = String(entry?.status || 'pending')
    if (nextStatus === 'success' && rowState.warn) nextStatus = 'warn'
    phase.status = nextStatus

    const attackCount = parseAttackCount(rawDetail)
    if (Number.isFinite(attackCount)) {
      phase.attackCount = attackCount
      if (phaseKey === 'phase1') rowState.baseAttackCount = attackCount
    } else if (!Number.isFinite(phase.attackCount) && Number.isFinite(rowState.baseAttackCount) && phaseKey !== 'phase1') {
      phase.attackCount = rowState.baseAttackCount
    }
    const durationSeconds = parseDurationSeconds(rawDetail)
    if (Number.isFinite(durationSeconds) && durationSeconds > 0) {
      phase.durationSeconds = durationSeconds
      if (phaseKey === 'phase2') {
        rowState.arrivalAtMs = getTwNowMsSafe() + (durationSeconds * 1000)
      }
    }

    if (nextStatus === 'error') {
      phase.errorText = rawDetail.replace(/^Erro\s+\d+\/\d+\s*\|\s*/i, '').trim() || rawDetail || 'erro'
    }
    rowState.phases[phaseKey] = phase
  }

  const title = rowState.targetLabel
    ? `${rowState.senderTitle || rawTitle || entry.id} ➜ ${rowState.targetLabel}`
    : (rowState.senderTitle || rawTitle || entry.id)

  const phaseOrder = ['phase1', 'phase2', 'phase3']
  const phaseLines = phaseOrder.filter((key) => rowState.phases[key]).map((key) => buildPhaseLine(key, rowState.phases[key]))
  if (Number.isFinite(Number(rowState.arrivalAtMs)) && rowState.arrivalAtMs > 0) {
    const arrivalText = formatArrivalDateTimeFromMs(rowState.arrivalAtMs)
    if (arrivalText) phaseLines.push(`Chega: ${arrivalText}`)
  }
  let detail = phaseLines.join(' | ')
  if (!detail) detail = rawDetail
  if (rowState.warn && !/\bWARN\b/i.test(detail)) detail = `${detail}${detail ? ' | ' : ''}WARN: atenção`

  let status = String(entry?.status || 'pending')
  if (status === 'success' && rowState.warn) status = 'warn'
  return { status, title, detail }
}

function hasCoordsInText(text = '') {
  return /\(\s*\d+\s*\|\s*\d+\s*\)/.test(String(text || ''))
}

function hasContinentInText(text = '') {
  return /\bK\d{1,2}\b/i.test(String(text || ''))
}

function parseCoordsFromText(text = '') {
  const match = String(text || '').match(/\(\s*(\d+)\s*\|\s*(\d+)\s*\)/)
  if (!match) return { x: null, y: null }
  const x = Number(match[1])
  const y = Number(match[2])
  if (!Number.isFinite(x) || !Number.isFinite(y)) return { x: null, y: null }
  return { x, y }
}

function calcContinentFromCoords(x, y) {
  const numX = Number(x)
  const numY = Number(y)
  if (!Number.isFinite(numX) || !Number.isFinite(numY)) return null
  return (Math.floor(numY / 100) * 10) + Math.floor(numX / 100)
}

function parseTargetsProgressFromPhaseText(text = '') {
  const match = String(text || '').match(/\[(\d+)\s*\/\s*(\d+)\]/)
  if (!match) return null
  const current = Number(match[1])
  const total = Number(match[2])
  if (!Number.isFinite(current) || !Number.isFinite(total) || total <= 0) return null
  return {
    current: Math.max(0, Math.floor(current)),
    total: Math.max(0, Math.floor(total))
  }
}

export function createExecutionFeed(container, config = {}) {
  if (!container) return null
  const maxRows = Number.isFinite(config?.maxRows) ? Math.max(10, Math.floor(config.maxRows)) : 180
  const autoCloseMs = Number.isFinite(config?.autoCloseMs) ? Math.max(0, Math.floor(config.autoCloseMs)) : 3500

  const root = document.createElement('section')
  root.className = 'go-ef-overlay'
  root.innerHTML = `
    <div class="go-ef-panel" role="status" aria-live="polite" aria-atomic="false">
      <header class="go-ef-header">
        <strong class="go-ef-header-target" data-exec-header-target>Alvo: --</strong>
        <span class="go-ef-header-meta" data-exec-header-meta>Alvos [0/0] Verificado [0] Engatilhado [0] Enviado [0/0] Sucesso [0] | Erros [0] | time: 00:00</span>
        <button type="button" class="go-ef-close" data-exec-close aria-label="Fechar status">×</button>
      </header>
      <ul class="go-ef-list" data-exec-list></ul>
    </div>
  `
  document.body.insertAdjacentElement('beforeend', root)

  const listEl = root.querySelector('[data-exec-list]')
  const headerTargetEl = root.querySelector('[data-exec-header-target]')
  const headerMetaEl = root.querySelector('[data-exec-header-meta]')
  const closeBtnEl = root.querySelector('[data-exec-close]')
  const rowById = new Map()
  const rowStateById = new Map()
  const finalResultById = new Map()
  let currentProgress = 0
  let totalProgress = 0
  let totalCommands = 0
  let targetText = 'Alvo: --'
  let phaseText = 'Executando...'
  let lastTargetsProgress = null
  let summaryOverride = null
  let isClosable = false
  let closeTimer = null
  let durationTicker = null
  const durationState = {
    distribution: {
      running: false,
      startedAtMs: 0,
      elapsedMs: 0
    },
    send: {
      running: false,
      startedAtMs: 0,
      elapsedMs: 0
    }
  }

  const getDurationElapsedMs = (key) => {
    if (!EXEC_DURATION_KEYS.has(key)) return 0
    const state = durationState[key]
    if (!state) return 0
    if (!state.running) return Math.max(0, Math.floor(Number(state.elapsedMs) || 0))
    const nowMs = getTwNowMsSafe()
    const startedAtMs = Math.max(0, Math.floor(Number(state.startedAtMs) || 0))
    return Math.max(0, Math.floor(Number(state.elapsedMs) || 0) + Math.max(0, nowMs - startedAtMs))
  }

  const syncDurationTicker = () => {
    const hasRunning = Object.values(durationState).some((state) => Boolean(state?.running))
    if (hasRunning && durationTicker == null) {
      durationTicker = setInterval(() => {
        renderHeader()
      }, 100)
      return
    }
    if (!hasRunning && durationTicker != null) {
      clearInterval(durationTicker)
      durationTicker = null
    }
  }

  const setClosable = (next) => {
    isClosable = Boolean(next)
    if (closeBtnEl) closeBtnEl.classList.toggle('is-visible', isClosable)
  }

  const renderHeader = () => {
    const progressCurrent = Math.min(currentProgress, totalProgress || 0)
    const progressTotal = totalProgress
    const derivedSuccess = Array.from(finalResultById.values()).filter((status) => status === 'success').length
    const derivedFailed = Array.from(finalResultById.values()).filter((status) => status === 'error').length
    const rowStates = Array.from(rowStateById.values())
    const verifiedCount = rowStates.filter((rowState) => {
      const status = String(rowState?.phases?.phase1?.status || '')
      return status === 'success' || status === 'warn'
    }).length
    const armedCount = rowStates.filter((rowState) => {
      const status = String(rowState?.phases?.phase2?.status || '')
      return status === 'success' || status === 'warn'
    }).length
    const sentCount = rowStates.filter((rowState) => {
      const status = String(rowState?.phases?.phase3?.status || '')
      return status === 'success' || status === 'warn' || status === 'error'
    }).length
    const summarySuccess = Number.isFinite(Number(summaryOverride?.success))
      ? Number(summaryOverride.success)
      : derivedSuccess
    const summaryFailed = Number.isFinite(Number(summaryOverride?.failed))
      ? Number(summaryOverride.failed)
      : derivedFailed
    const summaryTotal = Number.isFinite(Number(summaryOverride?.total))
      ? Number(summaryOverride.total)
      : (totalCommands > 0 ? totalCommands : progressTotal)
    const sendDurationText = formatDurationMmSs(getDurationElapsedMs('send'))
    const targetsProgress = parseTargetsProgressFromPhaseText(phaseText) || lastTargetsProgress
    const isCompleted = /^conclu[ií]do/i.test(String(phaseText || '').trim())
    const headerProgressLabel = targetsProgress ? 'Alvos' : 'Fila'
    const targetsCurrent = targetsProgress
      ? (isCompleted ? targetsProgress.total : targetsProgress.current)
      : progressCurrent
    const targetsTotal = targetsProgress?.total ?? (summaryTotal || progressTotal)
    const completionText = isCompleted ? ' | Concluído!' : ''
    if (headerTargetEl) headerTargetEl.textContent = 'Envio de comandos'
    if (headerMetaEl) {
      headerMetaEl.textContent = `${headerProgressLabel} [${targetsCurrent}/${targetsTotal}] Verificado [${verifiedCount}] Engatilhado [${armedCount}] Enviado [${sentCount}/${summaryTotal || progressTotal}] Sucesso [${summarySuccess}] | Erros [${summaryFailed}] | time: ${sendDurationText}${completionText}`
    }
  }

  const clearCloseTimer = () => {
    if (closeTimer != null) {
      clearTimeout(closeTimer)
      closeTimer = null
    }
  }

  const resetDurations = () => {
    Object.keys(durationState).forEach((key) => {
      if (!EXEC_DURATION_KEYS.has(key)) return
      durationState[key].running = false
      durationState[key].startedAtMs = 0
      durationState[key].elapsedMs = 0
    })
    syncDurationTicker()
    renderHeader()
  }

  const startDuration = (key) => {
    const normalizedKey = String(key || '').trim().toLowerCase()
    if (!EXEC_DURATION_KEYS.has(normalizedKey)) return
    const state = durationState[normalizedKey]
    if (!state || state.running) return
    state.running = true
    state.startedAtMs = getTwNowMsSafe()
    syncDurationTicker()
    renderHeader()
  }

  const stopDuration = (key) => {
    const normalizedKey = String(key || '').trim().toLowerCase()
    if (!EXEC_DURATION_KEYS.has(normalizedKey)) return
    const state = durationState[normalizedKey]
    if (!state || !state.running) return
    const nowMs = getTwNowMsSafe()
    state.elapsedMs = Math.max(0, Math.floor(Number(state.elapsedMs) || 0) + Math.max(0, nowMs - Math.max(0, Number(state.startedAtMs) || 0)))
    state.running = false
    state.startedAtMs = 0
    syncDurationTicker()
    renderHeader()
  }

  const show = () => {
    clearCloseTimer()
    root.classList.add('is-active')
  }

  const hide = () => {
    root.classList.remove('is-active')
  }

  const clear = () => {
    rowById.clear()
    rowStateById.clear()
    finalResultById.clear()
    if (listEl) listEl.innerHTML = ''
    currentProgress = 0
    totalProgress = 0
    totalCommands = 0
    targetText = 'Alvo: --'
    phaseText = 'Executando...'
    lastTargetsProgress = null
    summaryOverride = null
    setClosable(false)
    resetDurations()
    renderHeader()
  }

  const trimRows = () => {
    if (!listEl) return
    while (listEl.children.length > maxRows) {
      const first = listEl.firstElementChild
      if (!first) break
      const id = first.getAttribute('data-exec-id')
      if (id) rowById.delete(id)
      first.remove()
    }
  }

  const setProgress = ({ current = 0, total = 0 } = {}) => {
    const incomingCurrent = Number.isFinite(current) ? Math.max(0, Math.floor(current)) : 0
    const incomingTotal = Number.isFinite(total) ? Math.max(0, Math.floor(total)) : 0
    if (totalCommands <= 0 && incomingTotal > 0) totalCommands = incomingTotal
    totalProgress = totalCommands > 0 ? totalCommands : incomingTotal
    currentProgress = incomingCurrent
    renderHeader()
  }

  const setPhase = ({ label = '' } = {}) => {
    phaseText = String(label || '').trim() || phaseText
    const parsedTargetsProgress = parseTargetsProgressFromPhaseText(phaseText)
    if (parsedTargetsProgress) lastTargetsProgress = parsedTargetsProgress
    renderHeader()
  }

  const upsert = (entry = {}) => {
    const id = String(entry?.id || '').trim()
    const status = String(entry?.status || 'pending')
    if (!id || !listEl) return
    const isCommandRow = id.startsWith('send:') || id.includes(':send:')
    if (!isCommandRow) return
    if (status === 'info') return
    const isFinalStatus = Boolean(entry?.finalStatus)
    if (isFinalStatus && (status === 'success' || status === 'error')) {
      summaryOverride = null
      finalResultById.set(id, status)
      renderHeader()
    }
    show()
    const rowState = rowStateById.get(id) || { senderTitle: '', targetLabel: '', phases: {}, baseAttackCount: null, warn: false }
    rowStateById.set(id, rowState)
    const present = presentEntry(entry, rowState, { targetText, phaseText })
    const html = createRowHtml({
      id,
      status: present.status || status,
      title: present.title || entry?.title || id,
      detail: present.detail || entry?.detail || ''
    })
    const existing = rowById.get(id)
    if (existing && existing.isConnected) {
      existing.outerHTML = html
      const next = listEl.querySelector(`[data-exec-id="${CSS.escape(id)}"]`)
      if (next) rowById.set(id, next)
    } else {
      listEl.insertAdjacentHTML('beforeend', html)
      const next = listEl.querySelector(`[data-exec-id="${CSS.escape(id)}"]:last-child`)
      if (next) rowById.set(id, next)
    }
    trimRows()
    const activeRow = rowById.get(id)
    if (activeRow && (present.status === 'running' || status === 'running')) {
      activeRow.scrollIntoView({ block: 'nearest', inline: 'nearest' })
    } else {
      listEl.scrollTop = listEl.scrollHeight
    }
  }

  const start = ({ total = 0, title = '', targetName = '', targetX = null, targetY = null, targetK = null } = {}) => {
    clear()
    show()
    const normalizedTargetName = String(targetName || '').trim()
    const hasTargetName = Boolean(normalizedTargetName)
    const hasCoords = Number.isFinite(Number(targetX)) && Number.isFinite(Number(targetY))
    const coordsFromName = parseCoordsFromText(normalizedTargetName)
    const safeX = hasCoords ? Number(targetX) : coordsFromName.x
    const safeY = hasCoords ? Number(targetY) : coordsFromName.y
    const safeKFromPayload = Number.isFinite(Number(targetK)) ? Number(targetK) : null
    const safeK = safeKFromPayload ?? calcContinentFromCoords(safeX, safeY)
    const hasSafeCoords = Number.isFinite(safeX) && Number.isFinite(safeY)
    const shouldAppendContinent = (
      Number.isFinite(safeK) &&
      hasCoordsInText(normalizedTargetName) &&
      !hasContinentInText(normalizedTargetName)
    )
    const targetNameWithK = hasTargetName
      ? shouldAppendContinent
        ? `${normalizedTargetName} K${safeK}`
        : normalizedTargetName
      : ''
    targetText = hasTargetName
      ? hasCoords
        ? hasCoordsInText(targetNameWithK)
          ? `Alvo: ${targetNameWithK}`
          : `Alvo: ${targetNameWithK} (${Number(targetX)}|${Number(targetY)})${Number.isFinite(safeK) ? ` K${safeK}` : ''}`
        : `Alvo: ${targetNameWithK}`
      : hasSafeCoords
        ? `Alvo: ${safeX}|${safeY}${Number.isFinite(safeK) ? ` K${safeK}` : ''}`
        : 'Alvo: --'
    phaseText = 'Executando...'
    setProgress({ current: 0, total })
    renderHeader()
    const detail = String(title || '').trim()
    if (detail) upsert({ id: '__exec:start__', status: 'info', title: 'Iniciando execução', detail })
  }

  const finish = ({ success = 0, failed = 0, total = 0, message = '' } = {}) => {
    phaseText = 'Concluído!!'
    if (total > 0) {
      currentProgress = total
      totalProgress = total
      totalCommands = total
    }
    summaryOverride = {
      success: Number(success) || 0,
      failed: Number(failed) || 0,
      total: Number(total) || totalCommands || totalProgress || 0
    }
    stopDuration('distribution')
    stopDuration('send')
    setClosable(true)
    renderHeader()
    clearCloseTimer()
    if (autoCloseMs > 0) {
      closeTimer = setTimeout(() => {
        hide()
      }, autoCloseMs)
    }
  }

  const destroy = () => {
    clearCloseTimer()
    if (durationTicker != null) {
      clearInterval(durationTicker)
      durationTicker = null
    }
    closeBtnEl?.removeEventListener?.('click', hide)
    rowById.clear()
    root.remove()
  }

  closeBtnEl?.addEventListener?.('click', hide)

  return {
    root,
    show,
    hide,
    clear,
    start,
    setProgress,
    setPhase,
    resetDurations,
    startDuration,
    stopDuration,
    upsert,
    finish,
    destroy
  }
}
