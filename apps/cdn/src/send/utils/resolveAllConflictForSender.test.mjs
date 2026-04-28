import test from 'node:test'
import assert from 'node:assert/strict'
import {
  normalizeAllConflictStrategy,
  resolveAllConflictForSender,
  buildAllConflictResolutionLog
} from './resolveAllConflictForSender.js'

test('normalizeAllConflictStrategy usa split como fallback', () => {
  assert.equal(normalizeAllConflictStrategy('split'), 'split')
  assert.equal(normalizeAllConflictStrategy('first'), 'first')
  assert.equal(normalizeAllConflictStrategy('invalid'), 'split')
})

test('resolveAllConflictForSender split divide restante entre ALL', () => {
  const result = resolveAllConflictForSender({
    availableUnits: 100,
    strategy: 'split',
    commands: [
      { commandId: 'a', fixed: 20, hasAll: true },
      { commandId: 'b', fixed: 10, hasAll: true }
    ]
  })

  const byId = Object.fromEntries(result.commands.map((c) => [c.commandId, c]))
  assert.equal(result.remainingAfterFixed, 70)
  assert.equal(result.minimumGuaranteed, true)
  assert.equal(byId.a.totalAssigned + byId.b.totalAssigned, 100)
  assert.equal(byId.a.allAssigned, 35)
  assert.equal(byId.b.allAssigned, 35)
  assert.equal(
    buildAllConflictResolutionLog({ resolution: result }),
    'Conflito ALL resolvido com split: as tropas foram divididas entre os comandos.'
  )
})

test('resolveAllConflictForSender first mantém restante no primeiro comando', () => {
  const result = resolveAllConflictForSender({
    availableUnits: 100,
    strategy: 'first',
    firstCommandId: 'b',
    commands: [
      { commandId: 'a', fixed: 20, hasAll: true },
      { commandId: 'b', fixed: 10, hasAll: true }
    ]
  })

  const byId = Object.fromEntries(result.commands.map((c) => [c.commandId, c]))
  assert.equal(byId.a.allAssigned, 0)
  assert.equal(byId.b.allAssigned, 70)
  assert.equal(result.winnerCommandId, 'b')
  assert.equal(result.minimumGuaranteed, true)
  assert.equal(
    buildAllConflictResolutionLog({ resolution: result, currentCommandId: 'a' }),
    'Conflito ALL resolvido com first: outro comando ficou como primeiro.'
  )
  assert.equal(
    buildAllConflictResolutionLog({ resolution: result, currentCommandId: 'b' }),
    'Conflito ALL resolvido com first: este comando foi o primeiro.'
  )
})

test('resolveAllConflictForSender garante mínimo antes do split', () => {
  const result = resolveAllConflictForSender({
    availableUnits: 120,
    strategy: 'split',
    commands: [
      { commandId: 'a', fixed: 20, minRequired: 50, hasAll: true },
      { commandId: 'b', fixed: 10, minRequired: 40, hasAll: true }
    ]
  })

  const byId = Object.fromEntries(result.commands.map((c) => [c.commandId, c]))
  assert.equal(result.remainingAfterFixed, 90)
  assert.equal(result.minimumGuaranteed, true)
  assert.equal(byId.a.minExtraAssigned >= 30, true)
  assert.equal(byId.b.minExtraAssigned >= 30, true)
  assert.equal(byId.a.totalAssigned + byId.b.totalAssigned, 120)
})

test('resolveAllConflictForSender reporta déficit quando mínimo não pode ser garantido', () => {
  const result = resolveAllConflictForSender({
    availableUnits: 60,
    strategy: 'first',
    firstCommandId: 'a',
    commands: [
      { commandId: 'a', fixed: 20, minRequired: 40, hasAll: true },
      { commandId: 'b', fixed: 20, minRequired: 40, hasAll: true }
    ]
  })

  assert.equal(result.minimumGuaranteed, false)
  assert.equal(result.deficits.length > 0, true)
})
