// ./core/plunder-list.js
import { dataConfig } from "../../config/data"
import { storageFarmSession } from "../../config";
import { normalizeDateTwString } from "../../../shared/normalizeDateTwString";
import { nDateTime } from "../../../stable-compat/date-parse";

// ===== helpers locais =====
const clickInvoker = (a) => () => {
  if (!a) return;
  try {
    a.dispatchEvent(new MouseEvent('click', {
      bubbles: true, cancelable: true,
      view: a.ownerDocument.defaultView
    }));
  } catch { /* ignore */ }
  // if (typeof a.click === 'function') a.click();
};

const getTitle = (el) =>
  el?.getAttribute?.('data-title') ??
  el?.getAttribute?.('title') ??
  (Array.from(el?.attributes ?? []).find(a => a.name.includes('title'))?.value ?? '');

const firstNum = (str) => {
  if (!str) return null;
  const m = String(str).match(/\d+/);
  return m ? Number(m[0]) : null;
};

const firstTime = (str) => {
  if (!str) return null;
  const m = String(str).match(/\d{1,}:\d{2}:\d{2}/);
  return m ? m[0] : null;
};

const numOrNull = (str) => {
  const m = String(str ?? '').match(/\d{1,2}/);
  return m ? Number(m[0]) : null;
};

// --
const getPlunderList = (html = document) => {
  const rows = Array.from(html.querySelectorAll("#plunder_list tr")).filter(tr => tr.className);
  const plunderListHtml = rows;

  const plunderList = rows.reduce((acc, tr) => {
    const tds = Array.from(tr.querySelectorAll("td"));
    if (!tds.length) return acc;

    // const lastTd = tds[tds.length - 1];
    // const lastA  = lastTd?.querySelector("a");
    // const urlBase = lastA?.href ? lastA.href.split('&')[0] : '';

    const idMatch = tr.id?.match?.(/\d+/g);
    const target = idMatch ? Number(idMatch[0]) : null;

    const farmIconA = tr.querySelector("a.farm_icon_a");
    const farmIconB = tr.querySelector("a.farm_icon_b");
    const farmIconC = tr.querySelector("a.farm_icon_c");

    // coluna "aldeia" costuma estar no tds[3]
    const colVillage = tds[3];
    const villageLink = colVillage?.querySelector("a");
    // const villageMatch = villageLink?.href.match(/village=(\d+)/);
    // const villageId = villageMatch ? Number(villageMatch[1]) : null

    const reportMatch = villageLink?.href?.match(/[&]view=(\d+)/);
    const report_id = reportMatch ? Number(reportMatch[1]) : null;

    const coordText = villageLink?.innerText || '';
    const coordMatch = coordText.trim().match(/\((\d+\|\d+)\) K\d+$/);
    const [x, y] = coordMatch ? coordMatch[1].split('|') : [null, null];

    // const coordMatch = coordText.match(/\d+\|\d+/);
    // const [x, y] = coordMatch ? coordMatch[0].split('|') : [null, null];

    const atkImg = colVillage?.querySelector("img");
    const attacks = firstNum(getTitle(atkImg)) ?? 0;

    const resText = tds[5]?.innerText || '';
    const resourses = resText.match(/\d+/g)?.map(n => Number(n)) ?? null;

    const wall = numOrNull(tds[6]?.innerText);
    const distance = Number(tds[7]?.innerText ?? NaN);

    const typeImg = tds[1]?.querySelector?.("img")?.src || '';
    const typeMatch = typeImg.match(/red_blue|red_yellow|red|yellow|blue|green/i);
    const type = typeMatch ? typeMatch[0] : null;

    const lottImg = tds[2]?.querySelector?.("img")?.src || '';
    const lottMatch = lottImg ? lottImg.split('/').pop().match(/\d/) : null;
    const lott = lottMatch ? lottMatch[0] : 'none';

    const timeMatch = tds[4]?.innerText.match(/(\d+:\d+:\d+)/)
    const dateTrans = normalizeDateTwString(tds[4]?.innerText.replace(` ${timeMatch.pop() ?? ''}`))
    const report_time = nDateTime(dateTrans ?? '', timeMatch.pop() ?? '')
    const makeBtn = (el) => {
      if (!el || el.className.includes('farm_icon_disabled')) return null;
      const t = getTitle(el);
      return {
        action: clickInvoker(el),
        duration: firstTime(t)
      };
    };

    acc.push({
      type,
      lott,
      target,
      report_id,
      x, y,
      attacks,
      report_time,
      resourses,
      wall,
      distance: Number.isFinite(distance) ? distance : null,
      a: makeBtn(farmIconA),
      b: makeBtn(farmIconB),
      c: makeBtn(farmIconC),
      // place: lastA?.href || '',
      // infoVillage: urlBase ? (urlBase + `&screen=info_village&id=${target}`) : '',
      // command: urlBase ? (urlBase + `&screen=place&ajax=command&target=${target}`) : '',
      // confirm: urlBase ? (urlBase + `&screen=place&ajax=confirm`) : '',
      // popup: urlBase ? (urlBase + `&screen=place&ajaxaction=popup_command`) : ''
    });

    return acc;
  }, []);

  return { plunderList, plunderListHtml };
}

// retorna se relatório bate com 1 botão
async function isValidReportPerButton(report, button) {
  const { config } = await dataConfig()
  const keys = Object.keys(config[button])
  const maxAttacks = config[button][`${report.lott}:maxAttacks`]
  if (
    report[button] &&
    report[button].action &&
    config[button].active &&
    keys.find(key => key === `${report.lott}:active`) &&
    keys.find(key => key === `${report.lott}:${report.type}`) &&
    Number(report.distance) <= Number(config[button].maxDistance)  &&
    Number(report.attacks) < Number(maxAttacks) &&
    Number(report.wall) <= Number(config[button].maxWall)
  ) {
    return true
  }
  return false
}

// retorna lista de botões que coincidem c relatório
async function avaiableButtonsForReport(report) {
  const farmSession = await storageFarmSession.get();
  const attacked = new Set(farmSession?.targets?.map(Number) || []);

  const { buttons } = await dataConfig()
  const values = [];
  for (const button of buttons) {
    if ((await isValidReportPerButton(report, button)) && !attacked.has(Number(report.target))) {
      values.push(button)
    }
  }
  return values;
}

// atualiza o html da página e retorna plunderList e plunderListHtml atualizados
async function setPlunderListAvaliables (html = document) {
  const { plunderListHtml, plunderList } = getPlunderList(html)

  for (let i = 0; i < plunderList.length; i++) {
    const report = plunderList[i];
    const avaiable = await avaiableButtonsForReport(report);
    if (!avaiable.length) {
      plunderListHtml[i].remove()
    }
  }

  return getPlunderList(html)
}

export {
  getPlunderList,
  setPlunderListAvaliables,
  avaiableButtonsForReport,
  isValidReportPerButton
}
