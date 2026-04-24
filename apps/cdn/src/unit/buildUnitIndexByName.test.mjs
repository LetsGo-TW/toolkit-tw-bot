import test from 'node:test'
import assert from 'node:assert/strict'
import { buildUnitIndexByName } from './buildUnitIndexByName.js'

test('buildUnitIndexByName: mapeia unidades na ordem do array', () => {
  const units = ['spear', 'sword', 'axe']
  const result = buildUnitIndexByName(units)

  assert.ok(result instanceof Map)
  assert.equal(result.size, 3)
  assert.equal(result.get('spear'), 0)
  assert.equal(result.get('sword'), 1)
  assert.equal(result.get('axe'), 2)
})

test('buildUnitIndexByName: entrada inválida retorna map vazio', () => {
  assert.equal(buildUnitIndexByName(null).size, 0)
  assert.equal(buildUnitIndexByName(undefined).size, 0)
  assert.equal(buildUnitIndexByName('not-array').size, 0)
})

test('buildUnitIndexByName: unidade duplicada mantém último índice', () => {
  const result = buildUnitIndexByName(['spear', 'sword', 'spear'])

  assert.equal(result.size, 2)
  assert.equal(result.get('spear'), 2)
  assert.equal(result.get('sword'), 1)
})
