/* eslint-disable no-undef */
import { reloadCurrentTabOnSessionExpired } from '../../../../shared/reloadCurrentTabOnSessionExpired'

const ANTI_TRACKING_INSTALLED_KEY = "__goAntiTrackingInstalled";

function isPingRequestUrl(url) {
  try {
    const parsedUrl = new URL(String(url || ''), window.location.origin)

    return (
      parsedUrl.pathname.endsWith('/game.php')
      && parsedUrl.searchParams.get('screen') === 'api'
      && parsedUrl.searchParams.get('ajax') === 'ping'
    )
  } catch {
    return false
  }
}

function hasSessionExpiredResponseBody(bodyText) {
  if (typeof bodyText !== 'string' || !bodyText.trim()) {
    return false
  }

  const normalizedBodyText = bodyText.toLowerCase()

  if (
    normalizedBodyText.includes('sess\\u00e3o expirou')
    || normalizedBodyText.includes('sessão expirou')
    || normalizedBodyText.includes('session expired')
  ) {
    return true
  }

  try {
    const parsed = JSON.parse(bodyText)
    const error = String(parsed?.error || '').toLowerCase()

    return (
      error.includes('sessão expirou')
      || error.includes('session expired')
    )
  } catch {
    return false
  }
}

runAntiTrack();

