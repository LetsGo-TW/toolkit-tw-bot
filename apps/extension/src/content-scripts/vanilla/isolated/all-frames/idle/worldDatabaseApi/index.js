/* eslint-disable no-undef */
__webpack_nonce__ = 'c29tZSBjb29sIHN0cmluZyB3aWxsIHBvcCB1cCAxMjM=';

import { handleRequest } from "./handlerRequest";
import { init } from "./initDB";
import { validMessanger } from "./validMessenger";

let inFlight = false;

const serializeError = (err) => {
  if (Array.isArray(err)) return err;
  if (Array.isArray(err?.error)) return err.error;
  if (Array.isArray(err?.message)) return err.message;
  return err?.message || err?.toString?.() || 'Erro';
};

const receivedMessage = async ({ data, origin, source }) => {
  const CHANNEL = validMessanger({ data, source, origin });
  if (!CHANNEL) return;

  const { requestId } = data;
  try {
    const response = await handleRequest(data);
    const finalPromise = response?._finalPromise;
    if (finalPromise) delete response._finalPromise;
    window.postMessage(
      { source: CHANNEL, requestId, response },
      origin
    );
    if (finalPromise) {
      finalPromise
        .then((finalResponse) => {
          if (!finalResponse) return;
          window.postMessage(
            { source: CHANNEL, requestId, response: finalResponse, final: true },
            origin
          );
        })
        .catch((err) => {
          window.postMessage(
            { source: CHANNEL, requestId, error: serializeError(err), final: true },
            origin
          );
        });
    }
  } catch (err) {
    window.postMessage(
      { source: CHANNEL, requestId, error: serializeError(err) },
      origin
    );
  }
}

window.addEventListener('message', receivedMessage, false);

console.log('[World][Database API] running')

if (!inFlight) {
  inFlight = true;
  init();
};

export {};
