import youtubeLinkImage from "../../components/youtube-link-image";
import farmHTML from './index.html'
import farmCSS from './style.css'
import { printMessage } from "../../components/printMessage";
import { configBase, storageConfigFarm, storageFarmSchedules } from "../config";
import { initBreakWallConfig, storageBreakWallTemplates } from "../config/break-wall";
import { getAllAliveTargets } from "../handler/alive-targets";
import { Distance } from "@toolkit-tw-bot/core";
import { getGameData } from "@toolkit-tw-bot/document";
import { extensionId as RELEASE_EXTENSION_ID } from '@toolkit-tw-bot/release';
import { BotViewStatus } from "../../shared/bot-view-status";
import { getBlacklist } from "../config/break-wall/targets-black";
import { getAvaiablesSents } from "../config/break-wall/targets-sent";
import { hydrateGroupsSelect } from "../../groups/hydrateGroupSelect";

const source = 'FARM-VIEW'
const target = 'GO-FARM'

function insertCSS() {
  const styleHtml = document.createElement('style')
  styleHtml.id = 'toggle'
  styleHtml.innerHTML = farmCSS
  document.querySelector("head").appendChild(styleHtml)
}

async function setStatusMessage(message) {
  const config = await storageConfigFarm.get() || configBase
  const statusMessage = document.querySelector('#go-farm-status-msg')
  if (statusMessage) {
    if (!message) {
      message = config.active
        ? 'Aguardando próxima execução...'
        : 'Desativado. Configure e ative o auto-farm para iniciar.'
    }
    statusMessage.textContent = message
  }
}

async function onClickActive(e) {
  const config = await storageConfigFarm.get() || { ...configBase }
  config.active = e.target.checked
  await storageConfigFarm.set(config)
  await setStatusMessage()
  window.postMessage({ source, target, action: "set-farm-active", args: { active: config.active } });

  // Avisa o Service Worker para recalcular a máquina de estados/alarmes
  try {
    const gameData = getGameData()
    const response = await chrome.runtime.sendMessage(RELEASE_EXTENSION_ID, {
      extensionId: RELEASE_EXTENSION_ID,
      type: 'FARM_STATE_CHANGED',
      world: gameData?.world,
      playerId: parseInt(gameData?.player?.id, 10),
    }).catch(() => null);

    BotViewStatus.apply(response)
  } catch (err) {}

  console.log('[FARM_STATE_CHANGED]: ', config)
}

async function goFormSubmit(event) {
  event.preventDefault()
  const htmlForm = event.target
  const elements = htmlForm.querySelectorAll('input, select');
  const data = Array.from(elements).reduce((data, elem) => {
    let value;
    switch (elem.type) {
      case 'checkbox':
        value = elem.checked;
        break;
      case 'number':
        value = parseInt(elem.value, 10);
        break;
      case 'hidden':
        value = parseInt(elem.value, 10);
        break;
      case 'radio':
        if (elem.checked) {
          value = elem.value;
        }
        break;
      case 'select-one':
        if (elem.dataset.loading === 'true' && elem.dataset.pendingValue) {
          value = parseInt(elem.dataset.pendingValue, 10);
        } else {
          value = parseInt(elem.value, 10);
        }
        break;
      default:
        value = elem.value;
    }
    if (typeof value !== 'undefined' && elem.name) {
      data[elem.name] = value;
    }
    return data;
  }, {});
  await storageConfigFarm.set(data)
  await updateNextFarm()

  // Avisa o Service Worker que o 'season' ou outras configs mudaram
  try {
    const gameData = getGameData()
    const response = await chrome.runtime.sendMessage(RELEASE_EXTENSION_ID, {
      extensionId: RELEASE_EXTENSION_ID,
      type: 'FARM_CONFIG_CHANGED',
      world: gameData?.world,
      playerId: parseInt(gameData?.player?.id, 10),
    }).catch(() => null);

    BotViewStatus.apply(response)
  } catch (err) {}
  printMessage.success('Configurações salvas com sucesso!', 3000)
  console.log('[FARM_CONFIG_CHANGED]: ', data)
}

