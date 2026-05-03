import createReportView from "../../report/view/index"
import { nSecStrTime, strTimeToSec } from "../../stable-compat/date-parse"
import {
  HCAPTCHA_REPORT_ICON_URL,
  getDefaultHCaptchaSolverConfig,
  readHCaptchaSolverConfig,
  subscribeHCaptchaSolverConfig,
  writeHCaptchaSolverConfig,
} from "./model"

const html = `<span>
<img id="img-active" style="width: 28px; margin: 2px;" src="https://github.com/UnrecognizedBR/public/blob/master/icons/no-captcha.jpg?raw=true" alt="">
<img id="img-disable" style="width: 28px; margin: 2px;" src="https://github.com/UnrecognizedBR/public/blob/master/icons/icon-hCaptcha-128x128.png?raw=true" alt="">
</span>
<span>
<input type="checkbox" name="active-solver" id="active-solver">
<label id="label-active" for="active-solver"> ligado</label>
</span>
<span style="margin: 5px;">
<input type="checkbox" name="sound-solver" id="sound-solver">
<label for="sound-solver"> alarme</label>
</span>
<span name="set-disable" style="margin: 5px;">
<input type="time" name="time-solver" id="time-solver">
<label for="time-solver"> aguardar(hh:mm)</label>
</span>
<span>
<a id="reset-solver" style="cursor: pointer;"><img style="width: 12px; margin: 2px;" src="https://github.com/UnrecognizedBR/public/blob/master/icons/Reset-Blue.png?raw=true" alt=""></a>
</span>
<span>
<img id="btn-report-hcaptcha" style="width: 20px; height: 20px; cursor: pointer; margin-left: 10px; vertical-align: middle;" src="${HCAPTCHA_REPORT_ICON_URL}" alt="report" title="Ver Relatório do hCaptcha">
</span>`

function formatTimeValue(seconds = 0) {
  return nSecStrTime(seconds).match(/^[0-9]{1,}[:][0-9]{1,}/ig).join()
}

