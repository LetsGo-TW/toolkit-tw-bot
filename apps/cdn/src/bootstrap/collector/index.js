import {
  bootCollectorLauncherBotViewRunning,
  destroyCollectorLauncherBotViewRunning,
} from '../../components/go-buttons/mountCollectorLauncherButtons'

export async function syncCollectorRunning() {
  bootCollectorLauncherBotViewRunning()
}

export async function destroyCollectorRunning() {
  destroyCollectorLauncherBotViewRunning?.()
}

export default {
  destroyCollectorRunning,
  syncCollectorRunning,
}