async function updateNextFarm() {
  const config = await storageConfigFarm.get() || configBase
  const newNextFarm = document.querySelector('#go-farm-header-next-time')
  const goNextFarm = document.querySelector('#go-next-farm')
  const goLastFarm = document.querySelector('#go-last-farm')
  if (!goNextFarm || !goLastFarm) return

  const last = Number(config?.last || 0)

  goLastFarm.value = last ? String(last) : ''

  if (!last) {
    goNextFarm.textContent = '';
    if (newNextFarm) newNextFarm.textContent = '';
    return
  }

  const nextTimestampMs = (last + (config.season * 60)) * 1000;
  const nextDate = new Date(nextTimestampMs);
  const pad = (value, size = 2) => String(value).padStart(size, '0');
  const nextSchedules = `${pad(nextDate.getDate())}/${pad(nextDate.getMonth() + 1)}/${nextDate.getFullYear()} ${pad(nextDate.getHours())}:${pad(nextDate.getMinutes())}:${pad(nextDate.getSeconds())}`;

  const text = `Próxima execução: ${nextSchedules}`;
  goNextFarm.textContent = text;
  goNextFarm.setAttribute('data-go-title', 'Hora efetiva do jogo (TW).')
  if (newNextFarm) newNextFarm.textContent = text;
}

async function insertConfig() {
  const config = await storageConfigFarm.get() || { ...configBase }
  const gameData = getGameData()

  if (!gameData.features.Premium.active) {
    config.groupId = 0
  }

  const elements = document.querySelectorAll('#go-farm-form-config input, select')

  Array.from(elements).forEach(elem => {
    const key = elem.name
    switch (elem.type) {
      case 'checkbox':
        elem.checked = Boolean(config[key]);
        break;
      case 'number':
        elem.value = Number(config[key]);
        break;
      case 'radio':
        if (config[key] === elem.value) {
          elem.checked = Boolean(config[key]);
        }
        break;
      case 'select-one':
        if (elem.id === 'go-farm-group') {
          elem.dataset.pendingValue = String(config[key] ?? 0)
        }
        elem.value = config[key];
        break;
      default:
        elem.value = config[key];
    }
  })
  console.log('[INSERT CONGIG]: ', config)

  await updateNextFarm()
}

async function onMessage({ data, origin }) {
  if (origin !== location.origin) return
  if (!data.source || (data.source && data.source === source)) return
  const { target, action, args } = data
  if (!target || target !== 'GO-FARM') return

  console.debug({ args })

  switch (action) {
    case 'set-farm-active': {
      const goActiveFarm = document.querySelector('#go-farm-active')
      if (goActiveFarm) goActiveFarm.checked = args.active
      break;
    }
    case "set-farm-last": {
      await updateNextFarm();
      break;
    }
    case "go-farm-status": {
      await setStatusMessage(args.message);
      if ('display' in args) {
        document.querySelector('#go-farm-status').style.display = args.display;
      }
      break;
    }
    case 'go-farm-schedules': {
      await renderSchedules();

      break
    }
    default:
      break;
  }
}

async function onClickSchedules(e) {
  const { name } = e.target
  if (!name) return
  const schedules = await storageFarmSchedules.get() || { values: [] }
  const index = schedules.values.findIndex(({ id }) => Number(id) === Number(name))
  if (index === -1) return
  schedules.values.splice(index, 1)
  await storageFarmSchedules.set(schedules)
  await renderSchedules()
}

async function showSchedules() {
  const nodeSchedules = document.querySelector('#go-farm-schedules')
  if (!nodeSchedules) return

  const classNames = nodeSchedules.getAttribute('class').trim().split(' ')

  if (!classNames.includes('show')) {
    classNames.push('show')
    await renderSchedules()
    nodeSchedules.addEventListener('click', onClickSchedules, true)
  } else {
    classNames.pop()
    nodeSchedules.innerHTML = ''
    nodeSchedules.removeEventListener('click', onClickSchedules, true)
  }
  nodeSchedules.setAttribute('class', classNames.join(' '))
}

