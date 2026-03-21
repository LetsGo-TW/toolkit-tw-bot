const mongoose = require("mongoose");
const { loadEnv } = require("./config/load-env");
const { resolveMongoConfig } = require("./config/mongo");

loadEnv();

const { dbName, isRemote, nodeEnv, uri } = resolveMongoConfig();
const connectionPromise = mongoose.connect(uri, dbName ? { dbName } : undefined);

connectionPromise
  .then(() => {
    console.log(
      `✅ Conectado ao MongoDB (env: ${nodeEnv}, db: ${dbName}, remote: ${isRemote})`,
    );
  })
  .catch((err) => {
    console.error("❌ Erro ao conectar no MongoDB:");
    console.error(err);
  });

mongoose.Promise = global.Promise;
mongoose.awaitConnection = () => connectionPromise;

module.exports = mongoose;
