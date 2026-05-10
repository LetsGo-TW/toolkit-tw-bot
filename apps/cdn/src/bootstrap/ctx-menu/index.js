import {
  bootCtxMenuRunning,
  destroyCtxMenuRunning,
} from './villageContextMenu'

export async function syncCtxMenuRunning() {
  bootCtxMenuRunning()
}

export async function destroyCtxMenuBootstrapRunning() {
  destroyCtxMenuRunning?.()
}

export default {
  destroyCtxMenuBootstrapRunning,
  syncCtxMenuRunning,
}
