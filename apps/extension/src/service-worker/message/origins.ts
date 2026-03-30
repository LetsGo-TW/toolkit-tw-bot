/// <reference types="chrome" />
const manifest = chrome.runtime.getManifest();

const matchPatterns =
  (manifest.externally_connectable && manifest.externally_connectable.matches) ||
  manifest.host_permissions ||
  [];

// converte "https://*.tribalwars.com.br/*" => RegExp de ORIGIN
function originRegexFromMatch(match: string) {
  const m = /^([^:]+):\/\/([^/]+)/i.exec(match);
  if (!m) return null;

  let [, scheme, host] = m;

  const schemeRe =
    scheme === "*" ? "https?" :
    (scheme === "http" || scheme === "https") ? scheme : "https?";

  const esc = (s: string) => s.replace(/[.+?^${}()|[\]\\]/g, "\\$&");

  let hostRe;
  if (host === "*") hostRe = ".+";
  else if (host.startsWith("*.")) hostRe = `(?:[a-z0-9-]+\\.)*${esc(host.slice(2))}`;
  else hostRe = esc(host);

  return new RegExp(`^${schemeRe}:\\/\\/${hostRe}(?::\\d+)?$`, "i");
}

const ORIGIN_WHITELIST = matchPatterns.map(originRegexFromMatch).filter(Boolean);

export function getSenderOrigin(sender: chrome.runtime.MessageSender) {
  if (sender.origin) return sender.origin;
  if (sender.url) {
    try { return new URL(sender.url).origin; } catch { /* ignore */ }
  }
  return null;
}

export function isAllowedOrigin(origin: string | null) {
  if (!origin) return false;
  return ORIGIN_WHITELIST.some((re: { test: (arg0: string) => any; }) => re.test(origin));
}
