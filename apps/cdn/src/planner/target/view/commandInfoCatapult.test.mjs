import test from 'node:test'
import assert from 'node:assert/strict'
import { resolveCommandCatapultTargetLabel } from './commandInfoCatapult.js'

const buildingLabels = {
  wall: { trans: 'Muralha' },
  farm: { trans: 'Fazenda' }
}

test('resolveCommandCatapultTargetLabel traduz alvo simples quando ha catapulta', () => {
  const result = resolveCommandCatapultTargetLabel({
    units: {
      catapult: { count: '100' }
    },
    catapult_target: 'wall'
  }, {
    buildingLabels
  })

  assert.equal(result, 'Muralha')
})

test('resolveCommandCatapultTargetLabel le alvo aninhado do bloco catapult', () => {
  const result = resolveCommandCatapultTargetLabel({
    units: {
      catapult: { count: '12' }
    },
    catapult: {
      targetBuilding: {
        id: 'farm'
      }
    }
  }, {
    buildingLabels
  })

  assert.equal(result, 'Fazenda')
})

test('resolveCommandCatapultTargetLabel nao mostra alvo sem catapulta', () => {
  const result = resolveCommandCatapultTargetLabel({
    units: {
      catapult: { count: '0' }
    },
    catapult_target: 'wall'
  }, {
    buildingLabels
  })

  assert.equal(result, '')
})

test('resolveCommandCatapultTargetLabel ignora target da aldeia quando nao e alvo de catapulta', () => {
  const result = resolveCommandCatapultTargetLabel({
    units: {
      catapult: { count: '15' }
    },
    target: {
      id: '154008'
    }
  }, {
    buildingLabels
  })

  assert.equal(result, '')
})

test('resolveCommandCatapultTargetLabel ignora target aninhado fora do bloco de catapulta', () => {
  const result = resolveCommandCatapultTargetLabel({
    units: {
      catapult: { count: '15' }
    },
    details: {
      target: {
        id: '154008'
      }
    }
  }, {
    buildingLabels
  })

  assert.equal(result, '')
})
