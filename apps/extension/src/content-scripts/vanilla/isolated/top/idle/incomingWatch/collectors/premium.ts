import type {
  IncomingCollectorContext,
  IncomingCollectorResult,
  IncomingNotifyRow,
} from './types'

type PremiumIncomingRow = {
  commandId: string
  power: string | null
  currentComment: string | null
  targetVillageId: string | null
  targetVillageName: string | null
  targetCoord: string | null
  sourceName: string | null
  sourceVillageName: string | null
  sourceVillageId: string | null
  sourceCoord: string | null
  arrivalText: string | null
  travelText: string | null
}

const PREMIUM_INCOMINGS_BASE_SCREEN = 'overview_villages&mode=incomings&type=all&subtype=attacks&group=0'
const PREMIUM_DEFAULT_INCOMING_MARKERS = new Set(['atac', 'attack', 'ataque', 'attacco'])

function normalizeMarkerText(value = '') {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s|:]/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}

function hasTicketDetails(value = '') {
  return /[|]\s*(r|send|sent|envio|enviado|bt|backtime|retorno|volta|registrado|registered)\s*:/i.test(String(value || ''))
    || String(value || '').includes('🚀')
    || String(value || '').includes('🏠')
    || String(value || '').includes('📝')
}

function normalizeComparableComment(value = '') {
  return String(value || '')
    .replace(/\s*[\r\n]+\s*/g, ' ')
    .replace(/\s*\|\s*/g, ' | ')
    .replace(/\s{2,}/g, ' ')
    .trim()
    .toLowerCase()
}

function isAutoTaggableIncomingComment(value = '') {
  const normalized = normalizeMarkerText(value)
  if (hasTicketDetails(value)) return false
  if (!normalized) return true

  const [marker = ''] = normalized.split(/\s+/)
  return PREMIUM_DEFAULT_INCOMING_MARKERS.has(marker)
}

function parseHrefParam(href = '', params: string[] = []) {
  try {
    const url = new URL(String(href || ''), window.location.origin)

    for (const param of params) {
      const value = String(url.searchParams.get(param) || '').trim()
      if (value) return value
    }

    return null
  } catch {
    return null
  }
}

function getCellCoord(cell: Element | null) {
  return String(cell?.textContent || '').match(/\d+\|\d+/ig)?.[0] || null
}

function getRowCoords(row: Element) {
  return String(row.textContent || '').match(/\d+\|\d+/ig) || []
}

function findCellWithHref(cells: Element[], needle: string) {
  return cells.find((td) => Boolean(td.querySelector?.(`a[href*="${needle}"]`))) || null
}

function findVillageCells(cells: Element[]) {
  return cells.filter((td) => /\d+\|\d+/ig.test(String(td.textContent || '')))
}

function findArrivalCell(cells: Element[]) {
  return cells[5]
    || cells.find((td) => /[0-9]{2}:[0-9]{2}:[0-9]{2}/ig.test(String(td.textContent || '')))
    || null
}

function isTravelDurationText(value = '') {
  const normalized = String(value || '').trim()
  if (!normalized) return false
  if (/[0-9]{3}$/i.test(normalized)) return false
  if (/[./-]/.test(normalized)) return false
  return /^[0-9]{1,2}:[0-9]{2}:[0-9]{2}$/i.test(normalized)
}

function findTravelCell(cells: Element[], arrivalCell: Element | null) {
  const indexedCell = cells[6] || null

  if (indexedCell && indexedCell !== arrivalCell && isTravelDurationText(indexedCell.textContent || '')) {
    return indexedCell
  }

  return cells.find((td) => td !== arrivalCell && isTravelDurationText(td.textContent || '')) || indexedCell
}

function readCurrentComment(row: Element, cells: Element[], ctx: IncomingCollectorContext) {
  return ctx.normalizeInlineText(
    row.querySelector('span.quickedit-label')?.textContent
    || row.querySelector('span.quickedit-content')?.textContent
    || cells[0]?.querySelector?.('span.quickedit-label')?.textContent
    || cells[0]?.querySelector?.('span.quickedit-content')?.textContent
    || cells[0]?.textContent
    || '',
  )
}

