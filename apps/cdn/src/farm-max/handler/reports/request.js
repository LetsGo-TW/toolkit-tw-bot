import { makeAjaxHeadersGet } from "@toolkit-tw-bot/browser";
import { getGameData } from "@toolkit-tw-bot/document";
import { parseTwJsonText } from "../../../requests/utils/parseTwResponseText.js";

async function fetchReports({ url, init }) {
  const controller = new AbortController();
  init.signal = controller.signal
  const request = new Request(url, init)
  const t = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(request);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.text()
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

  const t = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(req);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const { response, error } = parseTwJsonText(await res.text(), "reports:view-response");
    if (error || !response || !response.dialog) throw new Error(error ?? response.toString())
    const html = new DOMParser().parseFromString(response.dialog, "text/html");
    const trs = Array.from(html.querySelectorAll('#attack_info_def_units tbody tr'))
    let alive = false
    const units = Array.from(trs[1].querySelectorAll('.unit-item'))
      .map((e, i) => {
        const img = Array.from(trs[0].querySelectorAll('img'))[i]
        const loss = Array.from(trs[2].querySelectorAll('.unit-item'))[i]
        const value = Number(e?.dataset?.unitCount) - Number(loss?.dataset?.unitCount)
        const name = img.getAttribute('data-title') || img.title
        const id = e?.getAttribute('class')?.match(/unit-item-([a-z]{1,})/)[1]
        if (value > 0) alive = true
        return {id, value, name}
      })
    const buildings = (JSON.parse(html.querySelector("#attack_spy_building_data")?.value || null) || [])
      .map(b => { if (!b.level) return b; return { ...b, level: Number(b.level) }})
    const ram = {
      name: units.find(u => u.id === 'ram').name,
      id: units.find(u => u.id === 'ram').id,
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
    const catapult = {
      name: units.find(u => u.id === 'catapult').name,
      id: units.find(u => u.id === 'catapult').id,
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

    return { alive, units, wall, destroy: { target: catapult.target, level: catapult.level },  buildings }
  } finally {
    clearTimeout(t);
  }
}

export { fetchReports, fetchReportView }
