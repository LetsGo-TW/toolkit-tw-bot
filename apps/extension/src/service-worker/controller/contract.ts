import type { EventBusEventDetail, EventBusHandler } from './event-bus'

export type ChromeEventHandler = (...args: any[]) => unknown

export type ChromeEventLike = {
  addListener: (handler: ChromeEventHandler) => void
  hasListener?: (handler: ChromeEventHandler) => boolean
}

export type ServiceWorkerControllerListener = {
  label: string
  event: ChromeEventLike
  handler: ChromeEventHandler
}

export type ServiceWorkerControllerTask = {
  label: string
  run: () => unknown | Promise<unknown>
}

export type ServiceWorkerControllerConfig = {
  listeners?: ServiceWorkerControllerListener[]
  startupTasks?: ServiceWorkerControllerTask[]
}

export const SERVICE_WORKER_CONTROLLER_EVENTS = Object.freeze({
  BOOT_START: 'controller:boot:start',
  BOOT_READY: 'controller:boot:ready',
  LISTENER_REGISTERED: 'controller:listener:registered',
  LISTENER_SKIPPED: 'controller:listener:skipped',
  TASK_STARTED: 'controller:task:started',
  TASK_COMPLETED: 'controller:task:completed',
  TASK_ERROR: 'controller:task:error',
})

export const EXECUTION_CONTROLLER_EVENTS = Object.freeze({
  DISPATCH_REQUESTED: 'execution:dispatch-requested',
  EXECUTION_IDLE: 'execution:idle',
  EXECUTION_STARTED: 'execution:started',
  EXECUTION_PAUSED: 'execution:paused',
  EXECUTION_STOPPED: 'execution:stopped',
  EXECUTION_COMPLETED: 'execution:completed',
  EXECUTION_FAILED: 'execution:failed',
  EXECUTION_RESCHEDULED: 'execution:rescheduled',
  BOT_PROTECT_DETECTED: 'bot-protect:detected',
  BOT_PROTECT_CLEARED: 'bot-protect:cleared',
  INCOMING_OBSERVED: 'incoming:observed',
  INCOMING_APPLY_PENDING: 'incoming:apply-pending',
  COMMAND_DUE: 'command:due',
  COMMAND_BATCH_READY: 'command:batch-ready',
  COMMAND_RECOVERY_REQUIRED: 'command:recovery-required',
  MINT_DUE: 'mint:due',
})

export const EXECUTION_TIMING = Object.freeze({
  COMMAND_PREWAKE_MS: 30_000,
  COMMAND_BATCH_WINDOW_MS: 30_000,
  RELIABLE_ALARM_MIN_MS: 30_000,
  MINT_SHORT_LOOP_MAX_MS: 5_000,
})

export const EXECUTION_KINDS = Object.freeze({
  BOT_PROTECT: 'botProtect',
  COMMAND: 'command',
  MINT: 'mint',
  INCOMING_APPLY: 'incomingApply',
  SCHEDULED: 'scheduled',
  MAIN: 'main',
  TRAIN: 'train',
})

export type ExecutionKind =
  typeof EXECUTION_KINDS[keyof typeof EXECUTION_KINDS]

export const EXECUTION_LANES = Object.freeze({
  PAGE: 'page',
  PARALLEL: 'parallel',
})

export type ExecutionLane =
  typeof EXECUTION_LANES[keyof typeof EXECUTION_LANES]

export const EXECUTION_WAKEUP_POLICIES = Object.freeze({
  NONE: 'none',
  IMMEDIATE: 'immediate',
  PAGE_TIMER: 'page-timer',
  ALARM: 'alarm',
})

export type ExecutionWakeupPolicy =
  typeof EXECUTION_WAKEUP_POLICIES[keyof typeof EXECUTION_WAKEUP_POLICIES]

export const EXECUTION_GUARD_STRATEGIES = Object.freeze({
  NONE: 'none',
  RUNNER_LEASE: 'runner-lease',
})

export type ExecutionGuardStrategy =
  typeof EXECUTION_GUARD_STRATEGIES[keyof typeof EXECUTION_GUARD_STRATEGIES]

export const EXECUTION_GUARD_STATUSES = Object.freeze({
  IDLE: 'idle',
  ARMED: 'armed',
  ACTIVE: 'active',
  RECOVERING: 'recovering',
})

export type ExecutionGuardStatus =
  typeof EXECUTION_GUARD_STATUSES[keyof typeof EXECUTION_GUARD_STATUSES]

