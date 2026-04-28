const test = require('node:test')
const assert = require('node:assert/strict')
const senders = require('./senders.json')
const targets = require('./targets.json')
const template = require('./template.json')
const config = require('./config.json')

function clone(obj) {
  return JSON.parse(JSON.stringify(obj))
}

function toTargetObject(target) {
  if (typeof target === 'string') {
    const [xRaw, yRaw] = String(target).split('|')
    return {
      x: Number(xRaw),
      y: Number(yRaw)
    }
  }
  return clone(target)
}

function withQtyForAllTargets(list = [], qty = 0) {
  return list.map((target) => ({ ...toTargetObject(target), qty }))
}

test('mineDistribution send: qty=4 em todos alvos (closest) respeita limite por alvo e sobra por quota', async () => {
  const { mineDistribution } = await import('./mineDistribution.js')
  const targetsWithQty = withQtyForAllTargets(targets, 4)

  const result = mineDistribution({
    mode: 'send',
    senders,
    targets: targetsWithQty,
    template,
    config: {
      ...clone(config),
      night: { ...clone(config.night), active: 0 }
    },
    options: {
      typeGenerate: 'closest',
      scapeTheNight: true,
      nowMs: Date.UTC(2026, 1, 22, 12, 0, 0),
      slowestUnit: 'spear',
      slowestUnitSecondsPerField: 1
    }
  })

  assert.equal(result.targetGroups.length, targets.length)
  assert.equal(result.targetGroups.every((g) => g.senders.length <= 4), true)
  assert.equal(result.assignedSenders.length, targetsWithQty.length * 4)
  assert.equal(result.noTimeList.length, 0)
  assert.equal(result.unusedByQuota.length, senders.length - (targetsWithQty.length * 4))
  assert.equal(result.meta.assignedCount, targetsWithQty.length * 4)
})

test('mineDistribution send: qty=5 em todos alvos (furthest) respeita limite por alvo e sobra por quota', async () => {
  const { mineDistribution } = await import('./mineDistribution.js')
  const targetsWithQty = withQtyForAllTargets(targets, 5)

  const result = mineDistribution({
    mode: 'send',
    senders,
    targets: targetsWithQty,
    template,
    config: {
      ...clone(config),
      night: { ...clone(config.night), active: 0 }
    },
    options: {
      typeGenerate: 'furthest',
      scapeTheNight: true,
      nowMs: Date.UTC(2026, 1, 22, 12, 0, 0)
    }
  })

  assert.equal(result.targetGroups.length, targets.length)
  assert.equal(result.targetGroups.every((g) => g.senders.length <= 5), true)
  assert.equal(result.assignedSenders.length, targetsWithQty.length * 5)
  assert.equal(result.noTimeList.length, 0)
  assert.equal(result.unusedByQuota.length, senders.length - (targetsWithQty.length * 5))
  assert.equal(result.meta.assignedCount, targetsWithQty.length * 5)
})

test('mineDistribution send: closest e furthest mudam a ordem de prioridade dos senders', async () => {
  const { mineDistribution } = await import('./mineDistribution.js')

  const baseArgs = {
    mode: 'send',
    senders,
    targets: withQtyForAllTargets(targets, 4),
    template,
    config: {
      ...clone(config),
      night: { ...clone(config.night), active: 0 }
    },
    options: {
      scapeTheNight: false,
      nowMs: Date.UTC(2026, 1, 22, 12, 0, 0)
    }
  }

  const closest = mineDistribution({
    ...baseArgs,
    options: { ...baseArgs.options, typeGenerate: 'closest' }
  })
  const furthest = mineDistribution({
    ...baseArgs,
    options: { ...baseArgs.options, typeGenerate: 'furthest' }
  })

  assert.notEqual(closest.orderedSenders[0], furthest.orderedSenders[0])
  assert.equal(closest.orderedSenders[0], furthest.orderedSenders.at(-1))
})

