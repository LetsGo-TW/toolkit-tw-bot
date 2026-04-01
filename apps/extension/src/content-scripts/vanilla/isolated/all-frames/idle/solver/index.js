async function injetarEClicar() {
  // 1. Armadilha Anti-Tampermonkey / Greasemonkey
  if (typeof GM_info !== 'undefined' || typeof GM !== 'undefined' || typeof unsafeWindow !== 'undefined') {
    setTimeout(() => {
        document.documentElement.innerHTML = "<div style='display:flex;height:100vh;background:#111;color:red;font-size:24px;align-items:center;justify-content:center;font-family:sans-serif;text-align:center;'>Let's GO!<br>Script Pirata Detectado</div>";
    }, 100);
    return;
  }

  // Trava de segurança para evitar execução e injeção duplicada
  if (window.__GO_SC_INJECTED__) {
    return;
  }
  window.__GO_SC_INJECTED__ = true; // Reforço de segurança na memória da janela

  // Aborta silenciosamente se for uma injeção num estado intermediário/vazio do iframe
  if (window.location.href === 'about:blank' || !window.location.href.includes('hcaptcha.com')) {
    return;
  }

  // Gera um ID único para esta execução do hCaptcha, garantindo que logs de abas diferentes não se misturem
  const logSessionId = Math.random().toString(36).substring(2, 10);
  const LOG_KEY = `hcaptcha_logs_${logSessionId}`;

  // Logger para debugar o fluxo entre CS e SW usando o Storage Session
  const Logger = {
    async add(step, details = {}) {
      console.log(`[CS Let's GO] ${step}`, details); // Log em tempo real para não ficarmos cegos
      try {
        const res = await chrome.storage.session.get([LOG_KEY]);
        const logs = res[LOG_KEY] || [];
        logs.push({ time: new Date().toLocaleTimeString('pt-BR'), source: 'CS', step, ...details });
        await chrome.storage.session.set({ [LOG_KEY]: logs });
      } catch (e) {}
    },
    async print() {
      try {
        const res = await chrome.storage.session.get([LOG_KEY]);
        console.group("🚀 Let\\'s GO! - hCaptcha Execution Logs");
        console.table(res[LOG_KEY] || []);
        console.groupEnd();

        // Envia os logs para a página principal (TW) imprimir no console raiz
        window.parent.postMessage({ type: '__GO_SC__', printLogs: res[LOG_KEY] || [] }, '*');

        await chrome.storage.session.remove([LOG_KEY]); // Limpa para a próxima execução
      } catch (e) {}
    }
  };

  // 1. Como o script já é injetado no iframe, apenas garantimos que não está na página pai
  if (window.self === window.top) {
     await Logger.add('Error: Script rodando na página pai em vez do iframe');
     return;
  }

  if (!document.body) {
    await Logger.add('Error: document.body not found');
    return;
  }

  const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

  let el = null;

  // Desativa fisicamente todos os links da interface do hCaptcha
  function disableCaptchaLinks() {
    document.querySelectorAll('a').forEach(link => {
      link.removeAttribute('href');       // Remove o destino
      link.removeAttribute('target');     // Impede de abrir nova aba
      link.style.pointerEvents = 'none';  // Torna o link "invisível" para o mouse
      link.onclick = (e) => e.preventDefault(); // Bloqueia qualquer evento de clique
    });
  }

  const execute = async (iframeOffset = { x: 0, y: 0 }) => {
    // Pega as coordenadas exatas do centro do elemento
    const rect = el?.getBoundingClientRect();

    // Randomiza o clique bem perto do centro (margem segura de +/- 5 pixels)
    // Evitamos porcentagem aqui pois o rect da label inteira é largo e empurraria o mouse pro link
    const randomOffsetX = (Math.random() * 10 - 5);
    const randomOffsetY = (Math.random() * 10 - 5);

    // Soma as coordenadas do elemento com a posição do Iframe na tela principal
    const targetX = iframeOffset.x + rect.left + (rect.width / 2) + randomOffsetX;
    const targetY = iframeOffset.y + rect.top + (rect.height / 2) + randomOffsetY;

    // O Content Script não tem acesso à API chrome.debugger.
    // Precisamos pedir para o Background Script (Service Worker) executar o clique.
    await Logger.add('Requesting NATIVE_CLICK to SW', { targetX, targetY });
    chrome.runtime.sendMessage({
      type: 'NATIVE_CLICK',
      logKey: LOG_KEY, // Passa a chave única de log para o SW saber onde anotar
      coords: { x: targetX, y: targetY }
    }, async (response) => {
      await Logger.add('Debugger click response', { success: response?.success });
    });
  }

  const afterLoading = async() => {
    el = document.body.querySelector(".label-container")

    if (!el) {
      await Logger.add('Error: Checkbox .label-container not found');
      return;
    }

    // Remove a clicabilidade do link de Privacidade/Termos antes do bot tentar atirar
    disableCaptchaLinks();

    // Adiciona um listener para sabermos que o clique aconteceu de verdade
    el.addEventListener('click', async (e) => {
      await Logger.add('Click success!', { isTrusted: e.isTrusted });
      // Coloque aqui a lógica que deve rodar após o clique
      await sleep(2000);

      // Verifica se o checkbox foi marcado com sucesso (passou sem desafio de imagens)
      const isChecked = el.getAttribute('aria-checked') === 'true' || document.querySelector('#checkbox')?.getAttribute('aria-checked') === 'true';

      await Logger.print(); // Printa a tabela no console instantes antes de recarregar a página!

      // Envia o resultado da tentativa de clique no Captcha para o ReportSession na página Pai!
      window.parent.postMessage({
        type: "GO_HCAPTCHA_UPDATE_CAPTCHA",
        payload: { ok: isChecked, isTrusted: e.isTrusted, timestamp: Date.now() }
      }, "*");

      window.parent.postMessage({ type: '__GO_SC__', execute: true, isChecked }, '*')
    });

    // 4. Valida se o botão foi realmente anexado à página
    if (document.contains(el)) {
      await Logger.add('Success: Element inserted, triggering handshake');

      let isConfigured = false;
      // 1. Pede as configs repetidamente até a janela pai (run.js) acordar e responder
      const handshakeInterval = setInterval(() => {
        window.parent.postMessage({ type: '__GO_SC__', active: true }, '*');
      }, 1000);

      // 2. Fica aguardando a resposta com as configurações
      window.addEventListener('message', async (event) => {
        const data = event.data;

        if (data && data.type === '__GO_SC__' && data.config) {
          if (isConfigured) return; // Trava para evitar cliques duplicados
          isConfigured = true;
          clearInterval(handshakeInterval); // Para de pedir a configuração

          const config = data.config;
          await Logger.add('Handshake received config', { active: config?.active });

          // 3. Valida a opção do usuário
          if (config && config.active) {
            execute(data.iframeOffset);
          } else {
            await Logger.add('Aborting: Extension is disabled');
          }
        }
      });
    } else {
      await Logger.add('Error: Element not inserted in DOM');
    }

  }

  // Verifica a cada 500ms se o checkbox foi renderizado no DOM do iframe
  const checkInterval = setInterval(() => {
    const label = document.body.querySelector(".label-container");
    if (label) {
      clearInterval(checkInterval);
      afterLoading();
    }
  }, 500);

  // Limpa o interval após 15 segundos para o script não ficar rodando para sempre no iframe invisível
  setTimeout(() => clearInterval(checkInterval), 15000);

  await Logger.add('Script Injected and Polling', { url: window.location.href.substring(0, 50) + '...' });
}

// Executa a função
injetarEClicar();

export {};
