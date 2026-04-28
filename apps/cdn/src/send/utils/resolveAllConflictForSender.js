const STRATEGIES = new Set(['split', 'first'])

function toInt(value, fallback = 0) {
  const n = Number(value)
  if (!Number.isFinite(n)) return fallback
  return Math.max(0, Math.floor(n))
}

export function normalizeAllConflictStrategy(strategy) {
  const value = String(strategy || '').trim().toLowerCase()
  return STRATEGIES.has(value) ? value : 'split'
}

/**
 * Resolve conflito de ALL entre múltiplos comandos para um mesmo sender/unidade.
 * Não executa envio: apenas calcula distribuição e metadados de resolução.
 */
export function resolveAllConflictForSender({
  availableUnits = 0,
  commands = [],
  strategy = 'split',
  firstCommandId = null
} = {}) {
  const mode = normalizeAllConflictStrategy(strategy)
  const available = toInt(availableUnits)
  const normalizedCommands = (Array.isArray(commands) ? commands : []).map((command, index) => ({
    index,
    commandId: command?.commandId ?? `cmd:${index}`,
    fixed: toInt(command?.fixed),
    hasAll: Boolean(command?.hasAll),
    // Mínimo necessário para este comando nesta unidade.
    minRequired: toInt(command?.minRequired, 0)
  }))

  const fixedTotal = normalizedCommands.reduce((acc, command) => acc + command.fixed, 0)
  const remainingAfterFixed = Math.max(0, available - fixedTotal)
  const allCandidates = normalizedCommands.filter((command) => command.hasAll)

  const byId = new Map(
    normalizedCommands.map((command) => ([
      command.commandId,
      {
        ...command,
        minExtraAssigned: 0,
        allAssigned: 0,
        totalAssigned: command.fixed,
        minSatisfied: command.fixed >= command.minRequired
      }
    ]))
  )

  let remainingPool = remainingAfterFixed
  const deficits = []

  // 1) Primeiro, tenta garantir mínimo por comando.
  // Só comandos com ALL podem receber extra nesta camada por unidade.
  normalizedCommands.forEach((command) => {
    const item = byId.get(command.commandId)
    if (!item) return
    const deficit = Math.max(0, command.minRequired - command.fixed)
    if (deficit <= 0) {
      item.minSatisfied = true
      return
    }
    if (!command.hasAll) {
      item.minSatisfied = false
      deficits.push({ commandId: command.commandId, required: deficit, assigned: 0 })
      return
    }
    const granted = Math.min(deficit, remainingPool)
    item.minExtraAssigned = granted
    item.allAssigned += granted
    item.totalAssigned = item.fixed + item.allAssigned
    remainingPool -= granted
    const stillMissing = deficit - granted
    item.minSatisfied = stillMissing <= 0
    if (stillMissing > 0) {
      deficits.push({ commandId: command.commandId, required: deficit, assigned: granted })
    }
  })

  if (!allCandidates.length) {
    return {
      strategyApplied: mode,
      fixedTotal,
      remainingAfterFixed,
      remainingAfterMinimum: remainingPool,
      hasConflict: false,
      winnerCommandId: null,
      minimumGuaranteed: deficits.length === 0,
      deficits,
      commands: Array.from(byId.values())
    }
  }

  if (mode === 'first') {
    const sortedByOrder = [...allCandidates].sort((a, b) => a.index - b.index)
    const winner = allCandidates.find((command) => command.commandId === firstCommandId) || sortedByOrder[0] || null

    if (winner) {
      const winnerItem = byId.get(winner.commandId)
      winnerItem.allAssigned += remainingPool
      winnerItem.totalAssigned = winnerItem.fixed + winnerItem.allAssigned
      remainingPool = 0
    }

    return {
      strategyApplied: mode,
      fixedTotal,
      remainingAfterFixed,
      remainingAfterMinimum: remainingPool,
      hasConflict: allCandidates.length > 1,
      winnerCommandId: winner?.commandId || null,
      minimumGuaranteed: deficits.length === 0,
      deficits,
      commands: Array.from(byId.values())
    }
  }

  // split (padrão)
  const sortedForSplit = [...allCandidates].sort((a, b) => a.index - b.index)
  const n = sortedForSplit.length
  const base = n > 0 ? Math.floor(remainingPool / n) : 0
  const extra = n > 0 ? (remainingPool % n) : 0

  sortedForSplit.forEach((command, idx) => {
    const item = byId.get(command.commandId)
    item.allAssigned += base + (idx < extra ? 1 : 0)
    item.totalAssigned = item.fixed + item.allAssigned
  })
  remainingPool = 0

  return {
    strategyApplied: mode,
    fixedTotal,
    remainingAfterFixed,
    remainingAfterMinimum: remainingPool,
    hasConflict: allCandidates.length > 1,
    winnerCommandId: null,
    minimumGuaranteed: deficits.length === 0,
    deficits,
    commands: Array.from(byId.values())
  }
}

export function buildAllConflictResolutionLog({
  resolution,
  currentCommandId = null
} = {}) {
  const strategyApplied = resolution?.strategyApplied || 'split'
  const hasConflict = Boolean(resolution?.hasConflict)
  if (!hasConflict) return 'Sem conflito ALL para resolver.'

  if (strategyApplied === 'split') {
    return 'Conflito ALL resolvido com split: as tropas foram divididas entre os comandos.'
  }

  if (strategyApplied === 'first') {
    const winner = resolution?.winnerCommandId || null
    if (!winner) return 'Conflito ALL resolvido com first: primeiro comando não identificado.'
    if (currentCommandId && winner === currentCommandId) {
      return 'Conflito ALL resolvido com first: este comando foi o primeiro.'
    }
    return 'Conflito ALL resolvido com first: outro comando ficou como primeiro.'
  }

  return 'Conflito ALL resolvido com split: as tropas foram divididas entre os comandos.'
}
