import {
  getDefaultHCaptchaSolverConfig,
  readHCaptchaSolverConfig,
  subscribeHCaptchaSolverConfig,
  writeHCaptchaSolverConfig,
} from "./model"

/**
 * Wrapper headless do config do solver.
 *
 * Antes esse módulo também montava a barra legada `#config-solver` dentro da
 * página do TW. Agora a UI oficial do captcha vive no composer/bot-view.
 *
 * Mesmo assim mantemos este wrapper porque o fluxo do solver ainda precisa de:
 * - leitura inicial da config
 * - estado em memória (`active`, `seconds`, `sound`)
 * - assinatura das mudanças quando a config for alterada pelo composer
 */
export const ConfigSolver = {
  active: false,
  seconds: 3600,
  sound: false,
  config: getDefaultHCaptchaSolverConfig(),
  unsubscribeConfig: null,

  async init() {
    await ConfigSolver.get()

    if (!ConfigSolver.unsubscribeConfig) {
      ConfigSolver.unsubscribeConfig = subscribeHCaptchaSolverConfig((config) => {
        ConfigSolver.applyConfig(config)
      })
    }
  },

  destroy() {
    ConfigSolver.unsubscribeConfig?.()
    ConfigSolver.unsubscribeConfig = null
  },

  applyConfig(config = {}) {
    const nextConfig = {
      ...getDefaultHCaptchaSolverConfig(),
      ...config,
    }

    ConfigSolver.active = Boolean(nextConfig.active)
    ConfigSolver.seconds = Number(nextConfig.seconds) || ConfigSolver.config.seconds
    ConfigSolver.sound = Boolean(nextConfig.sound)

    return nextConfig
  },

  async get() {
    const config = await readHCaptchaSolverConfig()
    ConfigSolver.applyConfig(config)
    return config
  },

  async set(params) {
    const config = await writeHCaptchaSolverConfig(params)
    ConfigSolver.applyConfig(config)
    return config
  },
}

export default ConfigSolver
