import test from 'node:test'
import assert from 'node:assert/strict'
import { distributeFakeLimitByAvailability } from './index.js'

test('distributeFakeLimitByAvailability calcula proporcao para spy/light/catapult', () => {
  const popMin = 23
  const pool = [
    { unit: 'spy', pop: 2, count: 34 },
    { unit: 'light', pop: 4, count: 18 },
    { unit: 'catapult', pop: 8, count: 10 }
  ]

  const result = distributeFakeLimitByAvailability(popMin, pool)

  assert.deepEqual(result, {
    spy: 4,
    light: 2,
    catapult: 2
  })
})
