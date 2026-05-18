// packages/release/src/script-registry.js
export const SCRIPT_REGISTRY = [
  // autos
  {
    id: 'farm-max',
    type: 'auto',
    label: 'Farm Max',
    viewMode: 'inline',
  },
  {
    id: 'exchange',
    type: 'auto',
    label: 'Premium Exchange',
    viewMode: 'inline',
  },
  // globals
  {
    id: 'hcaptcha',
    type: 'global',
    label: 'Anti-hCaptcha',
    viewMode: 'inline',
  },
  {
    id: 'notify',
    type: 'global',
    label: 'Notify',
    viewMode: 'inline',
  },
  {
    id: 'clipboard',
    type: 'global',
    label: 'Copy to clipboard',
    viewMode: 'inline',
  },
  // screens(others)
  {
    id: 'search-barbarians',
    type: 'screen',
    label: 'Search Barbarians',
    match: { screen: 'map' },
    goTo: { screen: 'map' },
    viewMode: 'inline',
  },
]
