import { nSecStrTime } from "../stable-compat/date-parse"

const notification = () => {
  const msg = document.createElement("div")
  msg.style = `display: flex; font-family: Verdana, Arial; color: darkseagreen; position: fixed; left: 2px; bottom: 32px; z-index: 12200; cursor: none;`
  msg.id = `go-msg`
  msg.innerHTML = `<div id="print-msg" style="margin: 1px; background-color: #764614c4; padding: 3px 5px 3px 5px; border-style: inset; border-color: cadetblue; font-size: 10pt; text-shadow: 1px 1px 1px #000000; cursor: none;"></div>`
  document.body.append(msg)

  const timer = document.createElement("div")
  timer.style = `display: flex; font-size: 10pt; font-family: Verdana, Arial; color: blue; position: fixed; right: 2px; bottom: 32px; z-index: 12200; cursor: none;`
  timer.id = `go-notification`
  timer.innerHTML = `<div id="go-next-timer" style="background-color: #764614c4; padding: 10px; width: 36px; height: 36px; border-radius: 100%; border-style: inset; border-color: cadetblue; text-shadow: 1px 1px 1px #000000;"><div id="print-timer" style="margin-top: 8px; margin-left: 0px; font-size: 10pt; color: darkseagreen; text-align: center; cursor: none;"></div></div>`
  document.body.append(timer)
}

const printTimer = (timer) => {
  const htmlThrobber = `<img src="graphic/throbber.gif">`
  const htmlTimer = `<span>${nSecStrTime(parseInt(timer)).substring(3)}</span>`
  const htmlPrintTimer = document.querySelector("#print-timer")
  if (!htmlPrintTimer) return
  htmlPrintTimer.style["margin-top"] = typeof timer != 'number' || isNaN(timer) || !timer || timer < 0 || timer >= 60 * 60 ? "0px" : "8px"
  const html = typeof timer != 'number' || isNaN(timer) || !timer || timer < 0 || timer >= 60 * 60 ? htmlThrobber : htmlTimer
  if (!htmlPrintTimer.children.length) {
    htmlPrintTimer.innerHTML = html
  } else {
    if (
      htmlPrintTimer.children[0].localName !== 'img' ||
      (
        htmlPrintTimer.children[0].localName === 'img' && html === htmlTimer
      )
    ) {
      htmlPrintTimer.innerHTML = html
    }
  }
}

export { notification, printTimer }
