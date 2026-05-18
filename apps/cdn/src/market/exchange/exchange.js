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
    return (1 + (rate >= 0 ? this.premiumExchange.tax.buy : this.premiumExchange.tax.sell)) * (this.calculateMarginalPrice(stockExchange, capacityExchange) + this.calculateMarginalPrice(stockExchange - rate, capacityExchange)) * rate / 2;
  }

  calculateMarginalPrice(stockExchange, capacityExchange) {
    const constants = this.premiumExchange.constants;
    return constants.resource_base_price - constants.resource_price_elasticity * stockExchange / (capacityExchange + constants.stock_size_modifier);
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
