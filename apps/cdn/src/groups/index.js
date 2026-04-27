import { makeAjaxBody, makeAjaxHeadersGet, makeAjaxHeadersPost } from "@toolkit-tw-bot/browser"
import { getCurrentGameData, getGroupFix } from "./fix"
import { ProtectingBot } from "@toolkit-tw-bot/document"

const gameData = getCurrentGameData()
const premiumActive = gameData?.features?.Premium?.active

export * from "./fix"

export default class Groups {
  constructor() {
    this.group_all = {
      group_id: 0,
      item_id: null,
      name: "todos",
      type: "group_all",
    }

    this.saved = getGroupFix()
  }

  resolveCurrentGroupId = () => getGroupFix(this.saved)

  async get(screen) {
    if (!this.values) {
      if (!premiumActive) {
        this.group_id = 0

        const url = new URL(gameData?.link_base_pure + screen, window.location.origin)
        url.searchParams.set('village', gameData.village.id)

        this.values = [{
          ...this.group_all,
          link: url.toString()
        }]
      } else {
        const url = new URL(gameData?.link_base_pure + `groups&mode=overview&ajax=load_group_menu&`, window.location.origin)
        url.searchParams.set('village', gameData.village.id)

        const request = {
          method: 'GET',
          headers: makeAjaxHeadersGet(),
          credentials: "include",
          referrerPolicy: "origin",
          cache: "no-store"
        }

        if (ProtectingBot['bot-protect-all-in-game'].active()) {
          throw ProtectingBot.error()
        }

        await fetch(url.toString(), request)
        .then(response => response.json())
        .then(data => {
          const { group_id, result } = data.response

          this.group_id = Number(group_id)

          this.values = [
            ...result.filter(g => g.type !== 'separator').reduce((groups, group) => {
              const group_id = Number(group.group_id)

              const url = new URL(gameData?.link_base_pure + screen, window.location.origin)
              url.searchParams.set('village', gameData.village.id)
              url.searchParams.set('group', group_id)

              groups.push({
                ...group,
                group_id,
                link: url.toString()
              })

              return groups
            }, []),
          ]
        })
      }
    }

    return this.values
  }

  async getGroup(group_id, screen) {
    if (!this.values) {
      await this.get(screen)
    }

    if (!premiumActive) {
      if (group_id != 0) {
        window.location.reload()
      }

      const url = new URL(gameData?.link_base_pure + screen, window.location.origin)
      url.searchParams.set('village', gameData.village.id)

      return {
        ...this.group_all,
        link: url.toString()
      }
    }

    return this.values.find(g => Number(g.group_id) === group_id)
  }

  staticGroupsInVillage = async(village_id) => {
    if (!premiumActive) return []

    if (ProtectingBot['bot-protect-all-in-game'].active()) {
      throw ProtectingBot.error()
    }

    const url = new URL(`${gameData.link_base_pure}groups&ajax=load_groups&village_id=${village_id}`, window.location.origin)

    return await fetch(url.toString(), {
      method: 'GET',
      headers: makeAjaxHeadersGet(),
      credentials: "include",
      referrerPolicy: "origin",
      cache: "no-store"
    })
    .then(resp => resp.json())
    .then(json => json.response.result)
    .then(data => data.reduce((arr, e) => {
      const {group_id, name, in_group} = e

      if (in_group) {
        arr.push({
          group_id: Number(group_id),
          name
        })
      }

      return arr
    }, []))
  }

  villagesInGroup = async(group_id) => {
    const base = {
      selected: null,
      villages: []
    }

    if (!premiumActive) return base

    const body = makeAjaxBody({
      group_id,
      h: gameData.csrf
    })

    const url = new URL(`${gameData.link_base_pure}groups&ajax=load_villages_from_group`, window.location.origin)

    return await fetch(url.toString(), {
      method: 'POST',
      headers: makeAjaxHeadersPost(),
      body,
      credentials: "include",
      referrerPolicy: "origin",
      cache: "no-store"
    })
    .then(resp => resp.json())
    .then(data => data.response.html)
    .then(text => new DOMParser().parseFromString(text,'text/html'))
    .then(html => {
      const trs = Array.from(html.querySelectorAll("#group_popup_content_container > table > tbody > tr"))
      return trs.reduce((obj, tr, i) => {
        const selected = tr.querySelector("#selected_popup_village")

        const tds = Array.from(tr.querySelectorAll("td"))

        const village = {
            id: Number(tds[0].querySelector('a').dataset.villageId),
            coord: tds[1].innerText.match(/[0-9]{1,3}[|]{1}[0-9]{1,3}/ig)[0],
        }

        if (selected) {
            obj.selected = {
                ...village,
                index: i,
            }
        }

        obj.villages.push(village)

        return obj
      }, base)
    })
    // .filter(tr => !tr.querySelector('th'))
  }

  save = () => {
    this.saved = this.resolveCurrentGroupId()
    return this.saved
  }

  restore = async (request = this.saved) => {
    const url = `${gameData.link_base_pure}groups&ajax=load_villages_from_group`
    const resolveRequest = () => {
      const requestInit = request instanceof Request
        ? {
            signal: request.signal,
            credentials: request.credentials,
            cache: request.cache,
            mode: request.mode,
            redirect: request.redirect,
            referrer: request.referrer,
            referrerPolicy: request.referrerPolicy,
            integrity: request.integrity,
            keepalive: request.keepalive
          }
        : request && typeof request === "object" && !Array.isArray(request)
          ? request
          : {}

      const requestUrl = request instanceof Request
        ? new URL(request.url, window.location.origin)
        : null

      const requestGroupFromUrl = request instanceof Request
        ? requestUrl.searchParams.get("group_id")
            || requestUrl.searchParams.get("groupId")
            || requestUrl.searchParams.get("group")
        : null

      const groupRaw = requestInit.group
        ?? requestInit.group_id
        ?? requestInit.groupId
        ?? requestGroupFromUrl
        ?? request
        ?? this.saved

      const group = Number(groupRaw)
      const headers = makeAjaxHeadersPost()

      const body = makeAjaxBody({
        group_id: Number.isFinite(group) ? group : Number(this.saved),
        h: gameData.csrf
      })

      return new Request(url, {
        ...requestInit,
        method: "POST",
        headers,
        body,
        credentials: requestInit.credentials || "include",
        cache: requestInit.cache || "no-store"
      })
    }

    try {
      if (ProtectingBot['bot-protect-all-in-game'].active()) {
        throw ProtectingBot.error()
      }

      const myRequest = resolveRequest()
      await fetch(myRequest)
    } catch (error) {
      console.error({ msg: error?.message || null, script: "SaveRestoreGroup-restore", error })
      throw error
    }
  }
}
