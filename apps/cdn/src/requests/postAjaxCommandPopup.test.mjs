import test from 'node:test'
import assert from 'node:assert/strict'
import { applyTemplateBuildTargetToPayloadEntries } from './utils/applyTemplateBuildTargetToPayloadEntries.js'

test('applyTemplateBuildTargetToPayloadEntries sobrescreve building quando o template normalizado tem catapulta', () => {
  const payload = [
    ['x', 500],
    ['y', 500],
    ['building', 'wall']
  ]

  const result = applyTemplateBuildTargetToPayloadEntries(payload, {
    templateNormalized: {
      buildTarget: 'farm',
      units: ['axe', 'catapult'],
      values: [[100, 5]]
    }
  })

  assert.deepEqual(result, [
    ['x', 500],
    ['y', 500],
    ['building', 'farm']
  ])
})

test('applyTemplateBuildTargetToPayloadEntries preserva building atual quando o template não tem catapulta', () => {
  const payload = [
    ['x', 500],
    ['y', 500],
    ['building', 'wall']
  ]

  const result = applyTemplateBuildTargetToPayloadEntries(payload, {
    templateNormalized: {
      buildTarget: 'farm',
      units: ['axe', 'catapult'],
      values: [[100, 0]]
    }
  })

  assert.deepEqual(result, payload)
})
