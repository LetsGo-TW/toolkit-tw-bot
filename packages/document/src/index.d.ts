import type { ParsedGameData } from '@toolkit-tw-bot/core'

export declare function getGameData(
  doc?: Document,
): ParsedGameData | undefined

export declare function dateServer(doc?: Document): string | 0

export declare function timeServer(doc?: Document): string | 0

export declare function dateTimeNow(doc?: Document): number

export declare function timeZone(doc?: Document): number

export declare function delayMillis(doc?: Document): number

export declare function normalizeText(value?: string): string

export declare function blockedRequestActive(html?: Document): Element | boolean | null

export declare function gameUpdateActive(html?: Document): boolean

export declare function extractTwSpecialMessage(html?: Document): string | null

export declare function assertNoCaptchaInGame(
  html?: Document,
  context?: string,
): void

export declare function assertNoGameUpdateOrBlockedRequest(
  html?: Document,
  options?: {
    context?: string
  },
): void

export declare function normalizeDateTwString(
  value?: string,
  options?: {
    host?: string | null
    doc?: Document
  },
): string | null

export declare function initUnitdata(): Promise<Record<string, any> | null>

export declare function getUnitData(): Record<string, any> | null

export declare function travelSecond(distance: number, unit: string): number

export declare function incomingUnitSlow(
  arrivalSecond: number,
  distance: number,
): string

export declare function searchPlayerImageUrl(
  doc?: Document,
): string | undefined

export declare const ProtectingBot: {
  type: string
  dsBody(html?: Document): Element | null
  error(): Error
  'bot-protection-quest': { active(html?: Document, win?: Window): boolean }
  'bot-protect': { active(html?: Document, win?: Window): boolean }
  'hCaptcha-in-page': { active(html?: Document, win?: Window): boolean }
  'hCaptcha-in-popup': { active(html?: Document, win?: Window): boolean }
  'bot-protect-all-in-game': { active(html?: Document, win?: Window): boolean }
}
