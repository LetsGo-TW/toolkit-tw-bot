/// <reference types="chrome" />

/**
 * Arquivo responsável por iniciar o monitoramento de incomings.
 *
 * Ele conecta:
 * - observer do contador #incomings_amount;
 * - runtime que lê/salva os ataques;
 * - fila de processamento;
 * - reconciliação periódica;
 * - sincronização visual das tags/tooltips.
 *
 * Também salva um estado pending no chrome.storage.local para recuperar
 * o processamento caso a página recarregue antes do runtime terminar.
 */

import { getGameData } from '@toolkit-tw-bot/document'
import installIncomingWatchObserver, { type IncomingObservedDetail } from './observer'
import {
  getIncomingBootstrapDetail,
  isIncomingWatchExtensionContextInvalidated,
  isIncomingWatchTransientError,
  installIncomingVisualSync,
  requestIncomingApplyQueue,
  readSaveNotifyIncomings,
  requestIncomingWatchDecision,
} from './runtime'

/**
 * Chave gravada no window para impedir que o script seja instalado duas vezes
 * na mesma página.
 */
const BOOTSTRAP_KEY = '__toolkitTwBotIncomingWatch__'

/**
 * Tempo para tentar processar novamente caso ocorra erro temporário,
 * como falha de rede ou fetch abortado.
 */
const DRAIN_RETRY_MS = 2500

/**
 * Intervalo da reconciliação periódica.
 *
 * Essa verificação cobre casos onde o contador total de incomings continua igual,
 * mas a fila real mudou.
 */
const PERIODIC_RECONCILE_MS = 5 * 60 * 1000


/**
 * Prefixo usado para salvar o pending no chrome.storage.local.
 *
 * A chave final fica:
 * incoming:pending:${world}:${playerId}
 */
const INCOMING_PENDING_STORAGE_PREFIX = 'incoming:pending'

/**
 * Tempo máximo para considerar um pending recuperável.
 *
 * Se a página recarregou e o pending ficou salvo, ele será recuperado.
 * Mas se ficou antigo demais, provavelmente é lixo/trava antiga e será removido.
 */
const INCOMING_PENDING_MAX_AGE_MS = 2 * 60 * 1000

/**
 * Tipagem extra para permitir salvar uma flag dentro do window.
 */
type ToolkitWindow = Window & {
  [BOOTSTRAP_KEY]?: boolean
}

/**
 * Tipagem mínima do game_data usado pelo Tribal Wars.
 */
type ToolkitGameData = {
  world?: string | null
  player?: {
    id?: string | number | null
  } | null
}

/**
 * Tarefa pendente na fila de processamento.
 */
type PendingIncomingTask = {
  detail: IncomingObservedDetail
  decision: Awaited<ReturnType<typeof requestIncomingWatchDecision>> | null
}

/**
 * Estado salvo no storage para recuperar processamento após reload.
 */
type IncomingPendingStorageValue = IncomingObservedDetail & {
  startedAt: number
}

/**
 * Indica se a fila está sendo processada neste momento.
 * Evita rodar dois processamentos ao mesmo tempo.
 */
let running = false

/**
 * Timer usado para tentar processar novamente depois de erro temporário.
 */
let retryTimer: ReturnType<typeof setTimeout> | null = null

/**
 * Última tarefa pendente.
 *
 * Como o objetivo é processar o estado mais recente dos incomings,
 * uma nova mudança pode substituir a anterior antes do processamento.
 */
let pendingTask: PendingIncomingTask | null = null

/**
 * Timer fixo da reconciliação periódica.
 */
let periodicReconcileTimer: ReturnType<typeof setInterval> | null = null

/**
 * Busca game_data diretamente da página.
 *
 * Aqui usamos:
 * - gameData.world
 * - gameData.player.id
 */
function getCurrentGameDataFromWindow(): ToolkitGameData | null {
  return getGameData() ?? null
}

/**
 * Monta a chave do pending no storage.
 *
 * Formato:
 * incoming:pending:${world}:${playerId}
 */
function getIncomingPendingStorageKey(): string | null {
  const gameData = getCurrentGameDataFromWindow()

  const world = String(gameData?.world || '').trim()
  const playerId = String(gameData?.player?.id || '').trim()

  if (!world || !playerId) {
    return null
  }

  return `${INCOMING_PENDING_STORAGE_PREFIX}:${world}:${playerId}`
}

/**
 * Valida e normaliza um detail salvo no storage.
 */
