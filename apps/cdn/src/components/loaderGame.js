class LoaderGame {
  css = `div.loader {
    position: fixed;
    top: 50%;
    left: 50%;
    margin-left: -12px;
    margin-top: -12px;
    z-index: 14000;
  }
  div.fader {
    position: fixed;
    height: 100%;
    width: 100%;
    background-color: black;
    top: 0px;
    left: 0px;
    opacity: 0.6;
    z-index: 13000;
  }
  div.popup_box_container {
    z-index: 12000
  }`
  style = document.createElement("style")
  html = `<div id="loader" class="loader"><img src="graphic/throbber.gif"";></div>`
  element = document.createElement("div")
  insert = () => {
    if (document.querySelector("div.fader")) document.querySelector("div.fader").remove()
    document.head.append(this.style)
    this.style.id = "loader"
    this.style.innerHTML = this.css
    document.body.append(this.element)
    this.element.id = "fader"
    this.element.className = "fader"
    this.element.innerHTML = this.html
  }
  remove = () => {
    this.style.remove()
    this.element.remove()
  }
}
export const loaderGame = new LoaderGame()
        // width: 36px;
        // height: 36px;
