import { storageAliveTargets } from "../../config/alive-targets";
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
  for (const { type, target, report_id, x, y } of plunderList) {
    if (
      ['green', 'yellow'].includes(type)
    ) {
      // remover
      const ind = aliveTargets.findIndex(([t]) => Number(t) === Number(target))
      if (ind !== -1) {
        aliveTargets.splice(ind, 1)
      }
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
        const { alive, units, wall } = await fetchReportView(data.village.id, report_id)
        const aliveTarget = alive
          ? [
            target,
            Number(report_id),
            Number(x),
            Number(y),
            units.filter(u => u.id !== 'militia').map(u => Number(u.value)),
            wall
          ]
          : [
            target
          ]

        aliveTargets.push(aliveTarget)
        await storageAliveTargets.set(aliveTargets)
        api.footer.set(`${targetDisplay} verificado.`, "ok");
      } catch (error) {
        api.footer.set(`Erro ao verificar ${targetDisplay}.`, "err");
        console.error(error)
        continue
      }
    }
  }
}

export { updateAliveTargets, getAllAliveTargets, getAliveTarget, isAliveTarget }