function parsePremiumIncomingRow(
  row: Element,
  ctx: IncomingCollectorContext,
): PremiumIncomingRow | null {
  const cells = Array.from(row.querySelectorAll('td'))
  if (!cells.length) return null

  const quickedit = cells[0]?.querySelector?.('span.quickedit')
    || row.querySelector?.('span.quickedit')

  const commandId = String((quickedit as HTMLElement | null)?.dataset?.id || '').trim()
  if (!commandId) return null

  const coords = getRowCoords(row)
  const targetCoord = String(coords[0] || '').trim() || null
  const sourceCoord = String(coords[1] || '').trim() || null
  if (!targetCoord || !sourceCoord) return null

  const villageCells = findVillageCells(cells)
  const targetVillageCell = villageCells[0] || null
  const sourceVillageCell = villageCells[1] || null

  const targetVillageName = ctx.normalizeInlineText(targetVillageCell?.textContent || '')
  const sourceVillageName = ctx.normalizeInlineText(sourceVillageCell?.textContent || '')

  const targetVillageLink =
    targetVillageCell?.querySelector?.('a[href*="info_village"]')
    || targetVillageCell?.querySelector?.('a[href*="village="]')
    || cells[1]?.querySelector?.('a[href*="village="]')
    || cells[1]?.querySelector?.('a[href*="id="]')

  const targetVillageId = parseHrefParam(
    (targetVillageLink as HTMLAnchorElement | null)?.href || '',
    ['village', 'id'],
  )

  const sourceVillageLink =
    sourceVillageCell?.querySelector?.('a[href*="info_village"]')
    || sourceVillageCell?.querySelector?.('a[href*="id="]')

  const sourceVillageId = parseHrefParam(
    (sourceVillageLink as HTMLAnchorElement | null)?.href || '',
    ['id', 'village'],
  )

  const sourcePlayerCell = findCellWithHref(cells, 'info_player')
  const sourceName = ctx.normalizeInlineText(sourcePlayerCell?.textContent || '')

  const arrivalCell = findArrivalCell(cells)
  const arrivalText = String(arrivalCell?.textContent || '').trim() || null

  const travelCell = findTravelCell(cells, arrivalCell)
  const travelText = String(travelCell?.textContent || '').trim() || null

  const currentComment = readCurrentComment(row, cells, ctx)

  return {
    commandId,
    power: ctx.attackPower(row),
    currentComment: currentComment || null,
    targetVillageId,
    targetVillageName: targetVillageName || null,
    targetCoord: getCellCoord(targetVillageCell) || targetCoord,
    sourceName: sourceName || null,
    sourceVillageName: sourceVillageName || null,
    sourceVillageId: sourceVillageId || null,
    sourceCoord: getCellCoord(sourceVillageCell) || sourceCoord,
    arrivalText,
    travelText,
  }
}

function collectPremiumIncomingRowsFromDocument(
  html: Document,
  ctx: IncomingCollectorContext,
) {
  const directRows = Array.from(html.querySelectorAll('#incomings_table > tbody tr.nowrap'))
  const sourceRows = directRows.length
    ? directRows
    : Array.from(html.querySelectorAll('#incomings_table > tbody tr'))
      .filter((row) => Boolean(row.querySelector('span.quickedit')))

  return sourceRows
    .map((row) => parsePremiumIncomingRow(row, ctx))
    .filter((row): row is PremiumIncomingRow => row !== null)
}

/**
 * Descobre todas as páginas disponíveis da tela premium de incomings.
 *
 * O Tribal Wars usa page indexado a partir de 0.
 * Exemplo:
 * - se aparecer page=0, page=1 e page=2, então são 3 páginas.
 *
 * Se não encontrar paginação, retorna [0].
 */
