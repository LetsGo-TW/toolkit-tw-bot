import { searchBarbarians } from '../searchBarbarians'
import { searchBarbariansView } from '../searchBarbarians/view'

export function createSearchBarbariansConfigSection() {
  return {
    id: 'map-search-barbarians',
    label: 'Search Barbarians',
    mount: (container) => {
      const searchContext = searchBarbarians()

      if (!searchContext) {
        return null
      }

      const view = searchBarbariansView({
        ...searchContext,
        mountTarget: container,
      })

      return typeof view?.destroy === 'function'
        ? () => view.destroy()
        : null
    },
  }
}

export function createMapConfigSections() {
  return [
    createSearchBarbariansConfigSection(),
  ]
}

export default createMapConfigSections