async function renderSchedules() {
  const nodeSchedules = document.querySelector('#go-farm-schedules')
  if (!nodeSchedules) return

  const schedules = await storageFarmSchedules.get() || { values: [] }
  if (!schedules.values.length) {
    nodeSchedules.innerHTML = '<span class="red">Nenhum agendamento.</span>'
    return
  }

  const gameData = getGameData()

  const nodes = schedules.values.map((village, i) => {
    const nodes = Object.keys(village.units).reduce((node, key) => {
      if (!['catapult', 'ram'].includes(key)) {
        const value = village.units[key] || 0
        const src = `https://dsbr.innogamescdn.com/asset/415a0ab7/graphic/unit/unit_${key}.webp`
        node.push(
          `
            <span class="go-border">
              <img width="16px" src="${src}">
              <span style="font-size: smaller;">${value}</span>
            </span>
          `
        )
      }
      return node
    }, [])

    const baseUrl = new URL(gameData.link_base_pure, window.location.origin)
    baseUrl.searchParams.set('village', village.id)
    const overviewUrl = new URL(baseUrl)
    overviewUrl.searchParams.set('screen', 'overview')
    const amFarmUrl = new URL(baseUrl)
    amFarmUrl.searchParams.set('screen', 'am_farm')

    return `
      <div class="go-farm-schedules" id="item:${village.id}">
        <span>
          <span data-go-title="Ir para a visualização da aldeia.">${i + 1}. <a href="${overviewUrl.toString()}"><span>${village.name}</span></a></span>
          <span>
            ${nodes.join('')}
          </span>
        </span>
        <span>
          <span>~ ${parseInt(village.max)} <a href="${amFarmUrl.toString()}" data-go-title="Ir para AS da aldeia."><img src="https://dsbr.innogamescdn.com/asset/28bd5527/graphic/icons/farm_assistent.webp" style="width: 16px; height: 16px;"></a></span>
          <img name="${village.id}" class="cancel_link_icon" src="https://dsbr.innogamescdn.com/asset/fa087e61/graphic/delete.png" alt="Cancelar" data-go-title="Cancelar">
        </span>
      </div>
    `
  })
  nodeSchedules.innerHTML = nodes.join('')
}

async function breakWallShow(e) {
  const { id } = e.target
  if (!id) return
  const nodeCheck = document.querySelector('#go-farm-check')
  const nodeBlack = document.querySelector('#go-farm-black')
  const nodeAlives = document.querySelector('#go-farm-alive')

  const removeShow = (node) => {
    if (!node || !node?.classList.contains('show')) return
    node?.classList.remove('show')
    node.innerHTML = ''
  }

  const setShow = (node) => {
    if (node?.classList.contains('show')) return
    node?.classList.add('show')
  }

  switch (id) {
    case 'go-farm-check-show':
      removeShow(nodeAlives)
      removeShow(nodeBlack)
      if (nodeCheck?.classList.contains('show')) {
        removeShow(nodeCheck)
        break;
      }
      setShow(nodeCheck)
      await renderCheck(nodeCheck)
      break;
    case 'go-farm-black-show':
      removeShow(nodeAlives)
      removeShow(nodeCheck)
      if (nodeBlack?.classList.contains('show')) {
        removeShow(nodeBlack)
        break;
      }
      setShow(nodeBlack)
      await renderBlack(nodeBlack)
      break;
    case 'go-farm-alive-show':
      removeShow(nodeCheck)
      removeShow(nodeBlack)
      if (nodeAlives?.classList.contains('show')) {
        removeShow(nodeAlives)
        break;
      }
      setShow(nodeAlives)
      await renderAlives(nodeAlives)
      break;
    default:
      break;
  }
}

function formatTargetCoords(target, x, y) {
  if (!x || !y) return String(target)
  const ko = `${String(y).padStart(3, '0').substring(0, 1)}${String(x).padStart(3, '0').substring(0, 1)}`
  return `(${x}|${y}) K${ko}`
}

function getBaseGameUrl() {
  const gameData = getGameData()
  return new URL(gameData.link_base_pure, window.location.origin)
}

