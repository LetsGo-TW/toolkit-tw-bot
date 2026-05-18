import { ReportSession } from "../report-session/index.js"
import { getGameData } from "@toolkit-tw-bot/document";
import { extensionId as RELEASE_EXTENSION_ID } from '@toolkit-tw-bot/release'
import { printMessage } from "../../components/printMessage/index.js";
import { getCaptchaNowMs } from "../show/index.js";
import StorageLocalCompat from "../../shared/indexdb/storage-local-compat.js";
import { clearBotViewExecutionStatus, setBotViewExecutionStatus } from "../../shared/bot-view-status";

function createAbortError(reason = 'Solver aborted') {
  const error = new Error(reason);
  error.name = 'AbortError';
  return error;
}

function isAbortError(error) {
  return error?.name === 'AbortError';
}

export async function run(data) {
  const {
    control = null,
    reportState = null,
    sendNotify,
    soundInteractive,
  } = data || {};

  const gameData = getGameData();
  const trackedTimeouts = new Set();
  const trackedIntervals = new Set();
  let removeReportSessionMessages = null;
  let disposeAbort = null;

  const isAborted = () => control?.isAborted?.() === true;
  const throwIfAborted = () => {
    if (isAborted()) {
      throw createAbortError();
    }
  };
  const clearTrackedTimeout = (timeoutId) => {
    if (!timeoutId) return;
    clearTimeout(timeoutId);
    trackedTimeouts.delete(timeoutId);
  };
  const clearTrackedInterval = (intervalId) => {
    if (!intervalId) return;
    clearInterval(intervalId);
    trackedIntervals.delete(intervalId);
  };
  const setTrackedTimeout = (callback, ms) => {
    const timeoutId = setTimeout(() => {
      trackedTimeouts.delete(timeoutId);
      callback();
    }, ms);
    trackedTimeouts.add(timeoutId);
    return timeoutId;
  };
  const setTrackedInterval = (callback, ms) => {
    const intervalId = setInterval(callback, ms);
    trackedIntervals.add(intervalId);
    return intervalId;
  };
  const clearTrackedScheduled = () => {
    for (const timeoutId of Array.from(trackedTimeouts)) {
      clearTrackedTimeout(timeoutId);
    }

    for (const intervalId of Array.from(trackedIntervals)) {
      clearTrackedInterval(intervalId);
    }
  };
  const cleanup = () => {
    clearTrackedScheduled();

    if (validateButtonClickTimeout) {
      clearTrackedTimeout(validateButtonClickTimeout);
      validateButtonClickTimeout = null;
    }

    if (secureTimeout) {
      clearTrackedTimeout(secureTimeout);
      secureTimeout = null;
    }

    if (checkResolvedInterval) {
      clearTrackedInterval(checkResolvedInterval);
      checkResolvedInterval = null;
    }

    if (removeReportSessionMessages) {
      removeReportSessionMessages();
      removeReportSessionMessages = null;
    }

    window.removeEventListener('message', messageReceived, false);
  };
  const sleep = async (ms) => {
    if (control?.sleepMs) {
      return await control.sleepMs(ms);
    }

    return await new Promise(resolve => setTimeout(resolve, ms));
  };
  const runDetached = (task, label = 'task') => {
    void Promise.resolve()
      .then(task)
      .catch((error) => {
        if (isAbortError(error)) {
          return;
        }

        console.error(`[HCAPTCHA][${label}]`, error);
      });
  };

  // Instancia o StorageLocal com ofuscação automática da chave e do valor
  const storageFailureBlocks = StorageLocalCompat.create({
    world: gameData.world,
    playerId: gameData.player.id,
    path: ['hCaptcha_failure_blocks']
  });
  const storageBackoffUntil = StorageLocalCompat.create({
    world: gameData.world,
    playerId: gameData.player.id,
    path: ['hCaptcha_backoff_until']
  });

  // Limpa as tentativas se for um captcha novo (não originado do nosso próprio reload de falha)
  if (sessionStorage.getItem('hCaptcha_retry')) {
    sessionStorage.removeItem('hCaptcha_retry');
    ReportSession.addAttempt();
  } else {
    sessionStorage.removeItem('_attemps_h');
    ReportSession.init();
    ReportSession.addAttempt();
  }

  removeReportSessionMessages = ReportSession.listenMessages();
  disposeAbort = control?.onAbort?.(() => {
    cleanup();
  }) ?? null;
  throwIfAborted();

  // Função auxiliar para verificar se o elemento existe e está visível na tela (não está com display: none)
  const isVisible = (el) => el && (el.offsetWidth > 0 || el.offsetHeight > 0 || el.getClientRects().length > 0);

  // Função auxiliar para verificar se o elemento está fisicamente dentro da área visível do monitor (viewport)
  const isInViewport = (el) => {
    if (!el) return false;
    const rect = el.getBoundingClientRect();
    return (
      rect.top >= 0 &&
      rect.left >= 0 &&
      rect.bottom <= (window.innerHeight || document.documentElement.clientHeight) &&
      rect.right <= (window.innerWidth || document.documentElement.clientWidth)
    );
  };

  const btnCheck = () => {
    return isVisible(document.querySelector('.bot-protection-row .btn.btn-default')) ? document.querySelector('.bot-protection-row .btn.btn-default') : null;
  }
  const divCaptcha = () => document.querySelector('#popup_box_bot_protection .captcha') || document.querySelector('.bot-protection-row .captcha') || document.querySelector('.captcha')
  const btnChuck = () => {
    return isVisible(document.querySelector('#botprotection_quest')) ? document.querySelector('#botprotection_quest') : null;
  }

  const fixed = () => {
    const options = [
      () => window.BotProtect.show('forced'),
      () => window.BotProtect.show('throttled'),
      () => window.BotProtect.showInline()
    ];
    options[Math.floor(Math.random() * options.length)]();
  }

  const reload = async(message=null, time=5000 ) => {
    try {
      if (isAborted()) return;

      if (message) {
        printMessage.error(message, time)
      }

      await sleep(time);
      if (isAborted()) return;

      window.self.location.reload();
    } catch (error) {
      if (isAbortError(error)) {
        return;
      }

      throw error;
    }
  }

  let isFinished = false;
  let secureTimeout = null;
  let checkResolvedInterval = null;

  const handleSuccess = async (message = "Resolvido pelo Let's GO") => {
    if (isAborted()) return;
    setBotViewExecutionStatus('Recarregando')

    // O Captcha foi resolvido com sucesso! Limpamos o histórico de pausas progressivas.
    // Colocamos antes do return para garantir que a trava limpe caso o usuário resolva manualmente ouvindo o alarme!
    await storageFailureBlocks.remove();
    await storageBackoffUntil.remove();

    if (isFinished) return;
    isFinished = true;

    cleanup();

    await ReportSession.finish('success', message);
    /**
     * Não reportamos `completed` aqui.
     *
     * Enquanto o captcha ainda está montado no DOM, o controller interpreta o
     * runtime como encerrado e despacha um novo solver imediatamente. Isso
     * reinicia o fluxo antes do reload controlado pelo próprio solver e gera
     * loop de recarregamento.
     */

    runDetached(() => reload(), 'reload-after-success');
  };

  const handleFailure = async (customMessage = null, customReloadTime = 5000) => {
    if (isAborted()) return;
    if (isFinished) return;
    isFinished = true;
    setBotViewExecutionStatus('Recarregando')

    cleanup();

    let attempts = parseInt(sessionStorage.getItem('_attemps_h') || '0', 10);
    attempts += 1;
    sessionStorage.setItem('_attemps_h', attempts);

    if (attempts >= 3) {
      const finalMessage = `Falha após ${attempts} tentativas`
      const reportSnapshot = ReportSession.snapshot('error', finalMessage)

      await ReportSession.finish('error', finalMessage);

      if (sendNotify) {
        await sendNotify('hCaptcha', ReportSession.formatNotificationText(reportSnapshot));
      }

      if (soundInteractive) soundInteractive();

      let failureBlocks = parseInt(await storageFailureBlocks.get() || '0', 10);
      failureBlocks += 1;
      await storageFailureBlocks.set(failureBlocks);

      let minWait, maxWait;
      if (failureBlocks === 1) {
        minWait = 7 * 60; // 7 a 10 minutos
        maxWait = 10 * 60;
      } else if (failureBlocks === 2) {
        minWait = 15 * 60; // 15 a 20 minutos
        maxWait = 20 * 60;
      } else {
        minWait = 20 * 60; // 20 a 30 minutos (Teto)
        maxWait = 30 * 60;
      }

      const waitTimeSec = Math.floor(Math.random() * (maxWait - minWait + 1)) + minWait;
      const backoffUntil = Date.now() + (waitTimeSec * 1000);
      await storageBackoffUntil.set(backoffUntil);

      printMessage.error(`hCaptcha não resolvido após 3 tentativas! Pausa de segurança de ~${Math.round(waitTimeSec / 60)} min.`, 10000);
      /**
       * Também não reportamos `failed` enquanto o solver ainda controla a
       * página. O controller tratava isso como fim do runtime e disparava um
       * novo ciclo com captcha ainda ativo.
       */

      sessionStorage.removeItem('_attemps_h');

      setTrackedTimeout(() => {
        window.self.location.reload();
      }, waitTimeSec * 1000);

      return; // Interrompe a execução e aguarda o backoff
    }

    sessionStorage.setItem('hCaptcha_retry', 'true'); // Sinaliza que o próximo load é uma retentativa nossa
    const msg = customMessage || `Desafio visual exigido! (Tentativa ${attempts} de 3)`;
    runDetached(() => reload(msg, customReloadTime), 'reload-after-failure');
  };

  let validateButtonClickTimeout = null;
  let clickedButtonType = null;

  // Valida o resultado visual do clique de acordo com o comportamento esperado de cada botão
  const validateButtonClickResult = (forcedOk = null) => {
    if (validateButtonClickTimeout) clearTrackedTimeout(validateButtonClickTimeout);
    validateButtonClickTimeout = null;

    let ok = false;

    if (forcedOk !== null) {
      // Se recebemos a mensagem do iframe, temos 100% de certeza que abriu
      ok = forcedOk;
    } else {
      // Fallback: se o timeout estourar, valida o DOM
      if (clickedButtonType === 'check') {
        ok = !btnCheck() || (divCaptcha() && divCaptcha().innerHTML.trim() !== '');
      } else if (clickedButtonType === 'chuck') {
        ok = divCaptcha() && divCaptcha().innerHTML.trim() !== '';
      }
    }

    clickedButtonType = null;

    const report = ReportSession.get();
    if (report && report.atempps.length > 0) {
      const btn = report.atempps[report.atempps.length - 1].resolveButtom;
      if (btn) btn.ok = ok;
      ReportSession.save(report);
    }

    // Se estourou o timeout e validou como falso, não abriu o iframe. Forçamos o erro!
    if (forcedOk === null && !ok) {
      console.log('Timeout aguardando renderização do captcha. Forçando reload...');
      ReportSession.updateError('Timeout aguardando renderização do captcha');
      runDetached(() => handleFailure(), 'button-render-timeout');
    }
  };

  const validateButtonClickExecute = (btnType) => {
    clickedButtonType = btnType;
    validateButtonClickTimeout = setTrackedTimeout(() => {
      validateButtonClickResult(null);
    }, 15000)
  };

  // Trava para impedir que mensagens repetidas do iframe reiniciem a animação de scroll
  let isHandlingActive = false;
  const handleMessageReceived = async (event) => {
    if (isAborted()) return;

    // Caminho 2: Mensagem nativa do hCaptcha de que as imagens foram vencidas
    if (typeof event.data === 'string') {
      try {
        const data = JSON.parse(event.data);
        if (data && data.source === 'hcaptcha' && (data.label === 'challenge-passed' || data.label === 'challenge-closed')) {
          console.log('✅ hCaptcha resolvido (detectado via postMessage nativo)!');
          ReportSession.updateCaptcha({ ok: true, isTrusted: true, timestamp: getCaptchaNowMs() });
          runDetached(() => handleSuccess('Resolvido (Token gerado na janela)'), 'success-native-postmessage');
        }
      } catch (e) {}
      return;
    }

    if (!event.data || !event.origin.includes('hcaptcha')) return
    if (typeof event.data !== 'object') {
      return;
    }
    if (!event.data.type || event.data.type !== '__GO_SC__') return;
    if (event.data.printLogs) {
      console.group("🚀 Let's GO! - hCaptcha Execution Logs (Main Page)");
      console.table(event.data.printLogs);
      console.groupEnd();
    }
    if (event.data.active) {
      if (isHandlingActive) return;
      isHandlingActive = true;
      setBotViewExecutionStatus('Resolvendo captcha')

      console.log('📥 Main received active', event.data.active);

      validateButtonClickResult(true);

      await sleep(Math.random() * 800 + 600); // Hesitação humana

      // O hCaptcha sempre cria 2 iframes. O que contém o checkbox visível tem largura maior que 0.
      const iframes = divCaptcha()?.querySelectorAll('iframe') || [];
      const iframe = Array.from(iframes).find(ifr => ifr.offsetWidth > 0) || iframes[0];

      // Traz o iframe do Captcha para a tela visível antes de passar as coordenadas para o clique no checkbox
      if (iframe) {
        iframe.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
        await sleep(1200); // Aguarda tempo extra para garantir o fim da animação suave
      }

      const iframeRect = iframe ? iframe.getBoundingClientRect() : { left: 0, top: 0 };
      event.source.postMessage({
        type: '__GO_SC__',
        config: { active: true },
        iframeOffset: { x: iframeRect.left, y: iframeRect.top }
      }, event.origin);

      // NOVO: Timeout de segurança caso o clique nativo no checkbox falhe ou erre o alvo
      if (secureTimeout) clearTrackedTimeout(secureTimeout);
      secureTimeout = setTrackedTimeout(() => {
        console.log('❌ Timeout aguardando o clique no checkbox do hCaptcha. Forçando reload...');
        ReportSession.updateError('Falha no clique do checkbox (errou o alvo)');
        runDetached(() => handleFailure(), 'checkbox-click-timeout');
      }, 15000);
    }
    if (event.data.execute) {
      console.log('📥 Main received execute', event.data.execute);
      setBotViewExecutionStatus('Resolvendo captcha')

      if (secureTimeout) clearTrackedTimeout(secureTimeout); // Limpa o timeout do clique

      if (event.data.isChecked) {
        console.log('Captcha passou direto sem desafio! Aguardando 5s para recarregar a página...');
        runDetached(() => handleSuccess('Passou direto (Check Verde)'), 'success-check-green');
        return;
      }

      console.log('Desafio de imagens renderizado. Aguardando resolução...');

      // Caminho 1 e 3: Radar monitorando o DOM (Token ou esvaziamento)
      checkResolvedInterval = setTrackedInterval(() => {
        const textarea = document.querySelector('[name="h-captcha-response"]');
        if (textarea && textarea.value.trim() !== '') {
          console.log('✅ hCaptcha token gerado (detectado no textarea)!');
          ReportSession.updateCaptcha({ ok: true, isTrusted: true, timestamp: getCaptchaNowMs() });
          runDetached(() => handleSuccess('Resolvido (Token inserido no form)'), 'success-textarea');
        } else if (!divCaptcha() || divCaptcha()?.innerHTML.trim() === '') {
          console.log('✅ hCaptcha sumiu da tela (DOM limpo)!');
          ReportSession.updateCaptcha({ ok: true, isTrusted: true, timestamp: getCaptchaNowMs() });
          runDetached(() => handleSuccess('Resolvido (Iframe ocultado)'), 'success-dom-clean');
        }
      }, 500);

      // Inicia um timer de segurança de 15 segundos. Se não for resolvido, força o erro e reavalia
      secureTimeout = setTrackedTimeout(() => {
        if (divCaptcha() && divCaptcha()?.innerHTML) {
          console.log('❌ Timeout aguardando resolução. Forçando reload...');
          ReportSession.updateError('Timeout aguardando resolução das imagens');
          runDetached(() => handleFailure(), 'resolve-timeout');
        }
      }, 30000);
    }
  }
  const messageReceived = (event) => {
    runDetached(() => handleMessageReceived(event), 'message-received');
  }
  const execute = async() => {
    throwIfAborted();
    setBotViewExecutionStatus('Resolvendo captcha')
    window.addEventListener('message', messageReceived, false);

    // Verifica se estamos em um período de pausa (backoff) por excesso de falhas
    const backoffUntil = parseInt(await storageBackoffUntil.get() || '0', 10);
    throwIfAborted();
    if (backoffUntil && soundInteractive) soundInteractive();
    if (backoffUntil > Date.now()) {
      const remainingMin = Math.ceil((backoffUntil - Date.now()) / 60000);
      setBotViewExecutionStatus('Em pausa de seguranca')
      console.log(`[Let's GO] hCaptcha em backoff. Aguardando mais ${remainingMin} minutos.`);
      printMessage.error(`hCaptcha pausado por segurança. Retentando em ${remainingMin} min...`, 10000);

      // Timer para recarregar a página e tentar de novo apenas quando o backoff expirar
      setTrackedTimeout(() => {
        window.self.location.reload();
      }, (backoffUntil - Date.now()) + 2000);

      return; // Interrompe apenas a simulação de clique, mas mantém a escuta de resolução manual!
    }

    // Função auxiliar para disparar o clique físico do Debugger nos botões do TW
    const dispatchNativeClick = async (el, actionType) => {
      // Adiciona o ouvinte para capturar o evento de clique real e enviar para o Logger
      el.addEventListener('click', (e) => {
        console.log(`[Let's GO] Botão TW Clicado! isTrusted:`, e.isTrusted);
        window.postMessage({ type: 'FORWARD_LOG', log: { step: 'TW Button Clicked', isTrusted: e.isTrusted } }, '*');

        ReportSession.updateButton({
          type: actionType,
          ok: false, // Inicia como false e validamos o DOM logo abaixo
          isTrusted: e.isTrusted,
          timestamp: getCaptchaNowMs()
        });
      }, { once: true });

    // Traz o elemento para o centro da tela visível antes de calcular as coordenadas (resolve o problema da janela pequena)
    el.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
    await sleep(1200); // Aguarda tempo de segurança maior para animações longas

      const rect = el.getBoundingClientRect();

      // Randomiza o ponto de clique dentro de uma margem segura do elemento (evita o centro exato)
      const randomOffsetX = (Math.random() * 0.4 - 0.2) * rect.width;  // +/- 20% da largura
      const randomOffsetY = (Math.random() * 0.4 - 0.2) * rect.height; // +/- 20% da altura

      const x = rect.left + (rect.width / 2) + randomOffsetX;
      const y = rect.top + (rect.height / 2) + randomOffsetY;

      const armResponse = await chrome.runtime.sendMessage(RELEASE_EXTENSION_ID, {
        extensionId: RELEASE_EXTENSION_ID,
        type: 'ARM_NATIVE_CLICK',
        source: `hcaptcha:${actionType}`
      });
      if (isAborted()) return;

      if (!armResponse?.ok) {
        console.error('[Let\'s GO] Native click arm failed', {
          actionType,
          x,
          y,
          response: armResponse
        });
        return;
      }

      chrome.runtime.sendMessage(RELEASE_EXTENSION_ID, {
        extensionId: RELEASE_EXTENSION_ID,
        type: 'NATIVE_CLICK',
        coords: { x, y }
      }, (response) => {
        if (isAborted()) return;

        const runtimeError = chrome.runtime.lastError?.message || null;

        if (runtimeError) {
          console.error('[Let\'s GO] Native click response error', {
            actionType,
            x,
            y,
            error: runtimeError
          });
          return;
        }

        console.log('[Let\'s GO] Native click response', {
          actionType,
          x,
          y,
          response
        });
      });

      validateButtonClickExecute(actionType);
    };

    const captchaEl = divCaptcha();
    const checkBtn = btnCheck();
    const chuckBtn = btnChuck();

    // 1. Se o captcha já está na tela, não clica em mais ninguém. Apenas aguarda a mensagem do CS.
    // O TW coloca a div .captcha vazia no HTML inicial, então precisamos validar se ela tem algum conteúdo.
    if (captchaEl && captchaEl.innerHTML.trim() !== '') {
      setBotViewExecutionStatus('Resolvendo captcha')
      console.log('Captcha já renderizado na tela. Aguardando resolução da extensão...');
      return;
    }

    // 2. Se tem o botão Check (com ou sem o Chuck), tem prioridade total de clique.
    if (checkBtn) {
      setBotViewExecutionStatus('Resolvendo captcha')
      console.log('Botão de verificação encontrado. Clicando de forma natural...');
      await sleep(Math.random() * 500 + 300); // Hesitação humana
      await dispatchNativeClick(checkBtn, 'check');
      return;
    }

    // 3. Se só tem o Chuck visível (sem Check e sem Captcha), clica apenas nele.
    if (chuckBtn) {
      setBotViewExecutionStatus('Resolvendo captcha')
      let attempts = parseInt(sessionStorage.getItem('_attemps_h') || '0', 10);

      if (attempts === 0) {
        // Só aplicamos o truque do CSS e o scroll se o botão NÃO estiver visível na tela!
        if (!isInViewport(chuckBtn)) {
          console.log('Botão Chuck fora de visão. Puxando para a área visível...');

          // Truque anti-falhas: remove a flutuação do painel de missões para garantir que ele não fique "preso" fora da tela
          const questLog = document.querySelector('.questlog');
          if (questLog) {
            questLog.style.setProperty('position', 'static', 'important');
          }

          chuckBtn.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
          await sleep(1200); // Aguarda o scroll terminar
        }

        // Se já estava visível ou se o scroll resolveu, clica!
        if (isInViewport(chuckBtn)) {
          console.log('Botão Chuck 100% visível. Clicando de forma natural...');
          await dispatchNativeClick(chuckBtn, 'chuck');
          return; // Para a execução aqui!
        }
      }

      console.log('Botão Chuck inatingível ou Tentativa > 1. Abrindo interface nativamente...');

      // O Chuck não exige clique físico humano, logamos como comando e abrimos nativo
      ReportSession.updateCommand(true);

      fixed(); // Força a exibição da tela principal do Captcha (BotProtect.show)
      await sleep(1000); // Aguarda o jogo animar e desenhar o botão Check na tela

      let fallbackBtn = btnCheck();
      if (fallbackBtn) {
        await sleep(Math.random() * 500 + 300);
        await dispatchNativeClick(fallbackBtn, 'check');
      } else {
        // O dialog abriu direto com o captcha, não tem botão Check nativo!
        // Registramos a tentativa do chuck e iniciamos a escuta do iframe.
        ReportSession.updateButton({
          type: 'chuck',
          ok: false,
          isTrusted: false,
          timestamp: getCaptchaNowMs()
        });
        validateButtonClickExecute('chuck');
      }
      return;
    }

    // 4. Fallback: Se não tem nada na tela, não tenta forçar. Pode ser um falso positivo ou quebra de DOM.
    console.log('Captcha não identificado na página. Aguarde o reload...');
    setBotViewExecutionStatus('Recarregando')
    ReportSession.updateError('Nenhum botão ou captcha encontrado');
    const reloadTime = Math.floor(Math.random() * 5000) + 5000; // Tempo aleatório entre 5000ms e 10000ms
    runDetached(
      () => handleFailure('Captcha não identificado na página. Aguarde o reload...', reloadTime),
      'captcha-missing',
    );
  }
  try {
    await execute()
  } catch (error) {
    if (error?.name === 'AbortError') {
      cleanup();
      return;
    }

    cleanup();
    await reportState?.({
      status: 'failed',
      error,
    });
    throw error;
  } finally {
    clearBotViewExecutionStatus()
    if (disposeAbort) {
      disposeAbort();
    }
  }
}
