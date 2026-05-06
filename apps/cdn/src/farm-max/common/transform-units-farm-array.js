function transformUnitsFarm(units) {
  return Object.keys(units).reduce((transform, key) => {
    if (['ram', 'catapult', 'snob', 'militia'].indexOf(key) === -1) {
      transform.push(Number(units[key]))
    }

    return transform
  }, [])
}

export { transformUnitsFarm }
