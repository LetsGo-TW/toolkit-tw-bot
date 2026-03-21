const { getNodeEnv, loadEnv } = require("./load-env");

const DEFAULT_DB_NAMES = {
  development: "toolkit_tw_bot_dev",
  production: "letsgo_access_control",
  test: "toolkit_tw_bot_test",
};

function toBoolean(value) {
  return String(value || "").trim().toLowerCase() === "true";
}

function isRemoteMongoUri(uri = "") {
  return /^mongodb\+srv:\/\//i.test(uri) || /mongodb\.net/i.test(uri);
}

function getDefaultDbName(nodeEnv) {
  if (process.env.MONGODB_DB_NAME) {
    return process.env.MONGODB_DB_NAME;
  }

  if (nodeEnv === "production" && process.env.DB_NAME) {
    return process.env.DB_NAME;
  }

  return DEFAULT_DB_NAMES[nodeEnv] || DEFAULT_DB_NAMES.development;
}

function buildLegacyAtlasUri(databaseName) {
  const { DB_PASS, DB_USER } = process.env;

  if (!DB_USER || !DB_PASS) {
    return null;
  }

  return `mongodb+srv://${DB_USER}:${DB_PASS}@cluster0.llt1v3s.mongodb.net/${databaseName}?retryWrites=true&w=majority&appName=Cluster0`;
}

function resolveMongoConfig() {
  loadEnv();

  const nodeEnv = getNodeEnv();
  const dbName = getDefaultDbName(nodeEnv);
  let uri = String(process.env.MONGODB_URI || "").trim();

  if (!uri && nodeEnv === "production") {
    uri = buildLegacyAtlasUri(dbName);
  }

  if (!uri && nodeEnv !== "production") {
    uri = `mongodb://127.0.0.1:27017/${dbName}`;
  }

  if (!uri) {
    throw new Error(
      "MongoDB não configurado. Defina MONGODB_URI ou, em produção, DB_USER/DB_PASS.",
    );
  }

  const allowRemoteDbInNonProd = toBoolean(
    process.env.ALLOW_REMOTE_DB_IN_NON_PROD,
  );
  const remote = isRemoteMongoUri(uri);

  if (nodeEnv !== "production" && remote && !allowRemoteDbInNonProd) {
    throw new Error(
      `Conexão remota com MongoDB bloqueada em ${nodeEnv}. Use um MONGODB_URI local ou defina ALLOW_REMOTE_DB_IN_NON_PROD=true explicitamente.`,
    );
  }

  return {
    dbName,
    isRemote: remote,
    nodeEnv,
    uri,
  };
}

module.exports = {
  resolveMongoConfig,
};
