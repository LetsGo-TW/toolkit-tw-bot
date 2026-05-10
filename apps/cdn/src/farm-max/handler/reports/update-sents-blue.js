import { ProtectingBot } from "@toolkit-tw-bot/document";
import { getAvaiablesSents, saveTargetSent } from "../../config/break-wall/targets-sent"
import { sleep } from "../../utils/sleep";
import { getPlunderList } from "../core/plunder-list"
import { fetchReportView } from "./request"

async function updateSentsBlue(data, api, d, w) {
  api.footer.set(`Verificando relatórios.`, "ok");
  const {plunderList} = getPlunderList(d)
  const sentsData = await getAvaiablesSents().catch(() => ({})) || {}
  const sents = sentsData.all || []
  for (const {type, target, report_id, x, y, wall} of plunderList) {
    if (
      ['blue', 'red_blue', 'yellow_blue'].includes(type) &&
      !sents.find((a => Number(a.report_id) === Number(report_id)))
    ) {
      if (ProtectingBot["bot-protect-all-in-game"].active(d, w) || ProtectingBot["bot-protect-all-in-game"].active()) {
        api.footer.set(`hCaptcha identificado! Encerrando...`, "err");
        await sleep(1000, 1111);
        throw ProtectingBot.error();
      }

      const targetDisplay = `(${x}|${y}) K${String(y).padStart(3, 0).substring(0, 1)}${String(x).padStart(3, 0).substring(0, 1)}`

      try {
        const { alive, units } = await fetchReportView(data.village.id, report_id)
        const targetSent = {
          target,
          x,
          y,
          report_id,
          alive,
          units,
          wall
        }
        await saveTargetSent(targetSent)
        api.footer.set(`${targetDisplay} verificado.`, "ok");
      } catch (error) {
        if (error?.message === 'Identified bot protection') {
          throw error
        }

        api.footer.set(`Erro ao verificar ${targetDisplay}.`, "err");
        console.error(error)
        continue
      }
    }
  }
}

export { updateSentsBlue }
