// AUTO-GENERATED FILE. DO NOT EDIT MANUALLY.

export class DynamicModules {
  static "map" = async () => {
    const mod = await import(
      /* webpackChunkName: "map" */
      './map/index.js'
    )
    return mod.default
  }

  static "settings" = async () => {
    const mod = await import(
      /* webpackChunkName: "settings" */
      './settings/index.js'
    )
    return mod.default
  }

  static "others" = async () => {
    const mod = await import(
      /* webpackChunkName: "others" */
      './others/index.js'
    )
    return mod.default
  }
}