function normalizeIncomingPendingDetail(value: unknown): IncomingPendingStorageValue | null {
  if (!value || typeof value !== 'object') {
    return null
  }

  const source = value as Partial<IncomingPendingStorageValue>

  const observedAt = Number(source.observedAt)
  const previousCount = Number(source.previousCount)
  const currentCount = Number(source.currentCount)
  const diffCount = Number(source.diffCount)
  const startedAt = Number(source.startedAt)

  if (
    !Number.isFinite(observedAt)
    || !Number.isFinite(previousCount)
    || !Number.isFinite(currentCount)
    || !Number.isFinite(diffCount)
    || !Number.isFinite(startedAt)
  ) {
    return null
  }

  return {
    observedAt,
    previousCount,
    currentCount,
    diffCount,
    startedAt,
  }
}

/**
 * Salva o estado pending antes de iniciar os requests pesados.
 *
 * Se a página recarregar no meio do readSaveNotifyIncomings ou queue-apply,
 * o próximo carregamento consegue recuperar e reiniciar o processo.
 */
async function markIncomingPending(detail: IncomingObservedDetail) {
  const key = getIncomingPendingStorageKey()

  if (!key) {
    logIncomingFlow('Pending não salvo. world/playerId indisponível em gameData.', {
      world: getCurrentGameDataFromWindow()?.world ?? null,
      playerId: getCurrentGameDataFromWindow()?.player?.id ?? null,
    })

    return
  }

  const pendingValue: IncomingPendingStorageValue = {
    ...detail,
    startedAt: Date.now(),
  }

  await chrome.storage.local.set({
    [key]: pendingValue,
  })

  console.log(
    `%c[CS][INCOMING_WATCH][PENDING_SET] Pending salvo | Key: ${key} | Antes: ${detail.previousCount} | Agora: ${detail.currentCount} | Diferença: ${detail.diffCount}`,
    'color: red; font-weight: bold;',
  )
}

/**
 * Remove o pending quando o ciclo completo terminou com sucesso.
 *
 * O ciclo completo aqui é:
 * - readSaveNotifyIncomings()
 * - requestIncomingApplyQueue()
 */
async function clearIncomingPending() {
  const key = getIncomingPendingStorageKey()

  if (!key) {
    return
  }

  await chrome.storage.local.remove(key)

  console.log(
    `%c[CS][INCOMING_WATCH][PENDING_CLEAR] Pending removido | Key: ${key}`,
    'color: red; font-weight: bold;',
  )
}

/**
 * Lê o pending salvo no storage.
 *
 * Não faz request no jogo.
 * Só verifica se havia um processamento aberto antes do reload.
 */
async function getIncomingPendingDetail(): Promise<IncomingObservedDetail | null> {
  const key = getIncomingPendingStorageKey()

  if (!key) {
    logIncomingFlow('Não foi possível verificar pending. world/playerId indisponível em gameData.', {
      world: getCurrentGameDataFromWindow()?.world ?? null,
      playerId: getCurrentGameDataFromWindow()?.player?.id ?? null,
    })

    return null
  }

  const result = await chrome.storage.local.get(key)
  const pending = normalizeIncomingPendingDetail(result?.[key])

  if (!pending) {
    return null
  }

  const age = Date.now() - pending.startedAt

  if (age > INCOMING_PENDING_MAX_AGE_MS) {
    await chrome.storage.local.remove(key)

    console.warn(
      `%c[CS][INCOMING_WATCH][PENDING_EXPIRED] Pending antigo removido | Key: ${key}`,
      'color: red; font-weight: bold;',
      {
        age,
        maxAge: INCOMING_PENDING_MAX_AGE_MS,
        pending,
      },
    )

    return null
  }

  console.log(
    `%c[CS][INCOMING_WATCH][PENDING_FOUND] Pending recuperado | Key: ${key} | Antes: ${pending.previousCount} | Agora: ${pending.currentCount} | Diferença: ${pending.diffCount}`,
    'color: red; font-weight: bold;',
  )

  return {
    observedAt: Date.now(),
    previousCount: pending.previousCount,
    currentCount: pending.currentCount,
    diffCount: pending.diffCount,
  }
}

/**
 * Log vermelho padronizado para identificação de mudança nos incomings.
 */
function logIncomingIdentification(detail: IncomingObservedDetail, context = 'observed') {
  console.log(
    `%c[CS][INCOMING_WATCH][${context}] Identificado mudança nos incomings | Antes: ${detail.previousCount} | Agora: ${detail.currentCount} | Diferença: ${detail.diffCount}`,
    'color: red; font-weight: bold;',
  )
}

/**
 * Log vermelho simples para eventos importantes do fluxo.
 */
function logIncomingFlow(message: string, data: Record<string, unknown> = {}) {
  console.log(
    `%c[CS][INCOMING_WATCH] ${message}`,
    'color: red; font-weight: bold;',
    data,
  )
}

/**
 * Identifica erros esperados de proteção do jogo/CAPTCHA.
 *
 * Esses erros não devem ir para console.error, porque a tela de erros
 * da extensão captura console.error e exibe como falha crítica.
 */
