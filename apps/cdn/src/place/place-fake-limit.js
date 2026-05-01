import { getGameData, ProtectingBot } from "@toolkit-tw-bot/document"
import { bringData } from "../bringData"
import { isCurrentScreen } from "../shared/isCurrentScreen"
import { isPlaceTryConfirm } from "../shared/isPlaceTryConfirm"
import { isPlaceCommand } from "../shared/isPlaceComand"
import {
  parseFirstInt,
  computeFakeMinPop,
  distributeFakeLimitByAvailability
} from "../shared/fakeLimit/index.js"

const FAKE_LIMIT_UNITS = [
  { unit: 'spear', pop: 1, inputId: '#units_entry_all_spear' },
  { unit: 'axe', pop: 1, inputId: '#units_entry_all_axe' },
  { unit: 'spy', pop: 2, inputId: '#units_entry_all_spy' },
  { unit: 'light', pop: 4, inputId: '#units_entry_all_light' },
  { unit: 'ram', pop: 5, inputId: '#units_entry_all_ram' },
  { unit: 'catapult', pop: 8, inputId: '#units_entry_all_catapult' }
]

export function getAllCountByEntryId(html, entryId) {
  const root = html || document
  const el = root?.querySelector?.(entryId)
  if (!el) return 0
  return parseFirstInt(el.textContent || el.innerText || '', 0)
}

export function buildFakeLimitPool(html = document) {
  return FAKE_LIMIT_UNITS.map((item) => ({
    unit: item.unit,
    pop: item.pop,
    count: getAllCountByEntryId(html, item.inputId)
  }))
}

export function clearFormUnitsInputs(form) {
  if (!form?.querySelectorAll) return
  form.querySelectorAll("input.unitsInput").forEach((el) => {
    el.value = ""
  })
}

export function applyUnitDistributionToForm(form, distribution = {}) {
  if (!form || !distribution || typeof distribution !== 'object') return
  Object.entries(distribution).forEach(([unit, value]) => {
    if (!unit || !(unit in form)) return
    form[unit].value = Number.isFinite(Number(value)) ? Number(value) : ''
  })
}

export function applySpyPresetToForm(form, amount = 5) {
  if (!form?.querySelector) return
  const inputSpy = form.querySelector("#unit_input_spy")
  if (!inputSpy) return
  inputSpy.value = Number.isFinite(Number(amount)) ? Number(amount) : 5
}

const gameData = getGameData()
const AUTO_FAKE_STORAGE_KEY = `__auto_fake:${gameData.world}:${gameData.player.id}`

class FakeLimit {
  form = null
  h3 = null
  span = null
  btns = null
  auto_fake = null
  auto_attack = null
  auto_send = null
  error_box = null
  fakeLimitPercent = null
  fakeLimitPromise = null

  init = function (html = document) {
    if (!isPlaceCommand() && !isPlaceTryConfirm()) return
    if (document.querySelector('#target_fake')) return

    void this.ensureFakeLimit()

    this.form = html.forms?.['command-data-form'] || null
    this.error_box = html.querySelector?.("#content_value div.error_box") || null
    this.auto_fake = this.getAutoFake()
    if (!this.form) return

    if (isPlaceCommand() && !isPlaceTryConfirm()) {
      this.auto_fake.action = false

      this.span = html.createElement("span")
      this.span.style = "background-color: tan; margin-left: 12px; padding: 6px 8px 8px 3px; border-radius: 7px; border: 1px solid #7d510f;"
      this.span.innerHTML = this.elem

      this.h3 = isCurrentScreen("place")
        ? html.querySelector("#content_value h3")
        : html.querySelector("#popup_box_popup_command h3")

      this.h3?.append?.(this.span)

      this.btns = [
        this.span.querySelector("#target_fake"),
        this.span.querySelector("#target_spy")
      ]
      this.btns[0]?.addEventListener("click", () => this.btnActions(0))
      this.btns[1]?.addEventListener("click", () => this.btnActions(1))

      this.auto_attack = this.span.querySelector("#auto_attack")
      this.auto_attack.checked = this.auto_fake.auto_attack
      this.auto_attack.addEventListener("change", () => {
        this.auto_fake.auto_attack = this.auto_attack.checked
        this.setAutoFake()
      })

      this.auto_send = this.span.querySelector("#auto_send_attack")
      this.auto_send.checked = this.auto_fake.auto_send
      this.auto_send.addEventListener("change", () => {
        this.auto_fake.auto_send = this.auto_send.checked
        this.setAutoFake()
      })
    }

    if (isPlaceTryConfirm() && this.auto_fake.action) {
      this.auto_fake.action = false
      this.setAutoFake()
      if (ProtectingBot['bot-protect-all-in-game'].active()) {
        throw ProtectingBot.error()
      }
      this.send()
    }
  }

