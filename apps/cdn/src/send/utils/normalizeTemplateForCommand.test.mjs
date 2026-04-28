import test from 'node:test'
import assert from 'node:assert/strict'
import { normalizeTemplateForCommand, buildTemplateRowMap } from './normalizeTemplateForCommand.js'

test('normalizeTemplateForCommand normaliza template novo para ordem do mundo', () => {
  const unitsOrder = ['spear', 'sword', 'axe']
  const template = {
    buildTarget: 'farm',
    units: ['axe', 'spear'],
    values: [[40, 100]]
  }

  const result = normalizeTemplateForCommand(template, unitsOrder, {
    sourceVillageUnits: { units: [1000, 1000, 1000] },
    mode: 'send'
  })

  assert.deepEqual(result.values, [[100, 0, 40]])
  assert.equal(result.buildTarget, 'farm')
})

test('normalizeTemplateForCommand usa percent para unidades comuns e value para knight/snob', () => {
  const unitsOrder = ['spear', 'knight', 'snob']
  const template = {
    templateType: 'percent',
    units: ['spear', 'knight', 'snob'],
    values: [
      [50, 1, 1],
      [25, 0, 1]
    ]
  }

  const result = normalizeTemplateForCommand(template, unitsOrder, {
    sourceVillageUnits: {
      units: [200, 1, 2],
      byUnit: new Map([
        ['spear', 200],
        ['knight', 1],
        ['snob', 2]
      ])
    },
    mode: 'send'
  })

  assert.deepEqual(result.values, [
    [100, 1, 1],
    [50, 0, 1]
  ])
})

test('normalizeTemplateForCommand aplica fake-limit em attack mesmo no modo percent', () => {
  const unitsOrder = ['spear']
  const template = {
    templateType: 'percent',
    units: ['spear'],
    values: [
      [10],
      [10]
    ]
  }

  const result = normalizeTemplateForCommand(template, unitsOrder, {
    sourceVillageUnits: {
      units: [200],
      byUnit: new Map([
        ['spear', 200]
      ])
    },
    commandType: 'attack',
    villagePoints: 10000,
    fakeLimitPercent: 1
  })

  assert.equal(result.values.length, 2)
  assert.equal(result.values.every((row) => Number(row?.[0]) >= 100), true)
  assert.equal(
    result.meta.resolutions.some((item) => item.type === 'fakeLimit'),
    true
  )
})

test('normalizeTemplateForCommand normaliza template legado', () => {
  const unitsOrder = ['spear', 'sword', 'axe']
  const template = { spear: 50, axe: 10 }

  const result = normalizeTemplateForCommand(template, unitsOrder, {
    sourceVillageUnits: { units: [1000, 1000, 1000] },
    mode: 'send'
  })

  assert.deepEqual(result.values, [[50, 0, 10]])
})

test('normalizeTemplateForCommand redistribui tropas quando fixo excede disponível', () => {
  const unitsOrder = ['spear']
  const template = { units: ['spear'], values: [[100], [80]] }

  const result = normalizeTemplateForCommand(template, unitsOrder, {
    sourceVillageUnits: { units: [150] },
    mode: 'send'
  })

  assert.equal(result.meta.conflicts.troops, true)
  assert.deepEqual(result.values, [[100], [50]])
})

test('normalizeTemplateForCommand não aborta em conflito de tropas (sempre redistribui)', () => {
  const unitsOrder = ['spear']
  const template = { units: ['spear'], values: [[100], [80]] }

  const result = normalizeTemplateForCommand(template, unitsOrder, {
    sourceVillageUnits: { units: [150] },
    mode: 'send'
  })

  assert.equal(result.meta.conflicts.troops, true)
  assert.deepEqual(result.values, [[100], [50]])
})

test('buildTemplateRowMap cria mapa unit->value da row', () => {
  const rowMap = buildTemplateRowMap(['spear', 'axe'], [120, 30])
  assert.deepEqual(rowMap, { spear: 120, axe: 30 })
})

