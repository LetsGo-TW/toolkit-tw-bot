class Distance {
  #base

  constructor({ x, y }) {
    x = Number(x)
    y = Number(y)
    this.#base = { x, y }
  }

  static create(base) {

    const { x, y } = typeof base === 'string' ? Distance.#transformCoordStringToObject(base) : base
    const distance = new Distance({ x, y })

    return distance
  }

  static #transformCoordStringToObject(coordString) {
    return {
      x: coordString.split('|')[0],
      y: coordString.split('|')[1]
    }
  }

  calc = (coord) => {
    const { x, y } = typeof coord === 'string' ? Distance.#transformCoordStringToObject(coord) : coord
    return this.#calculate({ x, y })
  }

  round = (coord) => Math.round(this.calc(coord) * 100) / 100

  get () {
    return this.#base
  }

  #calculate = ({ x, y }) => {
    x = Number(x)
    y = Number(y)
    return Math.sqrt(Math.pow(this.#base.x - x, 2) + Math.pow(this.#base.y - y, 2))
  }
}

export default Distance
