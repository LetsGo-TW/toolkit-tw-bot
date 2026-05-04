/**
 * Seletor do elemento que mostra a quantidade de ataques/comandos chegando.
 * No Tribal Wars geralmente é o contador de incomings no topo da tela.
 */
const INCOMINGS_SELECTOR = '#incomings_amount'

/**
 * Tempo de debounce do observer.
 *
 * Reduzido para 100ms para reagir mais rápido às mudanças do contador,
 * diminuindo a chance de uma alteração intermediária passar despercebida.
 */
const OBSERVER_DEBOUNCE_MS = 100

/**
 * Motivo da identificação.
 *
 * count-change:
 * O contador final mudou de verdade.
 *
 * intermediate-count-change:
 * O contador final voltou ao mesmo valor, mas durante as mutations
 * o observer enxergou um valor intermediário diferente.
 *
 * Exemplo:
 * Antes: 32
 * Mutation viu: 31
 * Final: 32
 */
export type IncomingObservedReason =
  | 'count-change'
  | 'intermediate-count-change'

/**
 * Dados enviados quando uma mudança no contador de incomings é detectada.
 */
export type IncomingObservedDetail = {
  /**
   * Momento exato da identificação.
   */
  observedAt: number

  /**
   * Quantidade anterior de incomings.
   */
  previousCount: number

  /**
   * Quantidade atual de incomings.
   */
  currentCount: number

  /**
   * Diferença entre o valor atual e o anterior.
   *
   * Exemplo:
   * Antes: 3
   * Agora: 5
   * diffCount: 2
   */
  diffCount: number

  /**
   * Motivo da identificação.
   */
  reason?: IncomingObservedReason

  /**
   * Valor intermediário visto durante a mutation.
   *
   * Só é preenchido quando reason = intermediate-count-change.
   */
  intermediateCount?: number | null
}

/**
 * Opções aceitas ao instalar o observer.
 */
type InstallIncomingObserverOptions = {
  /**
   * Elemento raiz onde o script irá procurar o #incomings_amount.
   *
   * Por padrão usa document.
   */
  root?: ParentNode | null

  /**
   * Função opcional chamada quando uma mudança real ou suspeita for detectada.
   */
  onObserved?: ((detail: IncomingObservedDetail) => void | Promise<void>) | null
}

/**
 * Normaliza o texto do contador de incomings.
 *
 * Exemplo:
 * "5"      => 5
 * "(12)"   => 12
 * "Ataques: 3" => 3
 *
 * Caso não encontre número, retorna null.
 */
function normalizeIncomingsAmount(value = ''): number | null {
  const onlyDigits = String(value || '').replace(/[^\d]/g, '')

  if (!onlyDigits) return null

  const amount = Number(onlyDigits)

  return Number.isFinite(amount) ? amount : null
}

/**
 * Faz um log destacado em vermelho no console quando uma mudança
 * no contador de incomings for identificada.
 */
function logIncomingChange(detail: IncomingObservedDetail): void {
  const reason = detail.reason || 'count-change'
  const intermediateText = detail.intermediateCount !== undefined
    ? ` | Intermediário: ${detail.intermediateCount}`
    : ''

  console.log(
    `%c[INCOMINGS OBSERVER] Identificado mudança nos incomings | Antes: ${detail.previousCount} | Agora: ${detail.currentCount} | Diferença: ${detail.diffCount} | Motivo: ${reason}${intermediateText}`,
    'color: red; font-weight: bold;',
  )
}

/**
 * Tenta descobrir qual nó do DOM sofreu alteração.
 *
 * O MutationObserver retorna uma lista de mutations.
 * Essa função verifica se alguma mutation veio diretamente do
 * #incomings_amount ou de algum filho dele.
 *
 * Se não encontrar pelas mutations, faz uma busca normal no root.
 */
