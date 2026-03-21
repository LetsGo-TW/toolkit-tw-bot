const express = require('express')
const path = require('path')
const { pathToFileURL } = require('url')
const authMiddleware = require('../middlewares/auth.middleware')

const router = express.Router()

let mineDistributionCached = null
const DISTRIBUTION_OPTIMIZED_MAX_PAIRS = 200000

async function getMineDistribution() {
  if (typeof mineDistributionCached === 'function') return mineDistributionCached
  const modulePath = path.join(__dirname, '../planner/manyTomany/mineDistribution.js')
  const mod = await import(pathToFileURL(modulePath).href)
  const fn = mod?.mineDistribution || mod?.default
  if (typeof fn !== 'function') {
    throw new Error('mineDistribution export não encontrado')
  }
  mineDistributionCached = fn
  return mineDistributionCached
}

function toFiniteNumber(value) {
  const num = Number(value)
  return Number.isFinite(num) ? num : null
}

function toNonNegativeInt(value) {
  const num = Number(value)
  if (!Number.isFinite(num) || num <= 0) return 0
  return Math.floor(num)
}

function normalizeDistributionMode(value) {
  return String(value || '').trim().toLowerCase() === 'min_cost_max_flow'
    ? 'min_cost_max_flow'
    : 'sender_first'
}

function normalizeCoordEntity(input = {}, kind = 'item') {
  const x = toFiniteNumber(input?.x)
  const y = toFiniteNumber(input?.y)
  if (x == null || y == null) return null
  const idRaw = toFiniteNumber(input?.id ?? input?.villageId ?? input?.sourceVillageId)
  return {
    ...((input && typeof input === 'object') ? input : {}),
    id: idRaw == null ? null : idRaw,
    x,
    y,
    _kind: kind
  }
}

function pickSource(sender = null) {
  if (!sender || typeof sender !== 'object') return null
  const sourceId = toFiniteNumber(sender?.villageId ?? sender?.id ?? sender?.sourceVillageId)
  const x = toFiniteNumber(sender?.x)
  const y = toFiniteNumber(sender?.y)
  return {
    id: sourceId == null ? null : sourceId,
    x,
    y,
    ...(sender?.name ? { name: String(sender.name) } : {})
  }
}

function pickTarget(target = null) {
  if (!target || typeof target !== 'object') return null
  const targetId = toFiniteNumber(target?.id)
  const x = toFiniteNumber(target?.x)
  const y = toFiniteNumber(target?.y)
  const playerId = toFiniteNumber(target?.playerId ?? target?.player_id ?? target?.owner)
  return {
    id: targetId == null ? null : targetId,
    x,
    y,
    ...(playerId != null ? { playerId } : {}),
    ...(target?.name ? { name: String(target.name) } : {})
  }
}

function buildCommandsFromTargetGroups(targetGroups = []) {
  const flat = []
  ;(Array.isArray(targetGroups) ? targetGroups : []).forEach((group, targetIndex) => {
    const target = pickTarget(group?.target)
    const senders = Array.isArray(group?.senders) ? group.senders : []
    senders.forEach((sender, round) => {
      flat.push({
        targetIndex,
        round,
        target,
        source: pickSource(sender)
      })
    })
  })
  flat.sort((a, b) => {
    if (a.round !== b.round) return a.round - b.round
    return a.targetIndex - b.targetIndex
  })
  return flat.map((command, order) => ({
    order,
    round: command.round,
    targetIndex: command.targetIndex,
    target: command.target,
    source: command.source
  }))
}

function buildCommands(entries = [], targetGroups = []) {
  const normalizedEntries = Array.isArray(entries) ? entries : []
  if (normalizedEntries.length > 0) {
    return normalizedEntries.map((entry, index) => {
      const dispatchOrder = toFiniteNumber(entry?.dispatchOrder)
      const sendOffsetMs = toFiniteNumber(entry?.sendOffsetMs)
      return {
        order: dispatchOrder == null ? index : dispatchOrder,
        round: toNonNegativeInt(entry?.round),
        targetIndex: toNonNegativeInt(entry?.targetIndex),
        target: pickTarget(entry?.target),
        source: pickSource(entry?.source),
        ...(dispatchOrder != null ? { dispatchOrder } : {}),
        ...(sendOffsetMs != null ? { sendOffsetMs } : {})
      }
    })
  }
  return buildCommandsFromTargetGroups(targetGroups)
}

function buildTargetsSummary(targetGroups = []) {
  return (Array.isArray(targetGroups) ? targetGroups : []).map((group, index) => ({
    order: index,
    target: pickTarget(group?.target),
    requestedQty: toNonNegativeInt(group?.requestedQty),
    assignedQty: toNonNegativeInt(group?.assignedQty),
    remainingQty: toNonNegativeInt(group?.remainingQty),
    pendingRejectedByNightCount: Array.isArray(group?.pendingRejectedByNight)
      ? group.pendingRejectedByNight.length
      : 0
  }))
}

function buildDiagnosticSendersList(list = []) {
  return (Array.isArray(list) ? list : []).map((sender) => pickSource(sender)).filter(Boolean)
}

router.use(authMiddleware)

