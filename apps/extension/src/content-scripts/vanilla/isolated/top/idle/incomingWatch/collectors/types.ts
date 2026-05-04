export type IncomingAttackEntry = {
  power: string | null
  ticket: string | null
  currentComment: string | null
  attacker: string | null
  attackerID: string | null
  attackerCoord: string | null
  attackerVillageID: string | null
  arrival: number | null
  taggedAt: number | null
}

export type IncomingVillageState = {
  name: string | null
  coord: string | null
  comingAttack: Record<string, IncomingAttackEntry>
}

export type IncomingState = {
  lastIncomingCount: number
  villages: Record<string, IncomingVillageState>
}

export type IncomingNotifyRow = {
  power: string | null
  ticket: string | null
  targetVillageId: string | null
  targetVillageName: string | null
  sourceName: string | null
  sourceVillageName: string | null
  arrivalText: string | null
  arrival: number | null
}

export type IncomingVillageSummary = {
  id: number
  name: string | null
  coord: string | null
  label: string | null
}

export type IncomingArrivalData = {
  arrivalText: string
  arrival: number
  arrivalParts: string[]
}

export type IncomingTravelMeta = {
  distance: number
  travelSeconds: number
  unitSlower: string
  travel: number
}

export type IncomingCollectorResult = {
  state: IncomingState
  notifyData: IncomingNotifyRow[]
  newAttack: number
  newSnob: number
}

export type IncomingCollectorContext = {
  getDoc: (
    screen: string,
    villageId?: string | number | null,
    options?: { signal?: AbortSignal },
  ) => Promise<Document>

  /**
   * Usado apenas no caminho premium.
   *
   * Quando existe mais de 1000 comandos chegando, o premium:
   * - busca page=-1;
   * - detecta page_size atual;
   * - altera page_size para 1000, se necessário;
   * - busca as páginas extras.
   */
  postChangePageSize?: (
    pageSize: number | null,
    screen: string,
    newPageSize?: number,
    options?: { signal?: AbortSignal },
  ) => Promise<void>

  readIncomingState: () => Promise<IncomingState>

  normalizeIncomingVillageState: (value?: any) => IncomingVillageState
  normalizeIncomingAttackEntry: (value?: any) => IncomingAttackEntry
  pruneExpiredIncomingState: (state: IncomingState) => IncomingState

  collectIncomingVillages: (html: Document) => IncomingVillageSummary[]

  attackPower: (row: Element) => string | null
  normalizeInlineText: (value?: string) => string

  parseArrivalData: (arrivalText?: string) => IncomingArrivalData | null
  resolveIncomingTravelMeta: (args: {
    sourceCoord?: string
    targetCoord?: string
    travelText?: string
  }) => IncomingTravelMeta | null

  buildIncomingTicket: (args: {
    arrivalParts?: string[] | null
    travel?: number
    unitSlower?: string
    currentComment?: string | null
  }) => string | null

  logIncomingWatchAttackIdentified?: (args: {
    commandId: string
    power: string | null
    attacker: string | null
    attackerCoord: string | null
    targetVillageName: string | null
    targetVillageId: string | null
    arrivalText: string | null
    ticket: string | null
  }) => void
}
