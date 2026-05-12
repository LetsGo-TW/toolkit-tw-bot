import create from "../../workers/create/index.js";
import Controller from './worker/controller';
import Emitters from "../../emitter";
import Running from "../../running";
import { FarmScheduleCore } from "./core";
import { getGameData, ProtectingBot } from "@toolkit-tw-bot/document";
import { BotViewStatus } from "../../shared/bot-view-status/index.js";

const farmSchedules = {
  controller: null,
  farmScheduleCore: null,
  reject: null,
  resolve: null,
  worker: null,
}

const running = new Running('farmSchedules')

export const emitter = new Emitters()

function ensureFarmSchedulesCoreStarted() {
  if (farmSchedules.farmScheduleCore) {
    return
  }

  BotViewStatus.setCurrent("Farm Max")
  BotViewStatus.setExecution("Executando agendamento")

  farmSchedules.farmScheduleCore = FarmScheduleCore.create()
}

const getCurrentGameData = () => {
  if (typeof window !== "undefined" && typeof window.game_data !== "undefined") {
    return window.game_data
  }

  if (typeof document === "undefined") return null

  return getGameData()
}

function settleCompletion(error = null) {
  const resolve = farmSchedules.resolve
  const reject = farmSchedules.reject

  farmSchedules.resolve = null
  farmSchedules.reject = null

  if (error && typeof reject === 'function') {
    reject(error)
    return
  }

  if (typeof resolve === 'function') {
    resolve()
  }
}

function cleanupFarmSchedules({ error = null } = {}) {
  try { farmSchedules.worker?.terminate?.() } catch { /* intentionally empty */ }

  Object.keys(emitter.events).forEach((eventName) => emitter.remove(eventName))

  farmSchedules.worker = null
  farmSchedules.controller = null
  farmSchedules.farmScheduleCore = null

  running.remove()
  settleCompletion(error)
}

function requestStopFarmSchedules() {
  emitter.emit('stopProcess', { actionName: 'stop' })
  emitter.emit('terminate')
}

export const pause = async() => {
  // O runtime de schedules nao e resumivel no contrato atual do controller;
  // quando pausado, encerramos a execucao corrente para evitar trabalho em background.
  running.pause()
  requestStopFarmSchedules()
}

export const resume = async() => {}

export const destroy = async() => {
  requestStopFarmSchedules()
}

export default async function start (data, context) {
  // Garante que apenas um processo do bot rode por vez, evitando sobrecarga e comportamento não-humano.
  if (running.is_active()) {
    // A verificação é feita com is_active() sem argumentos para detectar QUALQUER processo ativo.
    console.warn('[farmSchedules] Abortado: já existe outro processo do bot em execução.');
    return;
  }

  let baseUrl = data?.baseUrl || (typeof __webpack_public_path__ !== 'undefined' && __webpack_public_path__ !== 'auto' ? __webpack_public_path__ : null);

  if (!baseUrl) {
    const script = document.querySelector('script[src*="game.staged.js"]') || document.querySelector('script[src*="game.prepared.js"]');
    if (script && script.src) {
      const url = new URL(script.src);
      baseUrl = url.origin + url.pathname.replace(/\/[^/]+$/, '/');
    }
  }

  if (!baseUrl) {
    throw new Error('baseUrl não foi fornecido para o runner farm-schedules')
  }

  const gameData = getCurrentGameData()

  if (!gameData) {
    throw new Error('Object gameData is required!')
  }

  running.activate() /// importate!!!
  
  const completion = new Promise((resolve, reject) => {
    farmSchedules.resolve = resolve
    farmSchedules.reject = reject
  })

  emitter.on('alive', () => {
    ensureFarmSchedulesCoreStarted()
  })

  emitter.on('terminate', (detail = {}) => {
    const reason = typeof detail?.reason === 'string'
      ? detail.reason.trim().toLowerCase()
      : ''
    const isBotProtect = reason === 'bot-protect'
    const isRuntimeError = reason === 'runtime-error'
    const runtimeError = isRuntimeError
      ? Object.assign(
        new Error(detail?.error || 'Farm schedules runtime error'),
        {
          reason,
          source: detail?.source || null,
        },
      )
      : null

    cleanupFarmSchedules({
      error: isBotProtect ? ProtectingBot.error() : runtimeError,
    })

    if (isBotProtect) {
      ProtectingBot.redirect()
    }
  })

  context?.registerHandle?.({
    pause: async() => {
      await pause()
    },
    stop: async() => {
      await destroy()
    },
    destroy: async() => {
      await destroy()
    },
  })

  // const created = await create(root, token, 'farm-schedules', null, window)
  try {
    const created = await create(baseUrl, 'farm-schedules', null, window)
    farmSchedules.worker = created?.worker || null
    farmSchedules.controller = Controller.create(farmSchedules.worker)
    ensureFarmSchedulesCoreStarted()

    return await completion
  } catch (error) {
    cleanupFarmSchedules()
    throw error
  }
}
