const fs = require("fs");
const { Types } = require("mongoose");
const {
  getDataFilePath,
  toBoolean,
} = require("./_common");

const dataFile = getDataFilePath("data.json");
const forceRestore = toBoolean(process.env.RESTORE_FORCE, false);

async function main() {
  if (!process.env.NODE_ENV) {
    process.env.NODE_ENV = "development";
  }

  const { mongoose, Player, waitForConnection } = require("@toolkit-tw-bot/db");

  await waitForConnection();
  const dbName = mongoose.connection.db.databaseName;
  console.log(`✅ Conectado ao MongoDB (db: ${dbName})`);

  if (!fs.existsSync(dataFile)) {
    console.error("❌ data.json não encontrado em:", dataFile);
    process.exit(1);
  }

  const raw = fs.readFileSync(dataFile, "utf8");
  const data = JSON.parse(raw);

  console.log("📦 Registros no data.json:", data.length);

  const collection = mongoose.connection.db.collection("players");
  const existingCount = await collection.countDocuments({});
  console.log("📊 Registros já existentes em players:", existingCount);

  if (existingCount > 0 && !forceRestore) {
    console.log(
      "⚠️ Coleção players NÃO está vazia. Por segurança, o import foi abortado.",
    );
    console.log(
      "   Se quiser importar mesmo assim, rode com RESTORE_FORCE=true.",
    );
    process.exit(0);
  }

  if (existingCount > 0 && forceRestore) {
    console.log("🧹 Limpando coleção players antes de importar...");
    await collection.deleteMany({});
  }

  const docs = data.map((doc) => ({
    _id: new Types.ObjectId(doc._id),
    __v: doc.__v ?? 0,
    createdAt: doc.createdAt ? new Date(doc.createdAt) : undefined,
    due: doc.due,
    player_id: doc.player_id,
    updatedAt: doc.updatedAt ? new Date(doc.updatedAt) : undefined,
    world: doc.world,
  }));

  console.log("⬆️ Inserindo documentos em players...");
  try {
    const inserted = await Player.insertMany(docs, { ordered: false });
    console.log("✅ Import concluído. Total inserido:", inserted.length);
  } catch (error) {
    console.error("❌ Erro durante o insertMany:");
    console.error(error);
  } finally {
    await mongoose.disconnect();
    console.log("✅ Conexão fechada");
  }
}

main().catch((err) => {
  console.error("❌ Erro no script de restore:", err);
  process.exit(1);
});
