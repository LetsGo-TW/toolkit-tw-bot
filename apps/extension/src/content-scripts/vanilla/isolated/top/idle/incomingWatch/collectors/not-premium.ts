import type {
  IncomingCollectorContext,
  IncomingCollectorResult,
  IncomingNotifyRow,
} from './types'

/**
 * Caminho NÃO premium.
 *
 * Mantém o fluxo atual que já funciona:
 * - overview_villages
 * - overview de cada vila com incoming
 * - #commands_incomings
 * - info_command de cada comando novo
 *
 * Este collector só coleta/normaliza e atualiza o state em memória.
 * Quem persiste, envia notify e chama queue-apply continua sendo o runtime/index.
 */
export async function collectNotPremiumIncomings(
  ctx: IncomingCollectorContext,
): Promise<IncomingCollectorResult> {
  const overviewVillagesHtml = await ctx.getDoc('overview_villages')
  const incomingVillages = ctx.collectIncomingVillages(overviewVillagesHtml)
  const incomingVillageIdSet = new Set(incomingVillages.map(({ id }) => String(id)))
  const state = await ctx.readIncomingState()
  const notifyData: IncomingNotifyRow[] = []
  let newAttack = 0
  let newSnob = 0

  Object.keys(state.villages).forEach((villageId) => {
    if (!incomingVillageIdSet.has(villageId)) {
      delete state.villages[villageId]
    }
  })

  if (!incomingVillages.length) {
    const totalRaw = Number(document.querySelector('#incomings_amount')?.textContent)
    state.lastIncomingCount = Number.isFinite(totalRaw) ? totalRaw : 0

    return {
      state,
      notifyData,
      newAttack,
      newSnob,
    }
  }

  for (const incomingVillage of incomingVillages) {
    const villageId = String(incomingVillage.id)
    const previousVillageState = state.villages[villageId] || ctx.normalizeIncomingVillageState()
    const nextVillageState = ctx.normalizeIncomingVillageState({
      ...previousVillageState,
      name: incomingVillage.name ?? previousVillageState.name,
      coord: incomingVillage.coord ?? previousVillageState.coord,
    })

    const overviewHtml = await ctx.getDoc('overview', villageId)
    const commandsTable = overviewHtml.querySelector('#commands_incomings')

    if (!commandsTable) {
      delete state.villages[villageId]
      continue
    }

    const comingAttack = { ...nextVillageState.comingAttack }
    const arrAttackID = Array.from(commandsTable.querySelectorAll('tr.command-row'))
      .reduce((arr, row) => {
        const power = ctx.attackPower(row)
        const attId = String((row.querySelector('span.quickedit') as HTMLElement | null)?.dataset?.id || '').trim()
        const currentComment = ctx.normalizeInlineText(
          row.querySelector('span.quickedit-label')?.textContent
          || row.querySelector('span.quickedit-content')?.textContent
          || '',
        )

        if (!attId) return arr

        arr.push({
          attId,
          power,
          currentComment: currentComment || null,
        })

        return arr
      }, [] as Array<{ attId: string; power: string | null; currentComment: string | null }>)

    Object.keys(comingAttack).forEach((commandId) => {
      if (!arrAttackID.find(({ attId }) => Number(attId) === Number(commandId))) {
        delete comingAttack[commandId]
      }
    })

    for (const { attId, power, currentComment } of arrAttackID) {
      if (Object.prototype.hasOwnProperty.call(comingAttack, attId)) continue

      const infoCommandHtml = await ctx.getDoc(`info_command&id=${attId}&type=other`, villageId)
      const rows = Array.from(
        infoCommandHtml.querySelector('#content_value > table.vis > tbody')?.querySelectorAll?.('tr') || [],
      )

      if (rows.length < 3) continue

      const row1Cells = Array.from(rows[1]?.querySelectorAll('td') || [])
      const row2Cells = Array.from(rows[2]?.querySelectorAll('td') || [])
      const lastPlayerCell = row1Cells[row1Cells.length - 1]
      const lastVillageCell = row2Cells[row2Cells.length - 1]

      const attacker = ctx.normalizeInlineText(lastPlayerCell?.textContent || '')
      const attackerID = String(lastPlayerCell?.querySelector?.('a')?.href?.split('=')?.pop() || '').trim() || null
      const attackerVillageName = ctx.normalizeInlineText(lastVillageCell?.textContent || '')
      const attackerCoord = attackerVillageName.match(/\d+\|\d+/ig)?.[0] || null
      const attackerVillageID = String(lastVillageCell?.querySelector?.('a')?.href?.split('=')?.pop() || '').trim() || null
      const defenderCoord = nextVillageState.coord || incomingVillage.coord || null
      const defenderVillageName = ctx.normalizeInlineText(
        nextVillageState.name || incomingVillage.name || incomingVillage.label || `Vila ${villageId}`,
      )

      const regExp = /(?:\([0-9]{2}:[0-9]{2}:[0-9]{2}\):[0-9]{3}|[0-9]{2}:[0-9]{2}:[0-9]{2}:[0-9]{3})$/ig
      const index = rows.reduce<number | null>((ind, row, i) => {
        if (String(row.textContent || '').match(regExp)) {
          return i
        }

        return ind
      }, null)

      if (index == null || !rows[index] || !rows[index + 1] || !defenderCoord || !attackerCoord) {
        continue
      }

      const arrivalText = String(Array.from(rows[index].querySelectorAll('td'))[1]?.textContent || '').trim()
      const arrivalData = ctx.parseArrivalData(arrivalText)
      if (!arrivalData) continue

      const { arrival, arrivalParts } = arrivalData
      const travelText = String(rows[index + 1]?.querySelectorAll('td')?.[1]?.textContent || '').trim()
      const travelMeta = ctx.resolveIncomingTravelMeta({
        sourceCoord: attackerCoord,
        targetCoord: defenderCoord,
        travelText,
      })

      if (!travelMeta) continue

      const { unitSlower, travel } = travelMeta
      const ticket = ctx.buildIncomingTicket({
        arrivalParts,
        travel,
        unitSlower,
        currentComment,
      })

      if (!ticket) continue

      comingAttack[attId] = {
        ...ctx.normalizeIncomingAttackEntry(),
        power,
        ticket,
        currentComment: currentComment || null,
        attacker,
        attackerID,
        attackerCoord,
        attackerVillageID,
        arrival,
      }

      ctx.logIncomingWatchAttackIdentified?.({
        commandId: attId,
        power,
        attacker,
        attackerCoord,
        targetVillageName: defenderVillageName,
        targetVillageId: villageId,
        arrivalText,
        ticket,
      })

      newAttack++
      if (unitSlower === 'snob') newSnob++

      notifyData.push({
        power,
        ticket,
        targetVillageId: villageId,
        targetVillageName: defenderVillageName,
        sourceName: attacker,
        sourceVillageName: attackerVillageName,
        arrivalText,
        arrival,
      })
    }

    nextVillageState.comingAttack = ctx.pruneExpiredIncomingState({
      lastIncomingCount: state.lastIncomingCount,
      villages: {
        [villageId]: {
          ...nextVillageState,
          comingAttack,
        },
      },
    }).villages[villageId]?.comingAttack || {}

    state.villages[villageId] = ctx.normalizeIncomingVillageState(nextVillageState)
  }

  const totalRaw = Number(document.querySelector('#incomings_amount')?.textContent)
  state.lastIncomingCount = Number.isFinite(totalRaw) ? totalRaw : state.lastIncomingCount

  return {
    state,
    notifyData,
    newAttack,
    newSnob,
  }
}