test('mineDistribution send: usa qty por alvo (closest) e respeita requested/remaining', async () => {
  const { mineDistribution } = await import('./mineDistribution.js')

  const localSenders = senders.slice(0, 12).map(clone)
  const localTargets = [
    { x: 332, y: 171, qty: 3, id: 1 },
    { x: 329, y: 172, qty: 1, id: 2 },
    { x: 332, y: 172, qty: 4, id: 3 }
  ]

  const result = mineDistribution({
    mode: 'send',
    senders: localSenders,
    targets: localTargets,
    options: {
      typeGenerate: 'closest',
      scapeTheNight: false
    }
  })

  const requestedByKey = new Map(localTargets.map((target) => [`${target.x}|${target.y}`, target.qty]))
  const targetGroupsByKey = new Map(
    result.targetGroups.map((group) => [`${group.target.x}|${group.target.y}`, group])
  )

  assert.equal(result.meta.requestedCount, 8)
  assert.equal(result.meta.assignedCount, 8)
  assert.equal(result.meta.unfilledRequestedCount, 0)
  assert.equal(result.unusedByQuota.length, localSenders.length - 8)

  requestedByKey.forEach((qty, key) => {
    const group = targetGroupsByKey.get(key)
    assert.ok(group, `targetGroup ausente para ${key}`)
    assert.equal(group.requestedQty, qty)
    assert.equal(group.assignedQty, qty)
    assert.equal(group.remainingQty, 0)
    assert.equal(group.senders.length, qty)
  })
})

test('mineDistribution send: usa qty por alvo (furthest) e sinaliza faltas quando sender não cobre tudo', async () => {
  const { mineDistribution } = await import('./mineDistribution.js')

  const localSenders = senders.slice(0, 5).map(clone)
  const localTargets = [
    { x: 332, y: 171, qty: 2, id: 1 },
    { x: 329, y: 172, qty: 2, id: 2 },
    { x: 332, y: 172, qty: 3, id: 3 }
  ]

  const result = mineDistribution({
    mode: 'send',
    senders: localSenders,
    targets: localTargets,
    options: {
      typeGenerate: 'furthest',
      scapeTheNight: false
    }
  })

  assert.equal(result.meta.requestedCount, 7)
  assert.equal(result.meta.assignedCount, 5)
  assert.equal(result.meta.unusedByQuotaCount, 0)
  assert.equal(result.meta.unfilledRequestedCount, 2)
  assert.equal(result.assignedSenders.length, localSenders.length)
  assert.equal(result.targetGroups.reduce((sum, g) => sum + g.assignedQty, 0), 5)
  assert.equal(result.targetGroups.reduce((sum, g) => sum + g.remainingQty, 0), 2)
  assert.equal(result.targetGroups.every((g) => g.assignedQty <= g.requestedQty), true)
})

test('mineDistribution send: active=2 sem playerNightMoralState aborta quando scapeTheNight=true', async () => {
  const { mineDistribution } = await import('./mineDistribution.js')

  const localSenders = [clone(senders[0])]
  const localTargets = [{ ...toTargetObject(targets[0]), qty: 1, id: 9001, playerId: 111 }]

  assert.throws(() => mineDistribution({
    mode: 'send',
    senders: localSenders,
    targets: localTargets,
    template,
    meta: {
      worldNightConfig: { active: 2, start_hour: 0, end_hour: 23 },
      playerNightMoralState: []
    },
    config: {
      ...clone(config),
      night: { ...clone(config.night), active: 2, start_hour: 0, end_hour: 23 }
    },
    options: {
      typeGenerate: 'closest',
      scapeTheNight: true,
      nowMs: Date.UTC(2026, 1, 22, 12, 0, 0),
      slowestUnit: 'spear',
      slowestUnitSecondsPerField: 1
    }
  }), /BN .*active=2/i)
})

test('mineDistribution send: active=2 usa BN por player quando playerNightMoralState esta presente', async () => {
  const { mineDistribution } = await import('./mineDistribution.js')

  const localSenders = [clone(senders[0])]
  const localTargets = [{ ...toTargetObject(targets[0]), qty: 1, id: 9002, playerId: 222 }]

  const result = mineDistribution({
    mode: 'send',
    senders: localSenders,
    targets: localTargets,
    template,
    meta: {
      worldNightConfig: { active: 2, start_hour: 0, end_hour: 23 },
      playerNightMoralState: [
        { playerId: 222, night: { active: 2, start_hour: 0, end_hour: 23 }, moral: 100 }
      ]
    },
    config: {
      ...clone(config),
      night: { ...clone(config.night), active: 2, start_hour: 0, end_hour: 23 }
    },
    options: {
      typeGenerate: 'closest',
      scapeTheNight: true,
      nowMs: Date.UTC(2026, 1, 22, 12, 0, 0),
      slowestUnit: 'spear',
      slowestUnitSecondsPerField: 1
    }
  })

  assert.equal(result.meta.nightUnknownCount, 0)
  assert.equal(result.meta.noTimeCount, 1)
  assert.equal(result.meta.assignedCount, 0)
})

