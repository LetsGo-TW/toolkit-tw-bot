// packages/release/src/script-registry.js
export const SCRIPT_REGISTRY = [
  {
    id: 'hcaptcha',
    type: 'global',
    label: 'Anti-hCaptcha',
    viewMode: 'inline',
  },
  {
    id: 'settings-config',
    type: 'screen',
    label: 'Configurações',
    match: { screen: 'settings' },
    viewMode: 'page',
    goTo: { screen: 'settings' },
    actionLabel: 'Abrir',
  },
  {
    id: 'search-barbarians',
    type: 'screen',
    label: 'Search Barbarians',
    match: { screen: 'map' },
    goTo: { screen: 'map' },
    viewMode: 'inline',
  },
  {
    id: 'farm-max',
    type: 'global',
    label: 'Farm Max',
    viewMode: 'inline',
  }
]