async function renderCheck(nodeCheck) {
  if (!nodeCheck) return
  const { avaible: breakWallSents = [] } = (await getAvaiablesSents()) || {}
  if (!breakWallSents.length) {
    nodeCheck.innerHTML = '<span class="red">Nenhum quebra muro em andamento.</span>'
    return
  }

  const baseUrl = getBaseGameUrl()
  const nodes = breakWallSents
    .slice()
    .sort((a, b) => Number(a.arrival) - Number(b.arrival))
    .map(({ target, x, y, arrival }, i) => {
      const infoUrl = new URL(baseUrl)
      infoUrl.searchParams.set('screen', 'info_village')
      infoUrl.searchParams.set('id', target)

      const placeUrl = new URL(baseUrl)
      placeUrl.searchParams.set('screen', 'place')
      placeUrl.searchParams.set('target', target)

      return `
        <div class="go-farm-alive go-border">
          <span>
            <span data-go-title="Ir para a visualização da aldeia.">${i + 1}.
              <a href="${infoUrl.toString()}">
                <span>${formatTargetCoords(target, x, y)}</span>
              </a>
            </span>
          </span>
          <span>
            <span data-go-title="Horário de chegada do quebra-muro.">
              ⏱️ ${new Date(Number(arrival)).toLocaleString()}
            </span>
            <a href="${placeUrl.toString()}" onclick="Accountmanager.farm.openRallyPoint(${target}, event)" data-go-title="Praça">
              <img src="https://dsbr.innogamescdn.com/asset/28bd5527/graphic/buildings/place.webp">
            </a>
          </span>
        </div>
      `
    })

  nodeCheck.innerHTML = nodes.join('')
}

async function renderBlack(nodeBlack) {
  if (!nodeBlack) return
  const blacklist = await getBlacklist();
  if (!blacklist.length) {
    nodeBlack.innerHTML = '<span class="red">Nenhum quebra muro com perda total.</span>'
    return
  }
  const baseUrl = getBaseGameUrl()

  nodeBlack.innerHTML = blacklist.map(({ target, report_id, x, y }, i) => {
    const infoUrl = new URL(baseUrl)
    infoUrl.searchParams.set('screen', 'info_village')
    infoUrl.searchParams.set('id', target)

    const reportUrl = new URL(baseUrl)
    reportUrl.searchParams.set('screen', 'report')
    reportUrl.searchParams.set('mode', 'all')
    reportUrl.searchParams.set('view', report_id)

    return `
      <div class="go-farm-alive go-border">
        <span>
          <span data-go-title="Ir para a visualização da aldeia.">${i + 1}.
            <a href="${infoUrl.toString()}">
              <span>${formatTargetCoords(target, x, y)}</span>
            </a>
          </span>
        </span>
        <span>
          <a href="${reportUrl.toString()}" data-go-title="Relatório.">
            <span id="new_report" class="icon header new_report"></span>
          </a>
          <a style="vertical-align:middle; margin:5px;" class="cancel-icon" data-go-title="Remover da blacklist."></a>
        </span>
      </div>
    `
  }).join('')

  return
}

