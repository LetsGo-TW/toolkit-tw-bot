class Distance {
  #base

  constructor({ x, y }) {
    this.#base = {
      x: Number(x),
      y: Number(y),
    }
  }

  static create(base) {
    const { x, y } = typeof base === "string"
      ? Distance.#transformCoordStringToObject(base)
      : base

    return new Distance({ x, y })
  }

  static #transformCoordStringToObject(coordString) {
    const [x, y] = String(coordString || "").split("|")

    return { x, y }
  }

  calc = (coord) => {
    const { x, y } = typeof coord === "string"
      ? Distance.#transformCoordStringToObject(coord)
      : coord

    return this.#calculate({ x, y })
  }

  round = (coord) => Math.round(this.calc(coord) * 100) / 100

  get() {
    return this.#base
  }

  #calculate = ({ x, y }) => {
    const targetX = Number(x)
    const targetY = Number(y)

    return Math.sqrt(
      Math.pow(this.#base.x - targetX, 2)
      + Math.pow(this.#base.y - targetY, 2),
    )
  }
}

export default Distance
