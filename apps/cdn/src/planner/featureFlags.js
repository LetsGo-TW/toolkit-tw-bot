export const ENABLE_PLANNER_SCHEDULE = false
export const PLANNER_SCHEDULE_DISABLED_MESSAGE = 'Agendar em preparação.'

export function isPlannerScheduleEnabled() {
  return Boolean(ENABLE_PLANNER_SCHEDULE)
}

export function isScheduleModeValue(value) {
  const mode = String(value || '').trim().toLowerCase()
  return mode === 'schedule' || mode === 'schedules' || mode === 'agendar'
}

export function coercePlannerInputScheduleToSend(data = null) {
  if (isPlannerScheduleEnabled()) return { data, changed: false }
  if (!data || typeof data !== 'object') return { data, changed: false }
  const requestedByMode = isScheduleModeValue(data?.mode)
  const requestedByDispatchMode = isScheduleModeValue(data?.dispatchMode)
  if (!requestedByMode && !requestedByDispatchMode) return { data, changed: false }
  return {
    data: {
      ...data,
      mode: 'send',
      dispatchMode: 'send'
    },
    changed: true
  }
}
