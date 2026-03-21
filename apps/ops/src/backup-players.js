const fs = require("fs");
const path = require("path");

function ensureRuntimeEnv() {
  if (!process.env.NODE_ENV) {
    process.env.NODE_ENV = "production";
  }
}

function getMonorepoRoot() {
  return path.resolve(__dirname, "../../..");
}

function getTodayString() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function sanitizeSegment(value = "") {
  return String(value || "")
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "") || "default";
}

function getRetentionLimit() {
  const rawValue = Number(process.env.BACKUP_MAX_FILES || 7);
  if (!Number.isFinite(rawValue) || rawValue < 1) {
    return 7;
  }
  return Math.floor(rawValue);
}

function resolveBaseBackupDir() {
  const configuredDir = String(process.env.BACKUP_DIR || "").trim();

  if (!configuredDir) {
    return path.join(getMonorepoRoot(), "data", "backups", "players");
  }

  if (path.isAbsolute(configuredDir)) {
    return configuredDir;
  }

  return path.join(getMonorepoRoot(), configuredDir);
}

function buildBackupFileName(databaseName) {
  return `players.${sanitizeSegment(databaseName)}.${getTodayString()}.json`;
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
  return dirPath;
}

function pruneOldBackups(dirPath, databaseName) {
  const safeDatabaseName = sanitizeSegment(databaseName);
  const filePattern = new RegExp(
    `^players\\.${safeDatabaseName}\\.\\d{4}-\\d{2}-\\d{2}\\.json$`,
  );

  const files = fs
    .readdirSync(dirPath)
    .filter((name) => filePattern.test(name))
    .sort((a, b) => a.localeCompare(b));

  const retentionLimit = getRetentionLimit();
  const removableFiles = files.slice(0, Math.max(0, files.length - retentionLimit));

  removableFiles.forEach((fileName) => {
    const filePath = path.join(dirPath, fileName);
    console.log(`🗑  [backup] Removendo backup antigo: ${fileName}`);
    fs.unlinkSync(filePath);
  });

  return {
    filesCount: files.length,
    retentionLimit,
    removedCount: removableFiles.length,
  };
}

async function main() {
  ensureRuntimeEnv();
  const { Player, mongoose, waitForConnection } = require("@toolkit-tw-bot/db");

  try {
    await waitForConnection(mongoose);

    const databaseName = mongoose.connection.db.databaseName;
    const backupDir = ensureDir(resolveBaseBackupDir());
    const fileName = buildBackupFileName(databaseName);
    const filePath = path.join(backupDir, fileName);

    console.log(`✅ Conectado ao MongoDB (db: ${databaseName})`);
    console.log(`📂 [backup] Diretório de saída: ${backupDir}`);

    const players = await Player.find().lean();
    fs.writeFileSync(filePath, JSON.stringify(players, null, 2), "utf8");

    console.log(`📦 [backup] Total de registros: ${players.length}`);
    console.log(`✅ [backup] Backup salvo em: ${filePath}`);

    const pruneResult = pruneOldBackups(backupDir, databaseName);
    if (pruneResult.removedCount === 0) {
      console.log(
        `ℹ️ [backup] Total de backups: ${pruneResult.filesCount} (<= ${pruneResult.retentionLimit}, nada a apagar)`,
      );
    }
  } catch (error) {
    console.error("❌ [backup] Erro ao gerar backup de players:");
    console.error(error);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
    console.log("✅ Conexão fechada");
  }
}

module.exports = {
  buildBackupFileName,
  getMonorepoRoot,
  main,
  pruneOldBackups,
  resolveBaseBackupDir,
};

if (require.main === module) {
  main();
}
