import test from 'node:test'
import assert from 'node:assert/strict'
import { buildTemplateFirstRowUnitsForPlaceLink } from './buildTemplateFirstRowUnitsForPlaceLink.mjs'

const gameDataUnitsWithoutArcher = ['spear', 'sword', 'axe', 'spy', 'light', 'heavy', 'ram', 'catapult', 'knight', 'snob']
const gameDataUnitsWithArcher = ['spear', 'sword', 'axe', 'archer', 'spy', 'light', 'marcher', 'heavy', 'ram', 'catapult', 'knight', 'snob']

const sendersWithArcher = [
  {
    villageId: 154012,
    distance: 2,
    units: [4521, 3194, 0, 2094, 1002, 100, 0, 1031, 0, 10, 1, 3]
  },
  {
    villageId: 122544,
    distance: 2.2,
    units: [45, 7, 6089, 0, 2, 2406, 239, 0, 630, 2, 1, 9]
  },
  {
    villageId: 133648,
    distance: 2.8,
    units: [7802, 0, 0, 0, 0, 0, 0, 1998, 0, 0, 1, 3]
  },
  {
    villageId: 89906,
    distance: 65.1,
    units: [0, 1, 5201, 0, 50, 2600, 260, 0, 400, 100, 0, 0]
  },
  {
    villageId: 92087,
    distance: 65.3,
    units: [0, 1, 5201, 0, 50, 2600, 260, 0, 400, 100, 0, 0]
  },
  {
    villageId: 91954,
    distance: 65.5,
    units: [794, 500, 0, 0, 1000, 44, 0, 217, 0, 10, 0, 0]
  },
  {
    villageId: 88693,
    distance: 68,
    units: [0, 1, 6091, 0, 50, 3000, 300, 0, 500, 0, 0, 0]
  },
  {
    villageId: 89831,
    distance: 69.2,
    units: [0, 1, 5201, 0, 50, 2600, 260, 0, 400, 100, 0, 0]
  },
  {
    villageId: 91453,
    distance: 74,
    units: [0, 1, 6091, 0, 0, 3000, 300, 0, 1000, 0, 0, 0]
  },
  {
    villageId: 86212,
    distance: 77,
    units: [947, 500, 0, 4000, 1000, 49, 0, 515, 0, 10, 0, 0]
  }
]

const sendersWithoutArcher = sendersWithArcher.map((sender) => {
  const [spear, sword, axe, _archer, spy, light, _marcher, heavy, ram, catapult, knight, snob] = sender.units
  return {
    ...sender,
    units: [spear, sword, axe, spy, light, heavy, ram, catapult, knight, snob]
  }
})

const makeUnitIndex = (units) => new Map(units.map((unit, i) => [unit, i]))

test('cenários de mundo com arqueiro e sem arqueiro mantêm índice consistente', () => {
  const idxWithArcher = makeUnitIndex(gameDataUnitsWithArcher)
  const idxWithoutArcher = makeUnitIndex(gameDataUnitsWithoutArcher)
  assert.equal(sendersWithArcher[0].units.length, gameDataUnitsWithArcher.length)
  assert.equal(sendersWithoutArcher[0].units.length, gameDataUnitsWithoutArcher.length)
  assert.equal(idxWithArcher.get('heavy'), 7)
  assert.equal(idxWithoutArcher.get('heavy'), 5)
})

test('cenário sem arqueiro também calcula primeira linha corretamente', () => {
  const units = ['spear', 'sword', 'axe', 'spy', 'light', 'heavy', 'ram', 'catapult', 'knight', 'snob']
  const result = buildTemplateFirstRowUnitsForPlaceLink({
    templateState: {
      template: {
        templateType: 'value',
        units,
        values: [
          [100, 50, 200, 10, 20, 30, 5, 0, 1, 0],
          [10, 0, 50, 5, 0, 0, 0, 0, 0, 0]
        ]
      }
    },
    senderUnits: sendersWithoutArcher[0].units,
    unitIndexByName: makeUnitIndex(units)
  })
  assert.deepEqual(Object.fromEntries(result), {
    spear: 100,
    sword: 50,
    axe: 0,
    spy: 10,
    light: 20,
    heavy: 30,
    ram: 0,
    catapult: 0,
    knight: 1,
    snob: 0
  })
})

test('retorna vazio quando template não tem unidades', () => {
  const result = buildTemplateFirstRowUnitsForPlaceLink({
    templateState: { template: { templateType: 'value', units: [], values: [] } },
    senderUnits: [],
    unitIndexByName: new Map()
  })
  assert.equal(result.size, 0)
})

