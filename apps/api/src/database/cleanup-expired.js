// database/cleanup-expired.js
const Player = require("../models/Player");

// calcula o cutoff em segundos (agora - ~3 meses = 90 dias)
function getCutoffSeconds() {
  const nowSeconds = Math.floor(Date.now() / 1000);
  const threeMonthsSeconds = 60 * 60 * 24 * 90; // ~90 dias
  return nowSeconds - threeMonthsSeconds;
}

async function cleanupExpiredPlayers() {
  const cutoff = getCutoffSeconds();

  try {
    console.log(
      `🧹 [cleanup] Removendo players com due < ${cutoff} (vencidos há +3 meses)`,
    );

    const result = await Player.deleteMany({
      due: { $lt: cutoff },
    });

    console.log(
      `✅ [cleanup] Removidos ${result.deletedCount} documentos expirados`,
    );
  } catch (err) {
    console.error("❌ [cleanup] Erro ao remover expirados:", err.message);
  }
}

// inicia o job: roda 1x ao subir e depois 1x por dia
function startCleanupJob() {
  // roda uma vez quando o servidor sobe
  cleanupExpiredPlayers();

  const oneDayMs = 24 * 60 * 60 * 1000; // 24h

  setInterval(() => {
    cleanupExpiredPlayers();
  }, oneDayMs);

  console.log("⏰ [cleanup] Job diário de limpeza de players agendado");
}

module.exports = { startCleanupJob };
