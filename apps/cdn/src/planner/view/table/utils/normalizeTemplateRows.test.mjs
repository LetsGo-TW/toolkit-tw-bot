import test from 'node:test'
import assert from 'node:assert/strict'
import { normalizeTemplateRows } from './normalizeTemplateRows.js'

test('normalizeTemplateRows: diferentes templates', () => {
  const cases = [
    {
      name: 'mantém linha com valores positivos',
      values: [[0, 100, 0]],
      expected: [{ row: [0, 100, 0], rowIndex: 0 }]
    },
    {
      name: 'mantém linha com all (-1) e remove linha zero',
      values: [[0, -1, 0], [0, 0, 0]],
      expected: [{ row: [0, -1, 0], rowIndex: 0 }]
    },
    {
      name: 'remove linhas tudo zero',
      values: [[0, 0, 0], [0, 0, 0]],
      expected: []
    },
    {
      name: 'ignora inválidas e reindexa válidas em sequência',
      values: [null, 'x', [0, 0, 5], { a: 1 }, [1, 0, 0]],
      expected: [
        { row: [0, 0, 5], rowIndex: 0 },
        { row: [1, 0, 0], rowIndex: 1 }
      ]
    },
    {
      name: 'converte string numérica para número e remove linha zero',
      values: [['0', '7', '0'], ['0', '0', '0']],
      expected: [{ row: [0, 7, 0], rowIndex: 0 }]
    },
    {
      name: 'template sem values retorna vazio',
      values: undefined,
      expected: []
    }
  ]

  cases.forEach(({ name, values, expected }) => {
    const actual = normalizeTemplateRows({ values })
    console.log(values, actual)
    assert.deepEqual(actual, expected, name)
  })
})