export const ConfigSolver = {
  active: null,
  seconds: null,
  sound: null,
  images: null,
  config: getDefaultHCaptchaSolverConfig(),
  unsubscribeConfig: null,
  reportView: null,

  async init() {
    const contentContainer = document.querySelector("#contentContainer")

    if (!contentContainer) return

    let solver = document.querySelector('#config-solver')
    const shouldBind = !(solver instanceof HTMLElement) || solver.dataset.goConfigSolverBound !== '1'
    if (!(solver instanceof HTMLElement)) {
      solver = document.createElement("div")
      solver.id = "config-solver"
      solver.style = "display: flex; align-items: center; color: #603000;"
      solver.innerHTML = html
      contentContainer.insertAdjacentElement("beforeend", solver)
    }

    ConfigSolver.images = {
      active: solver.querySelector("#img-active"),
      disable: solver.querySelector("#img-disable"),
    }

    const time = solver.querySelector("#time-solver")
    const active = solver.querySelector("#active-solver")
    const sound = solver.querySelector("#sound-solver")
    const reset = solver.querySelector("#reset-solver")
    const reportBtn = solver.querySelector("#btn-report-hcaptcha")

    await ConfigSolver.get()
    ConfigSolver.syncUi(solver)

    if (shouldBind) {
      time?.addEventListener("input", ConfigSolver.onTimeInput)
      active?.addEventListener("change", ConfigSolver.onActiveChange)
      sound?.addEventListener("change", ConfigSolver.onSoundChange)
      reset?.addEventListener("click", ConfigSolver.onResetClick)
      reportBtn?.addEventListener("click", ConfigSolver.onReportClick)
      solver.dataset.goConfigSolverBound = '1'
    }

    if (!ConfigSolver.unsubscribeConfig) {
      ConfigSolver.unsubscribeConfig = subscribeHCaptchaSolverConfig((config) => {
        ConfigSolver.applyConfig(config)
        ConfigSolver.syncUi()
      })
    }
  },

  destroy() {
    const solver = document.querySelector("#config-solver")
    if (solver instanceof HTMLElement) {
      solver.querySelector("#time-solver")?.removeEventListener?.("input", ConfigSolver.onTimeInput)
      solver.querySelector("#active-solver")?.removeEventListener?.("change", ConfigSolver.onActiveChange)
      solver.querySelector("#sound-solver")?.removeEventListener?.("change", ConfigSolver.onSoundChange)
      solver.querySelector("#reset-solver")?.removeEventListener?.("click", ConfigSolver.onResetClick)
      solver.querySelector("#btn-report-hcaptcha")?.removeEventListener?.("click", ConfigSolver.onReportClick)
      solver.remove()
    }

    ConfigSolver.images = null
    ConfigSolver.unsubscribeConfig?.()
    ConfigSolver.unsubscribeConfig = null
    ConfigSolver.reportView?.destroy?.()
    ConfigSolver.reportView = null
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

  syncUi(root = document.querySelector("#config-solver")) {
    if (!(root instanceof HTMLElement)) return

    const time = root.querySelector("#time-solver")
    const active = root.querySelector("#active-solver")
    const sound = root.querySelector("#sound-solver")

    if (active) active.checked = Boolean(ConfigSolver.active)
    if (sound) sound.checked = Boolean(ConfigSolver.sound)
    if (time) time.value = formatTimeValue(ConfigSolver.seconds)

    ConfigSolver["set-images"]()
    ConfigSolver["set-disable"]()
  },

  async get() {
    const config = await readHCaptchaSolverConfig()
    ConfigSolver.applyConfig(config)
    return config
  },

  async set(params) {
    const config = await writeHCaptchaSolverConfig(params)
    ConfigSolver.applyConfig(config)
    ConfigSolver.syncUi()
    return config
  },

  async onTimeInput(event) {
    const value = String(event?.target?.value || '').trim()
    await ConfigSolver.set({
      active: ConfigSolver.active,
      seconds: strTimeToSec(`${value}:00`),
      sound: ConfigSolver.sound,
    })
  },

  async onActiveChange(event) {
    await ConfigSolver.set({
      active: Boolean(event?.target?.checked),
      seconds: ConfigSolver.seconds,
      sound: ConfigSolver.sound,
    })
  },

  async onSoundChange(event) {
    await ConfigSolver.set({
      active: ConfigSolver.active,
      seconds: ConfigSolver.seconds,
      sound: Boolean(event?.target?.checked),
    })
  },

  async onResetClick() {
    await ConfigSolver.set(ConfigSolver.config)
  },

  onReportClick() {
    if (!ConfigSolver.reportView) {
      ConfigSolver.reportView = createReportView({
        title: 'hCaptcha-Solver',
        reportType: 'hcaptcha',
        startOpen: true,
      })
      return
    }

    ConfigSolver.reportView.toggle()
  },

  ["set-images"]() {
    if (!ConfigSolver.images?.active || !ConfigSolver.images?.disable) return
    ConfigSolver.images.active.style.display = ConfigSolver.active ? "" : "none"
    ConfigSolver.images.disable.style.display = ConfigSolver.active ? "none" : ""
  },

  ["set-disable"]() {
    const labelActive = document.querySelector("#label-active")
    if (!labelActive) return
    labelActive.textContent = ConfigSolver.active ? " ligado" : " desligado"
    const color = ConfigSolver.active ? "#603000" : "#9f764d"
    const cursor = ConfigSolver.active ? "pointer" : "default"
    Array.from(document.getElementsByName("set-disable")).forEach((node) => {
      Array.from(node.children).forEach((childNode) => {
        if ('disabled' in childNode) {
          childNode.disabled = !ConfigSolver.active
        }
        if (childNode instanceof HTMLElement) {
          childNode.style.color = color
          childNode.style.cursor = cursor
        }
      })
    })
  },
}

export default ConfigSolver
