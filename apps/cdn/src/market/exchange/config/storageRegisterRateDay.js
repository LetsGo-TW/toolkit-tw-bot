const { getGameData } = require("@toolkit-tw-bot/document");

const gameData = getGameData();

const KEY_RATE_DAY = `__registerRateDay:${gameData?.world}:${gameData?.player?.id}`;

/**
 * Salva o objeto registerRateDay no localStorage.
 * @param {Object} data - O objeto contendo data e continentes.
 */
function saveRateDay(data) {
  if (!gameData) return;

  try {
    const serializedData = JSON.stringify(data);
    localStorage.setItem(KEY_RATE_DAY, serializedData);
    console.log(`[Storage] Dados de ${data.date} salvos com sucesso.`);
  } catch (e) {
    console.error("[Storage] Erro ao salvar no localStorage:", e);
  }
}

/**
 * Extrai o objeto registerRateDay do localStorage.
 * @returns {Object|null} O objeto recuperado ou null se não existir.
 */
function getRateDay() {
  if (!gameData) return;

  try {
    const data = localStorage.getItem(KEY_RATE_DAY);
    return data ? JSON.parse(data) : null;
  } catch (e) {
    console.error("[Storage] Erro ao extrair do localStorage:", e);
    return null;
  }
}

export { saveRateDay, getRateDay }
