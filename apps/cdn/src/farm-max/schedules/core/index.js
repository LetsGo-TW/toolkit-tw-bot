import { getDataRequest } from "../../common/get-data-request"
import { getModels } from "../../models/get-models"
import { storageConfigFarm, storageFarmSchedules } from "../../config"
import { emitter } from ".."
import { getOverviewPages } from "../../common/get-pages"
import { calculateNumberOfFarmsPerModel } from "../../common/calculate-number-of-attacks-per-model"
import { transformUnitsFarm } from "../../common/transform-units-farm-array"
import { saveLastInConfig } from "../../config/save-last"
import { dataConfig } from "../../config/data"
import { getGameData, ProtectingBot } from "@toolkit-tw-bot/document";
import { extensionId as RELEASE_EXTENSION_ID } from '@toolkit-tw-bot/release';

const getCurrentGameData = () => {
  if (typeof window !== "undefined" && typeof window.game_data !== "undefined") {
    return window.game_data
  }

  if (typeof document === "undefined") return null

  return getGameData()
}

/// Ver para voltar ao grupo anterior

class FarmScheduleCore {
  active = false
  #botProtectActive = false
  #gameData = null
  #playerVillages = null
  #villagesUnits = []
  #models = []

  constructor() {
    this.#init()
  }

  static create() {
    const farmScheduleCore = new FarmScheduleCore()

    return farmScheduleCore
  }

  async #init() {
    this.#gameData = getCurrentGameData()

