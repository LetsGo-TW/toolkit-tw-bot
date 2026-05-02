import Running from "../../running";
import { printMessage } from "../../components/printMessage";
import { Distance } from "@toolkit-tw-bot/core";
import { getGameData, ProtectingBot } from "@toolkit-tw-bot/document";
import { getAjaxMapFarm } from "./getAjaxMapFarm";
import { getAmFarmDoc } from "./getAmFarmDoc";
import { postAjaxFarmFilter } from "./postAjaxFarmFilter";

export function searchBarbarians() {
  const gameData = getGameData();

  const url = new URL(window.location.href)

  if (url.searchParams.get('screen') !== 'map') {
    console.log("%c[Farm] Só executa no screen=mapa... redirecionando", "color: red; font-weight: bold; font-size: 14px;");
    printMessage.error("Redirecionando para o mapa.", 3000);
    url.searchParams.set('screen', 'map')
    setTimeout(() => window.location.assign(url.toString()), 1000)
    return;
  }

  const running = new Running('mapSearch')

  const mapChooseSelect = document.querySelector("#map_chooser_select")
  const RESIZE_MAP_KEY = `_resizeMap__${gameData.world}_${gameData.player.id}`
  const resizeMap = localStorage.getItem(RESIZE_MAP_KEY) || mapChooseSelect?.value || '15'
  window.TWMap.resize(parseInt(resizeMap))

  const CUR_VILLAGE_ID = gameData.village.id;
  const distance = new Distance({ x: gameData.village.x, y: gameData.village.y });

  const controller = new AbortController();

  // Pausa humana e números aleatórios
  function getRandomNumber(min, max) {
    return Math.floor(Math.random() * (max - min) + min);
  }

  function wait(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // Avisos na tela (UI nativa do TW)
  function printInfoMsg(msg, time = 10000) {
    printMessage.info(msg, time);
  }

  // Extrai a quantidade de tropas configuradas para o template ativo de forma blindada
  function getTemplateUnits(doc, templateId) {
    let tUnits = {};
    let hasUnits = false;
    const container = doc.querySelector('.loot_assistant_templates');
    if (!container) return null;

    const inputs = Array.from(container.querySelectorAll('input'));
    gameData.units.forEach(u => {
      const input = inputs.find(e => e.name.includes(templateId) && e.name.includes(u));
      if (input) {
        tUnits[u] = parseInt(input.value, 10) || 0;
        if (tUnits[u] > 0) hasUnits = true;
      }
    });
    return hasUnits ? tUnits : null;
  }

  // Varre todas as páginas do Assistente de Saque para descobrir quem já foi atacado
  async function getAllFACoords(max_distance) {
    let coords = [];
    printInfoMsg(`Lendo Assistente de Saque para filtrar alvos...`, 2000);

    try {
      const url = new URL(`${gameData.link_base_pure}am_farm&order=distance&dir=asc`, window.location.origin)
      url.searchParams.set('village', CUR_VILLAGE_ID)
      url.searchParams.set('Farm_page', 0)

      let doc = await getAmFarmDoc(url.toString(), { signal: controller.signal });

      if (ProtectingBot['bot-protect-all-in-game'].active(doc)) {
        throw ProtectingBot.error()
      }
      const extractCoords = (htmlDoc) => {
        let pageCoords = [];
        const rows = htmlDoc.querySelectorAll('#plunder_list tr');
        rows.forEach(row => {
          const matches = row.textContent.match(/\d{1,3}\|\d{1,3}/g);
          if (matches) {
            let [cx, cy] = matches[matches.length - 1].split('|');
            pageCoords.push(`${parseInt(cx, 10)}|${parseInt(cy, 10)}`);
          }
        });
        return pageCoords;
      };

      let firstPageCoords = extractCoords(doc);
      coords = coords.concat(firstPageCoords);

      let pagesNumbers = [];
      let plunderNav = doc.querySelector('#plunder_list_nav');
      if (plunderNav) {
        let elements = plunderNav.querySelectorAll('a.paged-nav-item, option');
        elements.forEach(el => {
          let url = el.href || el.value;
          if (url) {
            let match = url.match(/Farm_page=(\d+)/);
            if (match) {
              let pageNum = parseInt(match[1], 10);
              if (pageNum !== 0 && !pagesNumbers.includes(pageNum)) {
                pagesNumbers.push(pageNum);
              }
            }
          }
        });
        pagesNumbers.sort((a, b) => a - b);
      }

      let shouldContinue = true;
      if (firstPageCoords.length > 0) {
        let lastCoord = firstPageCoords[firstPageCoords.length - 1];
        if (distance.calc(lastCoord) > max_distance) shouldContinue = false;
      }

      if (shouldContinue) {
        for (let i = 0; i < pagesNumbers.length; i++) {
          // Pausa a execução se o status for 'paused' durante a leitura das páginas.
          while (running.is_paused('mapSearch')) {
            if (!running.is_active('mapSearch')) break;
            await wait(500);
          }

          if (!running.is_active('mapSearch')) {
            console.log(`[Farm] Coleta de páginas parada pelo usuário.`);
            break;
          }
          let pageNum = pagesNumbers[i];
          printInfoMsg(`Coletando aldeias FA: ${i + 1}/${pagesNumbers.length}...`, 2000);

          const pageUrl = new URL(`${gameData.link_base_pure}am_farm&order=distance&dir=asc`, window.location.origin)
          pageUrl.searchParams.set('village', CUR_VILLAGE_ID)
          pageUrl.searchParams.set('Farm_page', pageNum)
          let pDoc = await getAmFarmDoc(pageUrl.toString(), { signal: controller.signal });
          if (ProtectingBot['bot-protect-all-in-game'].active(pDoc)) {
            throw ProtectingBot.error()
          }
          let pageCoords = extractCoords(pDoc);

          // Se a página não retorna nenhuma coordenada, consideramos que chegamos ao fim da lista do assistente.
          if (pageCoords.length === 0) {
            console.log(`[Farm] Página ${pageNum} do Assistente de Saque não retornou coordenadas. Parando a coleta.`);
            break;
          }

          coords = coords.concat(pageCoords);

          let lastCoord = pageCoords[pageCoords.length - 1];
          if (distance.calc(lastCoord) > max_distance) {
            console.log(`[Farm] Limite de distância atingido. Ignorando ${pagesNumbers.length - (i + 1)} página(s) restantes.`);
            break;
          }
        }
      }
    } catch (e) {
      console.error("[Farm] Erro ao ler Assistente de Saque:", e);
      printMessage.error("Falha na coleta do AS. Abortando para evitar ataques repetidos.", 4000);
      throw e;
    }

    coords = [...new Set(coords)];
    console.log(`[Farm] Lidas ${coords.length} aldeias no Assistente de Saque.`);
    return coords;
  }

  // Lê os dados do mapa atual e extrai as Bárbaras
  function getMapBarbs() {
    let barbs = [];

    for (let key in TWMap.villages) {
      let village = TWMap.villages[key];
      if (village.owner === "0") {
        let barb_x = Math.floor(village.xy / 1000).toString();
        let barb_y = (village.xy % 1000).toString();
        let coord = `${barb_x}|${barb_y}`;
        barbs.push([village.id, barb_x, barb_y, distance.calc(coord)]);
      }
    }
    barbs.sort((a, b) => a[3] === b[3] ? 0 : (a[3] < b[3] ? -1 : 1));
    return barbs;
  }

  function removeAttackedVillages(barbs, fa_coords) {
    let filtered_barbs = [];
    for (let i = 0; i < barbs.length; i++) {
      let coord = `${barbs[i][1]}|${barbs[i][2]}`;
      if (!fa_coords.includes(coord)) {
        filtered_barbs.push(barbs[i]);
      }
    }
    return filtered_barbs;
  }

  async function getAndApplyFilters() {
    const urlAmPage = new URL(`${gameData.link_base_pure}am_farm&order=distance&dir=asc`, window.location.origin)
    urlAmPage.searchParams.set('village', CUR_VILLAGE_ID)
    urlAmPage.searchParams.set('Farm_page', 0)
    let doc = await getAmFarmDoc(urlAmPage.toString(), { signal: controller.signal });
    if (ProtectingBot['bot-protect-all-in-game'].active(doc)) {
      throw ProtectingBot.error()
    }

    let savedFilters = [];

    const filterConfig = {
      'all_village_checkbox': { param: 'all_villages', action: 'toggle_show_all_villages', target: 0 },
      'attacked_checkbox': { param: 'show_attacked', action: 'toggle_show_attacked', target: 1 },
      'full_losses_checkbox': { param: 'full_losses', action: 'toggle_show_full_losses', target: 1 },
      'partial_losses_checkbox': { param: 'partial_losses', action: 'toggle_show_partial_losses', target: 1 },
      'full_hauls_checkbox': { param: 'only_full_hauls', action: 'toggle_only_full_hauls', target: 0 }
    };

    for (let id in filterConfig) {
      let cb = doc.getElementById(id);
      if (cb) {
        let isChecked = cb.hasAttribute('checked') || cb.checked;
        let currentState = isChecked ? 1 : 0;
        let desiredState = filterConfig[id].target;
        let param = filterConfig[id].param;
        let action = filterConfig[id].action;

        savedFilters.push({ action, param, wasChecked: isChecked, changedTo: desiredState });

        if (currentState !== desiredState) {
          console.log(`[Farm] Forçando filtro (${id}): ${param} -> ${desiredState}`);
          await postAjaxFarmFilter(action, param, desiredState, { signal: controller.signal });
          await wait(500);
        }
      } else {
        console.log(`[Farm] Aviso: Filtro ${id} não encontrado na página!`);
      }
    }
    return { savedFilters, doc };
  }

  async function restoreFilters(savedFilters) {
    if (!savedFilters) return;
    for (let f of savedFilters) {
      let originalState = f.wasChecked ? 1 : 0;
      if (originalState !== f.changedTo) {
        console.log(`[Farm] Restaurando filtro (${f.param}): -> ${originalState}`);
        await postAjaxFarmFilter(f.action, f.param, originalState, { signal: controller.signal });
        await wait(500);
      }
    }
  }

  // Loop Principal de Execução
  async function spyBarbs() {
    if (running.is_active('mapSearch')) return;

    if (!gameData?.features?.FarmAssistent?.active) {
      printMessage.error('O Assistente de Saque está desabilitado.', 3000)
      return
    }

    const a_el = document.getElementsByClassName('farm_icon_a')[0];
    const b_el = document.getElementsByClassName('farm_icon_b')[0];
    let A_TEMPLATE_ID = a_el ? a_el.getAttribute('data-template-id').split(':')[0] : '0';
    let B_TEMPLATE_ID = b_el ? b_el.getAttribute('data-template-id').split(':')[0] : '0';

    if (typeof TWMap !== 'undefined' && TWMap.urls && TWMap.urls.ctx) {
      if (A_TEMPLATE_ID === '0' && TWMap.urls.ctx.mp_farm_a) {
        const matchA = TWMap.urls.ctx.mp_farm_a.match(/template_id=(\d+)/);
        if (matchA) A_TEMPLATE_ID = matchA[1];
      }
      if (B_TEMPLATE_ID === '0' && TWMap.urls.ctx.mp_farm_b) {
        const matchB = TWMap.urls.ctx.mp_farm_b.match(/template_id=(\d+)/);
        if (matchB) B_TEMPLATE_ID = matchB[1];
      }
    }

    running.activate('mapSearch');

    console.log("%c[Farm] Aplicando configurações de filtros no Assistente de Saque...", "color: yellow; font-size: 12px;");

    let savedFilters = [];

    try {
      if (A_TEMPLATE_ID === '0' && B_TEMPLATE_ID === '0') {
        console.log("%c[Farm] Buscando IDs dos templates em segundo plano...", "color: yellow; font-size: 12px;");
        try {
          const urlAmPage = new URL(`${gameData.link_base_pure}am_farm&order=distance&dir=asc`, window.location.origin)
          urlAmPage.searchParams.set('village', CUR_VILLAGE_ID)
          urlAmPage.searchParams.set('Farm_page', 0)
          let doc = await getAmFarmDoc(urlAmPage.toString(), { signal: controller.signal });
          if (ProtectingBot['bot-protect-all-in-game'].active(doc)) {
            throw ProtectingBot.error()
          }

          let a_bg = doc.querySelector('.farm_icon_a');
          let b_bg = doc.querySelector('.farm_icon_b');
          if (a_bg) A_TEMPLATE_ID = a_bg.getAttribute('data-template-id').split(':')[0];
          if (b_bg) B_TEMPLATE_ID = b_bg.getAttribute('data-template-id').split(':')[0];
        } catch (e) {}
      }

      let template = A_TEMPLATE_ID !== '0' ? A_TEMPLATE_ID : B_TEMPLATE_ID;

      if (template === '0') {
        printMessage.error("Nenhum template A ou B encontrado!", 3000);
        return;
      }

      let filterData = await getAndApplyFilters();
      savedFilters = filterData.savedFilters;
      let active_template_units = getTemplateUnits(filterData.doc, template);

      if (!active_template_units) {
        console.log("%c[Farm] Aviso: Não foi possível ler os requisitos de tropas do modelo. O script usará a resposta do servidor como fallback.", "color: orange;");
      }

      let map_barbs = getMapBarbs();

      if (map_barbs.length === 0) {
        printMessage.error("Nenhuma bárbara disponível na área do mapa atual.", 3000);
        return;
      }
      let max_distance = map_barbs[map_barbs.length - 1][3];

      let fa_coords = await getAllFACoords(max_distance);
      map_barbs = removeAttackedVillages(map_barbs, fa_coords);

      if (typeof TWMap !== 'undefined' && typeof TWMap.commandIcons === 'undefined') {
        TWMap.commandIcons = {};
      }

      // Filtra antecipadamente as bárbaras que já possuem ataque a caminho ou ícones de perda no mapa
      map_barbs = map_barbs.filter(barb => {
        let barb_id = barb[0];

        let cmdIcons = TWMap?.commandIcons?.[barb_id];
        let hasAttack = Array.isArray(cmdIcons) ? cmdIcons.some(i => i && i.img === 'attack') : false;

        let vIcons = TWMap?.villageIcons?.[barb_id];
        let hasLossIcon = false;
        if (Array.isArray(vIcons)) {
          hasLossIcon = vIcons.some(i => i && i.img && (i.img.includes('red') || i.img.includes('yellow')));
        } else if (typeof vIcons === 'string') {
          hasLossIcon = vIcons.includes('red') || vIcons.includes('yellow');
        }

        return !hasAttack && !hasLossIcon;
      });

      if (map_barbs.length === 0) {
        console.log("%c[Farm] Todas as bárbaras da tela já foram atacadas ou filtradas.", "color: orange; font-weight: bold;");
        printMessage.error("Todas as bárbaras da área já foram atacadas ou filtradas.", 3000);
        return;
      }

      let total = map_barbs.length;
      let count = 0;
      let consecutiveErrors = 0;
      let stoppedByLackOfUnits = false;

      for (let barb of map_barbs) {
        // Pausa a execução se o status for 'paused', verificando a cada 500ms.
        while (running.is_paused('mapSearch')) {
          if (!running.is_active('mapSearch')) break; // Sai se o processo foi totalmente parado
          await wait(500);
        }

        if (!running.is_active('mapSearch')) break;
        if (ProtectingBot['bot-protect-all-in-game'].active()) {
          throw ProtectingBot.error()
        }

        let barb_id = barb[0];

        try {
          let response = await getAjaxMapFarm(template, barb_id, { signal: controller.signal });
          if (response.error) {
            consecutiveErrors++;
            printMessage.error(response.error, 3000);

            const errorMsg = (Array.isArray(response.error) ? response.error[0] : response.error).toLowerCase();
            if (errorMsg.includes('unidade') || errorMsg.includes('unit') || errorMsg.includes('tropa') || errorMsg.includes('suficiente')) {
              console.log("%c[Farm] Tropas esgotadas. Parando envios.", "color: orange; font-weight: bold;");
              stoppedByLackOfUnits = true;
              break;
            }
            console.log(`%c[Farm] Erro no alvo ${barb_id}: ${response.error} - Pulando vila.`, "color: yellow;");

            if (consecutiveErrors >= 2) {
              console.log("%c[Farm] Muitos erros seguidos. Verificando captcha...", "color: orange;");
              const checkUrl = new URL(`${gameData.link_base_pure}am_farm`, window.location.origin);
              checkUrl.searchParams.set('village', CUR_VILLAGE_ID);
              const checkDoc = await getAmFarmDoc(checkUrl.toString(), { signal: controller.signal });
              if (ProtectingBot['bot-protect-all-in-game'].active(checkDoc)) {
                throw ProtectingBot.error()
              }
              consecutiveErrors = 0;
            }
            continue;
          }

          consecutiveErrors = 0;
          printMessage.success(`Atacando Bárbara: ${++count} de ${total}`);

          if (!TWMap.commandIcons[barb_id]) {
            TWMap.commandIcons[barb_id] = [];
          }
          if (!TWMap.commandIcons[barb_id].some(i => i.img === 'attack')) {
            TWMap.commandIcons[barb_id].push({ img: 'attack' });
          }

          if (response.response && response.response.current_units && active_template_units) {
            let enoughUnits = true;
            for (let u of gameData.units) {
              let required = active_template_units[u] || 0;
              let available = parseInt(response.response.current_units[u] || '0', 10);
              if (required > available) {
                enoughUnits = false;
                break;
              }
            }
            if (!enoughUnits) {
              console.log("%c[Farm] Tropas insuficientes para o próximo envio. Parando antecipadamente.", "color: orange; font-weight: bold;");
              stoppedByLackOfUnits = true;
              break;
            }
          }

          await wait(getRandomNumber(250, 450));
        } catch (err) {
          consecutiveErrors++;
          if (err.name === 'AbortError') {
            console.log(`%c[Farm] Tempo limite de conexão excedido ao atacar o alvo ${barb_id}.`, "color: yellow;");
          } else {
            console.error("[Farm] Erro de requisição no sendAttack:", err);
          }
          printMessage.error("Erro de requisição.", 3000);

          if (consecutiveErrors >= 2) {
            console.log("%c[Farm] Muitos erros de requisição seguidos. Verificando captcha...", "color: orange;");
            try {
              const checkUrl = new URL(`${gameData.link_base_pure}am_farm`, window.location.origin);
              checkUrl.searchParams.set('village', CUR_VILLAGE_ID);
              const checkDoc = await getAmFarmDoc(checkUrl.toString(), { signal: controller.signal });
              if (ProtectingBot['bot-protect-all-in-game'].active(checkDoc)) {
                throw ProtectingBot.error()
              }
              consecutiveErrors = 0;
            } catch (checkErr) {
              console.error("[Farm] Proteção contra bot acionada ou falha na verificação:", checkErr);
              break;
            }
          }
        }
      }

      if (typeof TWMap.reload === 'function') TWMap.reload();

      if (stoppedByLackOfUnits) {
        printMessage.warn("Tropas esgotadas/insuficientes. Envios finalizados.", 5000);
      } else {
        console.log("%c[Farm] Finalizado!", "color: green; font-weight: bold; font-size: 14px;");
        printMessage.success("Search barbarians concluído!");
      }
    } catch (error) {
      console.error("[Farm] Execução interrompida:", error);
      if (error && error.message === 'bot-protect') {
        printMessage.error("Processo interrompido: Proteção antibot ativada.", 4000);
      } else if (error && error.name !== 'AbortError') {
        printMessage.error("Ocorreu um erro. Verifique o console.", 4000);
      }
    } finally {
      console.log("%c[Farm] Restaurando filtros do Assistente de Saque...", "color: yellow; font-size: 12px;");
      running.remove('mapSearch');
      await restoreFilters(savedFilters);
    }
  }

  const searchContext = {
    mapChooseSelect,
    resizeMap,
    key: RESIZE_MAP_KEY,
    spyBarbs,
    controller,
    running
  }

  return searchContext
}
