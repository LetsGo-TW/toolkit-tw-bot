const test = require('node:test')
const assert = require('node:assert/strict')
const senders = require('./senders.json')
const targets = require('./targets.json')

test('distributeSendersByTargets: distribui inteiros por alvo e fecha totais', async () => {
  const { distributeSendersByTargets } = await import('./distributeSendersByTargets.js')

  const result = distributeSendersByTargets({ senders, targets })

  assert.equal(result.totalSenders, senders.length)
  assert.equal(result.totalTargets, targets.length)
  assert.equal(result.targetGroups.length, targets.length)
  assert.equal(result.sendersPerTarget, Math.floor(senders.length / targets.length))
  assert.equal(result.remainingSenders, senders.length % targets.length)

  const assignedCount = result.targetGroups.reduce((acc, item) => acc + item.senders.length, 0)
  assert.equal(assignedCount + result.unassignedSenders.length, senders.length)
  assert.equal(result.unassignedSenders.length, 0)

  // primeiros "remainingSenders" alvos recebem +1 sender
  result.targetGroups.forEach((group, index) => {
    const expected = result.sendersPerTarget + (index < result.remainingSenders ? 1 : 0)
    assert.equal(group.senders.length, expected)
  })
})

test('distributeSendersByTargets: distribui em rodadas (não em blocos)', async () => {
  const { distributeSendersByTargets } = await import('./distributeSendersByTargets.js')

  const localTargets = ['100|100', '101|100', '102|100']
  const localSenders = ['200|200', '201|200', '202|200', '203|200', '204|200', '205|200', '206|200']

  const result = distributeSendersByTargets({
    senders: localSenders,
    targets: localTargets
  })

  // 7 / 3 = 2 e sobra 1 => [3,2,2]
  assert.deepEqual(result.targetGroups.map((g) => g.senders.length), [3, 2, 2])

  // Round-robin preserva sequência da lista ordenada de senders em rodadas
  const [g0, g1, g2] = result.targetGroups
  assert.equal(g0.senders[0], result.orderedSenders[0])
  assert.equal(g1.senders[0], result.orderedSenders[1])
  assert.equal(g2.senders[0], result.orderedSenders[2])
  assert.equal(g0.senders[1], result.orderedSenders[3])
  assert.equal(g1.senders[1], result.orderedSenders[4])
  assert.equal(g2.senders[1], result.orderedSenders[5])
  assert.equal(g0.senders[2], result.orderedSenders[6])
})

test('distributeSendersByTargets: furthest inverte ordem dos targets em relação ao closest', async () => {
  const { distributeSendersByTargets } = await import('./distributeSendersByTargets.js')

  const closest = distributeSendersByTargets({
    senders,
    targets,
    typeGenerate: 'closest'
  })
  const furthest = distributeSendersByTargets({
    senders,
    targets,
    typeGenerate: 'furthest'
  })

  assert.deepEqual(
    furthest.orderedTargets,
    [...closest.orderedTargets].reverse()
  )
})
