import {
  worldAllysApi,
  worldPlayersApi,
  worldVillagesApi,
  worldConfigApi,
} from './database';

const MAX_DEFERRED_REFRESH_ROUNDS = 4;

export async function handlerTwApis({ world, payload, _attempt = 0 }) {

  if (!world) throw new Error('world is required');
  const response = {};
  const pending = {};
  const pendingPromises = [];
  const wantVillages = Array.isArray(payload?.villages) && payload.villages.length;
  const wantPlayers = Array.isArray(payload?.players) && payload.players.length;
  const wantAllys = Array.isArray(payload?.allys) && payload.allys.length;
  const wantConfig = Array.isArray(payload?.config) && payload.config.length;
  const expandOwners = payload?.expandOwners === true;
  if (!wantVillages && !wantPlayers && !wantAllys && !wantConfig) {
    return {};
  }
  if (wantConfig) {
    response.config  = await worldConfigApi.search(world, payload.config);
  }

  const playerIds = new Set();
  const allyIds = new Set();

  if (wantVillages) {
    const meta = await worldVillagesApi.getMeta(world);
    if (!meta) {
      pending.villages = true;
      response.villages = [];
      pendingPromises.push(worldVillagesApi.coldStart(world));
    } else {
      response.villages = await worldVillagesApi.search(world, playerIds, payload.villages);
      if (worldVillagesApi.isUpdate(meta)) {
        pending.villages = true;
        pendingPromises.push(worldVillagesApi.update(world));
      }
    }
  }

  if (wantPlayers || (expandOwners && playerIds.size)) {
    const meta = await worldPlayersApi.getMeta(world);
    if (!meta) {
      pending.players = true;
      response.players = [];
      pendingPromises.push(worldPlayersApi.coldStart(world));
    } else {
      response.players = await worldPlayersApi.search(world, playerIds, allyIds, payload.players);
      if (worldPlayersApi.isUpdate(meta)) {
        pending.players = true;
        pendingPromises.push(worldPlayersApi.update(world));
      }
    }
  }

  if (wantAllys || (expandOwners && allyIds.size)) {
    const meta = await worldAllysApi.getMeta(world);
    if (!meta) {
      pending.allys = true;
      response.allys = [];
      pendingPromises.push(worldAllysApi.coldStart(world));
    } else {
      response.allys = await worldAllysApi.search(world, allyIds, payload.allys);
      if (worldAllysApi.isUpdate(meta)) {
        pending.allys = true;
        pendingPromises.push(worldAllysApi.update(world));
      }
    }
  }

  if (Object.keys(pending).length) {
    response.partial = true;
    response.pending = pending;
    if (pendingPromises.length && _attempt < MAX_DEFERRED_REFRESH_ROUNDS) {
      response._finalPromise = Promise.allSettled(pendingPromises).then(async () => {
        const nextResponse = await handlerTwApis({ world, payload, _attempt: _attempt + 1 });
        if (nextResponse?._finalPromise) {
          const chainedFinalPromise = nextResponse._finalPromise;
          delete nextResponse._finalPromise;
          return await chainedFinalPromise;
        }
        return nextResponse;
      });
    }
  }

  return response;
}
