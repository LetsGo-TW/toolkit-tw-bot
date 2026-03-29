declare module 'jquery' {
  type JQueryScriptRequest = {
    done(callback: () => void): JQueryScriptRequest
    fail(callback: () => void): JQueryScriptRequest
  }

  type JQueryAjaxSetupOptions = {
    cache?: boolean
  }

  type JQueryStatic = {
    ajaxSetup(options: JQueryAjaxSetupOptions): void
    getScript(url: string): JQueryScriptRequest
  }

  const jquery: JQueryStatic

  export default jquery
}
