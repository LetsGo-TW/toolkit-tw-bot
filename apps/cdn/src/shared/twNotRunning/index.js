const blockedRequestActive = (html = document) => (
  html.querySelector("#error > div.center > div.content.box-border.red > div.inner > div.full-content") || 
  (
    !html.querySelector("#home > div.center > div.content.box-border.red > div.inner > div.right.login > div.wrap") &&
    !html.querySelector("#contentContainer")
  )
)

const gameUpdateActive = (html=document) => html.querySelector("#error") ? true : false

export { blockedRequestActive, gameUpdateActive }
