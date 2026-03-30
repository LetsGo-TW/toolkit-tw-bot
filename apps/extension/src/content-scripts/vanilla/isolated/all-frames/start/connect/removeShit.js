export const removeShit = (received) => {
  if (window.self.location.href.indexOf('//www.') !== -1) return
  if (received.type !== "BOT_RUNNER_START") return

  // Truque de evasão: Força o status de proteção para throttled no body
  // const dsBody = document.querySelector("#ds_body")
  // if (dsBody && dsBody.attributes.getNamedItem('data-bot-protect')) {
  //   dsBody.setAttribute('data-bot-protect', 'throttled')
  // }

  console.log('[CS][Shit Remove] execute', received.type)

  // --- remove pubads propaganda
  const pubads = Array.from(document.querySelectorAll("head > script")) || []
  pubads?.forEach(e => {
    if (e?.src?.indexOf("gpt.js") !== -1) e?.remove()
    if (e?.src?.indexOf("doubleclick") !== -1) e?.remove()
    if (e?.innerHTML?.indexOf("googletag") !== -1) e?.remove()
  })

  if (document.getElementsByName("goog_topics_frame")?.length) {
    document.getElementsByName("goog_topics_frame")?.[0]?.remove()
  }

  // --- remove scripts nas tags img
  if (document.querySelector("#ds_body > img")) {
    document.querySelectorAll("#ds_body > img")?.forEach(e => e?.remove())
  }

  const metaTrial = Array.from(document.querySelectorAll("head > meta")) || []
  metaTrial?.forEach(e => {
    if (e["httpEquiv"] === "origin-trial") e?.remove()
  })

  const node = document.querySelector("#world_selection_clicktrap")
  if (node) node?.remove()
}
