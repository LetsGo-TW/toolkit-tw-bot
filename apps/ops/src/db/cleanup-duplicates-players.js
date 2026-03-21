const {
  connectMongo,
  disconnectMongo,
  toBoolean,
} = require("./_common");

const dryRun = toBoolean(process.env.DRY_RUN, true);

async function main() {
  const { collection } = await connectMongo();

  console.log("🔎 Buscando keys duplicadas... isso pode levar alguns segundos.");

  const cursor = collection.aggregate([
    {
      $group: {
        _id: "$key",
        count: { $sum: 1 },
        docs: {
          $push: {
            _id: "$_id",
            due: "$due",
            player_id: "$player_id",
            world: "$world",
          },
        },
      },
    },
    {
      $match: {
        count: { $gt: 1 },
      },
    },
  ]);

  let duplicateKeyCount = 0;
  let duplicateDocsTotal = 0;
  const idsToDelete = [];
  const sampleGroups = [];

  for await (const group of cursor) {
    duplicateKeyCount += 1;

    const docs = group.docs;
    docs.sort((a, b) => (b.due || 0) - (a.due || 0));

    const [toKeep, ...toDelete] = docs;
    duplicateDocsTotal += toDelete.length;

    if (!dryRun) {
      idsToDelete.push(...toDelete.map((doc) => doc._id));
    }

    if (sampleGroups.length < 5) {
      sampleGroups.push({
        count: group.count,
        deleting: toDelete,
        keep: toKeep,
        key: group._id,
      });
    }
  }

  console.log("====================================");
  console.log("🔁 Keys com duplicados:", duplicateKeyCount);
  console.log("🗑  Documentos antigos que poderiam ser apagados:", duplicateDocsTotal);

  if (sampleGroups.length > 0) {
    console.log("📌 Exemplos de grupos com duplicados (mostrando no máximo 5):");
    sampleGroups.forEach((group) => {
      console.log("--------------------------------------------------");
      console.log("Key:", group.key, " | total docs:", group.count);
      console.log("Mantendo (maior due):", group.keep);
      console.log("Apagando estes (mais antigos):", group.deleting);
    });
  } else {
    console.log("✅ Nenhuma key duplicada encontrada.");
  }

  if (!dryRun && idsToDelete.length > 0) {
    console.log("⚠️  DRY_RUN = false. Apagando documentos antigos...");
    const result = await collection.deleteMany({ _id: { $in: idsToDelete } });
    console.log("🧹 Documentos apagados:", result.deletedCount);
  } else {
    console.log("🚫 DRY_RUN = true. Nenhum documento foi apagado (somente análise).");
  }

  await disconnectMongo();
  console.log("✅ Conexão fechada");
}

main().catch((err) => {
  console.error("❌ Erro no script de duplicados:", err);
  process.exit(1);
});