  updateWorldConfig = (payload) => {
    const nextFakeLimit = Number(payload?.config?.game?.fake_limit)
    if (!Number.isFinite(nextFakeLimit)) return null
    this.fakeLimitPercent = nextFakeLimit
    return nextFakeLimit
  }

  ensureFakeLimit = async () => {
    if (Number.isFinite(this.fakeLimitPercent)) return this.fakeLimitPercent
    if (!this.fakeLimitPromise) {
      this.fakeLimitPromise = bringData('tw-apis', { config: ['game'] }, {
        resolveOnPartial: false
      })
        .then((payload) => this.updateWorldConfig(payload))
        .catch((error) => {
          console.error('[place-fake-limit][bringData]', error)
          return null
        })
        .finally(() => {
          this.fakeLimitPromise = null
        })
    }
    return this.fakeLimitPromise
  }

  getCurrentPopMin = () => computeFakeMinPop(gameData?.village?.points, this.fakeLimitPercent)

  attack = () => this.form?.attack?.click?.()

  send = () => this.form?.["troop_confirm_submit"]?.click?.()

  setLimit = async function (nBtn = 0) {
    clearFormUnitsInputs(this.form)

    if (nBtn === 0) {
      const fakeLimitPercent = await this.ensureFakeLimit()
      if (!Number.isFinite(fakeLimitPercent)) return false

      const popMin = this.getCurrentPopMin()
      const pool = buildFakeLimitPool(document)
      const distribution = distributeFakeLimitByAvailability(popMin, pool)
      applyUnitDistributionToForm(this.form, distribution)
      return true
    }

    if (nBtn === 1) {
      applySpyPresetToForm(this.form, 5)
      return true
    }

    return false
  }

  btnActions = async function (n) {
    if (this.auto_send?.checked) {
      this.auto_fake.action = true
      this.setAutoFake()
    }

    const applied = await this.setLimit(n)
    if (!applied) {
      if (this.auto_fake.action) {
        this.auto_fake.action = false
        this.setAutoFake()
      }
      return
    }

    if (this.auto_attack?.checked) {
      if (ProtectingBot['bot-protect-all-in-game'].active()) {
        throw ProtectingBot.error()
      }
      this.attack()
    }

    if (this.error_box && this.auto_fake.action) {
      this.auto_fake.action = false
      this.setAutoFake()
    }
  }

  elem = `<input type="button" id="target_fake" value="Fake-Limit" class="btn btn-attack" style = "width: 106px; color: coral;">
          <input type="button" id="target_spy" value="Fake-Spy" class="btn btn-attack" style = "width: 97px; color: coral; margin-left: -4px;">
          <div style="display: inline-flex; align-items: center; color: brown; font-size: 8pt;">
              <input type="checkbox" name="auto_attack" id="auto_attack" style="margin-left: 2px; margin-top: 12px;">
              <label for="auto_attack" title="Selecione para ENGATILHAR o ataque automaticamente" style="cursor: pointer; padding-top: 7px; "> >> Attack</label>
              <input type="checkbox" name="auto_send_attack" id="auto_send_attack" style="margin-left: 6px; margin-top: 12px;">
              <label for="auto_send_attack" title="Selecione para ENVIAR o ataque automaticamente" style="cursor: pointer; padding-top: 7px; "> >> Send</label>
          </div>`

  setAutoFake = () => localStorage.setItem(AUTO_FAKE_STORAGE_KEY, JSON.stringify(this.auto_fake))

  getAutoFake = () => {
    const raw = localStorage.getItem(AUTO_FAKE_STORAGE_KEY)
    if (!raw) {
      return {
        action: false,
        auto_attack: false,
        auto_send: false
      }
    }
    try {
      const data = JSON.parse(raw)
      return {
        action: Boolean(data?.action),
        auto_attack: Boolean(data?.auto_attack),
        auto_send: Boolean(data?.auto_send)
      }
    } catch {
      return {
        action: false,
        auto_attack: false,
        auto_send: false
      }
    }
  }
}

export { FakeLimit }
export {
  parseFirstInt,
  computeFakeMinPop,
  distributeFakeLimitByAvailability
}
export const CommandFakeLimit = new FakeLimit()