function runAntiTrack() {
  if (window[ANTI_TRACKING_INSTALLED_KEY]) return;
  window[ANTI_TRACKING_INSTALLED_KEY] = true;

  // 1. Armadilha Anti-Tampermonkey / Greasemonkey
  // Injetores de terceiros sempre deixam esses rastros globais na memória.
  if (typeof GM_info !== 'undefined' || typeof GM !== 'undefined' || typeof unsafeWindow !== 'undefined') {
    // Espera 100ms e destrói o HTML da página, impossibilitando o uso do bot pirata
    setTimeout(() => {
        document.documentElement.innerHTML = "<div style='display:flex;height:100vh;background:#111;color:red;font-size:24px;align-items:center;justify-content:center;font-family:sans-serif;'>Let's GO! - Script Pirata / Não Autorizado Detectado</div>";
        window.Connection = null; // Quebra o websocket do jogo
        window.$ = null; // Quebra o jQuery
    }, 100);
    return; // Interrompe a injeção do nosso escudo
  }

  console.log("%c[Let's GO] Escudo Anti-Tracking Inicializado!", "color: lime; font-weight: bold;");

  // Helper para extrair apenas a origem (domínio) do payload codificado
  const extractOrigin = (b64) => {
    try {
      const decoded = atob(b64);
      const match = decoded.match(/https?:\/\/[^\/]+/);
      return match ? match[0] : "Desconhecida";
    } catch {
      return "Inválida";
    }
  };

  // 1. Intercepta o WebSocket do Tribal Wars (window.Connection) de forma IMEDIATA
  const initConnectionBlocker = () => {
    let _connection = window.Connection;

    // Ao invés de usar setTimeout (que causa concorrência de milissegundos),
    // nós sequestramos a criação da variável Connection nativamente!
    Object.defineProperty(window, 'Connection', {
      get: function() {
        return _connection;
      },
      set: function(val) {
        _connection = val;

        // Assim que o TW criar a conexão, nós já "vacinamos" ela
        if (_connection && typeof _connection.emit === 'function' && !_connection._isHooked) {
          const originalEmit = _connection.emit;

          _connection.emit = function(eventName) {
            // O TW atualizou o radar! Agora eles usam "ac/r" (Anti-Cheat / Report)
            // e "cs" (Client Statistics - que faz dump do storage e envia pro servidor).
            if (eventName === 'Script' || eventName === 'ac/r' || eventName === 'cs') {
              let origin = "Desconhecida";
              try {
                const payload = arguments[1];
                if (Array.isArray(payload) && typeof payload[0] === 'string') {
                  origin = extractOrigin(payload[0]);
                } else if (typeof payload === 'string') {
                  origin = extractOrigin(payload);
                }
              } catch (e) {}

              console.log(`%c[Anti-Track] Telemetria WS (${eventName}) bloqueada. Origem: ${origin}`, "color: orange; font-weight: bold;");
              return; // 🛑 Bloqueia o envio na hora!
            }

            return originalEmit.apply(this, arguments);
          };
          _connection._isHooked = true;
        }
      },
      configurable: true
    });

    // Fallback caso a Connection já exista antes da nossa injeção
    if (_connection && typeof _connection.emit === 'function' && !_connection._isHooked) {
      window.Connection = _connection; // Dispara o setter acima para aplicar a trava
    }
  };

  // 2. Intercepta a injeção de Pixels de Rastreamento ($.fn.append)
  const initJQueryBlocker = () => {
    // Aguarda até o jQuery ser injetado pela página
    if (typeof window.$ === 'undefined' || typeof window.$.fn === 'undefined' || typeof window.$.fn.append === 'undefined') {
      setTimeout(initJQueryBlocker, 5);
      return;
    }

    const originalAppend = window.$.fn.append;

    window.$.fn.append = function(content) {
      // O TW tenta injetar uma imagem invisível com dados de rastreio codificados na URL
      // Formato procurado: <img src="/st/BASE64_CODE.gif">
      if (typeof content === 'string' && content.includes('/st/') && content.includes('.gif"')) {
        let origin = "Desconhecida";
        try {
          const base64String = content.match(/\/st\/(.*?)\.gif"/)[1];
          if (base64String) origin = extractOrigin(base64String);
        } catch (e) {}
        console.log(`%c[Anti-Track] Pixel HTML de rastreio bloqueado. Origem: ${origin}`, "color: orange; font-weight: bold;");
        return; // 🛑 Cancela a criação da tag <img> na página!
      }

      // Se for um append HTML legítimo do jogo, deixa passar
      return originalAppend.apply(this, arguments);
    };
  };

  // Filtro de Data Loss Prevention (DLP)
  // Impede fisicamente que qualquer pacote contendo assinaturas do nosso bot saia pela placa de rede
  const isMaliciousString = (str) => {
    if (typeof str !== 'string') return false;

    let toCheck = [str];
    try {
      // Decodifica a string caso seja FormUrlEncoded (Padrão do $.ajax do TW em game.php para envio de logs)
      // Isso impede que "chrome-extension%3A%2F%2F" burle a proteção
      toCheck.push(decodeURIComponent(str));
    } catch (e) {}

    for (let target of toCheck) {
      // Bloqueia eventos de telemetria conhecidos do Socket.io
      if (/^\d+\["(?:Script|ac\/r|cs)"/.test(target)) return true;
      // Bloqueia pacotes de qualquer tipo que tentem dedurar nossos scripts ou extensões
      if (target.includes('GO#worker-script') || target.includes('chrome-extension://')) return true;
      // Bloqueia logs nativos de erro do jogo que contenham o nome da extensão na stack trace
      if (target.toLowerCase().includes("let's go") || target.toLowerCase().includes("letsgo")) return true;
      // Bloqueia o endpoint de telemetria de performance (OpenTelemetry/Faro) da InnoGames
      if (target.includes('faro.innogames.de/collect') || target.includes('faro.tracing')) return true;
    }

    return false;
  };

  const isMaliciousPayload = (payload) => {
    if (!payload) return false;
    if (typeof payload === 'string') return isMaliciousString(payload);

    try {
      // Se for um FormData (upload) ou URLSearchParams, analisa todos os valores preenchidos
      if (payload instanceof FormData || payload instanceof URLSearchParams) {
        for (let value of payload.values()) {
          if (typeof value === 'string' && isMaliciousString(value)) return true;
        }
      }
    } catch (e) {}

    return false;
  };

  // 3. Interceptação de Baixo Nível (Bloqueio Físico na Rede)
  // Isso garante que mesmo se o TW reconectar o Socket ao mudar de aba e burlar a window.Connection,
  // a mensagem nativa do navegador não vai sair.
  const initNetworkBlocker = () => {
    const originalWsSend = window.WebSocket.prototype.send;
    window.WebSocket.prototype.send = function(data) {
      if (isMaliciousString(data)) {
        let origin = "Desconhecida";
        try {
          const match = data.match(/\["(?:Script|ac\/r|cs)"\s*,\s*\[?"([^"]+)"/);
          if (match && match[1]) origin = extractOrigin(match[1]);
        } catch (e) {}
        console.log(`%c[Anti-Track] Fuga bloqueada na raiz da rede (WebSocket). Origem: ${origin}`, "color: red; font-weight: bold;");
        return; // Corta o envio nativo do navegador
      }
      return originalWsSend.apply(this, arguments);
    };

    // Intercepta a abertura para bloquear GETs perigosos passados via Query String
    const originalXhrOpen = window.XMLHttpRequest.prototype.open;
    window.XMLHttpRequest.prototype.open = function(method, url) {
      this._goRequestUrl = typeof url === 'string' ? url : String(url || '');

      if (typeof url === 'string' && isMaliciousString(url)) {
        console.log(`%c[Anti-Track] Fuga bloqueada na raiz da rede (XHR Open URL).`, "color: red; font-weight: bold;");
        this._isMalicious = true;
      }

      return originalXhrOpen.apply(this, arguments);
    };

    const originalXhrSend = window.XMLHttpRequest.prototype.send;
    window.XMLHttpRequest.prototype.send = function(body) {
      if (isPingRequestUrl(this._goRequestUrl) && !this._goPingListenerInstalled) {
        this._goPingListenerInstalled = true;

        this.addEventListener('loadend', () => {
          try {
            if (
              this.status >= 200
              && this.status < 300
              && hasSessionExpiredResponseBody(this.responseText)
            ) {
              reloadCurrentTabOnSessionExpired()
            }
          } catch (e) {}
        }, { once: true });
      }

      if (this._isMalicious || isMaliciousPayload(body)) {
        let origin = "Desconhecida";
        try {
          if (typeof body === 'string') {
            const match = body.match(/\["(?:Script|ac\/r|cs)"\s*,\s*\[?"([^"]+)"/);
            if (match && match[1]) origin = extractOrigin(match[1]);
          }
        } catch (e) {}
        console.log(`%c[Anti-Track] Fuga bloqueada na raiz da rede (XHR). Origem: ${origin}`, "color: red; font-weight: bold;");
        this.abort(); // Interrompe silenciosamente nativo para não causar loops ou crashes na página
        return; // Corta o envio de fallback (Polling)
      }
      return originalXhrSend.apply(this, arguments);
    };

    // Intercepta a API Fetch (Muito usada pela InnoGames para telemetria assíncrona POST em /game.php)
    const originalFetch = window.fetch;
    window.fetch = async function(resource, config) {
      let isMalicious = false;
      const requestUrl = typeof resource === 'string'
        ? resource
        : resource instanceof Request
          ? resource.url
          : '';
      if (typeof resource === 'string' && isMaliciousString(resource)) isMalicious = true;
      else if (resource instanceof Request && isMaliciousString(resource.url)) isMalicious = true;

      if (config && config.body && isMaliciousPayload(config.body)) isMalicious = true;

      if (isMalicious) {
        console.log(`%c[Anti-Track] Fuga bloqueada na raiz da rede (Fetch).`, "color: red; font-weight: bold;");
        // Retorna um falso sucesso pro jogo não ficar tentando re-enviar e não quebrar a página
        return new Response(JSON.stringify({ success: true }), { status: 200 });
      }

      const response = await originalFetch.apply(this, arguments);

      if (isPingRequestUrl(requestUrl)) {
        void response.clone().text()
          .then((bodyText) => {
            if (hasSessionExpiredResponseBody(bodyText)) {
              reloadCurrentTabOnSessionExpired()
            }
          })
          .catch(() => {})
      }

      return response;
    };

    // Intercepta a API sendBeacon (A arma principal de analytics moderno disparada ao fechar a aba)
    const originalBeacon = navigator.sendBeacon;
    navigator.sendBeacon = function(url, data) {
      if ((typeof url === 'string' && isMaliciousString(url)) || isMaliciousPayload(data)) {
        console.log(`%c[Anti-Track] Fuga bloqueada na raiz da rede (Beacon).`, "color: red; font-weight: bold;");
        return true; // Simula que foi enfileirado com sucesso
      }
      return originalBeacon.apply(this, arguments);
    };
  };

  initConnectionBlocker();
  initJQueryBlocker();
  initNetworkBlocker();
}