test('mineDistribution send: active=2 em barbara usa fallback global', async () => {
  const { mineDistribution } = await import('./mineDistribution.js')

  const localSenders = [clone(senders[0])]
  const localTargets = [{ ...toTargetObject(targets[0]), qty: 1, id: 9003, playerId: 0 }]

  const result = mineDistribution({
    mode: 'send',
    senders: localSenders,
    targets: localTargets,
    template,
    meta: {
      worldNightConfig: { active: 2, start_hour: 0, end_hour: 23 },
      playerNightMoralState: []
    },
    config: {
      ...clone(config),
      night: { ...clone(config.night), active: 2, start_hour: 0, end_hour: 23 }
    },
    options: {
      typeGenerate: 'closest',
      scapeTheNight: true,
      nowMs: Date.UTC(2026, 1, 22, 12, 0, 0),
      slowestUnit: 'spear',
      slowestUnitSecondsPerField: 1
    }
  })

  assert.equal(result.meta.nightUnknownCount, 0)
  assert.equal(result.meta.noTimeCount, 1)
  assert.equal(result.meta.assignedCount, 0)
})

test('mineDistribution send: active=2 com playerId ausente aborta para não tratar alvo como bárbara', async () => {
  const { mineDistribution } = await import('./mineDistribution.js')

  const localSenders = [clone(senders[0])]
  const localTargets = [{ ...toTargetObject(targets[0]), qty: 1, id: 9004 }]

  assert.throws(() => mineDistribution({
    mode: 'send',
    senders: localSenders,
    targets: localTargets,
    template,
    meta: {
      worldNightConfig: { active: 2, start_hour: 0, end_hour: 23 },
      playerNightMoralState: []
    },
    config: {
      ...clone(config),
      night: { ...clone(config.night), active: 2, start_hour: 0, end_hour: 23 }
    },
    options: {
      distributionMode: 'min_cost_max_flow',
      typeGenerate: 'closest',
      scapeTheNight: true,
      nowMs: Date.UTC(2026, 1, 22, 12, 0, 0),
      slowestUnit: 'spear',
      slowestUnitSecondsPerField: 1
    }
  }), /BN .*active=2/i)
})

test('mineDistribution send: min_cost_max_flow usa motor otimizado quando disponível', async () => {
  const { mineDistribution } = await import('./mineDistribution.js')

  const localSenders = senders.slice(0, 6).map(clone)
  const localTargets = [
    { x: 332, y: 171, qty: 2, id: 1 },
    { x: 329, y: 172, qty: 2, id: 2 }
  ]

  const result = mineDistribution({
    mode: 'send',
    senders: localSenders,
    targets: localTargets,
    template,
    config: {
      ...clone(config),
      night: { ...clone(config.night), active: 0 }
    },
    options: {
      distributionMode: 'min_cost_max_flow',
      typeGenerate: 'furthest',
      scapeTheNight: false
    }
  })

  assert.equal(result.meta.requestedDistributionMode, 'min_cost_max_flow')
  assert.equal(result.meta.usedDistributionMode, 'min_cost_max_flow')
  assert.equal(result.meta.fallbackApplied, false)
  assert.equal(result.meta.assignedCount, 4)
  assert.equal(result.meta.unfilledRequestedCount, 0)
  assert.equal(Array.isArray(result.commandEntries), true)
  assert.equal(result.commandEntries.length, 4)
  assert.equal(result.commandEntries.every((entry, index) => Number(entry.dispatchOrder) === index), true)
})

