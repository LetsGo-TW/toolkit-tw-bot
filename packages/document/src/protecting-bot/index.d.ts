export type ProtectingBotChecker = {
  active(html?: Document, win?: Window): boolean
}

declare const ProtectingBot: {
  type: string
  dsBody(html?: Document): Element | null
  error(): Error
  'bot-protection-quest': ProtectingBotChecker
  'bot-protect': ProtectingBotChecker
  'hCaptcha-in-page': ProtectingBotChecker
  'hCaptcha-in-popup': ProtectingBotChecker
  'bot-protect-all-in-game': ProtectingBotChecker
}

export = ProtectingBot
