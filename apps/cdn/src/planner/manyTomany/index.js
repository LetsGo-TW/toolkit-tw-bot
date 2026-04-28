import fs from 'node:fs'
import getManyToManyTotals from './getManyToManyTotals.js'
import orderCoordsFromCoords from './orderCoordsFromCoords.js'
import distributeSendersByTargets from './distributeSendersByTargets.js'

const senders = JSON.parse(fs.readFileSync(new URL('./senders.json', import.meta.url), 'utf8'))
const targets = JSON.parse(fs.readFileSync(new URL('./targets.json', import.meta.url), 'utf8'))
const config = JSON.parse(fs.readFileSync(new URL('./config.json', import.meta.url), 'utf8'))

const dateTimeArrival = '2026-03-04T15:00:00'
const ms = '100'
const dateTimeSender = Date.now();
const scapeTheNight = true;
const commandsByTargetDefinedByThePlayer = 4
const typeGenerate = 'closest' // furthest

const {
  totalTargets,
  totalSenders,
  sendersPerTarget,
  remainingSenders
} = getManyToManyTotals({ senders, targets })

const orderedTargets = orderCoordsFromCoords(targets, senders)
const distribution = distributeSendersByTargets({ senders, targets })

console.log({
  totalTargets,
  totalSenders,
  sendersPerTarget,
  remainingSenders,
  dateTimeArrival,
  ms,
  commandGapMs: config?.commands?.attack_gap ?? null
})

console.log({
  farthestTarget: orderedTargets[0] ?? null,
  nearestTarget: orderedTargets.at(-1) ?? null,
  firstTargetGroup: distribution.targetGroups[0]
    ? {
        target: distribution.targetGroups[0].target,
        totalSenders: distribution.targetGroups[0].senders.length
      }
    : null
})

console.log(distribution.orderedSenders, distribution.targetGroups[0].senders)
