export type CoordLike =
  | string
  | {
      x: number | string
      y: number | string
    }

export declare class Distance {
  private constructor(base: { x: number | string; y: number | string })

  static create(base: CoordLike): Distance

  calc(coord: CoordLike): number

  round(coord: CoordLike): number

  get(): {
    x: number
    y: number
  }
}

export interface GetParamsUrlResult {
  href?: string
  origin?: string
  hostname?: string | null
  pathname?: string
  sessionExpired?: string | null
  screen?: string | null
  mode?: string | null
  targetId?: number | null
  villageId?: number | null
  t?: number | null
  isTryConfirm?: boolean
  isIntro?: boolean
  groupId?: number | null
  page?: number | null
  isMdf?: boolean
  isInGame?: boolean
  isPortalPage?: boolean
  isInLogin?: boolean
}

export interface ParsedGameData {
  player?: Record<string, unknown>
  village?: Record<string, unknown>
  [key: string]: unknown
}

export interface ResolvePreparedBaseUrlArgs {
  preparedEntryPattern?: RegExp
  assetOrigin?: string | null
  extensionAssetOrigin?: string | null
  assetBasePath?: string | null
  currentScript?: {
    src?: string | null
  } | null
  scripts?: ArrayLike<{
    src?: string | null
  }> | Iterable<{
    src?: string | null
  }> | null
}

export declare function getParamsUrl(
  base?: string,
  origin?: string,
): GetParamsUrlResult

export declare function parseGameData(
  htmlText?: string,
): ParsedGameData | undefined

export declare function setInputDateTime(
  cDate: string,
  cTime: string,
  cMs?: string | number | null,
): string

export declare function nDateTime(
  date: string,
  time?: string,
  ms?: string | number | null,
): number

export declare function nSecStrTime(s?: number): string

export declare function cTimeToSeg(cHora: string): number

export declare function strTimeToSec(string: string): number | null

export declare function random(min: number, max: number): number

export declare const DEFAULT_PREPARED_ENTRY_PATTERN: RegExp

export declare function shouldUseExtensionAssetOrigin(
  assetOrigin?: string | null,
): boolean

export declare function resolvePreparedBaseUrl(
  args?: ResolvePreparedBaseUrlArgs,
): string | null

export declare function syncPreparedBaseUrl(
  preparedBaseUrl?: string | null,
  key?: string,
  scope?: Record<string, unknown> | null,
): void
