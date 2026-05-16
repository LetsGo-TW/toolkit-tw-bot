import { DOC_REQUEST_TIMEOUT_MS, makeAjaxHeadersGet } from "@toolkit-tw-bot/browser";
import { getGameData } from "@toolkit-tw-bot/document";
import { parseTwJsonText } from "../../../requests/utils/parseTwResponseText.js";

function getRequestErrorText(error) {
  const reason = error?.cause ?? error?.reason;

  if (
    error?.name === "AbortError" ||
    error?.message === "timeout" ||
    reason?.message === "timeout" ||
    reason === "timeout"
  ) {
    return `timeout apos ${DOC_REQUEST_TIMEOUT_MS}ms`;
  }

  if (typeof error?.message === "string" && error.message.trim()) {
    return error.message.trim();
  }

  if (typeof reason?.message === "string" && reason.message.trim()) {
    return reason.message.trim();
  }

  return String(error || "erro desconhecido");
}

function wrapRequestError(error, context) {
  const wrapped = new Error(`${context}: ${getRequestErrorText(error)}`);
  wrapped.cause = error;
  return wrapped;
}

async function fetchReports({ url, init }) {
  const controller = new AbortController();
  init.signal = controller.signal
  const request = new Request(url, init)
  const t = setTimeout(() => controller.abort(new Error("timeout")), DOC_REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(request);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.text()
  } catch (error) {
    throw wrapRequestError(error, "Falha ao buscar pagina de relatorios");
  } finally {
    clearTimeout(t);
  }
}

async function fetchReportView(villageId, reportId) {
  const gameData = getGameData();
  const url = new URL(`${gameData.link_base_pure}report&ajax=view&id=${reportId}`, window.location.origin)
  url.searchParams.set('village', villageId)
  const controller = new AbortController();
  const headers = makeAjaxHeadersGet();

  const req = new Request(url.toString(), {
    method: "GET",
    headers,
    credentials: "include",
    referrerPolicy: "origin",
    cache: "no-store",
    signal: controller.signal
  });

  const t = setTimeout(() => controller.abort(new Error("timeout")), DOC_REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(req);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const { response, error } = parseTwJsonText(await res.text(), "reports:view-response");
    if (error || !response || !response.dialog) throw new Error(error ?? response.toString())
    const html = new DOMParser().parseFromString(response.dialog, "text/html");
    const isBreakWall = () => {
      const ramCount = html.querySelector("#attack_info_att_units tbody tr td.unit-item-ram")?.getAttribute('data-unit-count')
      if (!ramCount) return false
      return Number(ramCount) >= 2
    }
    const breakWall = isBreakWall()

    const trs = Array.from(html.querySelectorAll('#attack_info_def_units tbody tr'))
    if (!trs.length) {
      return {
        isBreakWall: breakWall,
        hasDefenseInfo: false,
        alive: false,
        units: [],
        wall: 0,
        destroy: { target: undefined, level: undefined },
        buildings: [],
      }
    }

    const unitsTr = trs[1]
    const lossesTr = trs[2]
    const headerTr = trs[0]

    if (!headerTr || !unitsTr || !lossesTr) {
      throw new Error("Estrutura inesperada do relatorio");
    }

    let alive = false;
    const units = Array.from(unitsTr.querySelectorAll('.unit-item'))
      .map((e, i) => {
        const img = Array.from(headerTr.querySelectorAll('img'))[i]
        const loss = Array.from(lossesTr.querySelectorAll('.unit-item'))[i]
        const value = Number(e?.dataset?.unitCount) - Number(loss?.dataset?.unitCount)
        const name = img.getAttribute('data-title') || img.title
        const id = e?.getAttribute('class')?.match(/unit-item-([a-z]{1,})/)[1]
        if (value > 0) alive = true
        return {id, value, name}
      })
    const buildings = (JSON.parse(html.querySelector("#attack_spy_building_data")?.value || null) || [])
      .map(b => { if (!b.level) return b; return { ...b, level: Number(b.level) }})
    const ramUnit = units.find(u => u.id === 'ram')
    const ram = {
      name: ramUnit?.name,
      id: ramUnit?.id,
      tr: undefined,
      level: undefined
    }
    if (ram.name) {
      ram['tr'] = Array.from(html.querySelectorAll("#attack_results tr"))
        .filter(tr => tr.querySelector('th').textContent.toLowerCase().indexOf(ram.name.toLowerCase()) !== -1)[0]
      if (ram.tr) {
        ram.level = Math.min(
          ...Array.from(ram.tr.querySelectorAll('b')).map(b => Number(b.textContent))
        )
      }
    }
    if (buildings.length) {
      const bWall = buildings.find(b => b.id === 'wall')
      ram.level = bWall?.level || ram.level
    }
    const catapultUnit = units.find(u => u.id === 'catapult')
    const catapult = {
      name: catapultUnit?.name,
      id: catapultUnit?.id,
      tr: undefined,
      level: undefined,
      target: undefined
    }
    if (catapult.name) {
      catapult['tr'] = Array.from(html.querySelectorAll("#attack_results tr"))
        .filter(tr => tr.querySelector('th').textContent.toLowerCase().indexOf(catapult.name.toLowerCase()) !== -1)[0]
      if (catapult.tr) {
        catapult.level = Math.min(
          ...Array.from(catapult.tr.querySelectorAll('b')).map(b => Number(b.textContent))
        )
        if (buildings.length) {
          catapult.target = buildings.reduce((target, { id, name }) => {
            if (catapult.tr.querySelector('td').textContent.toLowerCase().includes(name.toLowerCase())) {
              target = id
            }
            return target
          }, undefined)
        }
      }
    }
    const wall = ram.level

    return {
      isBreakWall: breakWall,
      hasDefenseInfo: true,
      alive,
      units,
      wall,
      destroy: { target: catapult.target, level: catapult.level },
      buildings
    }
  } catch (error) {
    throw wrapRequestError(error, `Falha ao abrir relatorio ${reportId}`);
  } finally {
    clearTimeout(t);
  }
}

export { fetchReports, fetchReportView }