function isIncomingWatchBotProtectionError(error: unknown) {
  const message = error instanceof Error
    ? error.message
    : String(error || '')

  const normalized = message.trim().toLowerCase()

  return (
    normalized.includes('bot protection')
    || normalized.includes('captcha')
    || normalized.includes('hcaptcha')
    || normalized.includes('protectingbot')
  )
}

/**
 * Loga erros do Incoming Watch sem estourar erro crítico para casos esperados
 * de bot protection/CAPTCHA/context invalidated.
 */
function logIncomingWatchError(
  context: string,
  error: unknown,
  fallbackMessage = 'Incoming watch failed',
) {
  if (isIncomingWatchExtensionContextInvalidated(error)) {
    return
  }

  if (isIncomingWatchBotProtectionError(error)) {
    console.warn(
      `%c[CS][INCOMING_WATCH][${context}] Bot protection/CAPTCHA detectado. Ignorando como erro crítico.`,
      'color: orange; font-weight: bold;',
      error,
    )
    return
  }

  console.error(
    `%c[CS][INCOMING_WATCH][${context}]`,
    'color: red; font-weight: bold;',
    error || fallbackMessage,
  )
}

/**
 * Agenda uma nova tentativa de processar a fila.
 */
function scheduleDrainRetry(delay = DRAIN_RETRY_MS) {
  if (retryTimer) {
    clearTimeout(retryTimer)
  }

  logIncomingFlow('Retry agendado para processar fila novamente.', {
    delay,
  })

  retryTimer = setTimeout(() => {
    retryTimer = null
    void drainIncomingQueue()
  }, Math.max(0, Number(delay) || 0))
}

/**
 * Processa a fila de incomings.
 *
 * Fluxo:
 * 1. pega a tarefa pendente;
 * 2. pergunta ao Service Worker se deve executar;
 * 3. se autorizado, salva pending no chrome.storage.local;
 * 4. lê os incomings reais nas páginas do jogo;
 * 5. salva estado;
 * 6. envia notificações, se configurado;
 * 7. envia ao Service Worker a quantidade de tags pendentes;
 * 8. se tudo terminou com sucesso, remove o pending.
 */
async function drainIncomingQueue() {
  if (running) {
    logIncomingFlow('Fila já está em processamento. Ignorando chamada duplicada.')
    return
  }

  running = true

  try {
    while (pendingTask) {
      const task = pendingTask
      pendingTask = null

      const { detail } = task

      logIncomingIdentification(detail, 'DRAIN_START')

      const decision = task.decision ?? await requestIncomingWatchDecision(detail).catch((error) => ({
        ok: false,
        execute: false,
        reason: error instanceof Error ? error.message : String(error),
      }))

      logIncomingFlow('Decisão recebida do Service Worker.', {
        ok: decision?.ok,
        execute: decision?.execute,
        reason: decision?.reason ?? null,
      })

      if (decision?.ok !== true || decision?.execute !== true) {
        logIncomingFlow('Execução ignorada pela decisão do Service Worker.', {
          ok: decision?.ok,
          execute: decision?.execute,
          reason: decision?.reason ?? null,
        })

        continue
      }

      /**
       * Ponto principal da alteração:
       *
       * A partir daqui o runtime foi autorizado e vai iniciar requests.
       * Então salvamos o pending antes de chamar readSaveNotifyIncomings().
       *
       * Se a página recarregar depois daqui, o bootstrap recupera esse pending
       * e reinicia o processo.
       */
      await markIncomingPending(detail)

      let readResult: Awaited<ReturnType<typeof readSaveNotifyIncomings>>

      try {
        logIncomingFlow('Iniciando leitura e salvamento dos incomings.', {
          previousCount: detail.previousCount,
          currentCount: detail.currentCount,
          diffCount: detail.diffCount,
        })

        readResult = await readSaveNotifyIncomings()

        logIncomingFlow('Leitura dos incomings finalizada.', {
          newAttack: readResult?.newAttack ?? 0,
          newSnob: readResult?.newSnob ?? 0,
          pendingTagCount: readResult?.pendingTagCount ?? 0,
          notifyRows: readResult?.notifyData?.length ?? 0,
        })
      } catch (error) {
        if (isIncomingWatchTransientError(error)) {
          logIncomingFlow('Erro temporário detectado. Tarefa voltou para fila.', {
            error: error instanceof Error ? error.message : String(error),
          })

          pendingTask = {
            detail,
            decision,
          }

          /**
           * Não remove o pending aqui.
           * Se a página recarregar antes do retry, o pending ainda será recuperado.
           */
          scheduleDrainRetry()
          return
        }

        /**
         * Também não removemos o pending em erro real aqui.
         * Se for uma queda/reload/contexto estranho, ele ainda pode ser recuperado
         * no próximo carregamento, desde que esteja dentro do prazo máximo.
         */
        throw error
      }

      const queueResult = await requestIncomingApplyQueue({
        pendingTagCount: readResult?.pendingTagCount ?? 0,
      }).catch((error) => ({
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      }))

      logIncomingFlow('Resultado do queue-apply recebido.', {
        ok: queueResult?.ok,
        error: queueResult?.error ?? null,
        execute: queueResult?.execute ?? null,
        queued: queueResult?.queued ?? null,
        reason: queueResult?.reason ?? null,
        pendingTagCount: readResult?.pendingTagCount ?? 0,
      })

      if (queueResult?.ok !== true) {
        logIncomingWatchError(
          'QUEUE_APPLY',
          queueResult?.error || 'Queue apply failed',
          'Queue apply failed',
        )

        /**
         * Não limpa o pending se o queue-apply falhou.
         * Assim o próximo carregamento ainda consegue recuperar.
         */
        continue
      }

      /**
       * Fim real do ciclo.
       *
       * Só removemos o pending depois que:
       * - readSaveNotifyIncomings terminou;
       * - requestIncomingApplyQueue retornou ok.
       */
      await clearIncomingPending()
    }
  } catch (error) {
    logIncomingWatchError('DRAIN', error)
  } finally {
    running = false

    if (pendingTask && !retryTimer) {
      logIncomingFlow('Nova tarefa pendente encontrada após finalizar processamento.')
      void drainIncomingQueue()
    }
  }
}

