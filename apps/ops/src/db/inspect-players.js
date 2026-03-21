const {
  connectMongo,
  disconnectMongo,
} = require("./_common");

async function main() {
  const { collection } = await connectMongo();

  const total = await collection.countDocuments({});
  console.log("Total de docs em players:", total);

  const [minDoc] = await collection
    .find({ due: { $exists: true } })
    .sort({ due: 1 })
    .limit(1)
    .toArray();

  const [maxDoc] = await collection
    .find({ due: { $exists: true } })
    .sort({ due: -1 })
    .limit(1)
    .toArray();

  console.log("Menor due no banco:", minDoc?.due, minDoc);
  console.log("Maior due no banco:", maxDoc?.due, maxDoc);

  await disconnectMongo();
  console.log("✅ Conexão fechada");
}

main().catch((err) => {
  console.error("Erro no inspect:", err);
  process.exit(1);
});
