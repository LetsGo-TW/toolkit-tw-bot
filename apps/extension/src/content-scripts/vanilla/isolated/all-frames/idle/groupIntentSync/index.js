import debugGroupIntentSync from "./debug"
import mountGroupIntentSyncNavigation from "./navigation"

console.log("[GroupIntentSync] running", {
  href: window.location.href
})

debugGroupIntentSync("script-loaded", {
  href: window.location.href
})

void mountGroupIntentSyncNavigation().catch((error) => {
  debugGroupIntentSync("mount-failed", {
    href: window.location.href,
    error: error instanceof Error ? error.message : String(error || "unknown error")
  })
})

export * from "./audit"
export * from "./context"
export * from "./debug"
export * from "./extension-context"
export * from "./fix-state"
export * from "./links"
export * from "./navigation"
export * from "./protections"
export * from "./runtime-state"
export * from "./storage"
export * from "./url"
