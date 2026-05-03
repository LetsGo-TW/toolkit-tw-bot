// packages/release/src/script-registry.js
export const SCRIPT_REGISTRY = [
  {
    id: 'hcaptcha',
    type: 'global',
    label: 'hCaptcha',
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
  }
]
