export const PREPARED_READY_ATTRIBUTE = 'data-toolkit-tw-bot-prepared-ready'
export const PREPARED_CONNECT_SERVER_ERROR_ATTRIBUTE = 'data-toolkit-tw-bot-connect-server-error'

export const STARTER_PREPARED_READY = 'STARTER_PREPARED_READY'
export const STARTER_PREPARED_ERROR = 'STARTER_PREPARED_ERROR'

export function isPreparedConnectServerError(doc: Document = document) {
  return doc.documentElement?.getAttribute(PREPARED_CONNECT_SERVER_ERROR_ATTRIBUTE) === 'true'
}
