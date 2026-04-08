import { gameData, getPlayers, link_mesma_aldeia, mdf, n_aldeias, premiumActive, scav_active, timeZone, verifyCurrentScreen } from "../general/init_tw"
import { getStorage, nSegStrHora, setStorage } from "../general/util"
import { withGroupFix } from "../Groups"

export function error_box( msg, t = 5000) {
  if (document.querySelector( "#content_value" )) {
    const errorBox = document.createElement( 'div' )
    document.querySelector( "#content_value" ).prepend( errorBox )
    errorBox.className = "error_box"
    errorBox.innerHTML = `<div class="content"> ${ msg }</div>`
    if (t > 0 ) setTimeout(() => errorBox.remove() , t )
  }
}

export function printMsg(msg) {
  if (!document.querySelector("#print-msg")) return
  document.querySelector("#print-msg").innerHTML = msg
}

export const printMessageRegressiveTime = (message, time) => {
  const intTime = setInterval(() => {
    printMsg(`${message} ${time}s`)
    time--
    if (time < 0) {
      clearInterval(intTime)
    }
  }, 1000);
}

export const go_container = () => "width: auto; max-width: 100%; background: #F7EED3 url(https://dsbr.innogamescdn.com/asset/1b9d83e8/graphic/index/main_bg.jpg) scroll right top repeat; position: relative; display: flow-root; justify-content: center flex-end; align-items: center; box-shadow: 1px 2px 3px 1px rgb(0 0 0 / 30%); border: 1px solid #7d510f; margin-bottom: 5px; padding: 5px;"

