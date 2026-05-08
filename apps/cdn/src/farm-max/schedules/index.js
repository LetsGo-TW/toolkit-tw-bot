import create from "../../workers/create/index.js";
import Controller from './worker/controller';
import Emitters from "../../emitter";
import Running from "../../running";
import { FarmScheduleCore } from "./core";
import { getGameData } from "@toolkit-tw-bot/document";

const farmSchedules = {
  controller: null,
  farmScheduleCore: null,
  resolve: null,
  worker: null,
}

const running = new Running('farmSchedules')

export const emitter = new Emitters()

const getCurrentGameData = () => {
  if (typeof window !== "undefined" && typeof window.game_data !== "undefined") {
    return window.game_data
  }

  if (typeof document === "undefined") return null

  return getGameData()
}

function resolveCompletion() {
  const resolve = farmSchedules.resolve
  farmSchedules.resolve = null

  if (typeof resolve === 'function') {
    resolve()
  }
}

function cleanupFarmSchedules() {
  try { farmSchedules.worker?.terminate?.() } catch { /* intentionally empty */ }

  Object.keys(emitter.events).forEach((eventName) => emitter.remove(eventName))

  farmSchedules.worker = null
  farmSchedules.controller = null
  farmSchedules.farmScheduleCore = null

  running.remove()
  resolveCompletion()
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

  const completion = new Promise((resolve) => {
    farmSchedules.resolve = resolve
  })

  emitter.on('alive', () => {
    farmSchedules.farmScheduleCore = FarmScheduleCore.create()
  })

  emitter.on('terminate', () => {
    cleanupFarmSchedules()
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

    return await completion
  } catch (error) {
    cleanupFarmSchedules()
    throw error
  }
}
