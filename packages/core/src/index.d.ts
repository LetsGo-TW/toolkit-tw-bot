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
  isInLogin?: boolean
}

export interface ParsedGameData {
  player?: Record<string, unknown>
  village?: Record<string, unknown>
  [key: string]: unknown
}

export declare function getParamsUrl(
  base?: string,
  origin?: string,
): GetParamsUrlResult

export declare function parseGameData(
  htmlText?: string,
): ParsedGameData | undefined