test('normalizeTemplateForCommand não aplica conflito de attacks em support', () => {
  const unitsOrder = ['spear']
  const template = { units: ['spear'], values: [[100], [50]] }

  const result = normalizeTemplateForCommand(template, unitsOrder, {
    sourceVillageUnits: { units: [100] },
    mode: 'send',
    commandType: 'support'
  })

  assert.equal(result.meta.commandType, 'support')
  assert.equal(result.meta.conflicts.attacks, false)
  assert.deepEqual(result.values, [[100]])
})

test('normalizeTemplateForCommand aplica fake limit redistribuindo com tropas já selecionadas', () => {
  const unitsOrder = ['spear', 'axe', 'spy']
  const template = {
    units: ['spear', 'axe', 'spy'],
    values: [
      [20, 20, 1],
      [20, 20, 1]
    ]
  }

  const result = normalizeTemplateForCommand(template, unitsOrder, {
    sourceVillageUnits: {
      units: [80, 80, 20],
      byUnit: new Map([
        ['spear', 80],
        ['axe', 80],
        ['spy', 20]
      ])
    },
    commandType: 'attack',
    villagePoints: 10000,
    fakeLimitPercent: 1 // min pop 100
  })

  assert.equal(result.meta.conflicts.attacks, false)
  assert.equal(result.values.length, 2)
  assert.equal(
    result.meta.resolutions.some((item) => item.type === 'fakeLimit'),
    true
  )
})

test('normalizeTemplateForCommand reduz linhas quando fake limit não fecha todas', () => {
  const unitsOrder = ['spear', 'axe']
  const template = {
    units: ['spear', 'axe'],
    values: [
      [20, 20],
      [20, 20],
      [20, 20]
    ]
  }

  const result = normalizeTemplateForCommand(template, unitsOrder, {
    sourceVillageUnits: {
      units: [60, 60],
      byUnit: new Map([
        ['spear', 60],
        ['axe', 60]
      ])
    },
    commandType: 'attack',
    villagePoints: 10000,
    fakeLimitPercent: 1 // min pop 100
  })

  assert.equal(result.meta.conflicts.attacks, true)
  assert.equal(result.values.length < 3, true)
})

test('normalizeTemplateForCommand reduz ataques se faltar unidade mais lenta', () => {
  const unitsOrder = ['axe', 'light', 'snob']
  const template = {
    units: ['axe', 'light', 'snob'],
    values: [
      [100, 0, 1],
      [100, 0, 1],
      [100, 0, 1],
      [100, 0, 1]
    ]
  }

  const result = normalizeTemplateForCommand(template, unitsOrder, {
    sourceVillageUnits: {
      units: [400, 0, 3],
      byUnit: new Map([
        ['axe', 400],
        ['light', 0],
        ['snob', 3]
      ])
    },
    commandType: 'attack',
    unitMetaByName: new Map([
      ['axe', { speed: 10, pop: 1 }],
      ['light', { speed: 12, pop: 4 }],
      ['snob', { speed: 35, pop: 100 }]
    ])
  })

  assert.equal(result.values.length, 3)
  assert.equal(result.meta.conflicts.attacks, true)
})

test('normalizeTemplateForCommand usa fallback de unitMetaByName quando disponível', () => {
  const unitsOrder = ['axe', 'light']
  const template = {
    units: ['axe', 'light'],
    values: [
      [10, 10],
      [10, 10]
    ]
  }
  const unitMetaByName = new Map([
    ['axe', { speed: 5, pop: 1 }],
    ['light', { speed: 10, pop: 4 }]
  ])

  const result = normalizeTemplateForCommand(template, unitsOrder, {
    sourceVillageUnits: {
      units: [20, 20],
      byUnit: new Map([
        ['axe', 20],
        ['light', 20]
      ])
    },
    commandType: 'attack',
    unitMetaByName
  })

  assert.equal(result.values.length, 2)
  assert.equal(
    result.meta.resolutions.some((item) => item.type === 'slowestUnit'),
    false
  )
})

