import { initUnitdata } from "../unit";
import { plannerView, warmupPlannerView } from "./view";
import { refreshPlannerProductionSnapshot } from "./production-snapshot";
import {
  coercePlannerInputScheduleToSend,
  isPlannerScheduleEnabled,
  PLANNER_SCHEDULE_DISABLED_MESSAGE
} from "./featureFlags";
import { getGameData } from "@toolkit-tw-bot/document";
import { consoleDev } from "@toolkit-tw-bot/utils";
import { printMessage } from "../components/printMessage";

/**
* PENDÊNCIA
* fazer request no mapa enviando comando com 1 spy para descobrir a config do mundo.
*/
export const minSpyCommand = { players: 5, barbarians: 1 }
export const dataUnits = new Map()
let plannerWarmupPromise = null

function syncDataUnitsMap(dataUnitsJson) {
  if (!dataUnitsJson || typeof dataUnitsJson !== 'object') return
  dataUnits.clear()
  Object.entries(dataUnitsJson).forEach(([key, value]) => dataUnits.set(key, value))
}

async function ensurePlannerUnitsLoaded() {
  const dataUnitsJson = await initUnitdata()
  if (!dataUnitsJson) throw new Error('Data units not found!')
  syncDataUnitsMap(dataUnitsJson)
  return dataUnitsJson
}

export function warmupPlanner({ level = 'idle' } = {}) {
  if (!plannerWarmupPromise) {
    plannerWarmupPromise = (async () => {
      try {
        await ensurePlannerUnitsLoaded()
      } catch (error) {
        console.debug('[GO][planner][warmup:units]', error)
      }
      await warmupPlannerView({ level })
    })()
      .catch((error) => {
        plannerWarmupPromise = null
        console.debug('[GO][planner][warmup:view]', error)
      })
  }
  return plannerWarmupPromise
}

export async function plannerOneToMany(data) {
  const normalizedInput = coercePlannerInputScheduleToSend(data)
  if (normalizedInput.changed && !isPlannerScheduleEnabled()) {
    printMessage.warn(PLANNER_SCHEDULE_DISABLED_MESSAGE, 2200)
  }
  data = normalizedInput.data

  consoleDev({
    event: 'plannerOneToMany:input',
    data
  }, { label: '[GO][planner]' })

  /** REQUER CONTA PREMIUM */
  const gameData = getGameData();
  if (!gameData.features.Premium.active) {
    printMessage.error('É nescessário conta premium do TW ativa!', 3000);
    return;
  }

  /** REQUER PLACE */
  if (gameData.village.buildings.place == 0) {
    printMessage.error('É preciso ter praça de reunião na vila!', 3000);
    return;
  }

  await ensurePlannerUnitsLoaded()

  try {
    await refreshPlannerProductionSnapshot({
      forceRefresh: true
    })
  } catch (error) {
    console.warn('[GO][planner][tp-refresh]', error?.message || error)
  }

  await plannerView(data)
}
