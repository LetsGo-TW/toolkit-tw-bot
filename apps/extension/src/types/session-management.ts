export type SmartSessionShortBreakConfig = {
  enabled: boolean
  everyMinutes: number
  durationMinutes: number
  delayMinutes: number
}

export type SmartSessionLongRestMode = 'interval' | 'schedule'

export type SmartSessionLongRestConfig = {
  enabled: boolean
  mode: SmartSessionLongRestMode
  durationMinutes: number
  durationDelayMinutes: number
  intervalHours: number
  startDelayMinutes: number
  scheduledTimes: string[]
}

export type SmartSessionConfig = {
  shortBreak: SmartSessionShortBreakConfig
  longRest: SmartSessionLongRestConfig
}

export type SessionManagementConfig = {
  reconnectOnSessionExpired: boolean
  smartSession: SmartSessionConfig
}

export const DEFAULT_SMART_SHORT_BREAK_EVERY_MINUTES = 3
export const MIN_SMART_SHORT_BREAK_EVERY_MINUTES = 3
export const MAX_SMART_SHORT_BREAK_EVERY_MINUTES = 60
export const DEFAULT_SMART_SHORT_BREAK_DURATION_MINUTES = 3
export const MIN_SMART_SHORT_BREAK_DURATION_MINUTES = 3
export const MAX_SMART_SHORT_BREAK_DURATION_MINUTES = 30
export const DEFAULT_SMART_SHORT_BREAK_DELAY_MINUTES = 1
export const MIN_SMART_SHORT_BREAK_DELAY_MINUTES = 1
export const MAX_SMART_SHORT_BREAK_DELAY_MINUTES = 5

export const DEFAULT_SMART_LONG_REST_MODE: SmartSessionLongRestMode = 'interval'
export const DEFAULT_SMART_LONG_REST_INTERVAL_HOURS = 2
export const MAX_SMART_LONG_REST_INTERVAL_HOURS = 12
export const DEFAULT_SMART_LONG_REST_DURATION_MINUTES = 15
export const MIN_SMART_LONG_REST_DURATION_MINUTES = 10
export const DEFAULT_SMART_LONG_REST_DURATION_DELAY_MINUTES = 1
export const MIN_SMART_LONG_REST_DURATION_DELAY_MINUTES = 1
export const MAX_SMART_LONG_REST_DURATION_DELAY_MINUTES = 5
export const DEFAULT_SMART_LONG_REST_START_DELAY_MINUTES = 5
export const MIN_SMART_LONG_REST_START_DELAY_MINUTES = 5
export const MAX_SMART_LONG_REST_START_DELAY_MINUTES = 10
export const DEFAULT_SMART_LONG_REST_SCHEDULED_TIMES = [
  '08:00',
  '12:00',
  '18:00',
] as const

export function createDefaultSmartSessionConfig(): SmartSessionConfig {
  return {
    shortBreak: {
      enabled: false,
      everyMinutes: DEFAULT_SMART_SHORT_BREAK_EVERY_MINUTES,
      durationMinutes: DEFAULT_SMART_SHORT_BREAK_DURATION_MINUTES,
      delayMinutes: DEFAULT_SMART_SHORT_BREAK_DELAY_MINUTES,
    },
    longRest: {
      enabled: false,
      mode: DEFAULT_SMART_LONG_REST_MODE,
      intervalHours: DEFAULT_SMART_LONG_REST_INTERVAL_HOURS,
      durationMinutes: DEFAULT_SMART_LONG_REST_DURATION_MINUTES,
      durationDelayMinutes: DEFAULT_SMART_LONG_REST_DURATION_DELAY_MINUTES,
      startDelayMinutes: DEFAULT_SMART_LONG_REST_START_DELAY_MINUTES,
      scheduledTimes: [...DEFAULT_SMART_LONG_REST_SCHEDULED_TIMES],
    },
  }
}

export function createDefaultSessionManagementConfig(): SessionManagementConfig {
  return {
    reconnectOnSessionExpired: false,
    smartSession: createDefaultSmartSessionConfig(),
  }
}
