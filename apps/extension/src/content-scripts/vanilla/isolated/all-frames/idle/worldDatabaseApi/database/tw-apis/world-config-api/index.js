import fetchTwConfigApi, { parseWorldConfig } from './fetch';
import { worldConfigDatalocal } from '..';

const SCHEMA_VERSION = 1;
const inFlight = new Map();

const getMeta = async (world) =>
  await worldConfigDatalocal.findById(`meta:${world}`);

const update = async (world) => {
  if (inFlight.has(world)) return inFlight.get(world);

  const requestPromise = (async () => {
    const rawId = `raw:cfg:${world}`;
    let rawDoc = await worldConfigDatalocal.findById(rawId);
    let worldConfig;

    if (rawDoc?.rawText) {
      worldConfig = parseWorldConfig(rawDoc.rawText);
    } else {
      const fetched = await fetchTwConfigApi(world);
      await worldConfigDatalocal.update({ id: rawId, rawText: fetched.rawText });
      worldConfig = fetched.worldConfig;
      rawDoc = await worldConfigDatalocal.findById(rawId);
    }

    const configDocs = Object.entries(worldConfig).map(([key, value]) => ({
      _id: `cfg:${world}:${key}`,
      world,
      key,
      value,
    }));

    const meta = {
      id: `meta:${world}`,
      update_date: Math.round(Date.now() / 1000),
      schema: SCHEMA_VERSION,
    };

    await worldConfigDatalocal.bulkUpsert(configDocs);
    await worldConfigDatalocal.update(meta);
    if (rawDoc && rawDoc._rev) {
      await worldConfigDatalocal.remove(rawDoc);
    }

    return meta;
  })().finally(() => inFlight.delete(world));

  inFlight.set(world, requestPromise);
  return requestPromise;
};

const search = async (world, payload = [], allowRefreshOnMissing = true) => {
  if (!await getMeta(world)) {
    await update(world);
  }

  if (!payload.length) return {};

  const config = {};
  const keys = payload.map((key) => `cfg:${world}:${key}`);
  const { rows } = await worldConfigDatalocal.allDocs({
    keys,
    include_docs: true,
  });

  for (const row of rows) {
    const doc = row?.doc;
    if (doc?.key) config[doc.key] = doc.value;
  }

  const hasMissingKey = payload.some((key) => !(key in config));
  if (hasMissingKey && allowRefreshOnMissing) {
    await update(world);
    return await search(world, payload, false);
  }

  return config;
};

const worldConfigApi = {
  getMeta,
  update,
  search,
};

export default worldConfigApi;
