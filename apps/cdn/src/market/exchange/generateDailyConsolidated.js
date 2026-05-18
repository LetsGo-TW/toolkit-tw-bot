/**
 * Gera o consolidado diário cruzando transações com o mapeamento de taxas min/max.
 *
 * @param {Array} exchangeDaily - Array de transações do dia.
 * @param {Object} registerRateDay - Objeto mapeado com min/max por continente.
 */
function generateDailyConsolidated(exchangeDaily, registerRateDay) {
  const date = registerRateDay.date || new Date().toISOString().split('T')[0];

  const consolidated = {
    date: date,
    summary_id: `${date.replace(/-/g, '')}_global`,
    continents: {},
    totals: {
      total_pp_profit: 0,
      total_trades: exchangeDaily.length,
      most_profitable_k: ""
    }
  };

  exchangeDaily.forEach(trade => {
    const { k, resource, type, amount, pp_spent, pp_received, rate_at_send } = trade;

    // Inicializa estrutura do continente
    if (!consolidated.continents[k]) consolidated.continents[k] = {};

    // Inicializa recurso e busca limites no formato registerRateDay.continents[k]
    if (!consolidated.continents[k][resource]) {
      // Acesso direto ao novo formato de objeto mapeado
      const marketLimits = registerRateDay.continents?.[k]?.[resource] || { min: null, max: null };

      consolidated.continents[k][resource] = {
        total_bought: 0,
        total_sold: 0,
        pp_spent: 0,
        pp_received: 0,
        net_pp_profit: 0,
        avg_buy_rate: 0,
        avg_sell_rate: 0,
        buy_count: 0,
        sell_count: 0,
        market_limits: marketLimits
      };
    }

    const resSummary = consolidated.continents[k][resource];

    if (type === 'buy') {
      resSummary.total_bought += amount;
      resSummary.pp_spent += (pp_spent || 0);
      resSummary.avg_buy_rate = (resSummary.avg_buy_rate * resSummary.buy_count + rate_at_send) / (resSummary.buy_count + 1);
      resSummary.buy_count++;
    } else {
      resSummary.total_sold += amount;
      resSummary.pp_received += (pp_received || 0);
      resSummary.avg_sell_rate = (resSummary.avg_sell_rate * resSummary.sell_count + rate_at_send) / (resSummary.sell_count + 1);
      resSummary.sell_count++;
    }

    resSummary.net_pp_profit = resSummary.pp_received - resSummary.pp_spent;
  });

  // Cálculo de lucros e limpeza de contadores
  let maxProfit = -Infinity;

  Object.keys(consolidated.continents).forEach(k => {
    let kProfit = 0;
    Object.keys(consolidated.continents[k]).forEach(res => {
      kProfit += consolidated.continents[k][res].net_pp_profit;

      // Remove auxiliares para o JSON final ficar limpo
      delete consolidated.continents[k][res].buy_count;
      delete consolidated.continents[k][res].sell_count;
    });

    consolidated.totals.total_pp_profit += kProfit;

    if (kProfit > maxProfit) {
      maxProfit = kProfit;
      consolidated.totals.most_profitable_k = k;
    }
  });

  return consolidated;
}
