const { Types } = require("mongoose");
const {
  connectMongo,
  disconnectMongo,
  requireOptionArg,
} = require("./_common");

async function main() {
  const idArg = requireOptionArg("id");
  const { collection } = await connectMongo();
  const id = new Types.ObjectId(String(idArg));

  const doc = await collection.findOne({ _id: id });

  console.log("Doc encontrado para esse _id:", idArg, doc);

  await disconnectMongo();
  console.log("✅ Conexão fechada");
}

main().catch((err) => {
  console.error("Erro:", err);
  process.exit(1);
});
