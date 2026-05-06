import create from "../../workers/create/index.js";
import Controller from './worker/controller';
import Emitters from "../../emitter";
import Running from "../../running";
import { FarmScheduleCore } from "./core";
import { getGameData } from "@toolkit-tw-bot/document";

const farmSchedules = {}

const running = new Running('farmSchedules')

export const emitter = new Emitters()

const getCurrentGameData = () => {
  if (typeof window !== "undefined" && typeof window.game_data !== "undefined") {
    return window.game_data
  }

  if (typeof document === "undefined") return null

  return getGameData()
}

export const pause = () => {}; // O processo é muito rápido para justificar pausa

export const resume = () => {}; 

export const destroy = () => {
  emitter.emit('stopProcess', { actionName: 'stop' }); // Aciona o controller.abort() no worker
  emitter.emit('terminate'); // Encerra o worker e limpa o running
};

export const start = async (baseUrl) => {
  if (running.is_active()) {
    console.debug('Is already executing!');
    return;
  }

  const gameData = getCurrentGameData()

  if (!gameData) {
    console.info('Object gameData is require!')
    return
  }

  running.activate() /// importate!!!

  // const created = await create(root, token, 'farm-schedules', null, window)
  const created = await create(baseUrl, 'farm-schedules', null, window)
  const worker = created?.worker || null

  emitter.on('alive', () => {
    farmSchedules.farmScheduleCore = FarmScheduleCore.create()
  })

  farmSchedules.controller = Controller.create(worker)

  return new Promise((resolve) => {
    emitter.on('terminate', () => {
      if (farmSchedules.worker) {
        farmSchedules.worker.terminate()
      }
      Object.keys(emitter.events).map(e => emitter.remove(e))
      farmSchedules.controller = null
      farmSchedules.farmScheduleCore = null
      running.remove()
      resolve()
    })
  })
}

export default start;
