function toRandomIntegerBound(value, name, normalize) {
  const numericValue = Number(value)

  if (!Number.isFinite(numericValue)) {
    throw new TypeError(`random expected "${name}" to be a finite number`)
  }

  return normalize(numericValue)
}

function random(min, max) {
  const start = toRandomIntegerBound(min, 'min', Math.ceil)
  const end = toRandomIntegerBound(max, 'max', Math.floor)

  if (start > end) {
    throw new RangeError(
      'random expected min and max to define at least one integer in range',
    )
  }

  return Math.floor(Math.random() * (end - start + 1)) + start
}

module.exports = random