export const EXECUTION_STATUSES = Object.freeze({
  IDLE: 'idle',
  QUEUED: 'queued',
  RUNNING: 'running',
  PAUSED: 'paused',
  COMPLETED: 'completed',
  FAILED: 'failed',
  CANCELED: 'canceled',
})

export type ExecutionStatus =
  typeof EXECUTION_STATUSES[keyof typeof EXECUTION_STATUSES]

export type ExecutionRule = {
  kind: ExecutionKind
  lane: ExecutionLane
  priority: number
  usesPage: boolean
  allowsShortWakeup: boolean
  shortWakeupMaxMs: number | null
  minimumAlarmDelayMs: number | null
}

export const EXECUTION_RULES: Record<ExecutionKind, ExecutionRule> = {
  [EXECUTION_KINDS.BOT_PROTECT]: {
    kind: EXECUTION_KINDS.BOT_PROTECT,
    lane: EXECUTION_LANES.PAGE,
    priority: 1000,
    usesPage: true,
    allowsShortWakeup: true,
    shortWakeupMaxMs: 0,
    minimumAlarmDelayMs: null,
  },
  [EXECUTION_KINDS.COMMAND]: {
    kind: EXECUTION_KINDS.COMMAND,
    lane: EXECUTION_LANES.PAGE,
    priority: 900,
    usesPage: true,
    allowsShortWakeup: false,
    shortWakeupMaxMs: null,
    minimumAlarmDelayMs: null,
  },
  [EXECUTION_KINDS.MINT]: {
    kind: EXECUTION_KINDS.MINT,
    lane: EXECUTION_LANES.PAGE,
    priority: 800,
    usesPage: true,
    allowsShortWakeup: true,
    shortWakeupMaxMs: EXECUTION_TIMING.MINT_SHORT_LOOP_MAX_MS,
    minimumAlarmDelayMs: null,
  },
  [EXECUTION_KINDS.INCOMING_APPLY]: {
    kind: EXECUTION_KINDS.INCOMING_APPLY,
    lane: EXECUTION_LANES.PAGE,
    priority: 700,
    usesPage: true,
    allowsShortWakeup: false,
    shortWakeupMaxMs: null,
    minimumAlarmDelayMs: EXECUTION_TIMING.RELIABLE_ALARM_MIN_MS,
  },
  [EXECUTION_KINDS.SCHEDULED]: {
    kind: EXECUTION_KINDS.SCHEDULED,
    lane: EXECUTION_LANES.PAGE,
    priority: 300,
    usesPage: true,
    allowsShortWakeup: false,
    shortWakeupMaxMs: null,
    minimumAlarmDelayMs: EXECUTION_TIMING.RELIABLE_ALARM_MIN_MS,
  },
  [EXECUTION_KINDS.MAIN]: {
    kind: EXECUTION_KINDS.MAIN,
    lane: EXECUTION_LANES.PAGE,
    priority: 400,
    usesPage: true,
    allowsShortWakeup: false,
    shortWakeupMaxMs: null,
    minimumAlarmDelayMs: EXECUTION_TIMING.RELIABLE_ALARM_MIN_MS,
  },
  [EXECUTION_KINDS.TRAIN]: {
    kind: EXECUTION_KINDS.TRAIN,
    lane: EXECUTION_LANES.PAGE,
    priority: 400,
    usesPage: true,
    allowsShortWakeup: false,
    shortWakeupMaxMs: null,
    minimumAlarmDelayMs: EXECUTION_TIMING.RELIABLE_ALARM_MIN_MS,
  },
}

export type ControllerScopeRef = {
  scopeKey: string | null
  world: string | null
  t: number | null
  playerId: number | null
  playerName?: string | null
}

export type ControllerExecutionGuard = {
  strategy: ExecutionGuardStrategy
  status: ExecutionGuardStatus
  leaseId: string | null
  runnerTabId: number | null
  runnerWindowId: number | null
  acquiredAt: number | null
  protectedUntilAt: number | null
  lastHeartbeatAt: number | null
}

export type ControllerCommandExecutionMeta = {
  plannerId: string | null
  commandId: string | null
  twCommandId: string | null
  sourceVillageId: number | null
  targetVillageId: number | null
  sendAt: number
  alarmAt: number
  prewakeLeadMs: number
  batchWindowMs: number
  batchStartAt: number
  batchEndAt: number
}

export type ControllerExecutionRef = {
  executionId: string
  kind: ExecutionKind
  lane: ExecutionLane
  status: ExecutionStatus
  scope: ControllerScopeRef
  nextAt: number | null
  tabId: number | null
  windowId: number | null
  startedAt: number | null
  updatedAt: number
  wakeupPolicy?: ExecutionWakeupPolicy | null
  payload?: Record<string, unknown> | null
  resumeToken?: Record<string, unknown> | null
  command?: ControllerCommandExecutionMeta | null
  guard?: ControllerExecutionGuard | null
  reason?: string | null
}

