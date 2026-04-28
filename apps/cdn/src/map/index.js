// eslint-disable-next-line no-undef
__webpack_nonce__ = 'c29tZSBjb29sIHN0cmluZyB3aWxsIHBvcCB1cCAxMjM=';

import { initMapInfoCacheObserver } from "./mapInfoCacheObserver";
import { bootMapMenuRunning } from "./menu/index.js";

export default async() => {
  const url = new URL(window.location.href)
  if (url.searchParams.get('intro')) return
  if (url.searchParams.get('screen') !== 'map') return

  initMapInfoCacheObserver()
  bootMapMenuRunning()
}
