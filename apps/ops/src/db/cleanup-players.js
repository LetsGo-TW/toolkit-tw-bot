const {
  connectMongo,
  disconnectMongo,
  toBoolean,
} = require("./_common");

const dryRun = toBoolean(process.env.DRY_RUN, true);

async function main() {
  const { collection } = await connectMongo();

  const nowSeconds = Math.floor(Date.now() / 1000);
  const threeMonthsInSeconds = 60 * 60 * 24 * 90;
  const cutoff = nowSeconds - threeMonthsInSeconds;

  console.log("Timestamp de corte (due <):", cutoff);

  const total = await collection.countDocuments({});
  console.log("Total atual de documentos em players:", total);

  const expiredCount = await collection.countDocuments({
    due: { $lt: cutoff },
  });
  console.log(
    "Documentos com due vencido há mais de 3 meses:",
    expiredCount,
  );

  if (expiredCount > 0) {
    const sample = await collection
      .find({ due: { $lt: cutoff } })
      .sort({ due: 1 })
      .limit(5)
      .toArray();

    console.log("Alguns docs que seriam apagados:", sample);
  }

  if (!dryRun && expiredCount > 0) {
    console.log("🗑  Deletando documentos...");
    const result = await collection.deleteMany({ due: { $lt: cutoff } });
    console.log("Removidos:", result.deletedCount);
  } else {
    console.log(
      "🚫 DRY_RUN = true. Nada foi apagado (apenas contagem / exemplo).",
    );
  }

  await disconnectMongo();
  console.log("✅ Conexão fechada");
}

main().catch((err) => {
  console.error("Erro no script de limpeza:", err);
  process.exit(1);
});
