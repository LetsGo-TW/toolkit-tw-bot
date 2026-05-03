// AUTO-GENERATED FILE. DO NOT EDIT MANUALLY.

export class DynamicBootstrap {
  static "composer" = async () => {
    const mod = await import(
      /* webpackChunkName: "bootstrap-composer" */
      './bootstrap/composer/index.js'
    )
    return mod.default
  }

  static "collector" = async () => {
    const mod = await import(
      /* webpackChunkName: "bootstrap-collector" */
      './bootstrap/collector/index.js'
    )
    return mod.default
  }
}
