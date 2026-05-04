import './style.css'

import createReportView from "../../report/view/index"
import {
  HCAPTCHA_REPORT_ICON_URL,
  readHCaptchaSolverConfig,
  subscribeHCaptchaSolverConfig,
  writeHCaptchaSolverConfig,
} from "../../hCaptcha/config/model"

/**
 * O relatório agora é tratado como janela independente do composer.
 *
 * Motivo:
 * - o composer deve fechar ao clicar fora
 * - o report precisa continuar vivo para drag/focus
 * - se o report fosse "filho" do painel secundário, ele morreria junto
 *
 * Então mantemos uma única instância compartilhada por módulo, fora do
 * lifecycle do dropdown.
 */
let sharedHCaptchaReportView = null

function stopEvent(event) {
  event?.preventDefault?.()
  event?.stopPropagation?.()
}

function createToggleRow({ label = '', checked = false, onToggle = null } = {}) {
  const row = document.createElement('div')
  row.className = 'go-bot-view-captcha-config-row'

  const text = document.createElement('span')
  text.className = 'go-bot-view-captcha-config-row-label'
  text.textContent = String(label || '').trim()

  const toggle = document.createElement('button')
  toggle.type = 'button'
  toggle.className = 'go-bot-view-captcha-config-switch'
  toggle.setAttribute('role', 'switch')

  const thumb = document.createElement('span')
  thumb.className = 'go-bot-view-captcha-config-switch-thumb'
  toggle.append(thumb)

  const setChecked = (value) => {
    const isChecked = Boolean(value)
    toggle.setAttribute('aria-checked', isChecked ? 'true' : 'false')
    toggle.classList.toggle('is-on', isChecked)
  }

  setChecked(checked)

  toggle.addEventListener('click', async(event) => {
    stopEvent(event)
    const nextChecked = toggle.getAttribute('aria-checked') !== 'true'
    if (typeof onToggle === 'function') {
      await onToggle(nextChecked)
      return
    }

    setChecked(nextChecked)
  }, true)

  row.append(text, toggle)

  return {
    root: row,
    setChecked,
    destroy() {
      toggle.remove()
      text.remove()
      row.remove()
    },
  }
}

export function createBotViewCaptchaConfig(container, sectionApi = {}) {
  if (!(container instanceof HTMLElement)) {
    return null
  }

  const root = document.createElement('section')
  root.className = 'go-bot-view-captcha-config'
  root.innerHTML = `
    <p class="go-bot-view-captcha-config-copy">
      Configuração global do solver de captcha.
    </p>
    <div class="go-bot-view-captcha-config-actions"></div>
  `

  const actions = root.querySelector('.go-bot-view-captcha-config-actions')
  const footer = document.createElement('div')
  footer.className = 'go-bot-view-captcha-config-footer'

  const reportBtn = document.createElement('button')
  reportBtn.type = 'button'
  reportBtn.className = 'go-bot-view-captcha-config-report'
  reportBtn.innerHTML = `
    <img src="${HCAPTCHA_REPORT_ICON_URL}" alt="" width="18" height="18" aria-hidden="true" />
    <span>Relatórios</span>
  `

  footer.append(reportBtn)
  root.append(footer)
  container.append(root)

  let currentConfig = null
  const onReportClick = (event) => {
    stopEvent(event)
    sectionApi?.close?.()

    /**
     * Fechamos o composer primeiro e só então abrimos o report.
     *
     * O `setTimeout(0)` garante que o dropdown seja desmontado antes da
     * janela do relatório ser aberta, evitando conflito de "click outside".
     */
    window.setTimeout(() => {
      const root = sharedHCaptchaReportView?.root?.()
      const isAlive = root instanceof HTMLElement && root.isConnected

      if (!isAlive) {
        sharedHCaptchaReportView = createReportView({
          title: 'hCaptcha-Solver',
          reportType: 'hcaptcha',
          startOpen: true,
        })
        return
      }

      sharedHCaptchaReportView.setReportType?.('hcaptcha')
      sharedHCaptchaReportView.open?.()
    }, 0)
  }

  const setStatusFromConfig = (config = {}) => {
    if (typeof sectionApi?.setStatus === 'function') {
      sectionApi.setStatus(
        config?.active ? 'Ativo' : 'Desligado',
        config?.active ? 'active' : 'danger',
      )
    }
  }

  const applyConfig = (config = {}) => {
    currentConfig = {
      active: Boolean(config?.active),
      sound: Boolean(config?.sound),
      seconds: Number(config?.seconds) || 3600,
    }

    autoSolverRow?.setChecked(currentConfig.active)
    alarmRow?.setChecked(currentConfig.sound)
    setStatusFromConfig(currentConfig)
  }

  const persistConfig = async(patch = {}) => {
    const nextConfig = await writeHCaptchaSolverConfig({
      ...(currentConfig || {}),
      ...patch,
    })

    applyConfig(nextConfig)
    return nextConfig
  }

  const autoSolverRow = createToggleRow({
    label: 'Auto-solver',
    checked: false,
    onToggle: async(nextChecked) => {
      await persistConfig({ active: nextChecked })
    },
  })

  const alarmRow = createToggleRow({
    label: 'Alarme',
    checked: false,
    onToggle: async(nextChecked) => {
      await persistConfig({ sound: nextChecked })
    },
  })

  actions?.append(autoSolverRow.root, alarmRow.root)

  reportBtn.addEventListener('click', onReportClick, true)

  const unsubscribe = subscribeHCaptchaSolverConfig((config) => {
    applyConfig(config)
  })

  void readHCaptchaSolverConfig().then((config) => {
    applyConfig(config)
  }).catch((error) => {
    console.error('[bot-view captcha config]', error)
    setStatusFromConfig({ active: false })
  })

  return {
    destroy() {
      unsubscribe?.()
      reportBtn.removeEventListener('click', onReportClick, true)
      autoSolverRow.destroy()
      alarmRow.destroy()
      root.remove()
    },
  }
}

export default createBotViewCaptchaConfig