test('normalizeTemplateForCommand prioriza quantidade de ataques quando faltar snob', () => {
  const unitsOrder = ['axe', 'snob']
  const template = {
    units: ['axe', 'snob'],
    values: [
      [100, 1],
      [100, 1],
      [100, 1],
      [100, 2]
    ]
  }

  const result = normalizeTemplateForCommand(template, unitsOrder, {
    sourceVillageUnits: {
      units: [400, 4],
      byUnit: new Map([
        ['axe', 400],
        ['snob', 4]
      ])
    },
    commandType: 'attack',
    unitMetaByName: new Map([
      ['axe', { speed: 10, pop: 1 }],
      ['snob', { speed: 35, pop: 100 }]
    ])
  })

  const snobIdx = result.units.indexOf('snob')
  const totalSnob = result.values.reduce((acc, row) => acc + (Number(row?.[snobIdx]) || 0), 0)
  assert.equal(result.values.length, 4)
  assert.equal(totalSnob, 4)
  assert.equal(result.values.every((row) => (Number(row?.[snobIdx]) || 0) >= 1), true)
})

test('normalizeTemplateForCommand não usa snob para completar fake-limit', () => {
  const unitsOrder = ['spear', 'snob']
  const template = {
    units: ['spear', 'snob'],
    values: [
      [10, 1],
      [10, 1]
    ]
  }

  const result = normalizeTemplateForCommand(template, unitsOrder, {
    sourceVillageUnits: {
      units: [20, 10],
      byUnit: new Map([
        ['spear', 20],
        ['snob', 10]
      ])
    },
    commandType: 'attack',
    villagePoints: 20000,
    fakeLimitPercent: 1,
    unitMetaByName: new Map([
      ['spear', { speed: 10, pop: 1 }],
      ['snob', { speed: 35, pop: 100 }]
    ])
  })

  assert.equal(result.values.length, 0)
  assert.equal(result.meta.conflicts.attacks, true)
})

test('normalizeTemplateForCommand usa tropas fora do modelo só para completar', () => {
  const unitsOrder = ['spear', 'axe', 'light']
  const template = {
    units: ['spear', 'axe', 'light'],
    values: [
      [30, 30, 0],
      [30, 30, 0]
    ]
  }

  const result = normalizeTemplateForCommand(template, unitsOrder, {
    sourceVillageUnits: {
      units: [60, 60, 20],
      byUnit: new Map([
        ['spear', 60],
        ['axe', 60],
        ['light', 20]
      ])
    },
    commandType: 'attack',
    villagePoints: 10000,
    fakeLimitPercent: 1
  })

  const lightIdx = result.units.indexOf('light')
  assert.equal(result.values.length, 2)
  assert.equal(result.values.every((row) => (Number(row?.[lightIdx]) || 0) > 0), true)
})

test('normalizeTemplateForCommand não usa tropas fora do modelo quando o modelo fecha o fake-limit', () => {
  const unitsOrder = ['spear', 'axe', 'light']
  const template = {
    units: ['spear', 'axe', 'light'],
    values: [
      [30, 30, 0],
      [30, 30, 0]
    ]
  }

  const result = normalizeTemplateForCommand(template, unitsOrder, {
    sourceVillageUnits: {
      units: [100, 100, 20],
      byUnit: new Map([
        ['spear', 100],
        ['axe', 100],
        ['light', 20]
      ])
    },
    commandType: 'attack',
    villagePoints: 10000,
    fakeLimitPercent: 1
  })

  const lightIdx = result.units.indexOf('light')
  assert.equal(result.values.length, 2)
  assert.equal(result.values.every((row) => (Number(row?.[lightIdx]) || 0) === 0), true)
})

