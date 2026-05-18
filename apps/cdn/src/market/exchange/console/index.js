function getGameData() {
  return window.game_data
}

function isBotProtect(html = document, win = window) {
  const BOT_PROTECT_DATASET_KEY = "botProtect"
  const hasSelector = (html = document, selector = "") => Boolean(html.querySelector(selector))
  const hasDivByClass = (html = document, className = "") => Array.from(
    html.querySelectorAll("div")
  ).filter((entry) => entry.className === className).length > 0
  const getDsBody = (html = document) => html.querySelector("#ds_body") || null
  const forced = Array.from(document.all).filter(e => e.className === 'no-selection' || typeof e.className === 'object')
  if (hasSelector(html, "#botprotection_quest")) return true
  if (hasSelector(html, "#bot_check .btn")) return true
  if (hasDivByClass(html, "captcha")) return true
  if (hasSelector(html, "#popup_box_bot_protection > div > div > iframe")) return true
  if (Array.from(document.querySelectorAll('.bot-protection-row')).length) return true
  if (win.hcaptcha) return true
  if (forced.length) return true
  const dsBody = getDsBody(html)
  if (!dsBody) return true
  if (dsBody && dsBody.dataset && dsBody.dataset[BOT_PROTECT_DATASET_KEY]) return true
  return false
}

function makeAjaxHeadersGet() {
  const h = new Headers();
  h.set("accept", "application/json, text/javascript, */*; q=0.01");
  h.set("tribalwars-ajax", "1");
  h.set("x-requested-with", "XMLHttpRequest");
  return h;
}

function combineAbortControllerSignals(signals = []) {
  if (window?.AbortSignal?.any) {
    return window?.AbortSignal?.any(signals)
  }
  const ctrl = new AbortController();
  const onAbort = () => ctrl.abort();

  for (const s of signals) {
    if (!s) continue;
    if (s.aborted) return AbortSignal.abort();
    s.addEventListener("abort", onAbort, { once: true });
  }
  return ctrl.signal;
}

async function getAjaxExchangeData(villageId = null, { signal } = {}) {
  const gameData = getGameData();
  const url = new URL(`${gameData.link_base_pure}market&ajax=exchange_data`, window.origin);
  if (villageId) url.searchParams.set("village", villageId);

  const headers = makeAjaxHeadersGet();

  // controller só pro timeout
  const timeoutCtrl = new AbortController();
  const t = setTimeout(() => timeoutCtrl.abort(new Error("timeout")), 8000);

  // ✅ combina: abort externo + timeout
  const combinedSignal = signal
    ? combineAbortControllerSignals([signal, timeoutCtrl.signal])
    : timeoutCtrl.signal;


  try {
    if (isBotProtect()) {
      clearTimeout(t);
      throw new Error('Bot protection detected');
    }

    const res = await fetch(url.toString(), {
      method: "GET",
      headers,
      credentials: "include",
      referrerPolicy: "origin",
      cache: "no-store",
      signal: combinedSignal,
    });

    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const { response, error } = await res.json();
    if (error || !response) throw new Error(error || "Not found!");
    return response;
  } finally {
    clearTimeout(t);
  }
}

/**
 * Salva o objeto registerRateDay no localStorage.
 * @param {Object} data - O objeto contendo data e continentes.
 */
function saveRateDayToStorage(data) {
  try {
    const serializedData = JSON.stringify(data);
    localStorage.setItem('__registerRateDay_', serializedData);
    console.log(`[Storage] Dados de ${data.date} salvos com sucesso.`);
  } catch (e) {
    console.error("[Storage] Erro ao salvar no localStorage:", e);
  }
}

/**
 * Extrai o objeto registerRateDay do localStorage.
 * @returns {Object|null} O objeto recuperado ou null se não existir.
 */
function getRateDayFromStorage() {
  try {
    const data = localStorage.getItem('__registerRateDay_');
    return data ? JSON.parse(data) : null;
  } catch (e) {
    console.error("[Storage] Erro ao extrair do localStorage:", e);
    return null;
  }
}

/**
 * Extrai o K (Continente) de uma coordenada.
 * Aceita string "555|555" ou objeto {x: 555, y: 555}.
 *
 * @param {string|Object} coord - A coordenada para processar.
 * @returns {string} O K correspondente (ex: "55", "5", "50").
 */
function extractK(coord) {
    let x, y;

    if (typeof coord === 'string') {
        // Divide a string pelo pipe e converte para número
        const parts = coord.split('|');
        x = parseInt(parts[0], 10);
        y = parseInt(parts[1], 10);
    } else if (typeof coord === 'object' && coord !== null) {
        x = parseInt(coord.x, 10);
        y = parseInt(coord.y, 10);
    }

    // Se a conversão falhar, retorna null
    if (isNaN(x) || isNaN(y)) return null;

    // O K é formado pelo primeiro dígito da centena (floor de coord/100)
    // Ex: y: 555 -> 5 | x: 555 -> 5 => K55
    // Ex: y: 55  -> 0 | x: 555 -> 5 => K05 (ou K5)
    // Ex: y: 555 -> 5 | x: 55  -> 0 => K50
    const kY = Math.floor(y / 100);
    const kX = Math.floor(x / 100);

    // Retorna como string. Usamos Number() para remover zeros à esquerda se preferir "5" em vez de "05"
    return String(kY * 10 + kX);
}

