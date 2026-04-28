import getManyToManyTotals from './getManyToManyTotals.js'
import orderCoordsFromCoords from './orderCoordsFromCoords.js'

export function distributeSendersByTargets({
  senders = [],
  targets = [],
  typeGenerate = 'closest'
} = {}) {
  const orderedTargetsBase = orderCoordsFromCoords(targets, senders)

  if (!orderedTargetsBase.length) {
    return {
      ...getManyToManyTotals({ senders, targets }),
      orderedTargets: [],
      orderedSenders: Array.isArray(senders) ? [...senders] : [],
      targetGroups: [],
      unassignedSenders: Array.isArray(senders) ? [...senders] : []
    }
  }

  const normalizedTypeGenerate = String(typeGenerate || '').trim().toLowerCase() === 'closest'
    ? 'closest'
    : 'furthest'
  // closest: targets do mais distante para o mais próximo (comportamento legado)
  // furthest: targets invertidos (mais próximo -> mais distante) para equilibrar a distribuição
  const orderedTargets = normalizedTypeGenerate === 'furthest'
    ? [...orderedTargetsBase].reverse()
    : orderedTargetsBase
  // Sender continua baseado no target mais distante do conjunto original para manter priorização de distância.
  const farthestTarget = orderedTargetsBase[0]
  const orderedSendersBase = orderCoordsFromCoords(senders, [farthestTarget])
  const orderedSenders = normalizedTypeGenerate === 'closest'
    ? [...orderedSendersBase].reverse()
    : orderedSendersBase
  const {
    totalTargets,
    totalSenders,
    sendersPerTarget,
    remainingSenders
  } = getManyToManyTotals({
    senders: orderedSenders,
    targets: orderedTargets
  })

  const targetGroups = orderedTargets.map((target) => {
    return {
      target,
      senders: []
    }
  })

  // Distribuição em rodadas:
  // 1a rodada: 1 sender por target (os mais distantes)
  // 2a rodada: próximos sender por target...
  // até esgotar a lista.
  orderedSenders.forEach((sender, senderIndex) => {
    const targetIndex = senderIndex % totalTargets
    const group = targetGroups[targetIndex]
    if (!group) return
    group.senders.push(sender)
  })

  return {
    totalTargets,
    totalSenders,
    sendersPerTarget,
    remainingSenders,
    orderedTargets,
    orderedSenders,
    typeGenerate: normalizedTypeGenerate,
    farthestTarget,
    targetGroups,
    unassignedSenders: []
  }
}

export default distributeSendersByTargets
