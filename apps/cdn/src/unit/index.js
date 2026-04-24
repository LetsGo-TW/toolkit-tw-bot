import unitsSpeed from './speed.json'
import StorageLocalCompat from '../shared/indexdb/storage-local-compat.js'
import { getAjaxUnitInfo } from '../requests/getAjaxUnitInfo';
import { buildUnitIndexByName } from './buildUnitIndexByName';
import { getGameData } from '@toolkit-tw-bot/document';

let cachedUnitData = null;
let cachedUnitDataScopeKey = null;
let storageUnitInfo = null;
let storageUnitInfoScopeKey = null;
let inFlight = null;

function getCurrentGameData() {
  if (typeof window !== 'undefined' && window?.game_data) {
    return window.game_data
  }

  if (typeof document === 'undefined') return null

  try {
    return getGameData()
  } catch (_) {
    return null
  }
}

function getUnitInfoScope() {
  const gameData = getCurrentGameData()
  const world = String(gameData?.world || '').trim()

  if (!world) {
    return null
  }

  return {
    compose: {
      world,
      path: ['unit', 'info'],
    },
    scopeKey: `world:${world}`,
  }
}

function getUnitInfoStorage() {
  const scope = getUnitInfoScope()
  const scopeKey = scope?.scopeKey || null

  if (!scopeKey) {
    return { scopeKey: null, storage: null }
  }

  if (storageUnitInfo && storageUnitInfoScopeKey === scopeKey) {
    return { scopeKey, storage: storageUnitInfo }
  }

  storageUnitInfo = StorageLocalCompat.create(scope.compose)
  storageUnitInfoScopeKey = scopeKey

  return { scopeKey, storage: storageUnitInfo }
}

function syncCachedUnitData(data, scopeKey = null) {
  cachedUnitData = data && typeof data === 'object' ? data : null
  cachedUnitDataScopeKey = cachedUnitData ? (scopeKey || null) : null
  return cachedUnitData
}

async function readStoredUnitData(storage) {
  if (!storage?.get) return null

  try {
    const stored = await storage.get()
    return stored && typeof stored === 'object' ? stored : null
  } catch (error) {
    console.warn('[unit][storage:get]', error)
    return null
  }
}

async function writeStoredUnitData(storage, data) {
  if (!storage?.set || !data || typeof data !== 'object') return

  try {
    await storage.set(data)
  } catch (error) {
    console.warn('[unit][storage:set]', error)
  }
}

function getUnitData() {
  const { scopeKey } = getUnitInfoStorage()
  if (scopeKey && cachedUnitDataScopeKey && cachedUnitDataScopeKey !== scopeKey) {
    return null
  }
  return cachedUnitData;
}

async function preloadUnitData() {
  const { scopeKey, storage } = getUnitInfoStorage()

  if (cachedUnitData && cachedUnitDataScopeKey === scopeKey) return cachedUnitData;
  if (inFlight?.scopeKey === scopeKey) return inFlight.promise;

  const promise = (async () => {
    try {
      const stored = await readStoredUnitData(storage)
      if (stored) {
        return syncCachedUnitData(stored, scopeKey)
      }

      const { unit_data: data } = await getAjaxUnitInfo();
      if (!data) throw new Error('Data units not found!');
      await writeStoredUnitData(storage, data)
      return syncCachedUnitData(data, scopeKey)
    } catch (error) {
      console.error(error);
      return null;
    } finally {
      if (inFlight?.promise === promise) {
        inFlight = null;
      }
    }
  })();

  inFlight = {
    scopeKey,
    promise,
  }

  return promise;
}

async function initUnitdata() {
  return preloadUnitData();
}

const travelSecond = (distance, unit) => {
  if (!cachedUnitData) throw new Error('Data units require init!');
  return (distance / cachedUnitData[unit].speed);
};

const incomingUnitSlow = (arrivalSecond, distance) => {
  if (!cachedUnitData) throw new Error('Data units require init!');
  const unitsIncomming = Object.entries(unitsSpeed.incoming)
    .sort((a, b) => {
      if (a[1] > b[1]) return -1;
      if (a[1] < b[1]) return 1;
      return 0;
    })
    .map(([unit]) => unit);
  let slow = 'snob';
  for (const unit of unitsIncomming) {
    if (arrivalSecond > distance / cachedUnitData[unit].speed) return slow;
    slow = unit;
  }
  return slow;
};

const getWorldUnitsOrder = () => {
  const currentGameData = getCurrentGameData()
  const units = Array.isArray(currentGameData?.units) ? currentGameData.units : [];
  return units.filter((unit) => unit && unit !== 'militia');
}

const getWorldUnitIndexByName = () => buildUnitIndexByName(getWorldUnitsOrder());

export {
  initUnitdata,
  getUnitData,
  travelSecond,
  incomingUnitSlow,
  buildUnitIndexByName,
  getWorldUnitsOrder,
  getWorldUnitIndexByName
}