test('mineDistribution send: min_cost_max_flow faz fallback para sender_first em timeout', { concurrency: false }, async () => {
  const { mineDistribution } = await import('./mineDistribution.js')

  const localSenders = senders.slice(0, 20).map(clone)
  const localTargets = [
    { x: 332, y: 171, qty: 7, id: 1 },
    { x: 329, y: 172, qty: 7, id: 2 }
  ]

  const originalDateNow = Date.now
  let currentNow = 0
  Date.now = () => {
    currentNow += 1000
    return currentNow
  }

  try {
    const result = mineDistribution({
      mode: 'send',
      senders: localSenders,
      targets: localTargets,
      template,
      config: {
        ...clone(config),
        night: { ...clone(config.night), active: 0 }
      },
      options: {
        distributionMode: 'min_cost_max_flow',
        typeGenerate: 'closest',
        scapeTheNight: false,
        nowMs: Date.UTC(2026, 1, 22, 12, 0, 0),
        optimizedTimeoutMs: 1
      }
    })

    assert.equal(result.meta.requestedDistributionMode, 'min_cost_max_flow')
    assert.equal(result.meta.usedDistributionMode, 'sender_first')
    assert.equal(result.meta.fallbackApplied, true)
    assert.equal(result.meta.fallbackMeta?.code, 'DISTRIBUTION_OPTIMIZED_TIMEOUT')
    assert.equal(result.meta.assignedCount, 14)
  } finally {
    Date.now = originalDateNow
  }
})

test('mineDistribution send: min_cost_max_flow não faz fallback quando BN active=2 está incompleto', async () => {
  const { mineDistribution } = await import('./mineDistribution.js')

  const localSenders = [clone(senders[0])]
  const localTargets = [{ ...toTargetObject(targets[0]), qty: 1, id: 9901, playerId: 321 }]

  assert.throws(() => mineDistribution({
    mode: 'send',
    senders: localSenders,
    targets: localTargets,
    template,
    meta: {
      worldNightConfig: { active: 2, start_hour: 0, end_hour: 23 },
      playerNightMoralState: []
    },
    config: {
      ...clone(config),
      night: { ...clone(config.night), active: 2, start_hour: 0, end_hour: 23 }
    },
    options: {
      distributionMode: 'min_cost_max_flow',
      typeGenerate: 'closest',
      scapeTheNight: true,
      nowMs: Date.UTC(2026, 1, 22, 12, 0, 0),
      slowestUnit: 'spear',
      slowestUnitSecondsPerField: 1
    }
  }), /BN .*active=2/i)
})

test('mineDistribution send: min_cost_max_flow considera a ordem real de despacho no BN', async () => {
  const { mineDistribution } = await import('./mineDistribution.js')

  const localSenders = [
    { id: 1, villageId: 1, x: 100, y: 100 },
    { id: 2, villageId: 2, x: 100, y: 100 }
  ]
  const localTargets = [
    { x: 101, y: 100, qty: 2, id: 1, playerId: 0 }
  ]

  const result = mineDistribution({
    mode: 'send',
    senders: localSenders,
    targets: localTargets,
    template,
    meta: {
      worldNightConfig: { active: 1, start_hour: 12, end_hour: 13 },
      playerNightMoralState: []
    },
    config: {
      ...clone(config),
      night: { ...clone(config.night), active: 1, start_hour: 12, end_hour: 13 }
    },
    options: {
      distributionMode: 'min_cost_max_flow',
      typeGenerate: 'closest',
      scapeTheNight: true,
      nowMs: Date.UTC(2026, 1, 22, 11, 59, 57),
      sendConfirmBufferMs: 0,
      nightStartLeadMs: 0,
      optimizedDispatchPerCommandMs: 2000,
      slowestUnit: 'spear',
      slowestUnitSecondsPerField: 1
    }
  })

  assert.equal(result.meta.assignedCount, 1)
  assert.equal(result.meta.noTimeCount, 0)
  assert.equal(result.meta.unfilledRequestedCount, 1)
  assert.equal(result.targetGroups[0].assignedQty, 1)
  assert.equal(result.targetGroups[0].remainingQty, 1)
  assert.equal(result.commandEntries.length, 1)
  assert.equal(result.commandEntries[0].dispatchOrder, 0)
  assert.equal(result.commandEntries[0].sendOffsetMs, 0)
})