function resolveObservedNode(
  mutations: MutationRecord[] = [],
  root: ParentNode = document,
): HTMLElement | null {
  for (const mutation of Array.isArray(mutations) ? mutations : []) {
    const target = mutation?.target

    if (!target) continue

    /**
     * Caso o próprio alvo da mudança seja o elemento #incomings_amount.
     */
    if (target instanceof HTMLElement && target.id === 'incomings_amount') {
      return target
    }

    /**
     * Caso a mudança tenha ocorrido em algum filho/texto dentro do elemento.
     */
    const element = target instanceof Element
      ? target
      : target.parentElement

    const closest = element?.closest(INCOMINGS_SELECTOR)

    if (closest instanceof HTMLElement) {
      return closest
    }
  }

  /**
   * Fallback: se não achou pelas mutations, procura diretamente no root.
   */
  const fallback = root.querySelector(INCOMINGS_SELECTOR)

  return fallback instanceof HTMLElement ? fallback : null
}

/**
 * Lê a quantidade atual de incomings no DOM.
 *
 * Pode receber um node diretamente ou procurar pelo #incomings_amount
 * dentro do root informado.
 */
function readCurrentAmount(
  node: HTMLElement | null = null,
  root: ParentNode = document,
): number | null {
  const sourceNode = node || root.querySelector(INCOMINGS_SELECTOR)

  if (!sourceNode) return null

  return normalizeIncomingsAmount(sourceNode.textContent)
}

/**
 * Instala o observer que monitora alterações no contador de incomings.
 *
 * Ele observa mudanças dentro do elemento #incomings_amount.
 *
 * Quando o número muda:
 * - lê o valor anterior;
 * - lê o valor atual;
 * - calcula a diferença;
 * - mostra log em vermelho no console;
 * - executa o callback onObserved, caso tenha sido informado.
 *
 * Também captura valores intermediários durante as mutations para reduzir
 * a chance de ignorar o caso raro onde o contador muda e volta ao mesmo valor
 * dentro da janela de debounce.
 *
 * Retorna uma função de cleanup para desligar o observer.
 */
