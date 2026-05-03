import { createBotViewCaptchaConfig } from '../../components/bot-view-captcha-config'
import { readHCaptchaSolverConfig } from './model'

export async function createHCaptchaBotViewSection() {
  const captchaConfig = await readHCaptchaSolverConfig()

  return {
    id: 'captcha-config',
    label: 'Captcha',
    groupId: 'globals',
    statusLabel: captchaConfig?.active ? 'Ativo' : 'Desligado',
    statusTone: captchaConfig?.active ? 'active' : 'danger',
    mount: (container, sectionApi) => createBotViewCaptchaConfig(container, sectionApi),
  }
}

export default createHCaptchaBotViewSection
