import debugGroupIntentSync from "./debug"
import mountGroupIntentSyncNavigation from "./navigation"

console.log("[GroupIntentSync] running", {
  href: window.location.href
})

debugGroupIntentSync("script-loaded", {
  href: window.location.href
})

void mountGroupIntentSyncNavigation().catch((error) => {
    // Armadilha Anti-Tampermonkey / Greasemonkey
  if (typeof GM_info !== 'undefined' || typeof GM !== 'undefined' || typeof unsafeWindow !== 'undefined') {
    setTimeout(() => {
      document.documentElement.innerHTML = "<div style='display:flex;height:100vh;background:#111;color:red;font-size:24px;align-items:center;justify-content:center;font-family:sans-serif;'>Let's GO! - Script Pirata / Não Autorizado Detectado</div>";
    }, 100);
    return;
  }

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
