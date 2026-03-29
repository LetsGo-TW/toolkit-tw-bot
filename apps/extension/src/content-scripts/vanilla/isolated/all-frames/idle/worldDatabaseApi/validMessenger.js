const CHANNEL = 'go-connectdb';
const extensionId = chrome.runtime.id;
export function validMessanger({ data, source, origin }) {
  if (source !== window) return;
  if (!data || data.source !== CHANNEL) return;
  if (!data.extensionId || data.extensionId !== extensionId) return;
  if (!origin || origin !== window.location.origin) return;
  if (!data.world) return;
  if (!data.db) return;
  if (!data.payload) return;
  if (!data.requestId) return;
  return CHANNEL;
}
