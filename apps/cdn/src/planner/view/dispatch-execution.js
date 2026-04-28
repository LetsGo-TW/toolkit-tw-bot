export async function executePlannerDispatchAction({
  mode,
  getContext,
  root,
  deps = {}
} = {}) {
  const {
    UI,
    activeTargetsDraftIdCurrent,
    applyDistributionStatusToTarget,
    applyDistributionStatusToTargets,
    applySentUnitsToSendersAndTable,
    applyTargetSendResultStatus,
    beginPlannerSendExecution,
    buildCaptchaInterruptedDiagnostics,
    buildCurrentTargetDistributePayload,
    buildDispatchDiagnosticsFormatItemFromStatus,
    buildMultiDistributeCommandsByTarget,
    buildMultiTargetsDistributePayload,
    buildOptimizedDistributionDebugSummary,
    buildPendingSendCommandId,
    buildPlayerNightMoralStateMetaPayload,
    buildSinglePendingSendCommands,
    buildTargetDispatchAggregateEntry,
    buildWorldNightConfigMetaPayload,
    calcContinentFromCoords,
    clearPlannerPendingSendSession,
    collectPendingSendCommandIds,
    consoleDev,
    createMultiTargetScopedExecutionView,
    endPlannerSendExecution,
    ensureDispatchNightMoralPreflight,
    executionFeedController,
    formatDispatchDiagnosticsBatchLocal,
    getCurrentTargetRequestedQtyFromContext,
    getMultiTargetsExecutionPlan,
    getTargetDispatchStatus,
    getTargetListKey,
    loadPlannerExecutionModule,
    nightBonusConfig,
    persistPlannerTargetsDraftFromNavigatorState,
    plannerSendRunning,
    plannerTargetCurrent,
    postCommandDistribute,
    recoverUnexpectedInterruptionBeforeNextExecution,
    refreshIncomingTargetIfOpen,
    removePlannerPendingSendCommands,
    rerenderTargetsNavigatorRowsCurrent,
    resolveTargetNightBonusConfigFromStateOrCache,
    savePlannerLastDistributionReport,
    savePlannerLastExecutionReport,
    savePlannerLastMultiDispatchReport,
    sendersDataCurrent,
    setTargetDispatchStatus,
    shouldUseCurrentTargetDistribution,
    startPlannerPendingSendSession,
    syncCurrentPlannerTargetDispatchStatusUi,
    targetsNavigatorMetaByKey
  } = deps

if (plannerSendRunning.is_active('plannerSend') || plannerSendRunning.is_active('plannerSendPreempt')) {
  UI?.InfoMessage?.('Envio do planner já está em execução.')
  return
}

let plannerSendLocked = false
try {
  await recoverUnexpectedInterruptionBeforeNextExecution?.()
  const context = getContext()
  const reportStartedAtMs = Date.now()
  const reportId = `planner-report-${reportStartedAtMs}`
  if (mode === 'send' && context?.targetScope === 'multi') {
  const multiPlan = context?.multiTargetsPlan || getMultiTargetsExecutionPlan()
  if (!Array.isArray(multiPlan?.items) || multiPlan.items.length <= 0) {
    UI?.ErrorMessage?.('Defina quantidade > 0 em pelo menos 1 alvo.')
    return
  }
  try {
    const preflight = await ensureDispatchNightMoralPreflight(context)
    if (preflight?.attempted && preflight.failed > 0) {
      UI?.InfoMessage?.(`BN preflight: ${preflight.resolved}/${preflight.total} player(s) resolvidos.`)
    }
  } catch (preflightError) {
    console.error('[planner:dispatch:multi:bn-preflight]', preflightError)
  }
  context.worldNightConfig = buildWorldNightConfigMetaPayload()
  context.playerNightMoralState = buildPlayerNightMoralStateMetaPayload()
  const payload = buildMultiTargetsDistributePayload(context)
  if (!Array.isArray(payload?.senders) || payload.senders.length <= 0) {
    UI?.ErrorMessage?.('Selecione vilas válidas (com coordenadas) para distribuir.')
    return
  }
  if (!Array.isArray(payload?.targets) || payload.targets.length <= 0) {
    UI?.ErrorMessage?.('Defina targets com qty > 0 para distribuir.')
    return
  }
  const templateValid = Boolean(context?.templateStats?.validation?.isValid && context?.templateStats?.template)
  if (!templateValid) {
    UI?.ErrorMessage?.('Modelo inválido para distribuição. Ajuste o template.')
    return
  }
  consoleDev({
    event: 'planner:dispatch:multi:pending',
    mode,
    totalCommands: multiPlan.totalCommands,
    activeTargets: multiPlan.activeTargets,
    items: multiPlan.items,
    executeConfirmOptions: context?.executeConfirmOptions || {},
    payload
  }, { label: '[planner:dispatch]' })
  executionFeedController?.hide?.()
  executionFeedController?.clear?.()
  const requestedTotalForFeed = Array.isArray(payload?.targets)
    ? payload.targets.reduce((sum, target) => sum + Math.max(0, Math.floor(Number(target?.qty) || 0)), 0)
    : Math.max(0, Math.floor(Number(multiPlan?.totalCommands) || 0))
  try {
    let distributeResponse = null
    executionFeedController?.startDuration?.('distribution')
    try {
      distributeResponse = await postCommandDistribute({
        payload
      })
    } finally {
      executionFeedController?.stopDuration?.('distribution')
    }
    consoleDev({
      event: 'planner:dispatch:multi:response',
      response: distributeResponse,
      optimizedDebug: buildOptimizedDistributionDebugSummary(distributeResponse)
    }, { label: '[planner:dispatch]' })
    await savePlannerLastDistributionReport({
      context,
      plannerTarget: plannerTargetCurrent,
      payload,
      response: distributeResponse,
      reportId,
      startedAtMs: reportStartedAtMs
    })
    applyDistributionStatusToTargets(distributeResponse)

    const requestedCount = Number(distributeResponse?.meta?.requestedCount || multiPlan.totalCommands || 0)
    const assignedCount = Number(distributeResponse?.meta?.assignedCount || distributeResponse?.meta?.commandsCount || 0)
    const unfilledCount = Number(distributeResponse?.meta?.unfilledRequestedCount || Math.max(0, requestedCount - assignedCount))
    const noTimeCount = Number(distributeResponse?.meta?.noTimeCount || 0)

    const summary = [
      `Distribuição: ${assignedCount}/${requestedCount}`,
      unfilledCount > 0 ? `faltam ${unfilledCount}` : null,
      noTimeCount > 0 ? `BN bloqueou ${noTimeCount}` : null
    ].filter(Boolean).join(' | ')

    if (assignedCount <= 0) {
      UI?.ErrorMessage?.(summary || 'Nenhum comando foi distribuído.')
      return
    }

    const groupedCommands = buildMultiDistributeCommandsByTarget(distributeResponse)
    if (!groupedCommands.length) {
      UI?.ErrorMessage?.('Distribuição retornou vazia para envio.')
      return
    }
    let plannerExecutionApi = null
    try {
      plannerExecutionApi = await loadPlannerExecutionModule()
    } catch (executionModuleError) {
      console.error('[planner:dispatch:multi:executor-load]', executionModuleError)
      UI?.ErrorMessage?.('Erro ao carregar executor do planner.')
      return
    }

    if (!plannerSendLocked) {
      plannerSendLocked = beginPlannerSendExecution()
      if (!plannerSendLocked) {
        UI?.InfoMessage?.('Envio do planner já está em execução.')
        return
      }
    }

    await startPlannerPendingSendSession({
      reportId,
      draftId: activeTargetsDraftIdCurrent,
      commands: Array.isArray(distributeResponse?.commands) ? distributeResponse.commands : []
    })

    executionFeedController?.start?.({
      total: Math.max(0, Math.floor(Number(assignedCount) || Number(requestedTotalForFeed) || 0)),
      title: `Distribuindo ${requestedTotalForFeed} comando(s) para múltiplos alvos`,
      targetName: 'Todos os Alvos'
    })
    executionFeedController?.setPhase?.({ label: 'Preparando envio multi' })

    const senderByVillageId = new Map(
      (Array.isArray(sendersDataCurrent) ? sendersDataCurrent : [])
        .filter((sender) => Number.isFinite(Number(sender?.villageId)))
        .map((sender) => [Number(sender.villageId), sender])
    )

    const aggregateExecution = {
      success: 0,
      failed: 0,
      total: 0,
      pending: 0,
      captchaErrorCount: 0,
      interruptedByCaptcha: false,
      byTarget: []
    }
    const multiFeedProgress = {
      current: 0,
      total: Math.max(0, Math.floor(Number(assignedCount) || 0)),
      noticeSeq: 0
    }
    executionFeedController?.setProgress?.({
      current: 0,
      total: multiFeedProgress.total
    })
    executionFeedController?.startDuration?.('send')
    try {
      for (let groupIndex = 0; groupIndex < groupedCommands.length; groupIndex += 1) {
          const group = groupedCommands[groupIndex]
          const target = group?.target || null
          const targetKey = getTargetListKey(target)
          const targetMeta = targetsNavigatorMetaByKey.get(targetKey) || {}
          const villageMeta = targetMeta?.village || null
          const playerMeta = targetMeta?.player || null
          const groupCommands = Array.isArray(group?.commands) ? group.commands : []
          const groupPendingCommandIds = collectPendingSendCommandIds(groupCommands)
          const groupSelectedVillageIds = []
          const groupSendersData = []
          const seenVillageIds = new Set()
          let missingSenderCount = 0
          const missingSenderVillageIds = []

          groupCommands.forEach((command) => {
            const sourceVillageId = Number(command?.source?.id ?? command?.source?.villageId)
            if (!Number.isFinite(sourceVillageId) || seenVillageIds.has(sourceVillageId)) return
            seenVillageIds.add(sourceVillageId)
            groupSelectedVillageIds.push(sourceVillageId)
            const sender = senderByVillageId.get(sourceVillageId)
            if (sender) groupSendersData.push(sender)
            else {
              missingSenderCount += 1
              missingSenderVillageIds.push(sourceVillageId)
            }
          })

          const groupPlannerTarget = {
            id: Number.isFinite(Number(target?.id ?? villageMeta?.id)) ? Number(target?.id ?? villageMeta?.id) : null,
            x: Number(target?.x ?? villageMeta?.x),
            y: Number(target?.y ?? villageMeta?.y),
            name: String(villageMeta?.name || target?.name || '').trim() || undefined,
            k: calcContinentFromCoords(Number(target?.x ?? villageMeta?.x), Number(target?.y ?? villageMeta?.y)),
            playerId: Number.isFinite(Number(playerMeta?.id ?? villageMeta?.playerId)) ? Number(playerMeta?.id ?? villageMeta?.playerId) : null
          }

          let executionResult = null
          if (!groupSendersData.length) {
            executionResult = {
              success: 0,
              failed: Math.max(0, groupSelectedVillageIds.length),
              total: Math.max(0, groupSelectedVillageIds.length),
              pending: 0
            }
          } else {
            try {
              const groupContext = {
                ...context,
                targetScope: 'current',
                targetPlayerId: groupPlannerTarget.playerId ?? null,
                nightBonusConfig: resolveTargetNightBonusConfigFromStateOrCache({
                  target: groupPlannerTarget
                }) || null,
                worldNightConfig: buildWorldNightConfigMetaPayload(),
                playerNightMoralState: buildPlayerNightMoralStateMetaPayload({
                  playerIds: [groupPlannerTarget.playerId]
                }),
                selectedVillageIds: groupSelectedVillageIds
              }
              const view = createMultiTargetScopedExecutionView({
                root,
                feedController: executionFeedController,
                createExecutionViewFn: plannerExecutionApi.createExecutionView,
                groupIndex,
                groupTotal: groupedCommands.length,
                groupTarget: groupPlannerTarget,
                aggregateTotal: multiFeedProgress.total,
                progressState: multiFeedProgress
              })
              executionResult = await plannerExecutionApi.executeSendPhases({
                mode: 'send',
                context: groupContext,
                plannerTarget: groupPlannerTarget,
                sendersData: groupSendersData,
                view,
                onResultResolved: (resultItem) => {
                  const sourceVillageId = Number(resultItem?.villageId)
                  if (!Number.isFinite(sourceVillageId)) return
                  void Promise.resolve(removePlannerPendingSendCommands({
                    reportId,
                    commandIds: [`${Number(groupPlannerTarget?.x)}|${Number(groupPlannerTarget?.y)}:${Math.trunc(sourceVillageId)}`]
                  })).catch((error) => {
                    console.error('[planner:dispatch:pending-session:remove]', error)
                  })
                }
              })
            } catch (groupError) {
              console.error('[planner:dispatch:multi:send-group]', {
                target: groupPlannerTarget,
                error: groupError
              })
              UI?.ErrorMessage?.(`Erro no envio para ${groupPlannerTarget?.x}|${groupPlannerTarget?.y}: ${groupError?.message || 'falha'}`)
              executionResult = {
                success: 0,
                failed: Math.max(0, groupSelectedVillageIds.length),
                total: Math.max(0, groupSelectedVillageIds.length),
                pending: 0
              }
            }
          }

          const normalizedGroupResult = {
            success: Math.max(0, Math.floor(Number(executionResult?.success) || 0)),
            failed: Math.max(0, Math.floor(Number(executionResult?.failed) || 0)),
            total: Math.max(0, Math.floor(Number(executionResult?.total) || groupSelectedVillageIds.length || 0)),
            pending: Math.max(0, Math.floor(Number(executionResult?.pending) || 0)),
            interruptedByCaptcha: Boolean(executionResult?.interruptedByCaptcha),
            diagnostics: (executionResult?.diagnostics && typeof executionResult.diagnostics === 'object')
              ? executionResult.diagnostics
              : null,
            sentUnitsByVillageId: Array.isArray(executionResult?.sentUnitsByVillageId) ? executionResult.sentUnitsByVillageId : []
          }
          if (normalizedGroupResult.interruptedByCaptcha && normalizedGroupResult.pending > 0) {
            aggregateExecution.captchaErrorCount += normalizedGroupResult.pending
            normalizedGroupResult.diagnostics = buildCaptchaInterruptedDiagnostics(
              normalizedGroupResult.diagnostics || null,
              normalizedGroupResult.pending
            )
            normalizedGroupResult.failed += normalizedGroupResult.pending
            normalizedGroupResult.pending = 0
          }
          if (missingSenderCount > 0) {
            normalizedGroupResult.failed += missingSenderCount
            normalizedGroupResult.total += missingSenderCount
            const prevDiagnostics = (normalizedGroupResult.diagnostics && typeof normalizedGroupResult.diagnostics === 'object')
              ? normalizedGroupResult.diagnostics
              : {}
            const prevPrep = (prevDiagnostics?.preparation && typeof prevDiagnostics.preparation === 'object')
              ? prevDiagnostics.preparation
              : {}
            normalizedGroupResult.diagnostics = {
              ...prevDiagnostics,
              preparation: {
                ...prevPrep,
                missingSenderCount: Math.max(0, Math.floor(Number(prevPrep?.missingSenderCount) || 0)) + missingSenderCount
              }
            }
          }

          applyTargetSendResultStatus(groupPlannerTarget, normalizedGroupResult)
          applySentUnitsToSendersAndTable(normalizedGroupResult)
          refreshIncomingTargetIfOpen(normalizedGroupResult)
          if (normalizedGroupResult.pending <= 0) {
            await removePlannerPendingSendCommands({
              reportId,
              commandIds: groupPendingCommandIds
            })
          } else {
            const resolvedVillageIds = new Set([
              ...missingSenderVillageIds,
              ...(Array.isArray(executionResult?.results)
                ? executionResult.results
                  .map((item) => Number(item?.villageId))
                  .filter(Number.isFinite)
                : [])
            ])
            const resolvedCommandIds = groupCommands
              .filter((command) => {
                const sourceVillageId = Number(command?.source?.id ?? command?.source?.villageId)
                return Number.isFinite(sourceVillageId) && resolvedVillageIds.has(sourceVillageId)
              })
              .map((command) => buildPendingSendCommandId(command))
              .filter(Boolean)
            await removePlannerPendingSendCommands({
              reportId,
              commandIds: resolvedCommandIds
            })
          }

          aggregateExecution.success += normalizedGroupResult.success
          aggregateExecution.failed += normalizedGroupResult.failed
          aggregateExecution.total += normalizedGroupResult.total
          aggregateExecution.pending += normalizedGroupResult.pending
          if (normalizedGroupResult.interruptedByCaptcha) {
            aggregateExecution.interruptedByCaptcha = true
          }
          aggregateExecution.byTarget.push(buildTargetDispatchAggregateEntry(
            groupPlannerTarget,
            normalizedGroupResult.diagnostics || null
          ))
          if (normalizedGroupResult.interruptedByCaptcha) {
            for (let pendingGroupIndex = groupIndex + 1; pendingGroupIndex < groupedCommands.length; pendingGroupIndex += 1) {
              const pendingGroup = groupedCommands[pendingGroupIndex]
              const pendingTarget = pendingGroup?.target || null
              if (!pendingTarget) continue
              const prevStatus = getTargetDispatchStatus(pendingTarget) || {}
              const remainingQty = Math.max(0, Math.floor(Number(prevStatus?.remainingQty) || 0))
              const distributedQty = Math.max(0, Math.floor(Number(prevStatus?.distributedQty) || 0))
              const captchaFailedQty = Math.max(
                Math.max(0, Math.floor(Number(prevStatus?.sendPendingQty) || 0)),
                distributedQty
              )
              const diagnostics = buildCaptchaInterruptedDiagnostics(prevStatus?.diagnostics || null, captchaFailedQty)
              setTargetDispatchStatus(pendingTarget, {
                ...prevStatus,
                stage: 'sent',
                sendOkQty: Math.max(0, Math.floor(Number(prevStatus?.sendOkQty) || 0)),
                sendFailQty: Math.max(0, Math.floor(Number(prevStatus?.sendFailQty) || 0)) + captchaFailedQty,
                sendPendingQty: 0,
                retryQty: remainingQty + Math.max(0, Math.floor(Number(prevStatus?.sendFailQty) || 0)) + captchaFailedQty,
                diagnostics
              })
              aggregateExecution.failed += captchaFailedQty
              aggregateExecution.captchaErrorCount += captchaFailedQty
              aggregateExecution.byTarget.push(buildTargetDispatchAggregateEntry(pendingTarget, diagnostics))
            }
            rerenderTargetsNavigatorRowsCurrent?.()
            persistPlannerTargetsDraftFromNavigatorState()
            await clearPlannerPendingSendSession({ reportId })
            await savePlannerLastMultiDispatchReport({
              context,
              plannerTarget: plannerTargetCurrent,
              payload,
              distributeResponse,
              executionResult: aggregateExecution,
              durationMs: Math.max(0, Date.now() - reportStartedAtMs),
              reportId,
              startedAtMs: reportStartedAtMs
            })
            break
          }
          await savePlannerLastMultiDispatchReport({
            context,
            plannerTarget: plannerTargetCurrent,
            payload,
            distributeResponse,
            executionResult: aggregateExecution,
            durationMs: Math.max(0, Date.now() - reportStartedAtMs),
            reportId,
            startedAtMs: reportStartedAtMs
          })
      }
    } finally {
      executionFeedController?.stopDuration?.('send')
    }
      executionFeedController?.setProgress?.({
        current: Math.max(0, Math.floor(Number(multiFeedProgress.current) || 0)),
        total: Math.max(0, Math.floor(Number(multiFeedProgress.total) || 0))
    })
    executionFeedController?.setPhase?.({ label: 'Concluído!!' })
    executionFeedController?.finish?.({
      success: aggregateExecution.success,
      failed: aggregateExecution.failed,
      total: aggregateExecution.total,
      message: aggregateExecution.pending > 0 ? `Pendentes: ${aggregateExecution.pending}.` : ''
    })

    {
      const formatItems = aggregateExecution.byTarget.map((item) => buildDispatchDiagnosticsFormatItemFromStatus({
        target: item?.target,
        requestedQty: item?.requestedQty,
        distributedQty: item?.distributedQty,
        remainingQty: item?.remainingQty,
        sendOkQty: item?.sendOkQty,
        sendFailQty: item?.sendFailQty,
        sendPendingQty: item?.sendPendingQty,
        retryQty: item?.retryQty,
        bnBlockedCount: item?.bnBlockedCount,
        diagnostics: item?.diagnostics
      }))
      const formattedItems = formatDispatchDiagnosticsBatchLocal(formatItems)
      if (formattedItems.length) {
        aggregateExecution.formattedDispatchDiagnostics = formattedItems
      }
    }

    await savePlannerLastMultiDispatchReport({
      context,
      plannerTarget: plannerTargetCurrent,
      payload,
      distributeResponse,
      executionResult: aggregateExecution,
      durationMs: Math.max(0, Date.now() - reportStartedAtMs),
      reportId,
      startedAtMs: reportStartedAtMs
    })
    await clearPlannerPendingSendSession({ reportId })

    if (aggregateExecution.interruptedByCaptcha) {
      UI?.ErrorMessage?.('Envio interrompido: Captcha identificado! Aguarde...')
    } else {
      UI?.InfoMessage?.('Envio de comando concluído!')
    }
  } catch (error) {
    console.error('[planner:dispatch:multi:distribute]', error)
    await clearPlannerPendingSendSession({ reportId })
    UI?.ErrorMessage?.(error?.message || 'Erro ao distribuir comandos')
  }
  return
}
let plannerExecutionApi = null
try {
  plannerExecutionApi = await loadPlannerExecutionModule()
} catch (executionModuleError) {
  console.error('[planner:dispatch:single:executor-load]', executionModuleError)
  UI?.ErrorMessage?.('Erro ao carregar executor do planner.')
  return
}
const view = plannerExecutionApi.createExecutionView({
  root,
  feedController: executionFeedController
})
try {
  const preflight = await ensureDispatchNightMoralPreflight(context)
  if (preflight?.attempted && preflight.failed > 0) {
    UI?.InfoMessage?.(`BN preflight: ${preflight.resolved}/${preflight.total} player(s) resolvidos.`)
  }
} catch (preflightError) {
  console.error('[planner:dispatch:execute:bn-preflight]', preflightError)
}
context.worldNightConfig = buildWorldNightConfigMetaPayload()
context.playerNightMoralState = buildPlayerNightMoralStateMetaPayload({
  playerIds: [plannerTargetCurrent?.playerId]
})
context.nightBonusConfig = nightBonusConfig ? { ...nightBonusConfig } : null
const singleSelectedVillageIds = Array.isArray(context?.selectedVillageIds) ? context.selectedVillageIds : []
const singleRequestedQty = getCurrentTargetRequestedQtyFromContext(context)
const singleUsesDistribution = shouldUseCurrentTargetDistribution(context)
let singleExecutionContext = context
let singlePendingCommands = buildSinglePendingSendCommands(plannerTargetCurrent, singleSelectedVillageIds)
let singleRequestedCount = singleRequestedQty
let singleDistributedCount = Math.max(0, singleSelectedVillageIds.length)
let singleDistributionDiff = Math.max(0, singleRequestedCount - singleDistributedCount)

if (singleUsesDistribution) {
  const payload = buildCurrentTargetDistributePayload(context, plannerTargetCurrent)
  if (!Array.isArray(payload?.senders) || payload.senders.length <= 0) {
    UI?.ErrorMessage?.('Selecione vilas válidas (com coordenadas) para distribuir.')
    return
  }
  if (!Array.isArray(payload?.targets) || payload.targets.length <= 0) {
    UI?.ErrorMessage?.('Defina uma quantidade válida para o alvo atual.')
    return
  }
  const templateValid = Boolean(context?.templateStats?.validation?.isValid && context?.templateStats?.template)
  if (!templateValid) {
    UI?.ErrorMessage?.('Modelo inválido para distribuição. Ajuste o template.')
    return
  }
  let distributeResponse = null
  try {
    executionFeedController?.hide?.()
    executionFeedController?.clear?.()
    executionFeedController?.startDuration?.('distribution')
    try {
      distributeResponse = await postCommandDistribute({
        payload
      })
    } finally {
      executionFeedController?.stopDuration?.('distribution')
    }
    await savePlannerLastDistributionReport({
      context,
      plannerTarget: plannerTargetCurrent,
      payload,
      response: distributeResponse,
      reportId,
      startedAtMs: reportStartedAtMs
    })
  } catch (distributionError) {
    console.error('[planner:dispatch:single:distribute]', distributionError)
    UI?.ErrorMessage?.(distributionError?.message || 'Erro ao distribuir comandos')
    return
  }

  const distributionTargetItem = Array.isArray(distributeResponse?.targets) ? distributeResponse.targets[0] || null : null
  applyDistributionStatusToTarget(plannerTargetCurrent, distributionTargetItem)
  const requestedCount = Math.max(0, Math.floor(Number(distributionTargetItem?.requestedQty) || Number(distributeResponse?.meta?.requestedCount) || singleRequestedQty || 0))
  const assignedCount = Math.max(0, Math.floor(Number(distributionTargetItem?.assignedQty) || Number(distributeResponse?.meta?.assignedCount) || Number(distributeResponse?.meta?.commandsCount) || 0))
  const unfilledCount = Math.max(0, Math.floor(Number(distributionTargetItem?.remainingQty) || Number(distributeResponse?.meta?.unfilledRequestedCount) || Math.max(0, requestedCount - assignedCount)))
  const noTimeCount = Math.max(0, Math.floor(Number(distributionTargetItem?.pendingRejectedByNightCount) || Number(distributeResponse?.meta?.noTimeCount) || 0))
  const summary = [
    `Distribuição: ${assignedCount}/${requestedCount}`,
    unfilledCount > 0 ? `faltam ${unfilledCount}` : null,
    noTimeCount > 0 ? `BN bloqueou ${noTimeCount}` : null
  ].filter(Boolean).join(' | ')
  if (assignedCount <= 0) {
    UI?.ErrorMessage?.(summary || 'Nenhum comando foi distribuído.')
    return
  }

  const groupedCommands = buildMultiDistributeCommandsByTarget(distributeResponse)
  const currentGroup = groupedCommands[0] || null
  const distributedCommands = Array.isArray(currentGroup?.commands) ? currentGroup.commands : []
  singlePendingCommands = distributedCommands
  singleRequestedCount = requestedCount
  singleDistributedCount = assignedCount
  singleDistributionDiff = Math.max(0, requestedCount - assignedCount)

  const senderByVillageId = new Map(
    (Array.isArray(sendersDataCurrent) ? sendersDataCurrent : [])
      .filter((sender) => Number.isFinite(Number(sender?.villageId)))
      .map((sender) => [Number(sender.villageId), sender])
  )
  const distributedVillageIds = []
  const distributedSendersData = []
  const seenVillageIds = new Set()
  distributedCommands.forEach((command) => {
    const sourceVillageId = Number(command?.source?.id ?? command?.source?.villageId)
    if (!Number.isFinite(sourceVillageId) || seenVillageIds.has(sourceVillageId)) return
    seenVillageIds.add(sourceVillageId)
    distributedVillageIds.push(sourceVillageId)
    const sender = senderByVillageId.get(sourceVillageId)
    if (sender) distributedSendersData.push(sender)
  })
  singleExecutionContext = {
    ...context,
    selectedVillageIds: distributedVillageIds
  }
  if (distributedSendersData.length > 0) {
    singlePendingCommands = distributedCommands
  }
}

if (!plannerSendLocked) {
  plannerSendLocked = beginPlannerSendExecution()
  if (!plannerSendLocked) {
    UI?.InfoMessage?.('Envio do planner já está em execução.')
    return
  }
}

await startPlannerPendingSendSession({
  reportId,
  draftId: activeTargetsDraftIdCurrent,
  commands: singlePendingCommands
})
const singlePrevStatus = getTargetDispatchStatus(plannerTargetCurrent) || {}
setTargetDispatchStatus(plannerTargetCurrent, {
  stage: 'distributed',
  requestedQty: singleRequestedCount,
  distributedQty: singleDistributedCount,
  remainingQty: Math.max(0, singleDistributionDiff),
  bnBlockedCount: Math.max(0, Math.floor(Number(singlePrevStatus?.bnBlockedCount) || 0)),
  sendOkQty: 0,
  sendFailQty: 0,
  sendPendingQty: singleDistributedCount,
  retryQty: Math.max(0, singleDistributionDiff)
})
syncCurrentPlannerTargetDispatchStatusUi(document.querySelector('#go-target-content'), plannerTargetCurrent)
await savePlannerLastExecutionReport({
  mode,
  context: singleExecutionContext,
  plannerTarget: plannerTargetCurrent,
  executionResult: {
    success: 0,
    failed: 0,
    pending: 0,
    captchaErrorCount: 0,
    total: singleDistributedCount,
    distributedCount: singleDistributedCount,
    requestedCount: singleRequestedCount
  },
  durationMs: 0,
  reportId,
  startedAtMs: reportStartedAtMs
})
try {
  const executionResultRaw = await plannerExecutionApi.executeSendPhases({
    mode,
    context: singleExecutionContext,
    plannerTarget: plannerTargetCurrent,
    sendersData: singleUsesDistribution
      ? (Array.isArray(sendersDataCurrent) ? sendersDataCurrent.filter((sender) => {
          const villageId = Number(sender?.villageId)
          return Number.isFinite(villageId) && singleExecutionContext.selectedVillageIds.includes(villageId)
        }) : [])
      : sendersDataCurrent,
    view,
    onResultResolved: (resultItem) => {
      const sourceVillageId = Number(resultItem?.villageId)
      if (!Number.isFinite(sourceVillageId)) return
      void Promise.resolve(removePlannerPendingSendCommands({
        reportId,
        commandIds: [`${Number(plannerTargetCurrent?.x)}|${Number(plannerTargetCurrent?.y)}:${Math.trunc(sourceVillageId)}`]
      })).catch((error) => {
        console.error('[planner:dispatch:pending-session:remove]', error)
      })
    }
  })
  const executionResult = {
    ...(executionResultRaw && typeof executionResultRaw === 'object' ? executionResultRaw : {}),
    distributedCount: singleDistributedCount,
    requestedCount: singleRequestedCount
  }
  applyTargetSendResultStatus(plannerTargetCurrent, executionResult)
  if (executionResult && typeof executionResult === 'object') {
    const formattedItems = formatDispatchDiagnosticsBatchLocal([
      buildDispatchDiagnosticsFormatItemFromStatus({
        target: plannerTargetCurrent,
        requestedQty: singleRequestedCount,
        distributedQty: singleDistributedCount,
        sendOkQty: executionResult?.success,
        sendFailQty: executionResult?.failed,
        sendPendingQty: executionResult?.pending,
        remainingQty: singleDistributionDiff,
        retryQty: Math.max(0, singleDistributionDiff + Math.floor(Number(executionResult?.failed || 0) + Number(executionResult?.pending || 0))),
        diagnostics: executionResult?.diagnostics
      })
    ])
    if (formattedItems.length) {
      executionResult.formattedDispatchDiagnostics = formattedItems
    }
    if (executionResult?.interruptedByCaptcha) {
      UI?.ErrorMessage?.('Envio interrompido: Captcha identificado! Aguarde...')
    } else {
      UI?.InfoMessage?.('Envio de comando concluído!')
    }
  }
  await savePlannerLastExecutionReport({
    mode,
    context: singleExecutionContext,
    plannerTarget: plannerTargetCurrent,
    executionResult,
    durationMs: Math.max(0, Date.now() - reportStartedAtMs),
    reportId,
    startedAtMs: reportStartedAtMs
  })
  applySentUnitsToSendersAndTable(executionResult)
  refreshIncomingTargetIfOpen(executionResult)
} catch (error) {
  console.error('[planner:dispatch:single:send]', error)
  UI?.ErrorMessage?.(error?.message || 'Erro ao enviar comandos')
  } finally {
    await clearPlannerPendingSendSession({ reportId })
  }
} finally {
  if (plannerSendLocked) endPlannerSendExecution()
}

}