async function renderAlives(nodeAlives) {
  if (!nodeAlives) return

  const allAliveTargets = await getAllAliveTargets()
  const aliveTargets = allAliveTargets.filter(([, report_id]) => !!report_id)
  if (!aliveTargets.length) {
    nodeAlives.innerHTML = '<span class="red">Nenhum bárbara com tropa.</span>'
    return
  }
  const gameData = getGameData()
  const calculateDistance = Distance.create(gameData.village.coord)
  const nodes = aliveTargets
    .sort((a, b) => {
      const da = calculateDistance.calc({ x: a[2], y: a[3] })
      const db = calculateDistance.calc({ x: b[2], y: b[3] })
      if (da > db) return 1
      if (da < db) return -1
      return 0
    })
    .map(([target, report_id, x, y, units, wall], i) => {
      const ko = `${String(y).padStart(3, '0').substring(0, 1)}${String(x).padStart(3, '0').substring(0, 1)}`

      const nodeUnits = units.map((value, i) => {
        const src = `https://dsbr.innogamescdn.com/asset/415a0ab7/graphic/unit/unit_${gameData.units[i]}.webp`
        return `
          <span class="go-border">
            <img width="16px" src="${src}">
            <span style="font-size: smaller;">${value}</span>
          </span>
        `
      })

      const baseUrl = new URL(gameData.link_base_pure, window.location.origin)
      
      const infoUrl = new URL(baseUrl)
      infoUrl.searchParams.set('screen', 'info_village')
      infoUrl.searchParams.set('id', target)

      const simUrl = new URL(baseUrl)
      simUrl.searchParams.set('screen', 'place')
      simUrl.searchParams.set('mode', 'sim')
      simUrl.searchParams.set('only_survive', '1')
      simUrl.searchParams.set('report_id', report_id)

      const reportUrl = new URL(baseUrl)
      reportUrl.searchParams.set('screen', 'report')
      reportUrl.searchParams.set('mode', 'all')
      reportUrl.searchParams.set('view', report_id)

      const placeUrl = new URL(baseUrl)
      placeUrl.searchParams.set('screen', 'place')
      placeUrl.searchParams.set('target', target)

      return `
          <div class="go-farm-alive go-border">
            <span>
              <span data-go-title="Ir para a visualização da aldeia.">${i + 1}.
                <a href="${infoUrl.toString()}">
                  <span>${`(${x}|${y}) K${ko}`}</span>
                </a>
              </span>
              <span>
                ${nodeUnits.join('')}
              </span>
            </span>
            <span>
              <span>
                <img src="https://dsbr.innogamescdn.com/asset/4e165360/graphic/buildings/wall.webp">
                ${wall ?? '?'}
              </span>
              <span data-go-title="Distância">
                <img src="https://dsbr.innogamescdn.com/asset/28bd5527/graphic/rechts.webp">
                ${calculateDistance.round({x, y}).toFixed(2)}
              </span>
                <a href="${simUrl.toString()}" data-go-title="Simulador">🧮</a>
                <a href="${reportUrl.toString()}" data-go-title="Relatório.">
                  <span id="new_report" class="icon header new_report"></span>
                </a>
                <a href="${placeUrl.toString()}" onclick="Accountmanager.farm.openRallyPoint(${target}, event)" data-go-title="Praça">
                <img src="https://dsbr.innogamescdn.com/asset/28bd5527/graphic/buildings/place.webp">
              </a>
            </span>
          </div>
      `
    })
  nodeAlives.innerHTML = nodes.join('')
}

async function renderBreakWallTemplates() {
  const select = document.querySelector('#breakWall-template')
  await initBreakWallConfig()
  const templates = await storageBreakWallTemplates.get() || {}
  const options = Object.keys(templates)
    .map(template => `<option value="${template}">muralha ${template}</option>`)
  select.innerHTML = options
}

async function renderEditTemplate() {
  const gameData = getGameData()
  const select = document.querySelector('#breakWall-template')
  const editTemplate = document.querySelector('#go-farm-edit-template')
  const templates = await storageBreakWallTemplates.get() || {}
  const template = templates[select.value] || {}
  const nodes = gameData.units.reduce((node, unit) => {
    if (!['knight', 'snob', 'militia'].includes(unit)) {
      const value = template[unit] || 0
      const src = `https://dsbr.innogamescdn.com/asset/415a0ab7/graphic/unit/unit_${unit}.webp`
      node.push(
        `
          <span class="go-border none">
            <label class="go-label" for="${unit}">
              <img src="${src}">
            </label>
            <input class="go-edit-unit" id="${unit}" type="number" min="0" value="${value}">
          </span>
        `
      )
    }
    return node
  }, [])
  editTemplate.innerHTML = nodes.join('')
}

async function onChangeSelect() {
  await renderEditTemplate()
}

async function onEditTemplate({target: { id, value }}) {
  const select = document.querySelector('#breakWall-template')
  const templates = await storageBreakWallTemplates.get() || {}
  if (!templates[select.value]) templates[select.value] = {}
  templates[select.value][id] = Number(value)
  await storageBreakWallTemplates.set(templates)
}

async function editOpen() {
  const editTemplate = document.querySelector("#go-farm-edit-template")
  const classNames = editTemplate.getAttribute('class').trim().split(' ')
  if (!classNames.includes('show')) {
    classNames.push('show')
  } else {
    classNames.pop()
  }
  editTemplate.setAttribute('class', classNames.join(' '))
}