export function jig_status() {
  if (!document.querySelector( "#status" )) {
    let area
    if ( !premiumActive ) {
      area = document.createElement( 'table' )
      document.querySelector( "#main_layout > tbody > tr.shadedBG > td.maincell > br" ).insertAdjacentElement( 'afterend', area )
      area.id ="quickbar_outer"
      area.width = "100%"
      area.style = `align="center"`
      area.cellspacing ="0"
      let html = `<tbody><tr><td><table id="quickbar_inner" style="border-collapse: collapse;" width="100%"><tbody><tr class="topborder"><td class="left"></td><td class="main"></td><td class="right"></td></tr><tr><td class="left"></p></td><td id="quickbar_contents" class="main"><ul class="menu quickbar"><li class="quickbar_item" style = "margin: 0 10px 0 10px;" data-hotkey="1"><span><a id="m1" class="quickbar_link" href="${withGroupFix(`${link_mesma_aldeia}main`)}" title="Atalho 1"><img class="quickbar_image" data-src="https://dsbr.innogamescdn.com/asset/1b9d83e8/graphic//buildings/main.png" alt="" src="https://dsbr.innogamescdn.com/asset/1b9d83e8/graphic//buildings/main.png">Principal</a></span></li><li class="quickbar_item" style = "margin: 0 10px 0 10px;" data-hotkey="2"><span><a id="m2" class="quickbar_link" href="${withGroupFix(`${link_mesma_aldeia}train`)}" title="Atalho 2"><img class="quickbar_image" data-src="https://dsbr.innogamescdn.com/asset/1b9d83e8/graphic//buildings/barracks.png" alt="" src="https://dsbr.innogamescdn.com/asset/1b9d83e8/graphic//buildings/barracks.png">Recrutar</a></span></li><li class="quickbar_item" style = "margin: 0 10px 0 10px;" data-hotkey="3"><span><a id="m3" class="quickbar_link" href="${withGroupFix(`${link_mesma_aldeia}snob`)}" title="Atalho 3"><img class="quickbar_image" data-src="https://dsbr.innogamescdn.com/asset/1b9d83e8/graphic//buildings/snob.png" alt="" src="https://dsbr.innogamescdn.com/asset/1b9d83e8/graphic//buildings/snob.png">Academia</a></span></li>`
      html +=`<li class="quickbar_item" style = "margin: 0 10px 0 10px;" data-hotkey="4"><span><a id="m4" class="quickbar_link" href="${withGroupFix(`${link_mesma_aldeia}market`)}" title="Atalho 4"><img class="quickbar_image" data-src="https://dsbr.innogamescdn.com/asset/1b9d83e8/graphic//buildings/market.png" alt="" src="https://dsbr.innogamescdn.com/asset/1b9d83e8/graphic//buildings/market.png">Mercado</a></span></li><li class="quickbar_item" style = "margin: 0 10px 0 10px;" data-hotkey="5"><span><a id="m5" class="quickbar_link" href="${withGroupFix(`${link_mesma_aldeia}smith`)}" title="Atalho 5"><img class="quickbar_image" data-src="https://dsbr.innogamescdn.com/asset/1b9d83e8/graphic//buildings/smith.png" alt="" src="https://dsbr.innogamescdn.com/asset/1b9d83e8/graphic//buildings/smith.png">Ferreiro</a></span></li>`
      if (scav_active) html +=`<li class="quickbar_item" style = "margin: 0 10px 0 10px;" data-hotkey="6"><span><a id="m6" class="quickbar_link" href="${withGroupFix(`${link_mesma_aldeia}place&mode=scavenge`)}" title="Atalho 6"><img class="quickbar_image" data-src="https://dsbr.innogamescdn.com/asset/e2454ccc/graphic/buildings/storage.png" alt="" src="https://dsbr.innogamescdn.com/asset/e2454ccc/graphic/buildings/storage.png">Coleta</a></span></li>`
      html +=`<li class="quickbar_item" style = "margin: 0 10px 0 10px;" data-hotkey="0"><span><a id="m0" class="quickbar_link" href="${withGroupFix(`${link_mesma_aldeia}place`)}" title="Atalho 0"><img class="quickbar_image" data-src="https://dsbr.innogamescdn.com/asset/1b9d83e8/graphic//buildings/place.png" alt="" src="https://dsbr.innogamescdn.com/asset/1b9d83e8/graphic//buildings/place.png">Praça</a></span></li></ul></td><td class="right"></td></tr><tr class="bottomborder"><td class="left"></td><td class="main"></td><td class="right"></td></tr><tr><td class="shadow" colspan="3"><div class="leftshadow"></div><div class="rightshadow"></div></td></tr></tbody></table></td></tr></tbody>`
      area.innerHTML = html
      if ( n_aldeias > 1 ) {
        area = document.createElement('td')
        document.querySelector("#menu_row2").prepend(area)
        area.className = "box-item icon-box arrowCell"
        html = `<a id="village_switch_right" class="village_switch_link" href="${withGroupFix(`/game.php?${mdf}&village=n${ gameData.village.id }&screen=${ gameData.screen }${ gameData.mode ? '&mode=' : '' }${ gameData.mode ? gameData.mode : '' }`)}" accesskey="d"><span class="arrowRight"></span></a>`
        area.innerHTML = html
        area = document.createElement('td')
        document.querySelector("#menu_row2").prepend(area)
        area.className = "box-item icon-box separate arrowCell"
        html = `<a id="village_switch_left" class="village_switch_link" href="${withGroupFix(`/game.php?${mdf}&village=p${ gameData.village.id }&screen=${ gameData.screen }${ gameData.mode ? '&mode=' : '' }${ gameData.mode ? gameData.mode : '' }`)}" accesskey="a"><span class="arrowLeft"></span></a>`
        area.innerHTML = html
      // --- muda link para outra visualização
      } else document.querySelector( "#menu_row > td:nth-child(2) > a" ).href = withGroupFix("/game.php?village=55871&screen=overview_villages")
      document.addEventListener('keydown', (e) => {
        if ( document.querySelector( `#m${e.key}` ) && ( e.target.localName != 'input' && e.target.localName != 'textarea' ) ) self.location = document.querySelector( `#m${e.key}` ).href
      })
    }
    area = document.createElement('div')
    // document.querySelector("#quickbar_inner > tbody > tr:nth-child(2) > td.left").prepend(area)
    area.id = "status"
    area.className = "go-status go-logo"
    const ds_body = document.querySelector("#ds_body")
    if (ds_body) ds_body.append(area)
    area = document.createElement('style')
    area.innerHTML = `.go-status {
      display: flex;
      font-family: Verdana, Arial;
      position: fixed;
      right: 2px;
      bottom: 32px;
      z-index: 12200;
      background-color: #764614c4;
      padding: 10px;
      border-style: inset;
      border-color: cadetblue;
      text-shadow: 1px 1px 1px #000000;
      cursor: default;
    }
    .go-status-text {
      position: fixed;
      padding: 3px;
      left: 3px;
      right: auto;
      color: darkseagreen;
    }
    .go-logo {
      top: 6px;
      left: 34px;
      bottom: auto;
      display: flex !important;
      flex-direction: row-reverse;
      padding: 0px;
      width: 0px;
      height: 0px;
      border: none;
      margin: 3px;
      cursor: default;
    }
    .go-logo-img {
      width: 60px;
      height: 52px;
      margin-left: 2px;
      margin-top: -2px;
    }`
    document.head.append(area)
    if ( timeZone() != 0 ) {
      const spanTimeZone = document.createElement("span")
      document.querySelector("#main_layout > tbody > tr.shadedBG > td.maincell > p").prepend(spanTimeZone)
      spanTimeZone.innerHTML = `Time Zone: <span id="time_zone" style="color : red;">${nSegStrHora(Math.abs(timeZone()))}</span>`
    }
  }
}

