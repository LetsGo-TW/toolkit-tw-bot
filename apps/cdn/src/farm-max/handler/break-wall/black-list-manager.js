import { ProtectingBot } from "@toolkit-tw-bot/document";
import { getBlacklist, removeFromBlacklist, upsertToBlacklist } from "../../config/break-wall/targets-black.js";
import { getAvaiablesSents } from "../../config/break-wall/targets-sent.js";
import { getReviewedRedTargets, saveReviewedRedTargets } from "../../config/break-wall/reviewed-red-targets.js";
import { storageAliveTargets } from "../../config/alive-targets";
import { dateTimeNow } from "../../../stable-compat/date-tw.js";
import { dataConfig } from "../../config/data.js";
import { sleep } from "../../utils/sleep.js";
import { getPlunderList } from "../core/plunder-list.js";
import { fetchReportView } from "../reports/request.js";

async function blacklistManager(data, api, d = document, w = window) {
  const blacklist = await getBlacklist();
  const { breakWall: configBreakWall } = await dataConfig();
  const { plunderList } = getPlunderList(d);
  if (!plunderList.length) return;

  api.footer.set(`Verificando blacklist de quebra-muros...`, 'info');

  const blacklistedTargets = new Set(blacklist.map(item => item.target));
  const sentsData = await getAvaiablesSents().catch(() => ({})) || {}
  const sentTargets = new Set((sentsData.all || []).map((sent) => Number(sent.target)))
  const aliveTargets = new Set(((await storageAliveTargets.get().catch(() => ([]))) || []).map(([target]) => Number(target)))
  const reviewedTargets = new Map((await getReviewedRedTargets()).map((entry) => [Number(entry.target), entry]))
  let reviewedTargetsDirty = false

  const removeReviewedTarget = (targetId) => {
    if (reviewedTargets.delete(Number(targetId))) {
      reviewedTargetsDirty = true
    }
  }

  const upsertReviewedTarget = (targetId, reportId, result = 'ignored') => {
    reviewedTargets.set(Number(targetId), {
      target: Number(targetId),
      report_id: Number(reportId),
      checkedAt: dateTimeNow(),
      result,
    })
    reviewedTargetsDirty = true
  }

  try {
    for (const report of plunderList) {
      const targetId = Number(report.target);
      const reportDistance = Number(report.distance)
      const maxBreakWallDistance = Number(configBreakWall.maxDistance)
      const isWithinBreakWallDistance = Number.isFinite(reportDistance)
        && Number.isFinite(maxBreakWallDistance)
        && reportDistance <= maxBreakWallDistance

      if (
        blacklistedTargets.has(targetId)
        || sentTargets.has(targetId)
        || aliveTargets.has(targetId)
        || report.type !== 'red'
      ) {
        removeReviewedTarget(targetId)
      }

      if (!blacklistedTargets.has(targetId)) {
        if (
          report.type !== 'red'
          || !configBreakWall.red
          || !report.report_id
          || sentTargets.has(targetId)
          || !isWithinBreakWallDistance
        ) continue;

        if (Number(reviewedTargets.get(targetId)?.report_id) === Number(report.report_id)) {
          continue;
        }

        if (ProtectingBot["bot-protect-all-in-game"].active(d, w) || ProtectingBot["bot-protect-all-in-game"].active()) {
          api.footer.set(`hCaptcha identificado! Encerrando...`, "err");
          await sleep(1000, 1111);
          throw ProtectingBot.error();
        }

        const targetDisplay = `(${report.x}|${report.y}) K${String(report.y).padStart(3, 0).substring(0, 1)}${String(report.x).padStart(3, 0).substring(0, 1)}`

        try {
          const { isBreakWall } = await fetchReportView(data.village.id, report.report_id)

          if (isBreakWall) {
            await upsertToBlacklist(targetId, report.report_id, report.x, report.y);
            blacklistedTargets.add(targetId);
            removeReviewedTarget(targetId)
            api.footer.set(`Alvo ${report.x}|${report.y} (vermelho) atualizado na blacklist.`, 'info');
          } else {
            upsertReviewedTarget(targetId, report.report_id, 'ignored')
          }
        } catch (error) {
          if (error?.message === 'Identified bot protection') {
            throw error
          }

          const reason = error?.message || error?.name || String(error)
          api.footer.set(`Erro ao verificar ${targetDisplay}: ${reason}.`, "err");
          console.error(`[farm-max] Erro ao verificar ${targetDisplay}`, error)
          await sleep(1500, 2200);
        }
        continue;
      }

      // Rule: green, yelow: targetId sai de black list.
      if (['green', 'yellow'].includes(report.type)) {
        await removeFromBlacklist(targetId);
        blacklistedTargets.delete(targetId);
        api.footer.set(`Alvo ${report.x}|${report.y} (${report.type}) removido da blacklist.`, 'ok');
      } 
      // Rule: red: atualiza o reportId da black list.
      else if (report.type === 'red') {
        await upsertToBlacklist(targetId, report.report_id, report.x, report.y);
        removeReviewedTarget(targetId)
        api.footer.set(`Alvo ${report.x}|${report.y} (vermelho) atualizado na blacklist.`, 'info');
      } 
      // Rule: blue/mixed reports without troops update the report_id.
      // updateAliveTargets already ran and would have moved it if it had troops.
      else if (['blue', 'red_blue', 'yellow_blue'].includes(report.type) && report.report_id) {
        await upsertToBlacklist(targetId, report.report_id, report.x, report.y);
        api.footer.set(`Alvo ${report.x}|${report.y} (azul/misto sem tropas) atualizado na blacklist.`, 'info');
      }
    }
  } finally {
    if (reviewedTargetsDirty) {
      await saveReviewedRedTargets(Array.from(reviewedTargets.values()))
    }
  }
}

export { blacklistManager };