test('normalizeTemplateForCommand redistribui sobra para linha ALL do modelo em conflito com snob', () => {
  const unitsOrder = ['spear', 'sword', 'axe', 'archer', 'spy', 'light', 'marcher', 'heavy', 'ram', 'catapult', 'knight', 'snob']
  const template = {
    units: unitsOrder,
    values: [
      [0, 0, -1, 0, -1, -1, -1, 0, -1, -1, 1, 1],
      [0, 0, 666, 0, 0, 333, 0, 0, 0, 0, 0, 1],
      [0, 0, 666, 0, 0, 333, 0, 0, 0, 0, 0, 1],
      [0, 0, 666, 0, 0, 333, 0, 0, 0, 0, 0, 1]
    ]
  }

  const result = normalizeTemplateForCommand(template, unitsOrder, {
    sourceVillageUnits: {
      units: [0, 0, 0, 0, 142, 100, 0, 0, 0, 10, 0, 4],
      byUnit: new Map([
        ['spear', 0],
        ['sword', 0],
        ['axe', 0],
        ['archer', 0],
        ['spy', 142],
        ['light', 100],
        ['marcher', 0],
        ['heavy', 0],
        ['ram', 0],
        ['catapult', 10],
        ['knight', 0],
        ['snob', 4]
      ])
    },
    commandType: 'attack',
    villagePoints: 12300, // min pop 123
    fakeLimitPercent: 1,
    unitMetaByName: new Map([
      ['spy', { speed: 9, pop: 2 }],
      ['light', { speed: 10, pop: 4 }],
      ['catapult', { speed: 30, pop: 8 }],
      ['snob', { speed: 35, pop: 100 }]
    ])
  })

  const spyIdx = result.units.indexOf('spy')
  const lightIdx = result.units.indexOf('light')
  const catapultIdx = result.units.indexOf('catapult')
  const snobIdx = result.units.indexOf('snob')

  assert.equal(result.values.length, 4)
  assert.deepEqual(
    result.values.map((row) => Number(row?.[snobIdx]) || 0),
    [1, 1, 1, 1]
  )
  assert.equal(
    result.values.slice(1).every((row) =>
      (Number(row?.[lightIdx]) || 0) > 0
    ),
    true
  )
  assert.equal(
    result.values.reduce((acc, row) => acc + (Number(row?.[spyIdx]) || 0), 0),
    142
  )
  assert.equal(
    result.values.reduce((acc, row) => acc + (Number(row?.[lightIdx]) || 0), 0),
    100
  )
  assert.equal(
    result.values.reduce((acc, row) => acc + (Number(row?.[catapultIdx]) || 0), 0),
    10
  )
})

test('normalizeTemplateForCommand não redistribui quando faltar snob sem conflito de fake-limit', () => {
  const unitsOrder = ['spear', 'sword', 'axe', 'archer', 'spy', 'light', 'marcher', 'heavy', 'ram', 'catapult', 'knight', 'snob']
  const template = {
    units: unitsOrder,
    values: [
      [0, 0, -1, 0, 0, -1, 0, 0, 0, 0, 0, 1],
      [0, 0, 666, 0, 0, 333, 0, 0, 0, 0, 0, 1],
      [0, 0, 666, 0, 0, 333, 0, 0, 0, 0, 0, 1],
      [0, 0, 666, 0, 0, 333, 0, 0, 0, 0, 0, 1]
    ]
  }

  const result = normalizeTemplateForCommand(template, unitsOrder, {
    sourceVillageUnits: {
      units: [0, 0, 6167, 0, 0, 2279, 0, 0, 0, 0, 0, 3],
      byUnit: new Map([
        ['spear', 0],
        ['sword', 0],
        ['axe', 6167],
        ['archer', 0],
        ['spy', 0],
        ['light', 2279],
        ['marcher', 0],
        ['heavy', 0],
        ['ram', 0],
        ['catapult', 0],
        ['knight', 0],
        ['snob', 3]
      ])
    },
    commandType: 'attack',
    villagePoints: 12300,
    fakeLimitPercent: 1,
    slowestTemplateUnit: 'snob'
  })

  assert.deepEqual(result.values, [
    [0, 0, 4835, 0, 0, 1613, 0, 0, 0, 0, 0, 1],
    [0, 0, 666, 0, 0, 333, 0, 0, 0, 0, 0, 1],
    [0, 0, 666, 0, 0, 333, 0, 0, 0, 0, 0, 1]
  ])
})