export const statusGo = (status) => {
  const nodeStatus = document.querySelector( "#status" )
  if (!nodeStatus) return
  switch ( status ) {
    case true:
      nodeStatus.innerHTML = `<img class="go-logo-img" src="https://github.com/UnrecognizedBR/public/blob/master/icons/icon_green_60.png?raw=true" alt="let's Go!" style ="width: 69px; height: 60px; margin-left: 2px; margin-top: -2px; margin-bottom: -4px; margin-right: -35px;" >`
      console.log( "♻️ Let's Go! ON" )
      break
    case false:
      nodeStatus.innerHTML = `<img class="go-logo-img" src="https://github.com/UnrecognizedBR/public/blob/master/icons/icon_red_60.png?raw=true" alt="let's Go!" style ="width: 69px; height: 60px; margin-left: 2px; margin-top: -2px; margin-bottom: -4px; margin-right: -35px;" >`
      console.log( "⛔️ Let's Go OFF!" )
      break
    case "await":
      nodeStatus.innerHTML = `<img class="go-logo-img" src="https://github.com/UnrecognizedBR/public/blob/master/icons/icon_yelow_60.png?raw=true" alt="let's Go!" style ="width: 69px; height: 60px; margin-left: 2px; margin-top: -2px; margin-bottom: -4px; margin-right: -35px;" >`
      console.log( "⏳ Let's Go STOP!" )
      break
    case "command":
      nodeStatus.innerHTML = `<img class="go-logo-img" src="https://github.com/UnrecognizedBR/public/blob/master/icons/icon_yelow_60.png?raw=true" alt="let's Go!" style ="width: 69px; height: 60px; margin-left: 2px; margin-top: -2px; margin-bottom: -4px; margin-right: -35px;" >`
      console.log( "⚔️ Let's Go Command!" )
      break
    default:
      break
  }
}

export async function toggleOnOff() {
  if ( !document.querySelector( '#showOnOff' ) && document.querySelector("#quickbar_inner > tbody > tr:nth-child(2) > td.right") ) {
    await getPlayers().then((players, error) => {
      if (error) throw error
      const styleHtml = document.createElement( 'style' )
      document.querySelector( "head" ).appendChild( styleHtml )
      let html = `.go-menu {
        top: 4px;
        bottom: auto;
        display: flex !important;
        flex-direction: row-reverse;
        padding: 0px;
        width: 0px;
        height: 0px;
        border: none;
        margin: 3px;
      }
      .go-menu-img {
        display: none;
        flex-direction: column;
        align-items: center;
        width: 12px;
        height: 32px;
        padding: 3px;
        margin: -4px 6px 3px 3px;
        cursor: pointer;
      }
      .sound {
        margin-top: auto;
      }
      .active {
        display: flex;
      }
      .disable {
        display: none;
      }
      input.toggle_go {
        display: none;
      }
      input.toggle_go + label {
        display: inline-block;
        position: relative;
        box-shadow: inset 0 0 0px 0.1px black;
        height: 36px; width: 14px;
        background-color: red;
        border-radius: 7px; cursor: pointer;
      }
      input.toggle_go + label:before {
        content: "";
        display: block;
        height: 14px;
        width: 14px;
        border-radius: 7px;
        background: rgba(191, 87, 17, 0);
        transition: 0.2s ease-in-out;
      }
      input.toggle_go + label:after {
        content: "";
        position: absolute;
        height: 14px;
        width: 14px;
        top: 0;
        left: 0 px;
        border-radius: 7px;
        background: rgb(82, 73, 73);
        box-shadow: inset 0 0 0 2px red, 2px 4px rgba(59, 55, 55, 0.3);
        transition: 0.2s ease-in-out;
      }
      input.toggle_go:checked + label:before {
        box-shadow: inset 0 0 0px 0.1px black;
        height: 36px;
        background: #13bf11;
      }
      input.toggle_go:checked + label:after {
        top: 22px;
        box-shadow:
        inset 0 0 0 2px #13bf11,
        2px 4px rgba(59, 55, 55, 0.3);
      }`
      styleHtml.innerHTML = html

      const showOnOff = `<div class="go-status go-menu">
      <span title="Let's GO! - Show/Pause">
        <input class="toggle_go" id="active_go" name="active_go" type="checkbox">
        <label for="active_go"></label>
      </span>
      <span id="go-menu" class="go-menu-img" title="Let's GO! - Menu">
        <span>➖</span>
        <span style="margin: -7px;">➖</span>
        <span>➖</span>
      </span>
      <span id="go-sound" class="go-menu-img sound" title="Let's GO! - Sound">🎵</span>
      <span id="go-pause" class="go-menu-img sound" title="Let's GO! - Sound">💤</span>
      </div>`
      const ds_body = document.querySelector("#ds_body")
      if (ds_body) ds_body.insertAdjacentHTML("beforeend", showOnOff)
      const active_go = document.querySelector( "#active_go" )
      active_go.checked = players[ gameData.player.id ].configs.active
    })
  }
}

