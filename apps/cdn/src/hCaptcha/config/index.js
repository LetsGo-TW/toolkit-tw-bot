import createReportView from "../../report/view/index"
import { svgToDataUri } from "../../components/go-buttons/util"
import { nSecStrTime, strTimeToSec } from "../../stable-compat/date-parse"
import { getGameData } from "@toolkit-tw-bot/document"
import StorageLocalCompat from "../../shared/indexdb/storage-local-compat"

const HCAPTCHA_REPORT_ICON_URL = svgToDataUri(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">' +
    '<rect x="5" y="3.5" width="14" height="17" rx="2.2" fill="#fff" stroke="#7c5a1e" stroke-width="1.4"/>' +
    '<path d="M8 8h8M8 11h8M8 14h6" stroke="#7c5a1e" stroke-width="1.5" stroke-linecap="round"/>' +
    '<circle cx="16.8" cy="16.8" r="3.2" fill="#facc15" stroke="#7c5a1e" stroke-width="1.2"/>' +
    '<path d="M15.9 16.8h1.8M16.8 15.9v1.8" stroke="#7c5a1e" stroke-width="1.2" stroke-linecap="round"/>' +
  '</svg>'
)

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

export const ConfigSolver = {
  active: null,
  seconds: null,
  sound: null,
  images: null,
  config: {
    active: false,
    seconds: 3600,
    sound: false,
  },

  storage: null,

  async init() {
    const contentContainer = document.querySelector("#contentContainer")

    if (!contentContainer) return

    if (document.querySelector('#config-solver')) return

    const gameData = getGameData();
    if (!gameData) return

    const solver = document.createElement("div")

    solver.id = "config-solver"
    solver.style = "display: flex; align-items: center; color: #603000;"
    solver.innerHTML = html

    if (!ConfigSolver.storage) {
      ConfigSolver.storage = StorageLocalCompat.create({
        world: gameData.world, 
        playerId: gameData.player.id,
        path: ['hcaptcha-solver', 'config']
      })
    }

    await ConfigSolver.get()

    contentContainer.insertAdjacentElement("beforeend", solver)

    ConfigSolver.images = {
      active: document.querySelector("#img-active"),
      disable: document.querySelector("#img-disable")
    }

    ConfigSolver["set-images"]()
    ConfigSolver["set-disable"]()

    const time = document.querySelector("#time-solver")
    time.value = nSecStrTime(ConfigSolver.seconds).match(/^[0-9]{1,}[:][0-9]{1,}/ig).join()
    time.addEventListener("input", () => {
      ConfigSolver.seconds = strTimeToSec(time.value + ":00")
      ConfigSolver.set({active: ConfigSolver.active, seconds: ConfigSolver.seconds, sound: ConfigSolver.sound})
    })

    document.querySelector("#config-solver [name='set-disable']").style.display = 'none'

    const active = document.querySelector("#active-solver")

    active.checked = ConfigSolver.active
    active.addEventListener("change", () => {
      ConfigSolver.active = active.checked
      ConfigSolver.set({active: ConfigSolver.active, seconds: ConfigSolver.seconds, sound: ConfigSolver.sound})
    })

    const sound = document.querySelector("#sound-solver")
    sound.checked = ConfigSolver.sound
    sound.addEventListener("change", () => {
      ConfigSolver.sound = sound.checked
      ConfigSolver.set({active: ConfigSolver.active, seconds: ConfigSolver.seconds, sound: ConfigSolver.sound})
    })

    const reset = document.querySelector("#reset-solver")
    reset.addEventListener("click", () => {
      ConfigSolver.set(ConfigSolver.config)
      active.checked = ConfigSolver.active
      time.value = nSecStrTime(ConfigSolver.seconds).match(/^[0-9]{1,}[:][0-9]{1,}/ig).join()
      sound.checked = ConfigSolver.sound
    })

    const reportBtn = document.querySelector("#btn-report-hcaptcha")
    if (reportBtn) {
      let hCaptchaReportView = null;
      reportBtn.addEventListener("click", () => {
        if (!hCaptchaReportView) {
          hCaptchaReportView = createReportView({
            title: 'hCaptcha-Solver',
            reportType: 'hcaptcha',
            startOpen: true
          });
        } else {
          hCaptchaReportView.toggle();
        }
      });
    }
  },

  async get() {
    if (!await ConfigSolver.storage.exists()) {
      await ConfigSolver.set(ConfigSolver.config)
    }
    const config = await ConfigSolver.storage.get()
    ConfigSolver.active = config.active
    ConfigSolver.seconds = config.seconds
    ConfigSolver.sound = config.sound
    return config
  },

  async set(params) {
    const config = {...params}
    await ConfigSolver.storage.set(config)
    ConfigSolver.active = config.active
    ConfigSolver.seconds = config.seconds
    ConfigSolver.sound = config.sound
    ConfigSolver["set-images"]()
    ConfigSolver["set-disable"]()
    return config
  },

  ["set-images"] : () => {
    ConfigSolver.images.active.style.display = ConfigSolver.active ? "" : "none"
    ConfigSolver.images.disable.style.display = ConfigSolver.active ? "none" : ""
  },

  ["set-disable"] : () => {
    document.querySelector("#label-active").textContent = ConfigSolver.active ? " ligado" : " desligado"
    const color = ConfigSolver.active ? "#603000" : "#9f764d"
    const cursor = ConfigSolver.active ? "pointer" : "default"
    Array.from(document.getElementsByName("set-disable")).map(e => Array.from(e.childNodes).map(c => {
      c.disabled = !ConfigSolver.active
      c.style = `color: ${color}; cursor: ${cursor}`
    }))
  }
}

export default ConfigSolver
