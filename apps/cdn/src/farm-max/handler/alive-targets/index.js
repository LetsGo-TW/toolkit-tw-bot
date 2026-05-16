import { storageAliveTargets } from "../../config/alive-targets";
import { removeReviewedRedTarget } from "../../config/break-wall/reviewed-red-targets.js";
import { sleep } from "../../utils/sleep";
import { getPlunderList } from "../core/plunder-list";
import { fetchReportView } from "../reports/request";
import { ProtectingBot } from "@toolkit-tw-bot/document";

async function getAllAliveTargets() {
  const aliveTargets = (await storageAliveTargets.get() || [])
  return aliveTargets
}

async function getAliveTarget(targetEvaluated) {
  const aliveTargets = await getAllAliveTargets()
  const aliveTarget = aliveTargets
    .find(([target, report_id]) => !!report_id && Number(target) === Number(targetEvaluated))
  return aliveTarget
}

async function isAliveTarget(targetEvaluated) {
  return !!(await getAliveTarget(targetEvaluated))
}

async function updateAliveTargets(data, api, d, w) {
  api.footer.set(`Verificando relatórios.`, "ok");
  const { plunderList } = getPlunderList(d)
  const aliveTargets = await getAllAliveTargets()
  const removeAliveTargets = (target) => {
    const ind = aliveTargets.findIndex(([t]) => Number(t) === Number(target))
    if (ind !== -1) {
      aliveTargets.splice(ind, 1)
    }
  }
  for (const { type, target, report_id, x, y } of plunderList) {
    if (
      ['green', 'yellow'].includes(type)
    ) {
      // remover
      removeAliveTargets(target)
    }
    if (
      ['blue', 'red_blue', 'yellow_blue'].includes(type) &&
      !aliveTargets.find(([t]) => Number(t) === Number(target))
    ) {
      // incluir
      if (ProtectingBot["bot-protect-all-in-game"].active(d, w) || ProtectingBot["bot-protect-all-in-game"].active()) {
        api.footer.set(`hCaptcha identificado! Encerrando...`, "err");
        await sleep(1000, 1111);
        throw ProtectingBot.error();
      }

      const targetDisplay = `(${x}|${y}) K${String(y).padStart(3, 0).substring(0, 1)}${String(x).padStart(3, 0).substring(0, 1)}`

      try {
        const { isBreakWall, alive, units, wall } = await fetchReportView(data.village.id, report_id)

        if (isBreakWall && type === 'red') {
          removeAliveTargets(target)
          await removeReviewedRedTarget(target)
          continue
        }

        if (alive) {
          const aliveTarget = [
            target,
            Number(report_id),
            Number(x),
            Number(y),
            units.filter(u => u.id !== 'militia').map(u => Number(u.value)),
            wall
          ];
          aliveTargets.push(aliveTarget);
          await removeReviewedRedTarget(target)
          api.footer.set(`${targetDisplay} verificado (com tropas).`, "ok");
        } else {
          removeAliveTargets(target);
        }
      } catch (error) {
        if (error?.message === 'Identified bot protection') {
          throw error
        }

        const reason = error?.message || error?.name || String(error)
        api.footer.set(`Erro ao verificar ${targetDisplay}: ${reason}.`, "err");
        console.error(`[farm-max] Erro ao verificar ${targetDisplay}`, error)
        await sleep(3500, 4200);
        continue
      }
    }
  }
  await storageAliveTargets.set(aliveTargets);
}

export { updateAliveTargets, getAllAliveTargets, getAliveTarget, isAliveTarget }
