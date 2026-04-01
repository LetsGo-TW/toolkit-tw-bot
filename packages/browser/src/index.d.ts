import type { ParsedGameData } from '@toolkit-tw-bot/core'

export declare function getGameData(
  doc?: Document,
): ParsedGameData | undefined

export declare function searchPlayerImageUrl(
  doc?: Document,
): string | undefined

export declare function combineAbortControllerSignals(
  signals?: Array<AbortSignal | null | undefined>,
): AbortSignal

export declare function makeAjaxHeadersPost(): Headers
export declare function makeAjaxHeadersGet(): Headers
export declare function makeAjaxHeadersGetDoc(): Headers
export declare function makeAjaxBody(
  payload?: Array<[string, string | number | null | undefined]> | Record<string, unknown>,
): URLSearchParams

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
