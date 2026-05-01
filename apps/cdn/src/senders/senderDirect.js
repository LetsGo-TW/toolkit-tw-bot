import { afterCommand } from "../place/place-after-command"
import { makeAjaxHeadersGetDoc } from "@toolkit-tw-bot/browser"
import { loaderGame } from "../components/loaderGame"
import { assertNoCaptchaInGame, assertNoGameUpdateOrBlockedRequest, getGameData, ProtectingBot } from "@toolkit-tw-bot/document"
import {
  getSenderNowMs,
  getStoredSenderOffsetMs,
  scheduleSenderDispatch,
} from "./timing"

const getCurrentGameData = () => {
  if (typeof window !== "undefined" && typeof window.game_data !== "undefined") {
    return window.game_data
  }

  return getGameData()
}

const buildPlaceUrl = () => {
  const gameData = getCurrentGameData()
  const url = new URL(`${gameData.link_base_pure}place`, window.location.origin)

  if (gameData?.csrf) {
    url.searchParams.set("h", String(gameData.csrf))
  }

  return url.toString()
}

const getPlaceDoc = async (context = "sender-direct:place") => {
  assertNoCaptchaInGame(document, `${context}:pre-fetch`)

  const req = new Request(buildPlaceUrl(), {
    method: "GET",
    headers: makeAjaxHeadersGetDoc(),
    credentials: "include",
    referrerPolicy: "origin",
    cache: "no-store"
  })

  const response = await fetch(req)
  if (!response.ok) throw new Error(`HTTP ${response.status}`)

  const html = new DOMParser().parseFromString(await response.text(), "text/html")
  assertNoCaptchaInGame(html, `${context}:html`)
  assertNoGameUpdateOrBlockedRequest(html, { context: `${context}:html` })

  return html
}

const waitMs = (durationMs = 0) => new Promise((resolve) => {
  setTimeout(resolve, Math.max(0, Number(durationMs) || 0))
})

const syncOffsetAfterCommand = async ({
  gameData,
  maxAttempts = 12,
  retryDelayMs = 250
} = {}) => {
  if (gameData?.screen !== "map") return false

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    try {
      const html = await getPlaceDoc(`sender-direct:after-command:${attempt + 1}`)
      const updated = afterCommand(html)
      if (updated) return true
    } catch (error) {
      console.error("[sender-direct][after-command]", error)
    }

    if (attempt < maxAttempts - 1) {
      await waitMs(retryDelayMs)
    }
  }

  return false
}

