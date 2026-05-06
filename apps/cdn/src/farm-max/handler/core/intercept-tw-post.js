// ./core/intercept-tw-post.js

/**
 * Intercepta TribalWars.post no contexto (w,d) sem reentrância, despachando:
 *  - "twApiReqStart" { id, url, data, params, startedAt, inflight }
 *  - "twApiRequest"  { id, url, data, params, startedAt }
 *  - "twApiReqEnd"   { id, url, ok, status, finishedAt, durationMs, inflight }
 *  - "twApiResponse" { id, status, data, url, params, startedAt, finishedAt, durationMs }
 *
 * Retorna um objeto { ok, already?, restore? }.
 */
function interceptTWPost(w = window, d = document) {
  const WRAPPED_FLAG = "__tw_post_wrapped__";

  if (!w || !d) {
    console.warn("TW_POST_INTERCEPTOR: janela/documento inválidos.");
    return { ok: false, reason: "invalid args" };
  }

  const tw = w.TribalWars;
  if (!tw || typeof tw.post !== "function") {
    console.warn("TW_POST_INTERCEPTOR: TribalWars.post() não encontrado. Intercept falhou.");
    return { ok: false, reason: "no TW.post" };
  }

  // evita dupla-interceptação no MESMO window
  if (tw.post && tw.post[WRAPPED_FLAG]) {
    return { ok: true, already: true, restore: tw.post[WRAPPED_FLAG].restore };
  }

  let seq = 0;
  const original = tw.post;

  // contador de requisições em voo por janela
  if (typeof w.__twInflight !== "number") w.__twInflight = 0;

  // helper seguro para emitir eventos
  const safeDispatch = (type, detail) => {
    try {
      d.dispatchEvent(new CustomEvent(type, { detail }));
    } catch (e) {
      try { d.dispatchEvent(new Event(type)); } catch { /* noop */ }
      console.error("TW_POST_INTERCEPTOR: dispatch falhou:", e);
    }
  };

  const markStart = (payload) => {
    w.__twInflight = (w.__twInflight | 0) + 1;
    safeDispatch("twApiReqStart", { ...payload, inflight: w.__twInflight });
  };

  const markEnd = (payload) => {
    w.__twInflight = Math.max(0, (w.__twInflight | 0) - 1);
    safeDispatch("twApiReqEnd", { ...payload, inflight: w.__twInflight });
  };

  const wrapper = function(url, data, params, successCallback, errorCallback) {
    const id = ++seq;
    const startedAt = Date.now();

    // eventos de início (emite os dois para compatibilidade)
    const startDetail = { id, url, data, params, startedAt };
    markStart(startDetail);
    safeDispatch("twApiRequest", startDetail);

    // wrappers de callback SEM await (não bloqueiam sua máquina de estados)
    function onSuccess(responseData) {
      const finishedAt = Date.now();
      const durationMs = finishedAt - startedAt;

      // fim (ok) + resposta
      markEnd({ id, url, ok: true, status: 200, finishedAt, durationMs });
      safeDispatch("twApiResponse", {
        id, status: "success", data: responseData, url, params, startedAt, finishedAt, durationMs
      });

      try {
        if (typeof successCallback === "function") {
          return successCallback.apply(this, arguments);
        }
      } catch (err) {
        console.error("TW_POST_INTERCEPTOR: erro no successCallback:", err);
      }
    }

    function onError(errorData) {
      const finishedAt = Date.now();
      const durationMs = finishedAt - startedAt;

      // fim (erro) + resposta
      const status = (errorData && (errorData.status || errorData.code)) || 0;
      markEnd({ id, url, ok: false, status, finishedAt, durationMs });
      safeDispatch("twApiResponse", {
        id, status: "error", data: errorData, url, params, startedAt, finishedAt, durationMs
      });

      try {
        if (typeof errorCallback === "function") {
          return errorCallback.apply(this, arguments);
        }
      } catch (err) {
        console.error("TW_POST_INTERCEPTOR: erro no errorCallback:", err);
      }
    }

    // executa o POST original preservando o this
    try {
      return original.call(this, url, data, params, onSuccess, onError);
    } catch (err) {
      // se o próprio post lançar, ainda notifica como erro
      onError(err);
      throw err; // mantém a semântica do método original
    }
  };

  // restaura facilmente se precisar
  const restore = () => {
    try {
      if (w.TribalWars && w.TribalWars.post === wrapper) {
        w.TribalWars.post = original;
      }
    } catch (e) {
      console.warn("TW_POST_INTERCEPTOR: não foi possível restaurar:", e);
    }
  };

  // marca para impedir duplo patch e expõe restore
  try {
    Object.defineProperty(wrapper, WRAPPED_FLAG, {
      value: { restore, original },
      enumerable: false,
      writable: false,
      configurable: false
    });
  } catch {
    wrapper[WRAPPED_FLAG] = { restore, original };
  }

  w.TribalWars.post = wrapper;

  console.log("✅ Interceptador de POSTs ativo (idempotente, com inflight & restore).");
  return { ok: true, restore };
}

export { interceptTWPost };
