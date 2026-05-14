import { Distance } from "@toolkit-tw-bot/core";
import { ProtectingBot } from "@toolkit-tw-bot/document";
import { storageFarmSchedules } from "../../config";
import { storageBreakWallTemplates } from "../../config/break-wall";
import { getBreakWallReports, normalizeBreakWallReports, saveBreakWallReports } from "../../config/break-wall/reports";
import { getAvaiablesSents, getSentByTarget, isSentByTarget, removeSentByTarget, saveTargetSent } from "../../config/break-wall/targets-sent";
import { getBlacklist, upsertToBlacklist } from "../../config/break-wall/targets-black.js";
import { dataConfig } from "../../config/data";
import { sleep } from "../../utils/sleep";
import { reportsHandler } from "../reports";
import { fetchReportView } from "../reports/request";
import { getAvaiablesReportBreakWall } from "./avaiables-reports";
import { execute } from "./execute";
import { dateTimeNow } from "../../../stable-compat/date-tw";

/**
 * Não envia se já tem qualquer ataque indo
 * Não envia se tem tropa na vila
 * Não envia se já enviou um quebra muro e retornou vermelho
 */

async function schedulerBreakWall(html = document) {
  const templates = await storageBreakWallTemplates.get()
  const { breakWall: configBreakWall } = await dataConfig()
  const existingReports = await getBreakWallReports() || []
  const { values: senders } = (await storageFarmSchedules.get()) || { values: [] }
  const avaiablesReports = await getAvaiablesReportBreakWall(html)
  const { avaible: breakWallSents = [] } = (await getAvaiablesSents()) || {}
  const blacklist = await getBlacklist();
  const newReportsInThisRun = [];
  if (avaiablesReports.length) {
    avaiablesReports.forEach(({target, x, y, wall, report_id, type, report_time}) => {
      const calculateDistance = Distance.create({ x, y })
      const template = wall ? templates[wall] : templates[configBreakWall.template]

      // cai fora se a vila já estiver programada ou já enviou
      const isAlreadyPlanned = (existingReports.some(r => Number(r.target) === Number(target))) ||
                             (newReportsInThisRun.some(r => Number(r.target) === Number(target)));
      const isAlreadySent = breakWallSents.some(r => Number(r.target) === Number(target));
      const isBlacklisted = blacklist.some(b => b.target === Number(target));

      if (isAlreadyPlanned || isAlreadySent || isBlacklisted) {
        return;
      }

      const sendersCopy = JSON.parse(JSON.stringify(senders));

      const [send] = sendersCopy.reduce((sends, sender) => {
        const {id, name, units} = sender;
        // desconta as tropas já agendadas para a villa
        if (newReportsInThisRun.length) {
          newReportsInThisRun.forEach((report) => { // {id, template, distance, target, x, y, wall}
            if (Number(report.id) === Number(id)) {
              Object.keys(report.template).forEach(key => { units[key] -= report.template[key] })
            }
          })
        }
        const hasEnoughTroops = () => {
          return Object.keys(template).every(unit => (units[unit] || 0) >= template[unit]);
        }

        if (hasEnoughTroops()) {
          const coordMatch = name.trim().match(/\((\d+\|\d+)\) K\d+$/);

          if (coordMatch) {
            const [senderX, senderY] = coordMatch[1].split('|');
            const distance = calculateDistance.round({x: senderX, y: senderY})

            if (distance <= configBreakWall.maxDistance) {
              sends.push({
                  id,
                  template,
                  distance,
              })

              // atualiza a quantidade de tropas
              Object.keys(template).forEach(key => { units[key] -= template[key] })

            }
          }
        }

        return sends
      }, []).sort((a, b) => {
        if (a.distance > b.distance) return 1
        if (a.distance < b.distance) return -1
        return 0
      })

      if (send) {
        newReportsInThisRun.push({...send, target, x, y, report_id, report_time, type, wall})
      }
    })
    // Save all planned reports (existing + new ones from this run) to storage.
    // This ensures that reports planned in this run are added to the existing ones
    // and are available for the next scheduler run.
    if (newReportsInThisRun.length > 0) {
      const allPlannedReports = [...existingReports, ...newReportsInThisRun];
      await saveBreakWallReports(allPlannedReports);
    }
  }

  return await getBreakWallReports()
}
async function handlerBreakWall(data, api, d = document, w = window) {
  const { breakWall: configBreakWall } = await dataConfig()
  if (!configBreakWall.active) return
  api.footer.set(`Verificando se existem muralhas para quebrar...`, 'warn');

  const breakWall = normalizeBreakWallReports(await schedulerBreakWall(d))
  if (!breakWall.length) return
  if (!breakWall.filter(({id}) => id === data.village.id).length) return

  let count = 1

  const sents = []
  const terminatedTargets = new Set();
  const claimedTargets = new Set();

  for (const report of breakWall) {
    try {
      // --- 1. GATHER INITIAL STATE & GUARD CLAUSES ---
      const targetId = Number(report.target);
      const isSent = await isSentByTarget(targetId).catch(() => ({ avaiable: false, alive: false, check: false }));
      const currentBlacklist = await getBlacklist();

      // Skip if not for the current village or an attack is already in transit.
      if (Number(report.id) !== Number(data.village.id)) continue;
      if (claimedTargets.has(targetId)) continue;
      claimedTargets.add(targetId);
      if (isSent.avaiable) continue;

      // Skip if target is blacklisted, has troops, or wall is already known to be 0.
      if (currentBlacklist.some(b => b.target === targetId)) continue;
      if (isSent.alive) continue;
      if (report.wall === 0) {
        // If a report for a village with no wall is in the queue, it's a finished or invalid task.
        terminatedTargets.add(targetId);
        api.footer.set(`Alvo ${report.x}|${report.y} já com muralha 0. Removendo da fila.`, 'info');
        continue;
      }

      // --- 2. DYNAMIC REPORT CHECKING (if needed) ---
      let wallLevel = report.wall;
      // --- Somente lista de enviados aguardando bater
      const shouldFetchReport = isSent.check || (
        report.report_id &&
        !isSent.alive &&
        report.type !== 'red'
      );

      if (shouldFetchReport) {
        let reportIdToCheck = report.report_id;
        // If `isSent.check` is true, it means an attack landed. We might need to find the new report.
        if (isSent.check) {
          const targetSent = await getSentByTarget(targetId) || {};
          // If the sent record doesn't have a report_id, we need to find it.
          if (!targetSent.report_id) {
            const newReportId = await reportsHandler(data, targetSent, api, d, w);
            if (newReportId) reportIdToCheck = newReportId;
          } else {
            reportIdToCheck = targetSent.report_id;
          }
        }

        if (reportIdToCheck) {
          if (ProtectingBot["bot-protect-all-in-game"].active(d, w)) throw ProtectingBot.error();

          const response = await fetchReportView(data.village.id, reportIdToCheck);

          // Case 1: Report is RED (total loss). Blacklist it.
          if (response.black && isSent.check) {
            await upsertToBlacklist(targetId, reportIdToCheck, report.x, report.y);
            await removeSentByTarget(targetId); // Clean from sent list as it's a final state.
            terminatedTargets.add(targetId);
            api.footer.set(`Alvo ${report.x}|${report.y} com perda total. Adicionado à blacklist.`, 'ok');
            continue;
          }

          // Case 2: Wall is destroyed, no troops. SUCCESS. Stop attacking.
          if (response.wall === 0 && !response.alive) {
            await removeSentByTarget(targetId); // Clean from sent list as it's a final state.
            terminatedTargets.add(targetId);
            api.footer.set(`Alvo ${report.x}|${report.y} limpo. Fim do quebra-muros para este alvo.`, 'ok');
            continue;
          }

          // Case 3: Troops are present. Mark as alive and stop attacking.
          if (response.alive) {
            const aliveData = { target: targetId, x: report.x, y: report.y, report_id: reportIdToCheck, units: response.units, wall: response.wall };
            await saveTargetSent(aliveData); // Also save to sent list to mark as 'alive'.
            terminatedTargets.add(targetId);
            api.footer.set(`Alvo ${report.x}|${report.y} tem tropas. Ataques de quebra-muros pausados.`, 'warn');
            continue;
          }

          // Case 4: Wall is damaged but not destroyed. Update state.
          if (response.wall > 0) {
            wallLevel = response.wall;
            const targetSent = await getSentByTarget(targetId) || { target: targetId, x: report.x, y: report.y };
            targetSent.wall = wallLevel;
            targetSent.report_id = reportIdToCheck;
            await saveTargetSent(targetSent);
          }
        }
      }

      // --- 4. EXECUTE ATTACK ---
      if (ProtectingBot["bot-protect-all-in-game"].active(d, w) || ProtectingBot["bot-protect-all-in-game"].active()) {
        api.footer.set(`hCaptcha identificado! Encerrando...`, "err");
        await sleep(1000, 1111);
        throw ProtectingBot.error();
      }

      if (!report.template) {
        const templates = await storageBreakWallTemplates.get()
        report.template = templates[wallLevel ?? configBreakWall.template]
      }
      const { target, x, y, arrival, duration, message } = await execute(data.village.id, report.template, report.target, report.x, report.y, api, d, w )
      const sentData = { target, x, y, arrival, duration }
      await saveTargetSent(sentData)
      sents.push(sentData)
      api.footer.set(`[${count}] ${message} Chegada: ${new Date(arrival).toLocaleString()}`, 'ok');
      count++
    } catch (error) {
      if (error?.message === 'Identified bot protection') throw error;
      if (error?.message === 'Sem tropas suficientes para enviar.') {
        terminatedTargets.add(Number(report.target));
        api.footer.set(`Quebra-muros para ${report.x}|${report.y} adiado: Sem tropas.`, 'warn');
      } else {
        console.error(error.message || error.toString())
        api.footer.set(error.message || error.toString(), 'err');
      }
    } finally {
      await sleep()
    }
  }

  const sentTargetsInThisRun = new Set(sents.map(s => Number(s.target)));
  const allTerminatedThisRun = new Set([...terminatedTargets, ...sentTargetsInThisRun]);
  const remainingReports = breakWall.filter(r => !allTerminatedThisRun.has(Number(r.target)));
  await saveBreakWallReports(remainingReports);

  const { check = [] } = (await getAvaiablesSents()) || {};
  for (const { target, arrival, duration } of check) {
    if (arrival + ((duration ?? 3600) * 1000) < dateTimeNow()) {
      await removeSentByTarget(target)
    }
  }
}

export { handlerBreakWall }