class CommanderDirect {
  confirmButton = null
  duration = null
  dateNow = null
  offset = null
  setOffsetDisplay = function(value) {
    const parsed = Number(value)
    const text = Number.isFinite(parsed) ? String(parsed) : ''
    const el = document.querySelector('#CSoffset')
    if (!el) return
    el.textContent = text
  }
  init = async function() {
    const gameData = getCurrentGameData();
    const tableDataForm = document.querySelector("#command-data-form table.vis");
    if (!tableDataForm) return;
    const numDateTimeNow = getSenderNowMs()
    window.$(window.$('#command-data-form')
    .find('tbody')[0])
    .append('<tr><td>Chegada:</td><td> <input type="datetime-local" id="CStime" step=".001"> </td></tr><tr> <td>Offset:</td><td> <span id="CSoffset" style="display: inline-block; min-width: 56px; color: brown; margin-top: 3.5px;"></span> <button type="button" id="CSbutton" class="btn">Confirmar</button> </td></tr>');
    this.confirmButton = window.$('#troop_confirm_submit');
    this.duration = Array.from(document.querySelectorAll("#command-data-form table.vis"))[0].innerText.match(/[0-9]{1,2}[:]{1}[0-9]{2}[:]{1}[0-9]{2}/ig)[0].split(":").map(Number)
    this.offset = getStoredSenderOffsetMs(gameData);
    this.dateNow = this.convertToInput(new Date(numDateTimeNow));
    this.setOffsetDisplay(this.offset);
    window.$('#CStime').val(this.dateNow);
    window.$('#CSbutton').click(async function() {
      // printMsg("Aguarde o envio de comando...")
      const offset = getStoredSenderOffsetMs(gameData)
      const selectedArrivalDate = new Date(window.$('#CStime').val())
      const selectedArrivalMs = selectedArrivalDate.getTime()
      if (!Number.isFinite(selectedArrivalMs)) return
      const attackTime = CommandSenderDirect.getAttackTime();
      CommandSenderDirect.setOffsetDisplay(offset)
      CommandSenderDirect.confirmButton.addClass( 'btn-disabled' );
      loaderGame.insert()
      // --- cálculo de delay
      const numDateTimeNow = getSenderNowMs()
      if ( numDateTimeNow < selectedArrivalMs + 5 * 1000) {
        if (gameData.screen == "map") {
          const html = await getPlaceDoc("sender-direct:before-command")
          let idsBefore = []
          if (html.querySelector("#commands_outgoings > table.vis")) {
            idsBefore = Array.from(
              html.querySelector("#commands_outgoings > table.vis").querySelectorAll('span.quickedit-out')
            ).map((e)=> e.dataset.id)
          }
          localStorage.setItem(`__comm:before:${gameData.world}:${gameData.player.id}`, JSON.stringify(idsBefore))
        }
        const dTmTmode = [
          selectedArrivalMs,
          "command",
        ]
        localStorage.setItem(`__confirm:date:time:mode:${gameData.world}:${gameData.player.id}`, JSON.stringify(dTmTmode))
      }
      // --- aguarda hora do envio
      scheduleSenderDispatch({
        targetSendMs: attackTime,
        offsetMs: offset,
        beforeDispatch() {
          if (ProtectingBot['bot-protect-all-in-game'].active()) {
            throw ProtectingBot.error()
          }
        },
        async onDispatch() {
          CommandSenderDirect.confirmButton.click()
          const offsetSync = await syncOffsetAfterCommand({ gameData })
          if (offsetSync?.updated) {
            CommandSenderDirect.offset = offsetSync.offsetMs
            CommandSenderDirect.setOffsetDisplay(offsetSync.offsetMs)
          }
          loaderGame.remove()
        },
        onError(error) {
          loaderGame.remove()
          console.error("[sender-direct][schedule]", error)
        }
      })
      this.disabled = true
    });
  }
  addGlobalStyle = function( css ) {
    const style = document.createElement('style')
    style.id = 'go-sender-direct'
    if (!document.head || document.querySelector('#go-sender-direct')) return
    style.innerHTML = css
    document.head.appendChild( style )
  }

  getAttackTime = function() {
    var d = new Date( window.$('#CStime').val().replace('T',' '));
    d.setHours( d.getHours() - this.duration[ 0 ]);
    d.setMinutes( d.getMinutes() - this.duration[ 1 ]);
    d.setSeconds( d.getSeconds() - this.duration[ 2 ]);
    return d;
  }

  convertToInput = function( t ) {
    t.setHours( t.getHours() + this.duration[ 0 ]);
    t.setMinutes( t.getMinutes() +this.duration[ 1 ]);
    t.setSeconds( t.getSeconds() +this.duration[ 2 ]);
    var a = {
      y: t.getFullYear(),
      m: t.getMonth() + 1,
      d: t.getDate(),
      time: t.toTimeString().split(' ')[ 0 ],
      ms: t.getMilliseconds()
    };
    if (a.m < 10) {
      a.m = '0' + a.m;
    }
    if (a.d < 10) {
      a.d = '0' + a.d;
    }
    if (a.ms < 100) {
      a.ms = '0' + a.ms;
      if (a.ms < 10) {
          a.ms = '0' + a.ms;
      }
    }
    return a.y + '-' + a.m + '-' + a.d + 'T' + a.time + '.' + a.ms;
  }
}

export const CommandSenderDirect = new CommanderDirect()
