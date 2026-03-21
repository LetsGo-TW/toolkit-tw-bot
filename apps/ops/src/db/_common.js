const fs = require("fs");
const path = require("path");

function getDbPackage() {
  return require("../../../../packages/db/src");
}

function resolveMongoRuntime() {
  const { resolveMongoConfig } = getDbPackage();
  return resolveMongoConfig();
}

async function connectMongo() {
  const { mongoose, waitForConnection } = getDbPackage();
  const { dbName, nodeEnv } = resolveMongoRuntime();
  await waitForConnection(mongoose);
  console.log(`✅ Conectado ao MongoDB (env: ${nodeEnv}, db: ${dbName})`);
  return {
    collection: mongoose.connection.db.collection("players"),
    dbName,
    mongoose,
    nodeEnv,
  };
}

function disconnectMongo() {
  const { mongoose } = getDbPackage();
  return mongoose.disconnect();
}

function getOpsDataDir() {
  return path.join(__dirname, "../../data/db");
}

function getDataFilePath(fileName) {
  return path.join(getOpsDataDir(), fileName);
}

function parseOptionArg(name) {
  const args = process.argv.slice(2);

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === `--${name}` && index + 1 < args.length) {
      return args[index + 1];
    }

    if (arg.startsWith(`--${name}=`)) {
      return arg.split("=", 2)[1];
    }
  }

  return null;
}

function requireOptionArg(name) {
  const value = parseOptionArg(name);

  if (!value) {
    throw new Error(`Parâmetro obrigatório ausente: --${name}`);
  }

  return value;
}

function readJsonFile(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Arquivo não encontrado: ${filePath}`);
  }

  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function toBoolean(value, defaultValue = false) {
  if (value == null || String(value).trim() === "") {
    return defaultValue;
  }

  return String(value).trim().toLowerCase() === "true";
}

module.exports = {
  connectMongo,
  disconnectMongo,
  getDataFilePath,
  getOpsDataDir,
  parseOptionArg,
  readJsonFile,
  requireOptionArg,
  toBoolean,
};
