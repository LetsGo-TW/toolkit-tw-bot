export function getManyToManyTotals({
  senders = [],
  targets = []
} = {}) {
  const totalSenders = Array.isArray(senders) ? senders.length : 0
  const totalTargets = Array.isArray(targets) ? targets.length : 0
  const sendersPerTarget = totalTargets > 0
    ? Math.floor(totalSenders / totalTargets)
    : 0
  const remainingSenders = totalTargets > 0
    ? (totalSenders % totalTargets)
    : totalSenders

  return {
    totalTargets,
    totalSenders,
    sendersPerTarget,
    remainingSenders
  }
}

export default getManyToManyTotals
