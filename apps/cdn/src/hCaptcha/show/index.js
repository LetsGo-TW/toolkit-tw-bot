// import { sendNotify } from "../../Notify"
import { Sounds } from "../../music"
import { dateServer, timeServer } from "../../stable-compat/date-tw"
import { notification, printTimer } from "../../components/notification"
import { run } from "../run"
import { ConfigSolver } from "../config"
import { Report } from "../../report"
import { ReportSession } from "../report-session/index.js"
import { useGoTiming } from "../../hooks/useGoTiming";
import { random } from "@toolkit-tw-bot/core"
import { nDateTime } from "../../stable-compat/date-parse"
import { sleep } from "../../stable-compat/utils"
import { getGameData, ProtectingBot } from "@toolkit-tw-bot/document"

const MSG_SOLVER_DISABLED = 'Resolve-auto: Desligado. Somente ação do usuário.'

function printMsg(msg) {
  if (!document.querySelector("#print-msg")) return
  document.querySelector("#print-msg").innerHTML = msg
}

export const getCaptchaNowMs = () => {
  if (useGoTiming.isReady()) {
    return Number(useGoTiming.getEffectiveServerNowMs())
  }

  return Number(nDateTime(dateServer(), timeServer()))
}

export default async function show() {
  const gameData = getGameData();

  const isCaptchaActive = ProtectingBot['bot-protect-all-in-game'].active();

  if (!isCaptchaActive) {
    const pendingReport = ReportSession.get()
    if (pendingReport) {
      const successMessage = 'Resolvido e validado pelo jogo'

      await ReportSession.finish('success', successMessage)
    }
  }

  if (ProtectingBot.screen.indexOf(gameData.screen) === -1) {
    ProtectingBot.redirect()
  }

  if (!isCaptchaActive) {
    return
  }

  printMsg('Aguarde...')

  if (!document.querySelector("#print-msg")) notification()

  printTimer(-1)

  await ConfigSolver.init()

  const configSolverNode = document.querySelector("#config-solver")

  Sounds.use("solver")
  Sounds.listner("#sound-solver")

  configSolverNode.addEventListener('change', onChangeConfig)

  const soundInteractive = () => {
    if (ConfigSolver.sound) {
      Sounds.play();
    }
  }

  if (ConfigSolver.active) {
    await optionEnableSolver()
  } else {
    optionDisableSolver()

    const body = `
      💀 hCahptcha identificado!
      ❗ ${MSG_SOLVER_DISABLED}
    `
    // await sendNotify('hCaptcha', body)
    soundInteractive();
  }

  async function optionEnableSolver() {
    console.log('Enable!')

    const time = parseInt(random(5, 10))

    printMsg(`Resolve-auto: ${new Date(getCaptchaNowMs() + ( time * 1000 )).toLocaleString("pt-BR")}`)

    await sleep(time)

    if (ConfigSolver.active) {
      run({ sendNotify: null, soundInteractive, Report })
    }
  }

  function optionDisableSolver() {
    console.log('Disable!');
    printMsg(MSG_SOLVER_DISABLED);
  }

  async function onChangeConfig(e) {
    const { id } = e.target
    await sleep(0.25)
    if (id === 'active-solver') {
      if (ConfigSolver.active) {
        await optionEnableSolver()
      } else {
        optionDisableSolver()
      }
    }
  }
}
