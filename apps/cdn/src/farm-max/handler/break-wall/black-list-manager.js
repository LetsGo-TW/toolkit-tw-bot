import { getBlacklist, removeFromBlacklist, upsertToBlacklist } from "../../config/break-wall/targets-black.js";
import { getPlunderList } from "../core/plunder-list.js";

async function blacklistManager(_data, api, d = document, w = window) {
  const blacklist = await getBlacklist();
  if (!blacklist.length) return;

  api.footer.set(`Verificando blacklist de quebra-muros...`, 'info');

  const { plunderList } = getPlunderList(d);
  const blacklistedTargets = new Set(blacklist.map(item => item.target));

  for (const report of plunderList) {
    const targetId = Number(report.target);
    if (!blacklistedTargets.has(targetId)) continue;

    // Rule: green, yelow: targetId sai de black list.
    if (['green', 'yellow'].includes(report.type)) {
      await removeFromBlacklist(targetId);
      api.footer.set(`Alvo ${report.x}|${report.y} (${report.type}) removido da blacklist.`, 'ok');
    } 
    // Rule: red: atualiza o reportId da black list.
    else if (report.type === 'red') {
      await upsertToBlacklist(targetId, report.report_id, report.x, report.y);
      api.footer.set(`Alvo ${report.x}|${report.y} (vermelho) atualizado na blacklist.`, 'info');
    } 
    // Rule: blue/mixed reports without troops update the report_id.
    // updateAliveTargets already ran and would have moved it if it had troops.
    else if (['blue', 'red_blue', 'yellow_blue'].includes(report.type) && report.report_id) {
      await upsertToBlacklist(targetId, report.report_id, report.x, report.y);
      api.footer.set(`Alvo ${report.x}|${report.y} (azul/misto sem tropas) atualizado na blacklist.`, 'info');
    }
  }
}

export { blacklistManager };
