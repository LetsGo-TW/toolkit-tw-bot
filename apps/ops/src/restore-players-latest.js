const fs = require("fs");
const path = require("path");

function ensureRuntimeEnv() {
  if (!process.env.NODE_ENV) {
    process.env.NODE_ENV = "development";
  }
}

function getMonorepoRoot() {
  return path.resolve(__dirname, "../../..");
}

function resolveBackupSourceDir() {
  const configuredDir = String(
    process.env.BACKUP_SOURCE_DIR || process.env.BACKUP_DIR || "",
  ).trim();

  if (!configuredDir) {
    return path.join(getMonorepoRoot(), "data", "backups", "players");
  }

  if (path.isAbsolute(configuredDir)) {
    return configuredDir;
  }

  return path.join(getMonorepoRoot(), configuredDir);
}

function listBackupFiles(dirPath) {
  if (!fs.existsSync(dirPath)) {
    return [];
  }

  return fs
    .readdirSync(dirPath)
    .filter((name) => /^players\..+\.\d{4}-\d{2}-\d{2}\.json$/.test(name))
    .map((name) => {
      const filePath = path.join(dirPath, name);
      const stat = fs.statSync(filePath);
      return {
        fileName: name,
        filePath,
        mtimeMs: stat.mtimeMs,
      };
    })
    .sort((a, b) => {
      if (b.mtimeMs !== a.mtimeMs) {
        return b.mtimeMs - a.mtimeMs;
      }
      return b.fileName.localeCompare(a.fileName);
    });
}

function findLatestBackupFile(dirPath = resolveBackupSourceDir()) {
  return listBackupFiles(dirPath)[0] || null;
}

function toPlayerDocs(items, mongoose) {
  return items.map((doc) => ({
    _id: doc?._id ? new mongoose.Types.ObjectId(String(doc._id)) : undefined,
    __v: doc?.__v ?? 0,
    createdAt: doc?.createdAt ? new Date(doc.createdAt) : undefined,
    due: doc?.due,
    player_id: doc?.player_id,
    updatedAt: doc?.updatedAt ? new Date(doc.updatedAt) : undefined,
    world: doc?.world,
  }));
}

function shouldForceRestore() {
  return String(process.env.RESTORE_FORCE || "")
    .trim()
    .toLowerCase() === "true";
}

function assertAllowedEnvironment(nodeEnv) {
  if (nodeEnv === "development" || nodeEnv === "test") {
    return;
  }

  throw new Error(
    `Restore do último backup bloqueado em ${nodeEnv}. Use apenas development/test.`,
  );
}

async function main() {
  ensureRuntimeEnv();
  const { Player, mongoose, waitForConnection } = require("../../../packages/db/src");

  try {
    assertAllowedEnvironment(process.env.NODE_ENV || "development");

    const backupDir = resolveBackupSourceDir();
    const latestBackup = findLatestBackupFile(backupDir);

    if (!latestBackup) {
      throw new Error(
        `Nenhum backup encontrado em ${backupDir}. Gere um backup antes de restaurar.`,
      );
    }

    await waitForConnection(mongoose);

    const dbName = mongoose.connection.db.databaseName;
    const collection = mongoose.connection.db.collection("players");
    const existingCount = await collection.countDocuments({});
    const forceRestore = shouldForceRestore();

    console.log(`✅ Conectado ao MongoDB (db: ${dbName})`);
    console.log(`📂 [restore] Origem do backup: ${latestBackup.filePath}`);
    console.log(`📊 [restore] Registros existentes em players: ${existingCount}`);

    if (existingCount > 0 && !forceRestore) {
      console.log(
        "ℹ️ [restore] Coleção players já possui dados. Nada foi restaurado.",
      );
      console.log(
        "   Para sobrescrever, rode com RESTORE_FORCE=true.",
      );
      return;
    }

    const raw = fs.readFileSync(latestBackup.filePath, "utf8");
    const items = JSON.parse(raw);

    if (!Array.isArray(items)) {
      throw new Error("Formato de backup inválido. Esperado um array de players.");
    }

    if (existingCount > 0 && forceRestore) {
      console.log("🧹 [restore] Limpando coleção players antes de restaurar...");
      await collection.deleteMany({});
    }

    const docs = toPlayerDocs(items, mongoose);
    await Player.insertMany(docs, { ordered: false });

    console.log(`✅ [restore] Restore concluído. Total inserido: ${docs.length}`);
  } catch (error) {
    console.error("❌ [restore] Erro ao restaurar último backup:");
    console.error(error);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
    console.log("✅ Conexão fechada");
  }
}

module.exports = {
  findLatestBackupFile,
  listBackupFiles,
  main,
  resolveBackupSourceDir,
};

if (require.main === module) {
  main();
}
