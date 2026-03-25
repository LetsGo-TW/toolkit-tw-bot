// apps/extension/entries/entries.js
const TRIBAL_WARS_MATCHES = [
  'https://*.tribalwars.com.br/*',
  'https://*.die-staemme.de/*',
  'https://*.staemme.ch/*',
  'https://*.tribalwars.net/*',
  'https://*.tribalwars.nl/*',
  'https://*.plemiona.pl/*',
  'https://*.tribalwars.com.pt/*',
  'https://*.divokekmeny.cz/*',
  'https://*.triburile.ro/*',
  'https://*.voynaplemyon.com/*',
  'https://*.fyletikesmaxes.gr/*',
  'https://*.divoke-kmene.sk/*',
  'https://*.klanhaboru.hu/*',
  'https://*.tribals.it/*',
  'https://*.klanlar.org/*',
  'https://*.guerretribale.fr/*',
  'https://*.guerrastribales.es/*',
  'https://*.tribalwars.ae/*',
  'https://*.tribalwars.co.uk/*',
  'https://*.tribalwars.works/*',
  'https://*.tribalwars.us/*',
  'https://*.tribalwars.cash/*',
]

const DEFAULT_EXCLUDE_MATCHES = [
  'https://*.google.com/*',
  'https://*/create_village.php?/*',
  '*://extensions/*',
]

module.exports = {
  sw: {
    'service-worker/index': {
      entry: 'service-worker/index.ts',
      type: 'service-worker',
      target: 'webworker',
    },
  },

  pg: {
    popup: {
      entry: 'pages/popup/index.tsx',
      type: 'popup',
      target: 'web',
      htmlFilename: 'popup.html',
    },
  },

  csVanilla: {
    'content-scripts/vanilla/main.top.start': {
      entry: 'content-script/main/top/start/index.js',
      matches: TRIBAL_WARS_MATCHES,
      excludeMatches: DEFAULT_EXCLUDE_MATCHES,
      world: 'MAIN',
      injection: 'vanilla',
      scope: 'top',
      runAt: 'document_start',
      allFrames: false,
      target: 'web',
    },
  },

  csShadowDom: {
    // 'content-scripts/shadowdom/isolated.top.start': {
    //   entry: 'content-script/isolated/top/start/index.js',
    //   matches: TRIBAL_WARS_MATCHES,
    //   excludeMatches: DEFAULT_EXCLUDE_MATCHES,
    //   world: 'ISOLATED',
    //   injection: 'shadowdom',
    //   scope: 'top',
    //   runAt: 'document_start',
    //   allFrames: false,
    //   target: 'web',
    // },
  },
}
