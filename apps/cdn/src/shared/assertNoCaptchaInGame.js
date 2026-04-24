import { ProtectingBot } from "@toolkit-tw-bot/document"

export function assertNoCaptchaInGame(html = document, context = 'request') {
  if (!ProtectingBot["bot-protect-all-in-game"].active(html)) return
  const error = ProtectingBot.error()
  error.cause = error.cause || 'Protecting-Bot'
  error.goContext = context
  throw error
}
