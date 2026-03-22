const mongoose = require("./mongoose");
const Player = require("./models/Player");
const TelegramLinkToken = require("./models/TelegramLinkToken");
const TelegramSubscription = require("./models/TelegramSubscription");
const {
  getAppRoot,
  getEnvPaths,
  getMonorepoRoot,
  getNodeEnv,
  loadEnv,
} = require("./config/load-env");
const { resolveMongoConfig } = require("./config/mongo");

async function waitForConnection(client = mongoose) {
  if (typeof client.awaitConnection === "function") {
    await client.awaitConnection();
    return;
  }

  if (client.connection.readyState === 1) {
    return;
  }

  await new Promise((resolve, reject) => {
    client.connection.once("connected", resolve);
    client.connection.once("error", reject);
  });
}

module.exports = {
  Player,
  TelegramLinkToken,
  TelegramSubscription,
  getAppRoot,
  getEnvPaths,
  getMonorepoRoot,
  getNodeEnv,
  loadEnv,
  mongoose,
  resolveMongoConfig,
  waitForConnection,
};