async function render(containerElement = null) {
  insertCSS()

  const elemHtml = document.createElement('div')
  elemHtml.id = 'go-container'
  elemHtml.innerHTML = farmHTML
  
  if (containerElement) {
    containerElement.appendChild(elemHtml)
  } else {
    const target = document.querySelector("#contentContainer") || document.body;
    target.prepend(elemHtml)
  }

  await renderBreakWallTemplates()

  const youTube = youtubeLinkImage('https://www.youtube.com/playlist?list=PLo4rLFftjcxHCs7eqMxP1Jf3ivwohXXJr', (message) => {
    printMessage.error(message, 3.5 * 1000)
  })
  document.querySelector('#go-youtube').appendChild(youTube)
  document.querySelector("#go-youtube img").setAttribute('width', '20px')

  await insertConfig()
  await setStatusMessage()
  await renderEditTemplate()

  const onClickResetFarm = async () => {
    await storageConfigFarm.set({ ...configBase, last: 0 })
    await insertConfig()

    // Avisa o Service Worker para zerar os alarmes e forçar a execução na mesma hora
    try {
      const response = await chrome.runtime.sendMessage(RELEASE_EXTENSION_ID, {
        extensionId: RELEASE_EXTENSION_ID,
        type: 'FARM_CONFIG_CHANGED',
        world: getGameData()?.world,
        playerId: parseInt(getGameData()?.player?.id, 10),
      }).catch(() => null);

      BotViewStatus.apply(response)
    } catch (err) {}
  }

  // const goFarmConfig = document.querySelector('#go-farm-config')
  // goFarmConfig.addEventListener('click', configOpen, true)
  const goFarmFormConfig = document.querySelector('#go-farm-form-config')
  goFarmFormConfig.addEventListener('submit', goFormSubmit, true)
  const goActiveFarm = document.querySelector('#go-farm-active')
  goActiveFarm.addEventListener('change', onClickActive, true)
  const selectBreakWallTemplate = document.querySelector("#breakWall-template")
  selectBreakWallTemplate.addEventListener('change', onChangeSelect, true)
  const editTemplate = document.querySelector("#go-farm-edit-template")
  editTemplate.addEventListener('input', onEditTemplate, true)
  const editButton = document.querySelector('#go-farm-edit-template-buttom')
  editButton.addEventListener('click', editOpen, true)
  const goResetFarm = document.querySelector("#go-reset-farm")
  goResetFarm.addEventListener('click', onClickResetFarm, true)
  const goSchedulesButton = document.querySelector('#go-farm-schedules-show')
  goSchedulesButton.addEventListener('click', showSchedules, true)

  const goCheckButton = document.querySelector("#go-farm-check-show")
  const goBlackButton = document.querySelector("#go-farm-black-show")
  const goAliveButton = document.querySelector("#go-farm-alive-show")
  goCheckButton?.addEventListener('click', breakWallShow, true)
  goBlackButton?.addEventListener('click', breakWallShow, true)
  goAliveButton?.addEventListener('click', breakWallShow, true)
  const goFarmGroup = document.querySelector('#go-farm-group')
  void hydrateGroupsSelect(goFarmGroup)

  const { avaible: breakWallSents = [] } = (await getAvaiablesSents()) || {}
  if (breakWallSents.length) {
    goCheckButton?.classList.add('active')
  }
  const blacklist = await getBlacklist();
  if (blacklist.length) {
    goBlackButton?.classList.add('active')
  }
  const allAliveTargets = await getAllAliveTargets()
  if (allAliveTargets.length) {
    goAliveButton?.classList.add('active')
  }
  window.addEventListener('message', onMessage , false);

  const destroy = () => {
    // goFarmConfig.removeEventListener('click', configOpen, true)y
    goFarmFormConfig.removeEventListener('submit', goFormSubmit, true)
    goActiveFarm.removeEventListener('change', onClickActive, true)
    selectBreakWallTemplate.removeEventListener('change', onChangeSelect, true)
    editTemplate.removeEventListener('input', onEditTemplate, true)
    editButton.removeEventListener('click', editOpen, true)
    goResetFarm.removeEventListener('click', onClickResetFarm, true)
    goSchedulesButton.removeEventListener('click', showSchedules, true)
    goCheckButton?.removeEventListener('click', breakWallShow, true)
    goBlackButton?.removeEventListener('click', breakWallShow, true)
    goAliveButton?.removeEventListener('click', breakWallShow, true)
    window.removeEventListener('message', onMessage , false);
    elemHtml.remove()
  }

  return destroy
}

export default { render }