export type ControllerBotProtectState = {
  active: boolean
  detectedAt: string | null
  detectedInTabId: number | null
  detectedInWindowId: number | null
  requiresReload: boolean
}

export type ControllerIncomingObserved = {
  observedAt: number
  previousCount: number | null
  currentCount: number
  diffCount: number
  source: string | null
  tabId: number | null
  windowId: number | null
}

export type ControllerIncomingState = {
  lastObservedAt: number | null
  lastObservedCount: number | null
  lastObservedPreviousCount: number | null
  lastObservedDiffCount: number
  diffPending: boolean
  diffCount: number
  applyQueuedAt: number | null
  observedInTabId: number | null
  observedInWindowId: number | null
}

export type ControllerCommandState = {
  queue: {
    activeBatch: ControllerCommandWindow | null
    queuedBatches: ControllerCommandWindow[]
    nextAlarmAt: number | null
    nextSendAt: number | null
    activeLeaseId: string | null
    protectedUntilAt: number | null
    busyUntilAt: number | null
    runnerTabId: number | null
    runnerWindowId: number | null
    recoveryRequired: boolean
  }
}

export type ControllerState = {
  booted: boolean
  current: ControllerExecutionRef | null
  botProtect: ControllerBotProtectState
  command: ControllerCommandState
  incoming: ControllerIncomingState
  lastDispatchAt: number | null
}

export type ControllerCommandWindow = {
  batchId: string
  scope: ControllerScopeRef
  alarmAt: number
  windowStartAt: number
  windowEndAt: number
  firstSendAt: number
  lastSendAt: number
  pendingCount: number
  executions: ControllerExecutionRef[]
  queuedAt: number
  protectedUntilAt: number | null
}

export type ControllerDispatchSnapshot = {
  now: number
  state: ControllerState
  commandWindow: ControllerCommandWindow | null
  dueMint: ControllerExecutionRef | null
  incomingApply: ControllerExecutionRef | null
  nextScheduled: ControllerExecutionRef | null
}

export type ControllerDispatchAction =
  | {
    type: 'noop'
    reason: string
  }
  | {
    type: 'run-bot-protect'
    reason: string
  }
  | {
    type: 'run-command-batch'
    window: ControllerCommandWindow
    reason: string
  }
  | {
    type: 'append-command-batch'
    window: ControllerCommandWindow
    current: ControllerCommandWindow
    reason: string
  }
  | {
    type: 'pause-and-run-mint'
    current: ControllerExecutionRef | null
    execution: ControllerExecutionRef
    reason: string
  }
  | {
    type: 'continue-mint-short-delay'
    execution: ControllerExecutionRef
    delayMs: number
    reason: string
  }
  | {
    type: 'run-incoming-apply'
    execution: ControllerExecutionRef
    reason: string
  }
  | {
    type: 'run-scheduled'
    execution: ControllerExecutionRef
    reason: string
  }

export type ControllerRescheduleSnapshot = {
  now: number
  execution: ControllerExecutionRef
}

export type ControllerRescheduleDecision =
  | {
    type: 'clear-wakeup'
    reason: string
  }
  | {
    type: 'dispatch-now'
    reason: string
  }
  | {
    type: 'continue-mint-short-delay'
    delayMs: number
    reason: string
  }
  | {
    type: 'schedule-command-alarm'
    scheduledAt: number
    delayMs: number
    sendAt: number
    windowStartAt: number
    windowEndAt: number
    reason: string
  }
  | {
    type: 'page-short-wakeup'
    delayMs: number
    reason: string
  }
  | {
    type: 'schedule-alarm'
    scheduledAt: number
    delayMs: number
    reason: string
  }
  | {
    type: 'clamp-and-schedule-alarm'
    scheduledAt: number
    delayMs: number
    reason: string
  }

export type ExecutionControllerContract = {
  getState: () => ControllerState
  dispatch: (
    snapshot: ControllerDispatchSnapshot,
  ) => ControllerDispatchAction | Promise<ControllerDispatchAction>
  resolveReschedule: (
    snapshot: ControllerRescheduleSnapshot,
  ) => ControllerRescheduleDecision | Promise<ControllerRescheduleDecision>
  emit: (type: string, detail?: EventBusEventDetail) => void
  on: (type: string, handler: EventBusHandler) => () => void
}
