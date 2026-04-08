
import svg from './youtube.svg'

export default class View {
  #fnError
  #data
  #href

  #element

  constructor(href, fnError, data) {
    this.#href = href
    this.#fnError = fnError
    this.#data = data
  }

  static create(href, fnError, data) {
    const view = new View(href, fnError, data)
    view.#init()
    return view.#element
  }

  #init() {
    this.#element = document.createElement('a')
    this.#element.setAttribute('data-go-title', 'YouTube tutorial')
    this.#element.innerHTML = `<img src=${svg} alt='YouTube'>`
    this.#element.setAttribute('class', 'show')
    if (this.#href) {
      this.#element.setAttribute('target', '_blank')
      this.#element.setAttribute('rel', 'noopener noreferrer')
      this.#element.setAttribute('href', this.#href)
      return
    }
    if (this.#fnError) {
      this.#element.addEventListener('click', () => {
        this.#fnError(this.#data.error, 3.5 * 1000)
      })
    }
  }
}