export function insert_toggle() {
  if ( !document.querySelector( '#toggle' ) ) {
    const styleHtml = document.createElement('style')
    document.querySelector("head").appendChild( styleHtml )
    styleHtml.id = 'toggle'
    styleHtml.innerHTML = `input.toggle { display: none; } input.toggle + label { display: inline-block; position: relative; box-shadow: inset 0 0 0px 0.1px black;; height: 12px; width: 24px; background-color: red; border-radius: 6px; margin-left: 1px; margin-top: 5px;  cursor: pointer;} input.toggle + label:before { content: ""; display: block; height: 12px; width: 12px; border-radius: 6px; background: rgba(191, 87, 17, 0); transition: 0.2s ease-in-out; } input.toggle + label:after { content: ""; position: absolute; height: 12px; width: 12px; top: 0; left: -2px; border-radius: 6px; background: rgb(82, 73, 73); box-shadow: inset 0 0 0 2px red, 2px 4px rgba(59, 55, 55, 0.3); transition: 0.2s ease-in-out; } input.toggle:checked + label:before { box-shadow: inset 0 0 0px 0.1px black; width: 24px; background: #13bf11; } input.toggle:checked + :after { left: 12px; box-shadow: inset 0 0 0 2px #13bf11, 2px 4px rgba(59, 55, 55, 0.3); }`
  }
}

export const updatingTicket = ( elem, ticket ) => elem.textContent.trim() != ticket ? elem.textContent = ticket : false

export function alertCommad( active ) {
  const color = active ? "#df0839" : "#8fbc8f"
  document.querySelector("#print-msg").style.color = color
  document.querySelector("#print-timer").style.color = color
}

export function checkModelEdit() {
  // --- editando modelo de construção
  if ( gameData.screen === "main" && document.querySelector( "#div_building" )) {
    if (!document.querySelector( "#div_building" ).hidden) return true
  }
  // --- editando modelo de tropas
  if ( gameData.screen === "train" && gameData.mode != "mass" && document.querySelector("#div_recrutar")) {
    if (!document.querySelector("#div_recrutar").hidden) return true
  }
  // --- editando configurações do mercado premium
  if (verifyCurrentScreen("market&mode=exchange") && document.querySelector("#view_config_premium")) {
    if (!document.querySelector("#view_config_premium").hidden) return true
  }
  // --- configurando farm
  if (gameData.screen === "am_farm" && document.querySelector("#settingsBody")) {
    if (document.querySelector("#settingsBody").style.display !== "none") return true
  }

  return false
}

export async function checkPaused(active, n_loop) {
  if ( document.querySelector( '#audio_atk' ) ) return true
  let check = false
  // --- se passar a segunda vez irá retornar falso e BOT volta a funcionar
  async function check_( check ) {
    if ( check == true ) {
      ! await getStorage('pause')
      ? await setStorage('pause', n_loop )
      : await getStorage('pause') == n_loop
      ? check = true
      : check = false
    }
    if ( check == false && await getStorage('pause') ) localStorage.removeItem("pause")
    return check
  }
  // --- enviando comando no mapa
  if ( document.querySelector( "#popup_box_popup_command" ) ) {
    check = true
    document.querySelector( "#ds_body" ).addEventListener( 'click', function( e ) {
      if ( e.target.id === document.querySelector("#ds_body").id
      || e.target.id == "troop_confirm_submit"
      || e.target.className == "popup_box_close tooltip-delayed"
      || e.target.className == "fader" ) {
          check = false
      }
    })
  }
  // --- verifica telas de edições configurações do BOT
  if ( checkModelEdit() ) check = checkModelEdit()
  // --- determina status e quando não for nenhuma das anteriores retorna falso
  check_( check )
  statusGo( check == true ? "await" : active )
  return check
}
