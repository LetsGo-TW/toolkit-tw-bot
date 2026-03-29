// eslint-disable-next-line eslint-comments/disable-enable-pair
/* eslint-disable @typescript-eslint/no-explicit-any */
export type ITribalWars = {
  isGo?: boolean
  fetch: (args: any) => object
  get: (args: any) => object
  post: (args: any) => object
  request: (args: any) => object
  redirect: (args: any) => object
  buildURL: (args: any) => object
  updateGameData: (args: any) => object
  mergeGameDataProperty: (args: any) => object
  handleGameData: (args: any) => object
  handleResponse: (args: any) => object
  registerOnLoadHandler: (args: any) => object
  shouldPartialLoad: (args: any) => object
  showResourceIncrease: (args: any) => object
  playSound: (args: any) => object
  setSetting: (args: any) => object
  suppressHint: (args: any) => object
  getSetting: (args: any) => object
  isTabActive: (args: any) => object
  isAnyTabActive: (args: any) => object
  wasLastActiveTab: (args: any) => object
  getIdleTime: (args: any) => number
  track: (args: any) => object
  a429124ce67: (args: any) => object
  jQuery351049531088168783511: {
    handle: (args: any) => object
  }
}

export default (extensionId: string) => {
  if ('TribalWars' in window) {
    if (typeof (window.TribalWars as ITribalWars).isGo !== 'undefined') return

    const old = window.TribalWars as ITribalWars

    Object.defineProperty(window.TribalWars, 'getIdleTime', {
      enumerable: true,
      writable: true,
      configurable: true,
    })

    window.TribalWars = {
      ...old,

      isGo: true,

      getIdleTime: function (args: any) {
        const idleTime = old.getIdleTime(args) as number

        window.postMessage({
          source: 'change-global-tribal-wars',
          target: 'content-scripts',
          extensionId,
          idleTime,
        })

        return idleTime
      },
    }
  }
}
