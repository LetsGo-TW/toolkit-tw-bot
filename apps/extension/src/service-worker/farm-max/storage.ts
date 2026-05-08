import {
  getScriptStorageDocument,
  putScriptStorageDocument,
  type NormalizedScriptStorageCompose,
} from '../indexdb/script-storage'
import { normalizeNumber } from '../normalize'

export type FarmStorageContext = {
  world: string
  playerId: number
}

export type FarmConfigState = {
  last: number
  active: boolean
  season: number
  maxVillages: number
  data: Record<string, unknown>
}

export type FarmScheduleState = {
  timegenerate: number
  count: number
  total: number
  values: unknown[]
  data: Record<string, unknown>
}

const DEFAULT_FARM_CONFIG = Object.freeze({
  last: 0,
  active: false,
  season: 10,
  maxVillages: 10,
})

const DEFAULT_FARM_SCHEDULE = Object.freeze({
  timegenerate: 0,
  count: 1,
  total: 0,
  values: [] as unknown[],
})

function asRecord(value: unknown) {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
}

function normalizePositiveInteger(value: unknown, fallback: number) {
  const normalized = normalizeNumber(value)

  if (normalized === null || normalized <= 0) {
    return fallback
  }

  return Math.trunc(normalized)
}

function normalizeNonNegativeInteger(value: unknown, fallback = 0) {
  const normalized = normalizeNumber(value)

  if (normalized === null || normalized < 0) {
    return fallback
  }

  return Math.trunc(normalized)
}

export function buildFarmConfigCompose({
  world,
  playerId,
}: FarmStorageContext): NormalizedScriptStorageCompose {
  return {
    world,
    playerId,
    path: ['config-farm'],
  }
}

export function buildFarmScheduleCompose({
  world,
  playerId,
}: FarmStorageContext): NormalizedScriptStorageCompose {
  return {
    world,
    playerId,
    path: ['farm-schedule'],
  }
}

export function normalizeFarmConfig(value: unknown): FarmConfigState {
  const data = asRecord(value)

  return {
    last: normalizeNonNegativeInteger(data.last, DEFAULT_FARM_CONFIG.last),
    active: data.active === true,
    season: normalizePositiveInteger(data.season, DEFAULT_FARM_CONFIG.season),
    maxVillages: normalizePositiveInteger(data.maxVillages, DEFAULT_FARM_CONFIG.maxVillages),
    data,
  }
}

export function normalizeFarmSchedule(value: unknown): FarmScheduleState {
  const data = asRecord(value)
  const values = Array.isArray(data.values) ? data.values : DEFAULT_FARM_SCHEDULE.values

  return {
    timegenerate: normalizeNonNegativeInteger(data.timegenerate, DEFAULT_FARM_SCHEDULE.timegenerate),
    count: normalizePositiveInteger(data.count, DEFAULT_FARM_SCHEDULE.count),
    total: normalizeNonNegativeInteger(data.total, values.length),
    values,
    data,
  }
}

export async function readFarmStorage(context: FarmStorageContext) {
  const configCompose = buildFarmConfigCompose(context)
  const scheduleCompose = buildFarmScheduleCompose(context)
  const [configDocument, scheduleDocument] = await Promise.all([
    getScriptStorageDocument(configCompose),
    getScriptStorageDocument(scheduleCompose),
  ])

  return {
    configCompose,
    scheduleCompose,
    configDocument,
    scheduleDocument,
    config: normalizeFarmConfig(configDocument?.data),
    schedule: normalizeFarmSchedule(scheduleDocument?.data),
  }
}

export async function putFarmConfigData(
  context: FarmStorageContext,
  data: Record<string, unknown>,
) {
  return await putScriptStorageDocument({
    compose: buildFarmConfigCompose(context),
    data,
  })
}

export async function putFarmScheduleData(
  context: FarmStorageContext,
  data: Record<string, unknown>,
) {
  return await putScriptStorageDocument({
    compose: buildFarmScheduleCompose(context),
    data,
  })
}