test('normalizeTemplateForCommand prioriza linhas reduzindo excesso de snob na primeira linha', () => {
  const unitsOrder = ['spear', 'sword', 'axe', 'archer', 'spy', 'light', 'marcher', 'heavy', 'ram', 'catapult', 'knight', 'snob']
  const template = {
    units: unitsOrder,
    values: [
      [0, 0, -1, 0, -1, -1, -1, 0, -1, -1, 1, 3],
      [0, 0, 666, 0, 0, 333, 0, 0, 0, 0, 0, 1],
      [0, 0, 666, 0, 0, 333, 0, 0, 0, 0, 0, 1],
      [0, 0, 666, 0, 0, 333, 0, 0, 0, 0, 0, 1]
    ]
  }

  const result = normalizeTemplateForCommand(template, unitsOrder, {
    sourceVillageUnits: {
      units: [0, 0, 0, 0, 142, 100, 0, 0, 0, 10, 0, 5],
      byUnit: new Map([
        ['spear', 0],
        ['sword', 0],
        ['axe', 0],
        ['archer', 0],
        ['spy', 142],
        ['light', 100],
        ['marcher', 0],
        ['heavy', 0],
        ['ram', 0],
        ['catapult', 10],
        ['knight', 0],
        ['snob', 5]
      ])
    },
    commandType: 'attack',
    villagePoints: 12300,
    fakeLimitPercent: 1,
    slowestTemplateUnit: 'snob',
    unitMetaByName: new Map([
      ['spy', { speed: 9, pop: 2 }],
      ['light', { speed: 10, pop: 4 }],
      ['catapult', { speed: 30, pop: 8 }],
      ['snob', { speed: 35, pop: 100 }]
    ])
  })

  const snobIdx = result.units.indexOf('snob')
  const lightIdx = result.units.indexOf('light')
  const catapultIdx = result.units.indexOf('catapult')

  assert.equal(result.values.length, 4)
  assert.deepEqual(
    result.values.map((row) => Number(row?.[snobIdx]) || 0),
    [2, 1, 1, 1]
  )
  assert.equal(
    result.values.slice(1).every((row) =>
      (Number(row?.[lightIdx]) || 0) > 0
    ),
    true
  )
  assert.equal(
    result.values.reduce((acc, row) => acc + (Number(row?.[lightIdx]) || 0), 0),
    100
  )
  assert.equal(
    result.values.reduce((acc, row) => acc + (Number(row?.[catapultIdx]) || 0), 0),
    10
  )
})

