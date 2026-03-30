import { worldAllPlayersDatalocal } from '..';
import { fetchTwPlayersApi, parsePlayers } from './fetch';

const SCHEMA_VERSION = 3;
const inFlight = new Map();

const isUpdate = (meta) => {
  if (meta.schema !== SCHEMA_VERSION) return true;
  if ((meta.update_date + 3660) * 1000 < Date.now()) return true;
  return false;
};

const getMeta = async (world) =>
  await worldAllPlayersDatalocal.findById(`meta:${world}`);

const request = async (world) => {
  if (inFlight.has(world)) return inFlight.get(world);

  const requestPromise = (async () => {
    const rawId = `raw:players:${world}`;
    const currentMeta = await getMeta(world);
    let rawDoc = await worldAllPlayersDatalocal.findById(rawId);
    let players;
    let lastModified;
    let updateDate = Math.round(Date.now() / 1000);
    let cleanupRawDoc = false;

    try {
      const fetched = await fetchTwPlayersApi(world);
      players = fetched.players;
      lastModified = fetched.lastModified;
      await worldAllPlayersDatalocal.update({
        id: rawId,
        rawText: fetched.rawText,
        rawFetchedAt: updateDate,
        lastModified: Math.round(lastModified / 1000),
      });
      rawDoc = await worldAllPlayersDatalocal.findById(rawId);
      cleanupRawDoc = true;
    } catch (error) {
      if (!rawDoc?.rawText) throw error;
      players = parsePlayers(rawDoc.rawText);
      lastModified =
        Number(rawDoc.lastModified || currentMeta?.last_modified || 0) * 1000;
      updateDate = Number(rawDoc.rawFetchedAt || currentMeta?.update_date || 0);
    }

    const meta = {
      id: `meta:${world}`,
      update_date: updateDate,
      last_modified: Math.round((lastModified || 0) / 1000),
      schema: SCHEMA_VERSION,
    };

    const playerDocs = players.map((player) => ({
      _id: `p:${player.id}`,
      ...player,
    }));

    await worldAllPlayersDatalocal.bulkUpsert(playerDocs);
    await worldAllPlayersDatalocal.update(meta);
    if (cleanupRawDoc && rawDoc && rawDoc._rev) {
      await worldAllPlayersDatalocal.remove(rawDoc);
    }

    return meta;
  })().finally(() => inFlight.delete(world));

  inFlight.set(world, requestPromise);
  return requestPromise;
};

const update = async (world) => {
  const meta = await getMeta(world);
  if (!meta) return;
  if (!isUpdate(meta)) return;
  return await request(world);
};

const coldStart = async (world) => await request(world);

const search = async (world, playerIds, allyIds, payload = []) => {
  if (!await getMeta(world)) throw new Error('Cold start required');
  if (!playerIds || !allyIds) throw new Error('Params is required');

  const players = [];
  for (const id of payload) {
    if (id || id === 0) playerIds.add(Number(id));
  }

  if (playerIds.size) {
    const keys = Array.from(playerIds).map((id) => `p:${id}`);
    const { rows } = await worldAllPlayersDatalocal.allDocs({
      keys,
      include_docs: true,
    });

    for (const row of rows) {
      const player = row?.doc;
      if (player) {
        players.push(player);
        if (player.allyId) allyIds.add(player.allyId);
      }
    }

    return players;
  }

  return null;
};

const worldPlayersApi = {
  isUpdate,
  getMeta,
  update,
  coldStart,
  search,
};

export default worldPlayersApi;
