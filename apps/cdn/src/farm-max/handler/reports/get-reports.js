import { getGameData } from "@toolkit-tw-bot/document";
import { parseReportTimeToEpochAuto } from "./date"

function getReports(html = document) {
  const gameData = getGameData()
  return Array.from(html.querySelectorAll("#report_list tr[class]")).map(tr => {
    const report_id = Number(tr.getAttribute('class').match(/report-(\d+)/)[1] || 0)
    const dateTimeText = tr.querySelector('td.nowrap').textContent
    const timestamp = parseReportTimeToEpochAuto(dateTimeText, {
      locale: gameData.locale, market: gameData.market
    })
    const report_time = parseInt(timestamp / 1000);
    const imgSrc = Array.from(tr.querySelectorAll('img')).map(img => img.src);

    const regexUnits = new RegExp(gameData.units.join('|'));
    const unitsMatch = imgSrc.filter(src => src.match(regexUnits));
    const units = unitsMatch.map(src => src.match(regexUnits)[0]);

    const [powerMatch] = imgSrc.filter(src => src.match(/attack_[a-z]{1,}|farm/));
    const power = powerMatch?.match(/attack_[a-z]{1,}|farm/)[0];

    const [typeMatch] = imgSrc.filter(src => src.match(/red_blue|red_yellow|red|yellow|blue|green/i));
    const type = typeMatch?.match(/red_blue|red_yellow|red|yellow|blue|green/i)[0];

    const [lottMatch] = imgSrc.filter((src) => src.match(/max_loot/));
    const lott = lottMatch?.match(/(\d).webp$/)[1] ?? 'none';

    const quickeEditLabel = tr.querySelector('.quickedit-label').innerText
    const regexQELabel = /\((\d+)\|(\d+)\)\s*K\d+\b/g;
    const hits = [...quickeEditLabel.matchAll(regexQELabel)];
    const [ , fromX, fromY ] = hits[0];
    const [ , targetX, targetY ] = hits[1];

    const labelMatch = quickeEditLabel.match(/-\s*\(([^)]+)\)\s*$/)
    const label = labelMatch ? labelMatch[1] : ''

    return {
      report_id,
      report_time,
      from: {x: fromX, y: fromY},
      target: {x: targetX, y: targetY},
      label,
      units,
      lott,
      type,
      power
    }
  })
}

export { getReports }
