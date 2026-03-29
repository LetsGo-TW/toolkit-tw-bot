import { worldAllysDatalocal } from '..';
import { fetchTwAllysApi, parseAllys } from './fetch';

const SCHEMA_VERSION = 3;
const inFlight = new Map();

const isUpdate = (meta) => {
  if (meta.schema !== SCHEMA_VERSION) return true;
  if ((meta.update_date + 3660) * 1000 < Date.now()) return true;
  return false;
};

const getMeta = async (world) =>
  await worldAllysDatalocal.findById(`meta:${world}`);

const request = async (world) => {
  if (inFlight.has(world)) return inFlight.get(world);

  const requestPromise = (async () => {
    const rawId = `raw:allys:${world}`;
    const currentMeta = await getMeta(world);
    let rawDoc = await worldAllysDatalocal.findById(rawId);
    let allys;
    let lastModified;
    let updateDate = Math.round(Date.now() / 1000);
    let cleanupRawDoc = false;

    try {
      const fetched = await fetchTwAllysApi(world);
      allys = fetched.allys;
      lastModified = fetched.lastModified;
      await worldAllysDatalocal.update({
        id: rawId,
        rawText: fetched.rawText,
        rawFetchedAt: updateDate,
        lastModified: Math.round(lastModified / 1000),
      });
      rawDoc = await worldAllysDatalocal.findById(rawId);
      cleanupRawDoc = true;
    } catch (error) {
      if (!rawDoc?.rawText) throw error;
      allys = parseAllys(rawDoc.rawText);
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

    const allyDocs = allys.map((ally) => ({
      _id: `a:${ally.id}`,
      ...ally,
    }));

    await worldAllysDatalocal.bulkUpsert(allyDocs);
    await worldAllysDatalocal.update(meta);
    if (cleanupRawDoc && rawDoc && rawDoc._rev) {
      await worldAllysDatalocal.db.remove(rawDoc);
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

const search = async (world, allyIds, payload = []) => {
  if (!await getMeta(world)) throw new Error('Cold start required');
  if (!allyIds) throw new Error('Params is required');

  const allys = [];
  for (const id of payload) {
    if (id || id === 0) allyIds.add(Number(id));
  }

  if (allyIds.size) {
    const keys = Array.from(allyIds).map((id) => `a:${id}`);
    const { rows } = await worldAllysDatalocal.allDocs({
      keys,
      include_docs: true,
    });

    for (const row of rows) {
      const ally = row?.doc;
      if (ally) allys.push(ally);
    }

    return allys;
  }

  return null;
};

const worldAllysApi = {
  isUpdate,
  getMeta,
  update,
  coldStart,
  search,
};

export default worldAllysApi;