test('normalizeTemplateForCommand usa mistura proporcional de light e catapult em fallback sem tropa principal do modelo', () => {
  const unitsOrder = ['spear', 'sword', 'axe', 'archer', 'spy', 'light', 'marcher', 'heavy', 'ram', 'catapult', 'knight', 'snob']
  const template = {
    units: unitsOrder,
    values: [
      [0, 0, -1, 0, -1, -1, -1, 0, -1, -1, 1, 3],
      [0, 0, 666, 0, 0, 333, 0, 0, 0, 0, 0, 1],
      [0, 0, 666, 0, 0, 333, 0, 0, 0, 0, 0, 1],
      [0, 0, 666, 0, 0, 333, 0, 0, 0, 0, 0, 1]
    ]
  }

  const result = normalizeTemplateForCommand(template, unitsOrder, {
    sourceVillageUnits: {
      units: [0, 0, 0, 0, 0, 18, 0, 0, 0, 10, 0, 5],
      byUnit: new Map([
        ['spear', 0],
        ['sword', 0],
        ['axe', 0],
        ['archer', 0],
        ['spy', 0],
        ['light', 18],
        ['marcher', 0],
        ['heavy', 0],
        ['ram', 0],
        ['catapult', 10],
        ['knight', 0],
        ['snob', 5]
      ])
    },
    commandType: 'attack',
    villagePoints: 12300,
    fakeLimitPercent: 1,
    slowestTemplateUnit: 'snob',
    unitMetaByName: new Map([
      ['light', { speed: 10, pop: 4 }],
      ['catapult', { speed: 30, pop: 8 }],
      ['snob', { speed: 35, pop: 100 }]
    ])
  })

  const snobIdx = result.units.indexOf('snob')
  const lightIdx = result.units.indexOf('light')
  const catapultIdx = result.units.indexOf('catapult')

  assert.equal(result.values.length, 4)
  assert.deepEqual(
    result.values.map((row) => Number(row?.[snobIdx]) || 0),
    [2, 1, 1, 1]
  )
  assert.equal(
    result.values.slice(1).every((row) =>
      (Number(row?.[lightIdx]) || 0) > 0 &&
      (Number(row?.[catapultIdx]) || 0) > 0
    ),
    true
  )
  assert.equal(
    result.values.reduce((acc, row) => acc + (Number(row?.[lightIdx]) || 0), 0),
    18
  )
  assert.equal(
    result.values.reduce((acc, row) => acc + (Number(row?.[catapultIdx]) || 0), 0),
    10
  )
})

test('normalizeTemplateForCommand não coloca no pool unidade mais lenta que a mais lenta do modelo', () => {
  const unitsOrder = ['spy', 'light', 'catapult']
  const template = {
    units: unitsOrder,
    values: [
      [1, 30, 0],
      [1, 30, 0]
    ]
  }

  const result = normalizeTemplateForCommand(template, unitsOrder, {
    sourceVillageUnits: {
      units: [3, 60, 10],
      byUnit: new Map([
        ['spy', 3],
        ['light', 60],
        ['catapult', 10]
      ])
    },
    commandType: 'attack',
    villagePoints: 12300,
    fakeLimitPercent: 1,
    slowestTemplateUnit: 'light',
    unitMetaByName: new Map([
      ['spy', { speed: 9, pop: 2 }],
      ['light', { speed: 10, pop: 4 }],
      ['catapult', { speed: 30, pop: 8 }]
    ])
  })

  const catapultIdx = result.units.indexOf('catapult')
  assert.equal(result.values.length, 1)
  assert.equal(
    result.values.reduce((acc, row) => acc + (Number(row?.[catapultIdx]) || 0), 0),
    0
  )
})

test('normalizeTemplateForCommand garante snob por linha mesmo com speed em campo/seg', () => {
  const unitsOrder = ['spy', 'light', 'catapult', 'snob']
  const template = {
    units: unitsOrder,
    values: [
      [18, 11, 1, 3],
      [1, 4, 1, 1],
      [2, 3, 1, 1],
      [33, 0, 7, 0]
    ]
  }

  const result = normalizeTemplateForCommand(template, unitsOrder, {
    sourceVillageUnits: {
      units: [54, 18, 10, 5],
      byUnit: new Map([
        ['spy', 54],
        ['light', 18],
        ['catapult', 10],
        ['snob', 5]
      ])
    },
    commandType: 'attack',
    unitMetaByName: new Map([
      ['spy', { speed: 0.111, pop: 2 }],
      ['light', { speed: 0.1, pop: 4 }],
      ['catapult', { speed: 0.033, pop: 8 }],
      ['snob', { speed: 0.028, pop: 100 }]
    ])
  })

  const snobIdx = result.units.indexOf('snob')
  const snobByRow = result.values.map((row) => Number(row?.[snobIdx]) || 0)
  const totalSnob = snobByRow.reduce((acc, value) => acc + value, 0)

  assert.equal(result.values.length, 4)
  assert.equal(snobByRow.every((qty) => qty >= 1), true)
  assert.equal(totalSnob, 5)
})
