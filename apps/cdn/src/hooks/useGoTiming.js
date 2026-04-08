function createGoTimingHub() {
  const subs = new Set();
  let last = null;
  let ready = false;

  const EVT = "go:tw-timing";
  const READY_EVT = "go:tw-timing:ready";

  function parseServerNowFromDom() {
    const dateText = String(document.querySelector("#serverDate")?.textContent || "").trim();
    const timeText = String(document.querySelector("#serverTime")?.textContent || "").trim();
    if (!dateText || !timeText) return null;

    const dateMatch = dateText.match(/(\d{1,2})[\/.-](\d{1,2})(?:[\/.-](\d{2,4}))?/);
    const timeMatch = timeText.match(/(\d{1,2}):(\d{2})(?::(\d{2}))?/);
    if (!dateMatch || !timeMatch) return null;

    const day = Number(dateMatch[1]);
    const month = Number(dateMatch[2]);
    const yearRaw = Number(dateMatch[3]);
    const year = Number.isFinite(yearRaw)
      ? (yearRaw < 100 ? 2000 + yearRaw : yearRaw)
      : new Date().getFullYear();

    const hour = Number(timeMatch[1]);
    const minute = Number(timeMatch[2]);
    const second = Number(timeMatch[3] || 0);

    if (
      !Number.isFinite(day) || !Number.isFinite(month) || !Number.isFinite(year)
      || !Number.isFinite(hour) || !Number.isFinite(minute) || !Number.isFinite(second)
    ) return null;

    const serverNowMs = new Date(year, month - 1, day, hour, minute, second).getTime();
    if (!Number.isFinite(serverNowMs) || serverNowMs <= 0) return null;
    return serverNowMs;
  }

  function notifySubscribers(snapshot) {
    subs.forEach(fn => {
      try { fn(snapshot); }
      catch (err) { console.error("[GO-TIMING] subscriber error", err); }
    });
  }

  function createFallbackSnapshot(reason = "dom-fallback") {
    const serverNowMs = parseServerNowFromDom();
    if (!Number.isFinite(serverNowMs)) return null;
    const now = Date.now();
    return {
      serverNowMs,
      offsetMs: serverNowMs - now,
      latencyMs: 0,
      source: "fallback",
      reason,
      sampledAtMs: now
    };
  }

  function adoptFallbackIfNeeded(reason) {
    if (ready && last) return last;
    const fallback = createFallbackSnapshot(reason);
    if (!fallback) return null;
    last = fallback;
    ready = true;
    notifySubscribers(last);
    return last;
  }

  function onTimingEvent(e) {
    last = e.detail;
    ready = true;
    notifySubscribers(last);
  }

  function onReadyEvent(e) {
    // garante ready mesmo se alguém só ouvir ready
    last = last || e.detail;
    ready = true;
  }

  window.addEventListener(EVT, onTimingEvent);
  window.addEventListener(READY_EVT, onReadyEvent);

  function assertReady() {
    if (!ready || !last) {
      const fallback = adoptFallbackIfNeeded("assert-ready");
      if (fallback) return;
      throw new Error(
        "[GO-TIMING] Clock não está pronto (sem go:tw-timing). " +
        "Provável: Timing ainda não carregou / TW travou / content-script não injetou."
      );
    }
  }

  return {
    subscribe(fn, { immediate = true } = {}) {
      subs.add(fn);
      if (immediate && last) {
        try { fn(last); } catch {}
      }
      return () => subs.delete(fn);
    },

    isReady() {
      return !!(ready && last);
    },

    waitReady(timeoutMs = 15000) {
      if (last) return Promise.resolve(last);

      const immediateFallback = adoptFallbackIfNeeded("wait-ready-start");
      if (immediateFallback) return Promise.resolve(immediateFallback);

      return new Promise((resolve, reject) => {
        const t = setTimeout(() => {
          cleanup();
          const fallback = adoptFallbackIfNeeded("wait-ready-timeout");
          if (fallback) {
            resolve(fallback);
            return;
          }
          reject(new Error("[GO-TIMING] timeout esperando go:tw-timing"));
        }, timeoutMs);

        const handler = (e) => {
          last = e.detail;
          ready = true;
          cleanup();
          resolve(last);
        };

        function cleanup() {
          clearTimeout(t);
          window.removeEventListener(EVT, handler);
          window.removeEventListener(READY_EVT, handler);
        }

        window.addEventListener(EVT, handler);
        window.addEventListener(READY_EVT, handler);
      });
    },

    getLast() {
      return last;
    },

    getLastOrThrow() {
      assertReady();
      return last;
    },

    getServerNowMs() {
      assertReady();
      return last.serverNowMs;
    },

    getEffectiveServerNowMs() {
      assertReady();
      return last.serverNowMs + (last.latencyMs || 0) / 2;
    },

    getOffsetMs() {
      assertReady();
      return last.offsetMs;
    },

    getLatencyMs() {
      assertReady();
      return last.latencyMs;
    },
  };
}

const useGoTiming = createGoTimingHub();
export { useGoTiming };
