import { isTribalWarsUrl } from "../prepared-context";
import { scheduleErrorAlarm } from "../prepared-context/error-tabId";

// Tempos base sugeridos (em segundos) baseados no tipo de recuperação de rede
const netError = new Map([
  ['net::ERR_INTERNET_DISCONNECTED', 30],  // Sem internet demora um pouco para restabelecer
  ['net::ERR_CONNECTION_TIMED_OUT', 15],   // Instabilidade ou lentidão, tenta mais rápido
  ['net::ERR_NAME_NOT_RESOLVED', 30],      // Falha de DNS costuma demorar mais
  ['net::ERR_CONNECTION_REFUSED', 30],     // Servidor fora ou reiniciando
  ['net::ERR_CONNECTION_RESET', 10],       // Queda abrupta no meio da conexão, geralmente volta rápido
  ['net::ERR_CONNECTION_CLOSED', 10],      // Timeout do servidor, tentar rápido
  ['net::ERR_CONNECTION_FAILED', 30],      // Falha geral
  ['net::ERR_CONNECTION_CLOSED_EARLY', 10] // Crash no script do site, tenta rápido
]);

// Erros que não devem ser retentados (causados pelo usuário, bloqueios locais ou SSL)
const ignoredErrors = new Set([
  'net::ERR_ABORTED',                  // Cancelado pelo usuário (apertou o X) ou por outro script
  'net::ERR_BLOCKED_BY_CLIENT',        // Bloqueado por AdBlock, antivírus ou outra extensão
  'net::ERR_BLOCKED_BY_ADMINISTRATOR', // Bloqueado por política corporativa do Windows/Rede
  'net::ERR_CERT_AUTHORITY_INVALID',   // Erro de certificado SSL (antivírus interceptando ou site inseguro)
  'net::ERR_CERT_DATE_INVALID'         // Relógio do Windows/PC do usuário está com a data errada
]);

// Armazena as tentativas por aba para aplicar o Recuo Exponencial (Exponential Backoff)
const tabRetries = new Map();
const MAX_RETRY_TIME = 5 * 60; // Teto máximo de 5 minutos (300 segundos)

function onWebNavigationErrorOccurred(details: chrome.webNavigation.WebNavigationFramedErrorCallbackDetails) {
  // somente tw url do manifest
  if (!isTribalWarsUrl(details.url)) return
  // frameId === 0 significa que é a janela principal da aba (não é um iframe)
  if (details.frameId !== 0) return
  // Ignora navegações canceladas, bloqueadas ou com erro irreversível localmente
  if (ignoredErrors.has(details.error)) {
    console.log(`Navegação abortada ou bloqueada (${details.error}): ${details.url}`);
    return;
  }

  console.log(`A página falhou ao carregar: ${details.url}`);
  console.log(`Código do erro: ${details.error}`);

  // Busca o erro na nossa lista customizada (netError)
  const baseTime = netError.get(details.error) || 15; // 15s como fallback genérico

  // Puxa o histórico de tentativas desta aba específica
  let retryData = tabRetries.get(details.tabId) || { attempt: 0, lastError: 0 };
  const now = Date.now();

  // Se a última falha foi há muito tempo (mais do que o nosso tempo máximo de espera + margem),
  // significa que a aba tinha voltado a funcionar e caiu de novo. Resetamos a contagem.
  if (now - retryData.lastError > (MAX_RETRY_TIME * 1000) + 60000) {
    retryData.attempt = 0;
  }

  retryData.attempt += 1;
  retryData.lastError = now;
  tabRetries.set(details.tabId, retryData);

  // Lógica do Recuo Exponencial: baseTime * 2^(tentativa - 1)
  let waitTime = baseTime * Math.pow(2, retryData.attempt - 1);

  // Aplica o teto máximo (não passar de 5 minutos para continuar tentando sem sufocar)
  if (waitTime > MAX_RETRY_TIME) {
    waitTime = MAX_RETRY_TIME;
  }

  console.log(`[Queda] Aba ${details.tabId} | Tentativa ${retryData.attempt}. Recarregando em ${waitTime} segundos...`);

  // No Manifest V3, o Service Worker dorme e cancela setTimeouts longos.
  // Usar a API de alarms garante que o navegador vai acordar o script no tempo exato!
  const delayInMinutes = waitTime / 60

  void scheduleErrorAlarm(details.tabId, delayInMinutes)
}

export { onWebNavigationErrorOccurred };