test('template não-value retorna 0 para todas as unidades', () => {
  const units = ['spear', 'sword', 'axe']
  const result = buildTemplateFirstRowUnitsForPlaceLink({
    templateState: {
      template: {
        templateType: 'percent',
        units,
        values: [[10, 20, 30]]
      }
    },
    senderUnits: [100, 200, 300],
    unitIndexByName: makeUnitIndex(units)
  })
  assert.deepEqual(Object.fromEntries(result), { spear: 0, sword: 0, axe: 0 })
})

test('primeira linha fixa sem outras linhas usa min(template, vila)', () => {
  const units = ['spear', 'sword', 'axe']
  const result = buildTemplateFirstRowUnitsForPlaceLink({
    templateState: {
      template: {
        templateType: 'value',
        units,
        values: [[120, 10, 50]]
      }
    },
    senderUnits: [100, 5, 70],
    unitIndexByName: makeUnitIndex(units)
  })
  assert.deepEqual(Object.fromEntries(result), { spear: 100, sword: 5, axe: 50 })
})

test('desconta linhas seguintes fixas da primeira linha', () => {
  const units = ['spear', 'sword', 'axe']
  const result = buildTemplateFirstRowUnitsForPlaceLink({
    templateState: {
      template: {
        templateType: 'value',
        units,
        values: [
          [300, 100, 80],
          [50, 0, 30],
          [20, 10, 0]
        ]
      }
    },
    senderUnits: [400, 120, 100],
    unitIndexByName: makeUnitIndex(units)
  })
  assert.deepEqual(Object.fromEntries(result), { spear: 300, sword: 100, axe: 70 })
})

test('all (-1) em outra linha zera unidade da primeira linha', () => {
  const units = ['spear', 'sword', 'axe']
  const result = buildTemplateFirstRowUnitsForPlaceLink({
    templateState: {
      template: {
        templateType: 'value',
        units,
        values: [
          [100, 100, 100],
          [-1, 0, 20]
        ]
      }
    },
    senderUnits: [500, 200, 150],
    unitIndexByName: makeUnitIndex(units)
  })
  assert.deepEqual(Object.fromEntries(result), { spear: 0, sword: 100, axe: 100 })
})

test('all (-1) na primeira linha usa sobra após desconto das outras', () => {
  const units = ['spear', 'sword', 'axe']
  const result = buildTemplateFirstRowUnitsForPlaceLink({
    templateState: {
      template: {
        templateType: 'value',
        units,
        values: [
          [-1, -1, 30],
          [100, 25, 5]
        ]
      }
    },
    senderUnits: [480, 90, 50],
    unitIndexByName: makeUnitIndex(units)
  })
  assert.deepEqual(Object.fromEntries(result), { spear: 380, sword: 65, axe: 30 })
})

test('ignora linhas vazias e usa a primeira linha útil', () => {
  const units = ['spear', 'sword']
  const result = buildTemplateFirstRowUnitsForPlaceLink({
    templateState: {
      template: {
        templateType: 'value',
        units,
        values: [
          [0, 0],
          [30, 0],
          [5, 0]
        ]
      }
    },
    senderUnits: [100, 100],
    unitIndexByName: makeUnitIndex(units)
  })
  assert.deepEqual(Object.fromEntries(result), { spear: 30, sword: 0 })
})

test('matriz de variáveis: tropa na aldeia (x), modelo (x), commandType', () => {
  const units = ['spear', 'sword', 'axe']
  const unitIndexByName = makeUnitIndex(units)

  const cases = [
    {
      name: 'aldeia menor que modelo',
      senderUnits: [80, 40, 20],
      values: [[120, 20, 10]],
      commandMode: 'attack',
      expected: { spear: 80, sword: 20, axe: 10 }
    },
    {
      name: 'desconto de linhas seguintes',
      senderUnits: [500, 120, 90],
      values: [[200, 100, 80], [50, 10, 0]],
      commandMode: 'attack',
      expected: { spear: 200, sword: 100, axe: 80 }
    },
    {
      name: 'all em linha seguinte zera primeira',
      senderUnits: [500, 120, 90],
      values: [[200, 100, 80], [-1, 0, 0]],
      commandMode: 'attack',
      expected: { spear: 0, sword: 100, axe: 80 }
    },
    {
      name: 'commandType support (mesmo cálculo desta função)',
      senderUnits: [80, 40, 20],
      values: [[120, 20, 10]],
      commandMode: 'support',
      expected: { spear: 80, sword: 20, axe: 10 }
    }
  ]

  cases.forEach(({ senderUnits, values, commandMode, expected }) => {
    console.log({ senderUnits, values, commandMode, expected })
    const result = buildTemplateFirstRowUnitsForPlaceLink({
      templateState: {
        template: {
          templateType: 'value',
          commandMode,
          units,
          values
        }
      },
      senderUnits,
      unitIndexByName
    })
    console.log(result)
    assert.deepEqual(Object.fromEntries(result), expected)
  })
})
