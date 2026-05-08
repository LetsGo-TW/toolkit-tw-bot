// import { sendNotify } from "../../Notify"
import { Sounds } from "../../music"
import { dateServer, timeServer } from "../../stable-compat/date-tw"
import { run } from "../run"
import { ConfigSolver } from "../config"
import { Report } from "../../report"
import { ReportSession } from "../report-session/index.js"
import { useGoTiming } from "../../hooks/useGoTiming";
import { random } from "@toolkit-tw-bot/core"
import { nDateTime } from "../../stable-compat/date-parse"
import { getGameData, ProtectingBot } from "@toolkit-tw-bot/document"
import { BotViewExecutionStatus } from "../../shared/bot-view-status"

const MSG_SOLVER_DISABLED = 'Resolve-auto: Desligado. Somente ação do usuário.'

export const getCaptchaNowMs = () => {
  if (useGoTiming.isReady()) {
    return Number(useGoTiming.getEffectiveServerNowMs())
  }

  return Number(nDateTime(dateServer(), timeServer()))
}

export default async function show({ context, control }) {
  control?.throwIfAborted?.()

  const gameData = getGameData();

  const isCaptchaActive = ProtectingBot['bot-protect-all-in-game'].active();

  if (!isCaptchaActive) {
    const pendingReport = ReportSession.get()
    const successMessage = pendingReport
      ? 'Resolvido e validado pelo jogo'
      : 'Captcha não está mais ativo'

    if (pendingReport) {
      await ReportSession.finish('success', successMessage)
    }

    await context?.reportState?.({
      status: 'completed',
      detail: {
        message: successMessage,
      },
    })
  }

  if (ProtectingBot.screen.indexOf(gameData.screen) === -1) {
    ProtectingBot.redirect()
  }

  if (!isCaptchaActive) {
    return
  }

  BotViewExecutionStatus.set('Aguarde...')

  /**
   * `ConfigSolver` agora é headless.
   *
   * Ele continua existindo como wrapper do estado/config do solver, mas não
   * injeta mais a barra antiga `#config-solver` no DOM. A UI oficial do
   * captcha passou a viver só no composer/bot-view.
   */
  await ConfigSolver.init()
  control?.onAbort?.(() => {
    ConfigSolver.destroy()
  })
  control?.throwIfAborted?.()

  Sounds.use("solver")

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

  // O solver precisa continuar "rodando" enquanto o captcha estiver ativo.
  // Se este fluxo retornar cedo, o GAME reporta `completed` e o SW redispara
  // o solver em loop, abortando os listeners que deveriam resolver/recarregar.
  await control?.waitForAbort?.()

  async function optionEnableSolver() {
    console.log('Enable!')

    const time = parseInt(random(5, 10))

    BotViewExecutionStatus.set(`Resolve-auto: ${new Date(getCaptchaNowMs() + ( time * 1000 )).toLocaleString("pt-BR")}`)

    await control?.sleepSeconds?.(time)
    control?.throwIfAborted?.()

    if (ConfigSolver.active) {
      BotViewExecutionStatus.set('Executando...');
      await run({
        sendNotify: null,
        soundInteractive,
        Report,
        reportState: context?.reportState,
        control,
      })
    }
  }

  function optionDisableSolver() {
    console.log('Disable!');
    BotViewExecutionStatus.set(MSG_SOLVER_DISABLED);
  }
}
