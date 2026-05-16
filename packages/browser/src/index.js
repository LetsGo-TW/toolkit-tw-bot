const combineAbortControllerSignals = require('./combine-abort-controller-signals')
const { createIndexedDbDocStore } = require('./indexed-db')
const {
  SCRIPT_STORAGE_MESSAGE_TYPE,
  createScriptStorageCompose,
  getScriptStorage,
  putScriptStorage,
  postScriptStorage,
  deleteScriptStorage,
  ScriptStorage,
} = require('./script-storage')
const StorageLocalCompat = require('./storage-local-compat')
const {
  makeAjaxHeadersPost,
  makeAjaxHeadersGet,
  makeAjaxHeadersGetDoc,
  makeAjaxBody,
} = require('./make-ajax')

const DOC_REQUEST_TIMEOUT_MS = 30_000

module.exports = {
  combineAbortControllerSignals,
  createIndexedDbDocStore,
  DOC_REQUEST_TIMEOUT_MS,
  SCRIPT_STORAGE_MESSAGE_TYPE,
  createScriptStorageCompose,
  getScriptStorage,
  putScriptStorage,
  postScriptStorage,
  deleteScriptStorage,
  ScriptStorage,
  StorageLocalCompat,
  makeAjaxHeadersPost,
  makeAjaxHeadersGet,
  makeAjaxHeadersGetDoc,
  makeAjaxBody,
}