class Exchange {
  resources
  types
  marketTypes
  premiumExchange
  registerRateDay

  constructor(premiumExchange) {
    this.resources = ['wood', 'stone', 'iron'];
    this.types = ['buy', 'sell'];
    this.marketTypes = ['trade', 'sprinter', 'premium'];
    this.premiumExchange = premiumExchange;
    // Carrega o histórico do storage ou inicia um novo objeto se estiver vazio
    this.registerRateDay = getRateDayFromStorage() || {
      date: new Date().toISOString().split('T')[0],
      continents: {}
    };
  }

  static async init(premiumExchange) {
    const exchange = new Exchange(premiumExchange);
    return exchange;
  }

  calculate(premiumExchange, ko) {
    this.premiumExchange = premiumExchange;

    const rateBase = { [ko]: {} }

    const rate = this.resources.map(r => {
      const rate = this.calculateRateForOnePoint(r);
      // Como 'ko' já é o K, passamos ele diretamente para o registro
      this.register(ko, r, rate);
      rateBase[ko][r] = this.marketTypes.reduce((trades, mt) => {
        trades[mt] = this.types.reduce((types, type) => {
          types[type] = this.calculateDynamicRate(r, ko, type, mt);
          return types;
        }, {})
        return trades;
      }, {})
      return rate;
    });

    return { rate, rateBase };
  }

  calculateDynamicRate(resource, k, type, marketType) {
    const entry = this.registerRateDay.continents[k]?.[resource];
    if (!entry) return null;

    const { min, max } = entry;
    const range = max - min;

    const multipliers = {
      // Arbitragem: Margem de 25% nas pontas
      trade:    { buy: 0.25, sell: 0.75 },

      // Foco em Crescimento: Compra tudo (1.0), quase não vende (1.0)
      sprinter: { buy: 1.0,  sell: 1.0  },

      // Foco em PPs: Quase não compra (0.0), Vende tudo (0.0)
      premium:  { buy: 0.1,  sell: 0.0  }
    };

    const factor = multipliers[marketType][type];
    return Math.floor(min + (range * factor));
  }

  register(k, resource, currentRate) {
    // 1. Inicializa o continente se ele ainda não existir no objeto
    if (!this.registerRateDay.continents[k]) {
      this.registerRateDay.continents[k] = {};
    }

    // 2. Inicializa o recurso específico dentro do continente se for a primeira vez
    if (!this.registerRateDay.continents[k][resource]) {
      this.registerRateDay.continents[k][resource] = {
        min: currentRate,
        max: currentRate,
        current: currentRate
      };
      // Salva a inicialização e encerra
      saveRateDayToStorage(this.registerRateDay);
      return;
    }

    const entry = this.registerRateDay.continents[k][resource];

    // 3. Guarda os valores antigos para verificar se houve mudança real
    const { min, max } = entry;

    // 4. Aplica a lógica simplificada com Math
    entry.min = Math.min(min, currentRate);
    entry.max = Math.max(max, currentRate);
    entry.current = currentRate;

    // 5. Só persiste se os limites de fato expandiram
    if (entry.min !== min || entry.max !== max) {
      saveRateDayToStorage(this.registerRateDay);
    }
  }

  calculateCost(resource, rate) {
    const stockExchange = this.premiumExchange.stock[resource];
    const capacityExchange = this.premiumExchange.capacity[resource];
    return (1 + (rate >= 0 ? this.premiumExchange.tax.buy : this.premiumExchange.tax.sell)) *
           (this.calculateMarginalPrice(stockExchange, capacityExchange) +
            this.calculateMarginalPrice(stockExchange - rate, capacityExchange)) * rate / 2;
  }

  calculateMarginalPrice(stockExchange, capacityExchange) {
    const constants = this.premiumExchange.constants;
    return constants.resource_base_price -
           constants.resource_price_elasticity * stockExchange /
           (capacityExchange + constants.stock_size_modifier);
  }

  calculateRateForOnePoint(resource) {
    const stock = this.premiumExchange.stock[resource];
    const capacity = this.premiumExchange.capacity[resource];
    const marginalPrice = this.calculateMarginalPrice(stock, capacity);

    let rate = Math.floor(1 / marginalPrice);
    let cost = this.calculateCost(resource, rate);

    for (let i = 0; i < 50; i++) {
      if (cost <= 1) break;
      rate--;
      cost = this.calculateCost(resource, rate);
    }
    return rate;
  }

