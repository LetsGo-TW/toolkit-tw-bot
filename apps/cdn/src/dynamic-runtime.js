// AUTO-GENERATED FILE. DO NOT EDIT MANUALLY.

export class DynamicRuntime {
  static "incomingApply" = async () => {
    const mod = await import(
      /* webpackChunkName: "incoming-apply" */
      './incoming/apply-runner.js'
    )
    return mod.default
  }

  static "solver" = async () => {
    const mod = await import(
      /* webpackChunkName: "solver-runtime" */
      './hCaptcha/index.js'
    )
    return mod.default
  }

  static "farm-handler" = async () => {
    const mod = await import(
      /* webpackChunkName: "farm-handler-runtime" */
      './farm-max/handler/index.js'
    )
    return mod.default
  }

  static "farm-schedules" = async () => {
    const mod = await import(
      /* webpackChunkName: "farm-schedules-runtime" */
      './farm-max/schedules/index.js'
    )
    return mod.default
  }
}