router.post('/distribute', async (req, res) => {
  const body = req.body || {}
  const mode = String(body?.mode || 'send').trim().toLowerCase()
  const rawSenders = Array.isArray(body?.senders) ? body.senders : []
  const rawTargets = Array.isArray(body?.targets) ? body.targets : []
  const template = body?.template ?? null
  const meta = (body?.meta && typeof body.meta === 'object') ? body.meta : {}
  const config = (body?.config && typeof body.config === 'object') ? body.config : {}
  const options = (body?.options && typeof body.options === 'object') ? body.options : {}
  const distributionMode = normalizeDistributionMode(options?.distributionMode)

  if (mode !== 'send') {
    return res.status(400).send({ ok: false, message: 'Bad request - mode suportado apenas "send"' })
  }

  const senders = rawSenders
    .map((item) => normalizeCoordEntity(item, 'sender'))
    .filter(Boolean)
    .map((sender, index) => ({
      ...sender,
      order: index,
      villageId: toFiniteNumber(sender?.villageId ?? sender?.id) ?? null
    }))

  const targets = rawTargets
    .map((item) => normalizeCoordEntity(item, 'target'))
    .filter(Boolean)
    .map((target, index) => ({
      ...target,
      order: index,
      qty: toNonNegativeInt(rawTargets[index]?.qty)
    }))

  if (!senders.length) {
    return res.status(400).send({ ok: false, message: 'Bad request - senders inválidos ou vazios' })
  }
  if (!targets.length) {
    return res.status(400).send({ ok: false, message: 'Bad request - targets inválidos ou vazios' })
  }

  const requestedCount = rawTargets.reduce((sum, target) => sum + toNonNegativeInt(target?.qty), 0)
  if (requestedCount <= 0) {
    return res.status(400).send({ ok: false, message: 'Bad request - soma de target.qty deve ser > 0' })
  }
  if (distributionMode === 'min_cost_max_flow') {
    const sendersCount = senders.length
    const slotsCount = requestedCount
    const pairsCount = sendersCount * slotsCount
    if (pairsCount > DISTRIBUTION_OPTIMIZED_MAX_PAIRS) {
      return res.status(400).send({
        ok: false,
        code: 'DISTRIBUTION_OPTIMIZED_LIMIT',
        message: `Otimizado disponível até ${DISTRIBUTION_OPTIMIZED_MAX_PAIRS} combinações (remetentes x comandos).`,
        meta: {
          sendersCount,
          slotsCount,
          pairsCount,
          maxPairs: DISTRIBUTION_OPTIMIZED_MAX_PAIRS
        }
      })
    }
  }

  try {
    const mineDistribution = await getMineDistribution()
    const distribution = mineDistribution({
      mode,
      senders,
      targets,
      template,
      meta,
      config,
      options
    })

    const commands = buildCommands(distribution?.commandEntries, distribution?.targetGroups)
    const targetsSummary = buildTargetsSummary(distribution?.targetGroups)

    const response = {
      ok: true,
      message: 'Distribuição calculada com sucesso',
      meta: {
        ...(distribution?.meta || {}),
        mode: distribution?.mode || mode,
        distributionMode: String(distribution?.meta?.usedDistributionMode || distributionMode),
        requestedDistributionMode: String(distribution?.meta?.requestedDistributionMode || distributionMode),
        typeGenerate: distribution?.typeGenerate || String(options?.typeGenerate || 'closest'),
        scapeTheNight: Boolean(distribution?.scapeTheNight),
        commandsCount: commands.length
      },
      settings: {
        mode: distribution?.mode || mode,
        distributionMode: String(distribution?.meta?.usedDistributionMode || distributionMode),
        requestedDistributionMode: String(distribution?.meta?.requestedDistributionMode || distributionMode),
        typeGenerate: distribution?.typeGenerate || String(options?.typeGenerate || 'closest'),
        scapeTheNight: Boolean(distribution?.scapeTheNight),
        baseSendMs: toFiniteNumber(distribution?.baseSendMs),
        sendConfirmBufferMs: toNonNegativeInt(distribution?.sendConfirmBufferMs),
        slowestUnit: distribution?.slowestUnit || null
      },
      commands,
      targets: targetsSummary,
      diagnostics: {
        noTimeList: buildDiagnosticSendersList(distribution?.noTimeList),
        unusedByQuota: buildDiagnosticSendersList(distribution?.unusedByQuota),
        orderedTargets: (Array.isArray(distribution?.orderedTargets) ? distribution.orderedTargets : []).map(pickTarget),
        orderedSenders: (Array.isArray(distribution?.orderedSenders) ? distribution.orderedSenders : []).map(pickSource)
      },
      raw: distribution
    }

    return res.status(200).send(response)
  } catch (error) {
    console.error('[commands/distribute]', error)
    if (String(error?.code || '') === 'BN_UNKNOWN_PLAYER_NIGHT') {
      return res.status(400).send({
        ok: false,
        code: error.code,
        message: error?.message || 'Dados de BN por player ausentes'
      })
    }
    return res.status(500).send({
      ok: false,
      message: error?.message || 'Erro ao calcular distribuição'
    })
  }
})

module.exports = (app) => app.use('/api/commands', router)
