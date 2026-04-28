export function buildSourceVillageUnitsFromInputs(inputs = [], unitsOrder = []) {
  const inputByName = new Map(
    (Array.isArray(inputs) ? inputs : [])
      .map((input) => [input?.name, input])
      .filter(([name]) => Boolean(name))
  )

  const byUnit = new Map()
  const units = []

  ;(Array.isArray(unitsOrder) ? unitsOrder : []).forEach((unit) => {
    const input = inputByName.get(unit)
    const raw = input?.dataset?.allCount ?? input?.getAttribute?.('data-all-count') ?? input?.value ?? '0'
    const value = Number(raw)
    const safeValue = Number.isFinite(value) ? value : 0
    byUnit.set(unit, safeValue)
    units.push(safeValue)
  })

  // Retorno:
  // units: Array<number> na mesma ordem de unitsOrder.
  // byUnit: Map<unitName, number> para acesso direto por nome.
  // Exemplo:
  // unitsOrder = ['spear', 'sword', 'axe']
  // retorno => {
  //   units: [0, 1, 5201],
  //   byUnit: Map { 'spear' => 0, 'sword' => 1, 'axe' => 5201 }
  // }
  return { units, byUnit }
}