function resolvePremiumIncomingPages(html: Document) {
  const pages = Array.from(html.querySelectorAll('a[href*="page="]'))
    .map((anchor) => parseHrefParam((anchor as HTMLAnchorElement).href, ['page']))
    .map((page) => Number(page))
    .filter((page) => Number.isFinite(page) && page >= 0)

  if (!pages.length) return [0]

  const maxPage = Math.max(...pages)
  return Array.from({ length: maxPage + 1 }, (_, page) => page)
}

async function collectPremiumIncomingRowsFromAllPages(
  ctx: IncomingCollectorContext,
) {
  /**
   * Primeiro buscamos com page=-1 porque essa era a entrada usada no script antigo
   * e geralmente traz a primeira tela/listagem com a paginação disponível.
   */
  const firstHtml = await ctx.getDoc(`${PREMIUM_INCOMINGS_BASE_SCREEN}&page=-1`)
  const rowsByCommandId = new Map<string, PremiumIncomingRow>()

  collectPremiumIncomingRowsFromDocument(firstHtml, ctx).forEach((row) => {
    rowsByCommandId.set(row.commandId, row)
  })

  const pages = resolvePremiumIncomingPages(firstHtml)

  console.log(
    `%c[incoming-watch:premium] Páginas de incoming encontradas: ${pages.length} | Pages: ${pages.join(', ')}`,
    'color: red; font-weight: bold;',
  )

  /**
   * Agora busca TODAS as páginas encontradas.
   *
   * Mesmo se page=-1 já trouxe parte/tudo, usamos Map por commandId
   * para deduplicar e garantir consistência.
   */
  for (const page of pages) {
    const html = await ctx.getDoc(`${PREMIUM_INCOMINGS_BASE_SCREEN}&page=${page}`)

    collectPremiumIncomingRowsFromDocument(html, ctx).forEach((row) => {
      rowsByCommandId.set(row.commandId, row)
    })
  }

  return Array.from(rowsByCommandId.values())
}

/**
 * Caminho premium.
 *
 * No premium a coleta vem da tela global de incomings:
 * overview_villages&mode=incomings&type=all&subtype=attacks&group=0&page=-1
 *
 * Depois busca todas as páginas encontradas na paginação:
 * page=0, page=1, page=2...
 *
 * Aqui NÃO editamos ticket direto no CS.
 * Apenas coletamos, normalizamos e atualizamos o state em memória.
 * A aplicação do ticket continua sendo decisão do SW/outro fluxo.
 */
