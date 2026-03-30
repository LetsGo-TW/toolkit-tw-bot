import { worldVillagesDatalocal } from '..';
import { fetchTwVillagesApi, parseVillages } from './fetch';
import { bulkUpsertInBatches } from './batch';

const SCHEMA_VERSION = 3;
const inFlight = new Map();

const isUpdate = (meta) => {
  if (meta.schema !== SCHEMA_VERSION) return true;
  if ((meta.update_date + 3660) * 1000 < Date.now()) return true;
  return false;
};

const getMeta = async (world) =>
  await worldVillagesDatalocal.findById(`meta:${world}`);

const request = async (world) => {
  if (inFlight.has(world)) return inFlight.get(world);

  const requestPromise = (async () => {
    const rawId = `raw:villages:${world}`;
    const currentMeta = await getMeta(world);
    let rawDoc = await worldVillagesDatalocal.findById(rawId);
    let villages;
    let lastModified;
    let updateDate = Math.round(Date.now() / 1000);
    let cleanupRawDoc = false;

    try {
      const fetched = await fetchTwVillagesApi(world);
      villages = fetched.villages;
      lastModified = fetched.lastModified;
      await worldVillagesDatalocal.update({
        id: rawId,
        rawText: fetched.rawText,
        rawFetchedAt: updateDate,
        lastModified: Math.round(lastModified / 1000),
      });
      rawDoc = await worldVillagesDatalocal.findById(rawId);
      cleanupRawDoc = true;
    } catch (error) {
      if (!rawDoc?.rawText) throw error;
      villages = parseVillages(rawDoc.rawText);
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

    const villageDocs = villages.map((village) => ({
      _id: `v:${village.id}`,
      ...village,
    }));
    const coordDocs = villages.map((village) => ({
      _id: `vx:${village.x}|${village.y}`,
      villageId: village.id,
      x: village.x,
      y: village.y,
    }));

    await bulkUpsertInBatches(
      worldVillagesDatalocal,
      [...villageDocs, ...coordDocs],
      5000
    );
    await worldVillagesDatalocal.update(meta);
    if (cleanupRawDoc && rawDoc && rawDoc._rev) {
      await worldVillagesDatalocal.remove(rawDoc);
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

const parseCoord = (value) => {
  if (!value) return null;
  if (typeof value === 'object' && value.x != null && value.y != null) {
    return { x: Number(value.x), y: Number(value.y) };
  }
  if (typeof value === 'string') {
    const match = value.match(/(\d{1,3})\|(\d{1,3})/);
    if (match) return { x: Number(match[1]), y: Number(match[2]) };
  }
  return null;
};

const search = async (world, playerIds, payload = []) => {
  if (!await getMeta(world)) throw new Error('Start required');
  if (!playerIds) throw new Error('Params is required');

  const villageIds = new Set();
  const coordKeys = [];
  const villages = [];

  for (const item of payload) {
    const coord = parseCoord(item);
    if (coord) {
      coordKeys.push(`vx:${coord.x}|${coord.y}`);
      continue;
    }

    if (item || item === 0) {
      const id = Number(item);
      if (!Number.isNaN(id)) villageIds.add(id);
    }
  }

  if (coordKeys.length) {
    const { rows } = await worldVillagesDatalocal.allDocs({
      keys: coordKeys,
      include_docs: true,
    });

    for (const row of rows) {
      const doc = row?.doc;
      if (doc?.villageId) villageIds.add(Number(doc.villageId));
    }
  }

  if (villageIds.size) {
    const keys = Array.from(villageIds).map((id) => `v:${id}`);
    const { rows } = await worldVillagesDatalocal.allDocs({
      keys,
      include_docs: true,
    });

    for (const row of rows) {
      const village = row?.doc;
      if (village) {
        villages.push(village);
        if (village.playerId) playerIds.add(village.playerId);
      }
    }

    return villages;
  }

  return null;
};

const worldVillagesApi = {
  isUpdate,
  getMeta,
  update,
  coldStart,
  search,
};

export default worldVillagesApi;
