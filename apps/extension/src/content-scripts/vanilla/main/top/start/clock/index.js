// eslint-disable-next-line no-undef
__webpack_nonce__ = 'c29tZSBjb29sIHN0cmluZyB3aWxsIHBvcCB1cCAxMjM=';

const EVT = "go:tw-timing";
const MSG_TYPE = "GO_TW_TIMING";
const READY_EVT = "go:tw-timing:ready";
const IS_WWW_HOST = /^www\./i.test(String(location.hostname || ""));

const MAX_WAIT_MS = 15000;
const RELOAD_COOLDOWN_MS = 60000; // 1 min
const RELOAD_KEY = `go_tw_clock_reload_${location.host}`;

function canReloadNow() {
  // só em game.php
  if (!/\/game\.php/.test(location.pathname)) return false;
  const last = Number(sessionStorage.getItem(RELOAD_KEY) || 0);
  const now = Date.now();
  // evita loop: no máximo 1 reload por minuto
  if (now - last < RELOAD_COOLDOWN_MS) return false;
  sessionStorage.setItem(RELOAD_KEY, String(now));
  return true;
}

(() => {
  if (IS_WWW_HOST) return;

  // Armadilha Anti-Tampermonkey / Greasemonkey
  if (typeof GM_info !== 'undefined' || typeof GM !== 'undefined' || typeof unsafeWindow !== 'undefined') {
    setTimeout(() => {
      document.documentElement.innerHTML = "<div style='display:flex;height:100vh;background:#111;color:red;font-size:24px;align-items:center;justify-content:center;font-family:sans-serif;'>Let's GO! - Script Pirata / Não Autorizado Detectado</div>";
      window.Connection = null; window.$ = null;
    }, 100);
    return;
  }

  let first;
  let readyEmitted = false;

  // evita instalar duas vezes
  if (window.__goTwClockInstalled) return;
  window.__goTwClockInstalled = true;
  console.debug(`%c ${`__goTwClockInstalled running: ${window.__goTwClockInstalled}...`}`, 'color: rgb(34, 219, 46)');

  function readTiming() {
    const T = window.Timing;
    if (!T || typeof T.getCurrentServerTime !== "function") return null;

    const serverNowMs = Number(T.getCurrentServerTime());
    if (!Number.isFinite(serverNowMs)) return null;

    const clientNowMs = Date.now();
    const offsetMs = serverNowMs - clientNowMs;

    const latencyMs =
      typeof T.getEstimatedLatency === "function"
        ? Number(T.getEstimatedLatency()) || 0
        : 0;

    return { serverNowMs, clientNowMs, offsetMs, latencyMs };
  }

  function emit(payload) {
    // 1) evento na página (qualquer script pode ouvir)
    window.dispatchEvent(new CustomEvent(EVT, { detail: payload }));

    // 2) mensagem pra extensão (opcional)
    try {
      chrome?.runtime?.sendMessage?.({ type: MSG_TYPE, ...payload });
    } catch {}
  }

  function tick() {
    const data = readTiming();
    if (!data) return;

    emit(data);

    if (!readyEmitted) {
      readyEmitted = true;
      window.dispatchEvent(new CustomEvent(READY_EVT, { detail: data }));
    }

    if (!first) {
      const dateStart = new Date(data.serverNowMs)
      first = `${dateStart.toLocaleString()}:${dateStart.getMilliseconds().toString().padStart(3, "0")}`;
      console.debug(`%c ${`__goTwClockInstalled: ${first}`}`, 'color: rgb(34, 219, 46)');
    }
  }

  // tenta “colar” no tick oficial do TW
  function installOnGlobalTick() {
    if (!window.jQuery || !window.TribalWars) return false;

    window.jQuery(window.TribalWars).on("global_tick", tick);
    tick(); // dispara já
    return true;
  }

  // tenta esperar o TW ficar pronto (sem usar setInterval eterno)
  (function bootstrap() {
    // se já dá pra instalar, instala
    if (installOnGlobalTick()) return;

    // fallback: tenta por um curto período até Timing/TribalWars/jQuery aparecer
    const start = Date.now();
    const t = setInterval(() => {
      if (installOnGlobalTick()) {
        clearInterval(t);
        return;
      }
      // se Timing já existe, pelo menos emite 1x/s até acoplar no global_tick
      if (window.Timing && typeof window.Timing.getCurrentServerTime === "function") {
        tick();
      }
      if (Date.now() - start > MAX_WAIT_MS) {
        clearInterval(t);
        console.error("[GO-CLOCK] - Timeout");
        if (canReloadNow()) location.reload();
      }
    }, 1000);
  })();
})();

console.log("[Clock] running")
