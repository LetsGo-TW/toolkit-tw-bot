/* global __webpack_public_path__ */

const extensionRuntime = (
  typeof chrome !== 'undefined' && chrome?.runtime?.getURL
    ? chrome.runtime
    : typeof browser !== 'undefined' && browser?.runtime?.getURL
      ? browser.runtime
      : null
)

if (extensionRuntime) {
  __webpack_public_path__ = extensionRuntime.getURL('content-scripts/')
}