export async function collectPremiumIncomings(
  ctx: IncomingCollectorContext,
): Promise<IncomingCollectorResult> {
  const state = await ctx.readIncomingState()
  const notifyData: IncomingNotifyRow[] = []
  let newAttack = 0
  let newSnob = 0

  const currentCount = Number(document.querySelector('#incomings_amount')?.textContent || 0)
  const rows = await collectPremiumIncomingRowsFromAllPages(ctx)

  console.log(
    `%c[incoming-watch:premium] Comandos coletados nas páginas: ${rows.length}`,
    'color: red; font-weight: bold;',
  )

  const seenVillageIds = new Set<string>()
  const seenCommandIdsByVillage = new Map<string, Set<string>>()

  for (const row of rows) {
    const {
      commandId,
      power,
      currentComment,
      targetVillageId,
      targetVillageName,
      targetCoord,
      sourceName,
      sourceVillageName,
      sourceVillageId,
      sourceCoord,
      arrivalText,
      travelText,
    } = row

    if (!targetVillageId || !targetCoord || !sourceCoord || !arrivalText || !travelText) {
      continue
    }

    seenVillageIds.add(targetVillageId)

    if (!seenCommandIdsByVillage.has(targetVillageId)) {
      seenCommandIdsByVillage.set(targetVillageId, new Set())
    }

    seenCommandIdsByVillage.get(targetVillageId)?.add(commandId)

    const previousVillageState = state.villages[targetVillageId] || ctx.normalizeIncomingVillageState()
    const nextVillageState = ctx.normalizeIncomingVillageState({
      ...previousVillageState,
      name: targetVillageName ?? previousVillageState.name,
      coord: targetCoord ?? previousVillageState.coord,
    })

    const comingAttack = { ...nextVillageState.comingAttack }
    const existingEntry = comingAttack[commandId] ? ctx.normalizeIncomingAttackEntry(comingAttack[commandId]) : null

    const arrivalData = ctx.parseArrivalData(arrivalText)
    const travelMeta = ctx.resolveIncomingTravelMeta({
      sourceCoord,
      targetCoord,
      travelText,
    })
    const canBuildTicket = Boolean(arrivalData && travelMeta && isAutoTaggableIncomingComment(currentComment || ''))

    if (!existingEntry && !canBuildTicket) {
      state.villages[targetVillageId] = ctx.normalizeIncomingVillageState({
        ...nextVillageState,
        comingAttack,
      })
      continue
    }

    const ticket = existingEntry?.ticket || (
      arrivalData && travelMeta
        ? ctx.buildIncomingTicket({
          arrivalParts: arrivalData.arrivalParts,
          travel: travelMeta.travel,
          unitSlower: travelMeta.unitSlower,
          currentComment,
        })
        : null
    )

    if (!ticket) {
      state.villages[targetVillageId] = ctx.normalizeIncomingVillageState({
        ...nextVillageState,
        comingAttack,
      })
      continue
    }

    const isNewEntry = !existingEntry?.ticket
    const pageHasTaggedTicket = hasTicketDetails(currentComment || '')
    const pageTicketMatches = pageHasTaggedTicket
      && normalizeComparableComment(currentComment || '') === normalizeComparableComment(ticket)

    comingAttack[commandId] = {
      ...ctx.normalizeIncomingAttackEntry(existingEntry),
      power,
      ticket,
      currentComment: currentComment || null,
      attacker: sourceName,
      attackerID: null,
      attackerCoord: sourceCoord,
      attackerVillageID: sourceVillageId,
      arrival: arrivalData?.arrival ?? existingEntry?.arrival ?? null,
      // No premium, só consideramos concluído quando o comentário retornado
      // pela própria página bate com o ticket esperado.
      taggedAt: pageTicketMatches
        ? existingEntry?.taggedAt ?? Date.now()
        : null,
    }

    if (isNewEntry && arrivalData && travelMeta) {
      ctx.logIncomingWatchAttackIdentified?.({
        commandId,
        power,
        attacker: sourceName,
        attackerCoord: sourceCoord,
        targetVillageName,
        targetVillageId,
        arrivalText,
        ticket,
      })

      newAttack++
      if (travelMeta.unitSlower === 'snob') newSnob++

      notifyData.push({
        power,
        ticket,
        targetVillageId,
        targetVillageName,
        sourceName,
        sourceVillageName,
        arrivalText,
        arrival: arrivalData.arrival,
      })
    }

    nextVillageState.comingAttack = comingAttack
    state.villages[targetVillageId] = ctx.normalizeIncomingVillageState(nextVillageState)
  }

  Object.entries(state.villages).forEach(([villageId, villageState]) => {
    if (!seenVillageIds.has(villageId)) {
      delete state.villages[villageId]
      return
    }

    const seenCommandIds = seenCommandIdsByVillage.get(villageId) || new Set<string>()

    Object.keys(villageState.comingAttack).forEach((commandId) => {
      if (!seenCommandIds.has(commandId)) {
        delete villageState.comingAttack[commandId]
      }
    })

    if (!Object.keys(villageState.comingAttack).length && !villageState.name && !villageState.coord) {
      delete state.villages[villageId]
    }
  })

  state.lastIncomingCount = Number.isFinite(currentCount) ? currentCount : state.lastIncomingCount

  return {
    state: ctx.pruneExpiredIncomingState(state),
    notifyData,
    newAttack,
    newSnob,
  }
}
