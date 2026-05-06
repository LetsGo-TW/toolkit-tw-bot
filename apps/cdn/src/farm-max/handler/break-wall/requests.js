import { makeAjaxHeadersGet, makeAjaxHeadersPost } from "@toolkit-tw-bot/browser";
import { getGameData } from "@toolkit-tw-bot/document";

async function fetchCommand(villageId, targetId, targetX, targetY, template) {
  const gameData = getGameData()
  const url = new URL(`${gameData.link_base_pure}place&ajax=command&target=${targetId}`, window.location.origin)
  url.searchParams.set('village', villageId)
  const controller = new AbortController();
  const req = new Request(url.toString(), {
    method: "GET",
    headers: makeAjaxHeadersGet(),      // só TribalWars-Ajax: 1
    credentials: "include",
    referrerPolicy: "origin",
    cache: "no-store",
    signal: controller.signal
  });

  const t = setTimeout(() => controller.abort(), 8000);

  try {
    const res = await fetch(req);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const { response, error } = await res.json();
    if (error || !response || !response.dialog) throw new Error(error ?? response.toString())
    const html = new DOMParser().parseFromString(response.dialog, "text/html");

    const inputs = Array.from(html.querySelectorAll("#command-data-form input"));

    const isTroops = () => {
      return Object.keys(template).reduce((validate, unit) => {
        const inputValue = Number(inputs.find(inp => inp.name === unit)?.dataset?.allCount || '0')
        if (template[unit] > 0 && inputValue < template[unit]) validate = false
        return validate
      }, true)
    }

    if (!isTroops()) {
      throw new Error('Sem tropas suficientes para enviar.')
    }

    const excludeType = "support";

    const payload = inputs.reduce((arr, el) => {
      const name = el.getAttribute("name");
      if (!name || name === excludeType) return arr;

      let value;
      if (name === 'attack') value = "l";
      else if (name === "x") value = targetX;
      else if (name === "y") value = targetY;
      else if (gameData.units.includes(name)) value = template[name] ?? ''
      else value = template[name] ?? el.getAttribute("value")

      arr.push([name, value]);
      return arr;
    }, []);

    if (!payload.find(([n]) => n === "h")) payload.push(["h", gameData.csrf]);
    return payload;
  } catch (e) {
    console.error(e)
    throw e
  } finally {
    clearTimeout(t);
  }
}

async function fetchConfirmCommand(villageId, payloadCommand) {
  const gameData = getGameData()
  const url = new URL(`${gameData.link_base_pure}place&ajax=confirm`, window.location.origin)
  url.searchParams.set('village', villageId)
  const body = new URLSearchParams();
  for (const [k, v] of payloadCommand) body.append(k, v);

  const controller = new AbortController();
  const headers = makeAjaxHeadersPost();

  const req = new Request(url.toString(), {
    method: "POST",
    headers,
    body,
    credentials: "include",
    referrerPolicy: "origin",
    cache: "no-store",
    signal: controller.signal
  });

  const t = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(req);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const { response, error } = await res.json();
    if (error || !response || !response.dialog) throw new Error(error || response.toString())
    const html = new DOMParser().parseFromString(response.dialog, "text/html");
    const durationSecond = Number(html?.querySelector('.relative_time')?.dataset?.duration)
    const inputs = Array.from(html.querySelectorAll("#command-data-form input"));
    const payload = inputs.reduce((arr, el) => {
      const name = el.getAttribute("name");
      if (name && !['submit_confirm', 'save_default_attack_building'].includes(name)) {
        const value = name === 'attack_name' && !el.getAttribute("value") && gameData.features.Premium.active
          ? 'breakWall'
          : el.getAttribute("value") ?? "troop_confirm_submit";
        arr.push([name, value])
      }
      return arr;
    }, []);

    if (!payload.find(([n]) => n === "building")) payload.push(["building", "wall"]);
    payload.push(["h", gameData.csrf], ["h", gameData.csrf]);
    return {payload, durationSecond};
  } catch (e) {
    console.error(e)
    throw e
  } finally {
    clearTimeout(t);
  }
}

async function fetchPopupCommand(villageId, payloadConfirm) {
  const gameData = getGameData()
  const url = new URL(`${gameData.link_base_pure}place&ajaxaction=popup_command`, window.location.origin)
  url.searchParams.set('village', villageId)
  const body = new URLSearchParams();
  for (const [k, v] of payloadConfirm) body.append(k, v);

  const controller = new AbortController();
  const headers = makeAjaxHeadersPost();

  const req = new Request(url.toString(), {
    method: "POST",
    headers,
    body,
    credentials: "include",
    referrerPolicy: "origin",
    cache: "no-store",
    signal: controller.signal
  });

  const t = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(req);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const { game_data, response, error } = await res.json()

    if (error || !response || !game_data) throw new Error(error || response.toString())

    const { time_generated } = game_data
    const { message, target_village, source_village } = response;

    return { time_generated, message, target_village, source_village };
  } catch (e) {
    console.error(e)
    throw e
  } finally {
    clearTimeout(t);
  }
}

export { fetchCommand, fetchConfirmCommand, fetchPopupCommand }