  /**
   * Coleta o histórico de 7 dias do script nativo do TW.
   * Extrai médias, mínimos, máximos e tendência.
   */
  readDataPremium() {
    const scriptTag = document.querySelector("#content_value div.vis script");
    if (!scriptTag) return null;

    const content = scriptTag.innerText;
    const history = { res: {}, med: {}, min: {}, max: {}, trend: {} };

    this.resources.forEach(res => {
        // Regex para capturar o array de dados específico de cada recurso
        const regex = new RegExp(`label:"${res}".*?data:\\[(.*?)\\]`, "s");
        const match = content.match(regex);

        if (match) {
            // Converte a string do array [[tempo, valor], ...] para apenas valores
            const rawData = JSON.parse(`[${match[1]}]`);
            const values = rawData.map(point => point[1]).filter(v => v > 0);

            if (values.length > 0) {
                const sum = values.reduce((a, b) => a + b, 0);
                history.res[res] = values;
                history.min[res] = Math.min(...values);
                history.max[res] = Math.max(...values);
                history.med[res] = sum / values.length;

                // Tendência: Comparação do último dia com o penúltimo
                const last = values[values.length - 1];
                const prev = values[values.length - 2] || last;
                history.trend[res] = last > prev ? 'UP' : (last < prev ? 'DOWN' : 'FLAT');
            }
        }
    });

    return history;
  }
}

function isRunInPage() {
  const url = new URL(window.location.href);
  if (url.searchParams.get('screen') !== 'market') return false
  if (url.searchParams.get('mode') !== 'exchange') return false

  let time = Date.now()
  if (window.PremiumExchange && !window.PremiumExchange.isHooked) {
    const originalReceiveData = window.PremiumExchange.receiveData;
    window.PremiumExchange.isHooked = true;
    window.PremiumExchange.receiveData = (data) => {
      originalReceiveData.call(window.PremiumExchange, data);
      const exchange = Exchange.init(data);
      const t = Date.now() - time
      console.log(exchange.calculate(data), t);
      time = Date.now()
    };
  }
  return true
}

async function runExchangeTest() {
  let lastExecutionTime = Date.now();

  /**
   * As configurações serão gerais, para todos os continentes e vilas
   * Somente o ajuste fino de compra e venda é por k quando existir registros de rateDay e a taxa não for manual(determinada pelo jogador)
   * requerimentos geral:
   * - o mundo ter mercado premium
   * - configurações de tipo de mercado[sprinter,premium,trade] (default: trade)
   * requerimentos para o getAjaxExchangeData:
   * - village com edifício mercado construído.
   * requisitos compra:
   * - ter pps(pontos premium) gameData.player.pp;
   * - configuração de ativar ou desativar compra(defaul: active: false);
   * - configurações pode limitar o máximo de recursos por compra(default: 5000);
   * - configurações pode limitar pps por saldo(default: pp atual) e/ou pp gasto/dia(default: 100) retirado de exchangeDaily;
   * - configurações limitar o armazem da village entre (0 a 200% do armazém; default: 80%) *contar o que está entrando;
   * - opção de por taxa base de compra manual(default: 63; active: true)
   * requisitos venda:
   * - a villa ter recursos e mercadores;
   * - configuração de ativar ou desativar venda(defaul: active: false);
   * - configuração pode limitar os recursos da vila(0 a 90% do armazém; default: 10%);
   * - configuração pode limitar o máximo de recursos por venda(default: 2000);
   * - opção de por taxa básica de venda manual(default: 73; active: true)
   * - só vender usando máximo de transporte(1000 recursos) do mercado(defaul: active: true);
   * - liberar mercadores proporcionalmente a taxa(não sar todos os mercadores assim que encontra uma taxa abaixo da base)(defaul: active: false);
   */
  const gameData = getGameData();
  if (!gameData) return

  const ko = extractK(gameData?.village?.coord)
  if (!ko) return

  const villageId = gameData.village.id;
  if (!villageId) return

  const executeCycle = async () => {
    try {
      // Busca os dados via AJAX para a aldeia atual
      const data = await getAjaxExchangeData(villageId);

      // Instancia a classe Exchange e calcula as taxas
      const exchange = new Exchange(data);
      const { rate, rateBase } = exchange.calculate(data, ko);

      // Calcula o tempo decorrido desde a última atualização
      const currentTime = Date.now();
      const elapsed = currentTime - lastExecutionTime;
      lastExecutionTime = currentTime;

      // Imprime no console: [madeira, argila, ferro] e o tempo em ms
      console.log(rate, elapsed);
      console.log(JSON.stringify(getRateDayFromStorage(), null, 2))
      console.log(JSON.stringify(rateBase, null, 2))

      // Agenda a próxima execução com tempo aleatório entre 9990 e 14990 ms
      const nextDelay = Math.floor(Math.random() * (11990 - 9990 + 1)) + 9990;
      console.log(`Próxima execução em ${nextDelay} ms`);
      setTimeout(executeCycle, nextDelay);

    } catch (error) {
      console.error("Erro na execução. O teste foi interrompido:", error.message);
      // O ciclo para automaticamente aqui pois executeCycle não é chamado no catch
    }
  };

  console.log("Iniciando monitoramento de taxas via AJAX...");
  executeCycle();
}

// Para iniciar o teste, execute:
runExchangeTest();