/**
 * Callback chamado pelo observer quando o contador #incomings_amount muda.
 *
 * Ele não processa direto.
 * Primeiro joga a mudança para a fila e depois chama o drain.
 */
function onObserved(detail: IncomingObservedDetail) {
  logIncomingIdentification(detail, 'OBSERVED')

  pendingTask = {
    detail,
    decision: null,
  }

  logIncomingFlow('Tarefa adicionada na fila.', {
    previousCount: detail.previousCount,
    currentCount: detail.currentCount,
    diffCount: detail.diffCount,
  })

  void drainIncomingQueue()
}

/**
 * Reconciliação periódica.
 *
 * Mantida como estava no seu arquivo.
 */
async function runPeriodicReconcile() {
  const detail = await getIncomingBootstrapDetail({
    force: true,
  }).catch((error) => {
    logIncomingWatchError('PERIODIC_RECONCILE', error)

    return null
  })

  if (!detail) {
    return
  }

  logIncomingIdentification(detail, 'PERIODIC_RECONCILE')

  onObserved(detail)
}

/**
 * Inicializa o sistema de incoming watch.
 */
async function bootstrap() {
  const scope = window as ToolkitWindow

  const gameData = getCurrentGameDataFromWindow()

  if (!gameData) {
    logIncomingFlow('Bootstrap ignorado. Context inválido.')
    return
  }

  if (scope[BOOTSTRAP_KEY]) {
    logIncomingFlow('Bootstrap ignorado. Incoming watch já estava instalado.')
    return
  }

  scope[BOOTSTRAP_KEY] = true

  logIncomingFlow('Bootstrap iniciado.')

  installIncomingWatchObserver({
    onObserved,
  })

  logIncomingFlow('Observer de incomings instalado.')

  installIncomingVisualSync()

  logIncomingFlow('Sincronização visual instalada.')

  if (!periodicReconcileTimer) {
    periodicReconcileTimer = setInterval(() => {
      void runPeriodicReconcile()
    }, PERIODIC_RECONCILE_MS)

    logIncomingFlow('Reconciliação periódica instalada.', {
      intervalMs: PERIODIC_RECONCILE_MS,
    })
  }

  /**
   * Primeiro tenta recuperar pending salvo no storage.
   *
   * Isso não faz requests no jogo.
   * Só lê chrome.storage.local.
   */
  const pendingDetail = await getIncomingPendingDetail().catch((error) => {
    logIncomingWatchError('PENDING_BOOTSTRAP', error)

    return null
  })

  if (pendingDetail) {
    logIncomingIdentification(pendingDetail, 'BOOTSTRAP_PENDING')
    onObserved(pendingDetail)
    return
  }

  /**
   * Se não tem pending, mantém o bootstrap normal.
   *
   * Aqui NÃO usamos force:true, para evitar requests desnecessários
   * a cada carregamento.
   */
  const bootstrapDetail = await getIncomingBootstrapDetail().catch((error) => {
    logIncomingWatchError('BOOTSTRAP_DETAIL', error)

    return null
  })

  if (bootstrapDetail) {
    logIncomingIdentification(bootstrapDetail, 'BOOTSTRAP')
    onObserved(bootstrapDetail)
  } else {
    logIncomingFlow('Bootstrap sem mudança inicial identificada.')
  }
}

/**
 * Executa o bootstrap assim que o arquivo é carregado.
 */
void bootstrap()

/**
 * Mantém o arquivo como módulo TypeScript.
 */
export {}
