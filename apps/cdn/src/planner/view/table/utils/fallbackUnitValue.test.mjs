import test from 'node:test'
import assert from 'node:assert/strict'
import { fallbackUnitValue } from './fallbackUnitValue.js'

test('fallbackUnitValue: casos principais', () => {
  const unitIndexByName = new Map([
    ['spear', 0],
    ['sword', 1],
    ['axe', 2]
  ])

  const cases = [
    {
      name: 'usa índice mapeado da unidade',
      input: { unitName: 'sword', units: [10, 25, 30], unitIndexByName, fallbackIndex: -1 },
      expected: 25
    },
    {
      name: 'usa fallback quando unidade não existe no mapa',
      input: { unitName: 'light', units: [10, 25, 30], unitIndexByName, fallbackIndex: 2 },
      expected: 30
    },
    {
      name: 'retorna 0 quando índice final é inválido',
      input: { unitName: 'light', units: [10, 25, 30], unitIndexByName, fallbackIndex: -1 },
      expected: 0
    },
    {
      name: 'retorna 0 quando valor do units é inválido',
      input: { unitName: 'axe', units: [10, 25, 'banana'], unitIndexByName, fallbackIndex: -1 },
      expected: 0
    },
    {
      name: 'converte string numérica para número',
      input: { unitName: 'spear', units: ['17', 25, 30], unitIndexByName, fallbackIndex: -1 },
      expected: 17
    },
    {
      name: 'retorna 0 quando units não existe',
      input: { unitName: 'spear', units: null, unitIndexByName, fallbackIndex: -1 },
      expected: 0
    }
  ]

  cases.forEach(({ name, input, expected }) => {
    const actual = fallbackUnitValue(input)
    console.log(input, actual)
    assert.equal(actual, expected, name)
  })
})
