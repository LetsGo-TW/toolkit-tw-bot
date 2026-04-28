const test = require('node:test')
const assert = require('node:assert/strict')
const senders = require('./senders.json')
const targets = require('./targets.json')

test('Deve retornar a lista de targets ordenada pelo sender mais distante', async () => {
  const { orderCoordsFromCoords } = await import('./orderCoordsFromCoords.js')

  const orderedTargets = orderCoordsFromCoords(targets, senders)

  assert.equal(orderedTargets.length, targets.length)
  assert.equal(orderedTargets[0], '333|157')
  assert.equal(orderedTargets.at(-1), '346|214')
})
