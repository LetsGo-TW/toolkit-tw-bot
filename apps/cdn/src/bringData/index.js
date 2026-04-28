import { getGameData } from "@toolkit-tw-bot/document";
import { extensionId } from '@toolkit-tw-bot/release'

const SOURSE = 'go-connectdb';

const pending = new Map();
let listenerBound = false;

const isValidMessage = (data) => {
  if (data?.source !== SOURSE) return false;
  if (!data.requestId) return false;
  if (!('response' in data) && !('error' in data)) return false;
  return true;
};

const onMessage = ({ data, origin }) => {
  if (!isValidMessage(data)) return;
  if (origin !== window.location.origin) return;
  const entry = pending.get(data.requestId);
  if (!entry) return;
  if (data.response?.loading && entry.retries < entry.maxRetries) {
    entry.retries += 1;
    setTimeout(() => {
      window.postMessage({
        source: SOURSE,
        extensionId: entry.extensionId,
        db: entry.db,
        world: entry.world,
        payload: entry.payload,
        requestId: data.requestId
      }, window.location.origin);
    }, entry.retryDelayMs);
    return;
  }

  if ('error' in data) {
    pending.delete(data.requestId);
    clearTimeout(entry.timeoutId);
    entry.reject(data.error);
    return;
  }

  if (data.response?.partial && !data.final) {
    if (typeof entry.onPartial === 'function') {
      entry.onPartial(data.response);
    }
    if (entry.resolveOnPartial && !entry.resolvedPartial) {
      entry.resolvedPartial = true;
      entry.resolve(data.response);
    }
    if (entry.resolveOnPartial && !entry.onFinal) {
      pending.delete(data.requestId);
      clearTimeout(entry.timeoutId);
    }
    return;
  }

  pending.delete(data.requestId);
  clearTimeout(entry.timeoutId);
  if (typeof entry.onFinal === 'function') {
    entry.onFinal(data.response);
  }
  entry.resolve(data.response);
};

const ensureListener = () => {
  if (listenerBound) return;
  window.addEventListener('message', onMessage);
  listenerBound = true;
};

export function bringData(
  db,
  payload,
  {
    timeoutMs = 15000,
    retryDelayMs = 1000,
    maxRetries = 8,
    resolveOnPartial = true,
    onPartial,
    onFinal,
    onTimeout,
    allowLateResponse = true
  } = {}
) {
  const gameData = getGameData();
  if (!gameData || !gameData.world) {
    return Promise.reject(new Error('gameData not found'));
  }
  const world = gameData.world;
  if (!extensionId) {
    return Promise.reject(new Error('extensionId not found'));
  }

  const requestId = crypto.randomUUID();

  ensureListener();

  const promise = new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      const entry = pending.get(requestId);
      if (!entry) return;
      if (entry.allowLateResponse) {
        entry.timedOut = true;
        if (typeof entry.onTimeout === 'function') {
          entry.onTimeout(new Error('bringData timeout'));
        }
        return;
      }
      pending.delete(requestId);
      reject(new Error('bringData timeout'));
    }, timeoutMs);
    pending.set(requestId, {
      resolve,
      reject,
      timeoutId,
      db,
      payload,
      world,
      extensionId,
      retries: 0,
      retryDelayMs,
      maxRetries,
      resolveOnPartial,
      onPartial,
      onFinal,
      onTimeout,
      allowLateResponse,
      resolvedPartial: false,
      timedOut: false
    });
  });

  window.postMessage({
    source: SOURSE,
    extensionId,
    db,
    world,
    payload,
    requestId
  }, window.location.origin);

  return promise;
}