    this.#playerVillages = JSON.parse(localStorage.getItem(`_ds_v_data_${this.#gameData.player.id}`)) || []
    emitter.on('updated', this.#updated.bind(this))
    emitter.on('finished', this.#finished.bind(this))
    emitter.on('stoped', this.#stoped.bind(this))
    emitter.on('error', this.#error.bind(this))

    window.addEventListener('message', this.#onMessage, true)

    this.#start()
  }

  #start = async() => {
    if (!this.#gameData.features?.FarmAssistent?.active) {
      console.warn("Assistente de Saque inativo no jogo. Encerrando schedules do Farm.");
      emitter.emit('terminate')
      return;
    }

    const dataRequests = this.#dataRequestsModels()
    emitter.emit('startProcess', { actionName: 'getTextHtml', type: 'getModels', dataRequests })
  }

  #handleBotProtectDetected = (html = document) => {
    if (!ProtectingBot["bot-protect-all-in-game"].active(html)) {
      return false
    }

    if (this.#botProtectActive) {
      return true
    }

    this.#botProtectActive = true

    emitter.emit('stopProcess', {
      actionName: 'stop',
      reason: 'bot-protect',
    })

    return true
  }

  #updated = async ({ type, count, page, textHtml }) => {
    const html = new DOMParser().parseFromString(textHtml, 'text/html')

    if (this.#handleBotProtectDetected(html)) {
      return
    }

    switch (type) {
      case 'getModels': {
        this.#models = getModels(html)
        break;
      }
      case 'dataRequestsOverview': {
        const villageUnits = this.#getVillageUnitsInHtmlOverview(html)
        this.#villagesUnits.push(villageUnits) // 1 objeto
        break
      }
      case 'dataRequestsCombined': {
        const villagesUnits = this.#getVillagesUnitsInHtmlCombined(html)
        const { pageSize } = getOverviewPages(html)
        if (pageSize < 1000 && page !== -1 && count === 1) { // faz somente na primeira pag
          this.#villagesUnits.push(...villagesUnits.reduce((data, village) => {
            const id = village.id
            if (!this.#villagesUnits.find(villageUnits => villageUnits.id === id)) {
              data.push(village)
            }
            return data
          }, []))
        }
        this.#villagesUnits.push(...villagesUnits) // 1 arr de objeto
        break
      }
      default:
        break;
    }
  }

  #finished = async ({ type, count, page, textHtml }) => {
    if (this.#botProtectActive) {
      emitter.emit('terminate', {
        reason: 'bot-protect',
      });
      return
    }
    switch (type) {
      case 'getModels': {  // 1
        // Sem conta premium
        if (!this.#gameData.features.Premium.active) {
          const dataRequests = await this.#dataRequestsOverview();
          emitter.emit('startProcess', {
            actionName: 'getTextHtml', type: 'dataRequestsOverview', dataRequests
          })

          break;
        }
        // Com conta premium
        const setPage = -1;
        const dataRequests = await this.#dataRequestsCombined(setPage);
        emitter.emit('startProcess', {
          actionName: 'getTextHtml', type: 'dataRequestsCombined', page: setPage, dataRequests
        });

        break;
      }
      case 'dataRequestsOverview': {
        // aqui encerra o processo
        this.#save()
        break
      }
      case 'dataRequestsCombined': {
        const html = new DOMParser().parseFromString(textHtml, 'text/html')

        if (this.#handleBotProtectDetected(html)) {
          break
        }

        const { pageSize, pages } = getOverviewPages(html)
        if (page === -1 && pageSize * pages.length > 1000) {
          if (this.#botProtectActive) {
            emitter.emit('terminate', {
              reason: 'bot-protect',
            });
            break
          }

          const dataRequests = pages.slice(parseInt(1000 / pageSize)).map(url => {
            return getDataRequest(url)
          })
          emitter.emit('startProcess', {
            actionName: 'getTextHtml', type: 'dataRequestsCombined', page: 0, dataRequests
          })

          break
        }

        if (pageSize && pageSize < 1000) {
          if (this.#botProtectActive) {
            emitter.emit('terminate', {
              reason: 'bot-protect',
            });
            break
          }

          const dataRequests = this.#dataPostRequestSetPageSize(html)
          emitter.emit('startProcess', {
            actionName: 'getTextHtml', type: 'dataPostRequestSetPageSize', dataRequests
          })

          break
        }

        // aqui encerra o processo
        this.#save()

        break
      }
      case 'dataPostRequestSetPageSize':
        // aqui encerra o processo
        this.#save()
        break
      default:
        break;
    }
  }

  #stoped = async (data) => {
    if (this.#botProtectActive) {
      emitter.emit('terminate', {
        ...data,
        reason: data?.reason || 'bot-protect',
      });
      return
    }
  }

  #error = async (data) => {
    if (this.#botProtectActive) {
      return
    }

    console.error(data)
    emitter.emit('terminate', {
      reason: 'runtime-error',
      error: data?.error || null,
      source: data?.source || null,
    })
  }

  #save = async () => {
    const configData = await dataConfig()
    const values = await this.#getVillagesUnitsOrderModels(this.#villagesUnits, configData)

    await storageFarmSchedules.set({
      timegenerate: parseInt(Date.now() / 1000),
      count: 1,
      total: values.length,
      values
    })

    try {
      const gameData = getCurrentGameData();
      if (gameData?.world && gameData?.player?.id) {
        chrome.runtime.sendMessage(RELEASE_EXTENSION_ID, {
          extensionId: RELEASE_EXTENSION_ID,
          timegenerate: parseInt(Date.now() / 1000), // Adiciona o timestamp da geração da lista
          type: 'FARM_CONFIG_CHANGED',
          world: gameData.world,
          playerId: parseInt(String(gameData.player.id), 10),
        }).catch((err) => console.warn('[FARM-SCHEDULES-CORE] Falha ao notificar SW (sendMessage).', err));
        console.log('[FARM-SCHEDULES-CORE] Notificação de nova lista de agendamentos enviada ao Service Worker.');
      }
    } catch (err) {
      console.error('[FARM-SCHEDULES-CORE] Falha ao construir mensagem para o SW.', err);
    }

    try { await saveLastInConfig('FARM-SCHEDULES', "GO-FARM"); } catch { /* Garante que 'last' seja sempre atualizado */ }

    console.log('END FARM SCHEDULES', await storageFarmSchedules.get())
    emitter.emit('terminate')
  }

  #onMessage = ({ data, origin }) => {
    if (origin !== window.origin) return
    const { target, active } = data
    if (!target || target !== 'go-farm') return
  }

  #dataRequestsModels = () => {
    const dataRequests = []
    dataRequests.push(getDataRequest(this.#gameData.link_base_pure , { village: this.#gameData.village.id, screen: 'am_farm' }))
    return dataRequests
  }

  #dataRequestsOverview = async () => {  // sem premium
    // Limita a varredura a 1 vila se não tiver Conta Premium ativa 
    // (evita flood de requisições HTTP e mantém consistência com outras regras do bot)
    const villages = this.#playerVillages.slice(0, 1)

    const dataRequests = []
    for (let { id } of villages) {
      const dataRequest = getDataRequest(this.#gameData.link_base_pure, { village: id, screen: 'overview' })
      dataRequests.push(dataRequest)
    }
    return dataRequests
  }

  #dataRequestsCombined = async (page = -1) => {
    const configFarm = await storageConfigFarm.get()

    const dataRequests = []
    const dataRequest = getDataRequest(this.#gameData.link_base_pure, {
      village: this.#gameData.village.id,
      screen: 'overview_villages',
      mode: 'combined',
      group: configFarm.groupId,
      page
    })
    dataRequests.push(dataRequest)
    return dataRequests
  }

  #getVillageUnitsInHtmlOverview = (html = document) => {
    const tableBoxMenu = html.querySelector('table.box.menu.nowrap')
    const id = Number(tableBoxMenu.querySelector('a.nowrap.tooltip-delayed').href.match(/village=([0-9]{1,})/i)[1])
    const boxItem = tableBoxMenu.querySelector('b.nowrap').textContent
    const nameBase = tableBoxMenu.querySelector('a.nowrap.tooltip-delayed').textContent
    const name = `${nameBase} ${boxItem}`
    // const units = Array.from(html.querySelectorAll('td.unit-item')).map(unit => Number(unit.innerText))
    const units = {
      ...this.#gameData.units.reduce((units, gdu) => { units[gdu] = 0; return units }, {}),
      ...Array.from(html.querySelectorAll('.all_unit strong'))
        .reduce((units, strong) => {
            units[strong.dataset.count] = Number(strong.textContent)
            return units
        }, {})
    }
    return { id, name, units }
  }

  #getVillagesUnitsInHtmlCombined = (html = document) => {
    const unitNames = Array.from(html.querySelectorAll("#combined_table tr img"))
      .filter(img => img.src.includes('/unit/'))
      .map(img => img.src.match(/unit_([a-z]{1,})./i)[1])

    return Array.from(
      html.querySelectorAll("#combined_table tr.nowrap")
    )
    .reduce((arr, e) => {
      const id = Number(e.querySelector("span.quickedit-vn").dataset.id)
      const name = e.querySelector('span.quickedit-label').innerText.trim()
      const units = Array.from(e.querySelectorAll("td.unit-item"))
        .reduce((units, td, i) => {
          units[unitNames[i]] = Number(td.innerText)

          return units
        }, {})

      arr.push({ id, name, units })
      return arr
    }, [])
  }

  #getVillagesUnitsOrderModels = async (villagesUnits, configData) => {
    const villagesUnitisOrderModels = villagesUnits.reduce((villagesUnitsMax, { id, name, units }) => {
      const unitsArray = transformUnitsFarm(units)
      const min = Math.min(...calculateNumberOfFarmsPerModel(unitsArray, this.#models, configData))
      const max = Math.max(...calculateNumberOfFarmsPerModel(unitsArray, this.#models, configData))

      villagesUnitsMax.push({ id, name, units, max, min })

      return villagesUnitsMax
    }, [])
    .sort((a, b)=>{
      if ( a.max > b.max ) return -1

      if ( a.max < b.max ) return 1

      return 0
    })
    .filter(villagesUnitsMax => Math.floor(villagesUnitsMax.max) > 0)

    const { maxVillages } = await storageConfigFarm.get()
    const leng = villagesUnitisOrderModels.length
    villagesUnitisOrderModels.length = Math.min(maxVillages, leng)

    return villagesUnitisOrderModels
  }

  #dataPostRequestSetPageSize = (html = document) => {
    const paginationForm = html.querySelector("#pagination_form")
    if (!paginationForm) return []
    const url = paginationForm.action

    const referer = new URL(url)
    referer.searchParams.delete('action')

    const headers = {
      "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7",
      "content-type": "application/x-www-form-urlencoded",
      "referer": referer.toString(),
      "upgrade-insecure-requests": "1"
    }

    const payload = Array.from(paginationForm.querySelectorAll('input'))
      .reduce((payload, { name, value }) => {
        if (name) {
          value = name === 'page_size' ? 1000 : value
          payload.push([name, value])
        }

        return payload
      }, [])

    const body = new URLSearchParams();
    for (const [k, v] of payload) body.append(k, v);

    const dataRequest = {
      url,
      init: {
        method: "POST",
        headers,
        body: body.toString(),
        credentials: "include",
        referrerPolicy: "origin",
        cache: "no-store",
      }
    }

    return [dataRequest]
  }
}

export { FarmScheduleCore }