export function installIncomingWatchObserver({
  root = document,
  onObserved = null,
}: InstallIncomingObserverOptions = {}) {
  const observedRoot: ParentNode = root ?? document

  /**
   * Busca o elemento que contém o contador de incomings.
   */
  const incomingNode = observedRoot.querySelector(INCOMINGS_SELECTOR)

  /**
   * Se não encontrar o contador na página, não instala nada.
   * Retorna uma função vazia para evitar erro em quem chamar.
   */
  if (!(incomingNode instanceof HTMLElement)) {
    console.warn(
      '%c[INCOMINGS OBSERVER] Elemento #incomings_amount não encontrado.',
      'color: red; font-weight: bold;',
    )

    return () => {}
  }

  /**
   * Guarda o primeiro valor conhecido.
   * A partir dele, o script consegue comparar mudanças futuras.
   */
  let lastKnownAmount = readCurrentAmount(incomingNode, observedRoot)

  /**
   * Timer usado para debounce.
   */
  let debounceTimer: ReturnType<typeof setTimeout> | null = null

  /**
   * Indica que, durante a janela de debounce, o observer viu
   * algum valor intermediário diferente do último valor conhecido.
   *
   * Isso protege melhor o caso:
   * 32 -> 31 -> 32
   *
   * O valor final fica igual, mas a fila pode ter mudado.
   */
  let sawIntermediateDifferentAmount = false

  /**
   * Guarda o último valor intermediário diferente visto.
   */
  let intermediateAmount: number | null = null

  /**
   * Dispara o callback onObserved com log padronizado.
   */
  const emitObserved = async (detail: IncomingObservedDetail) => {
    logIncomingChange(detail)

    if (typeof onObserved === 'function') {
      await onObserved(detail)
    }
  }

  /**
   * Limpa o estado intermediário após processar uma janela de debounce.
   */
  const resetIntermediateState = () => {
    sawIntermediateDifferentAmount = false
    intermediateAmount = null
  }

  /**
   * Processa uma possível mudança no contador de incomings.
   */
  const processIncomingsChange = async (node: HTMLElement | null = null) => {
    const currentAmount = readCurrentAmount(node, observedRoot)

    /**
     * Se não conseguiu ler número, ignora.
     */
    if (currentAmount === null) return

    /**
     * Se ainda não havia valor anterior salvo, salva agora
     * e não dispara evento.
     */
    if (lastKnownAmount === null) {
      lastKnownAmount = currentAmount
      resetIntermediateState()
      return
    }

    /**
     * Caso comum:
     * o valor final é igual ao último valor conhecido.
     *
     * Antes o observer simplesmente ignorava.
     *
     * Agora, se durante as mutations ele viu um valor intermediário diferente,
     * dispara uma reconciliação com diffCount 0.
     */
    if (currentAmount === lastKnownAmount) {
      if (sawIntermediateDifferentAmount) {
        const previousAmount = lastKnownAmount

        const detail: IncomingObservedDetail = {
          observedAt: Date.now(),
          previousCount: previousAmount,
          currentCount: currentAmount,
          diffCount: 0,
          reason: 'intermediate-count-change',
          intermediateCount: intermediateAmount,
        }

        resetIntermediateState()
        await emitObserved(detail)
      }

      return
    }

    /**
     * Salva o valor anterior antes de atualizar.
     */
    const previousAmount = lastKnownAmount

    /**
     * Atualiza o último valor conhecido.
     */
    lastKnownAmount = currentAmount

    /**
     * Monta os detalhes da mudança detectada.
     */
    const detail: IncomingObservedDetail = {
      observedAt: Date.now(),
      previousCount: previousAmount,
      currentCount: currentAmount,
      diffCount: currentAmount - previousAmount,
      reason: 'count-change',
    }

    resetIntermediateState()
    await emitObserved(detail)
  }

  /**
   * Cria o MutationObserver.
   *
   * Ele será chamado sempre que o conteúdo do contador mudar.
   */
  const observer = new MutationObserver((mutations = []) => {
    const node = resolveObservedNode(mutations, observedRoot)

    if (!node) return

    /**
     * Leitura imediata no momento da mutation.
     *
     * Essa leitura é importante porque o debounce pode pegar apenas
     * o valor final. Se o contador mudar e voltar ao mesmo valor dentro
     * do debounce, sem essa captura intermediária o evento seria ignorado.
     */
    const immediateAmount = readCurrentAmount(node, observedRoot)

    if (
      immediateAmount !== null
      && lastKnownAmount !== null
      && immediateAmount !== lastKnownAmount
    ) {
      sawIntermediateDifferentAmount = true
      intermediateAmount = immediateAmount

      console.log(
        `%c[INCOMINGS OBSERVER] Valor intermediário detectado | Último: ${lastKnownAmount} | Intermediário: ${immediateAmount}`,
        'color: red; font-weight: bold;',
      )
    }

    /**
     * Limpa debounce anterior, caso exista.
     */
    if (debounceTimer) {
      clearTimeout(debounceTimer)
    }

    /**
     * Aguarda alguns milissegundos antes de processar,
     * evitando múltiplas leituras seguidas.
     */
    debounceTimer = setTimeout(() => {
      debounceTimer = null
      void processIncomingsChange(node)
    }, OBSERVER_DEBOUNCE_MS)
  })

  /**
   * Inicia a observação no elemento #incomings_amount.
   */
  observer.observe(incomingNode, {
    /**
     * Observa troca de elementos filhos.
     */
    childList: true,

    /**
     * Observa alteração em textos internos.
     */
    characterData: true,

    /**
     * Observa também filhos dentro do elemento.
     */
    subtree: true,

    /**
     * Mantido caso futuramente precise comparar atributos antigos.
     */
    attributeOldValue: true,
  })

  /**
   * Log inicial para confirmar que o observer foi instalado.
   */
  console.log(
    `%c[INCOMINGS OBSERVER] Observer instalado. Valor inicial: ${lastKnownAmount ?? 'não identificado'}`,
    'color: red; font-weight: bold;',
  )

  /**
   * Retorna função para desligar o observer quando necessário.
   */
  return () => {
    /**
     * Cancela debounce pendente.
     */
    if (debounceTimer) {
      clearTimeout(debounceTimer)
      debounceTimer = null
    }

    resetIntermediateState()

    /**
     * Desliga o MutationObserver.
     */
    observer.disconnect()

    console.log(
      '%c[INCOMINGS OBSERVER] Observer desligado.',
      'color: red; font-weight: bold;',
    )
  }
}

export default installIncomingWatchObserver
