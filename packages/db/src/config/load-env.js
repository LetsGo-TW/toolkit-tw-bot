const fs = require("fs");
const path = require("path");
const dotenv = require("dotenv");

let cachedEnvState = null;

function getNodeEnv() {
  return process.env.NODE_ENV || "development";
}

function getMonorepoRoot() {
  return path.resolve(__dirname, "../../../..");
}

function getAppRoot() {
  return path.join(getMonorepoRoot(), "apps", "api");
}

function getEnvPaths(nodeEnv = getNodeEnv()) {
  const appRoot = getAppRoot();
  const paths = [];

  if (nodeEnv !== "test") {
    paths.push(path.join(appRoot, `.env.${nodeEnv}.local`));
  }

  if (nodeEnv !== "test") {
    paths.push(path.join(appRoot, ".env.local"));
  }

  paths.push(path.join(appRoot, `.env.${nodeEnv}`));
  paths.push(path.join(appRoot, ".env"));

  return paths;
}

function loadEnv() {
  if (cachedEnvState) {
    return cachedEnvState;
  }

  const nodeEnv = getNodeEnv();
  const loadedPaths = [];

  getEnvPaths(nodeEnv).forEach((envPath) => {
    if (!fs.existsSync(envPath)) {
      return;
    }

    dotenv.config({
      path: envPath,
      quiet: true,
    });

    loadedPaths.push(envPath);
  });

  cachedEnvState = {
    appRoot: getAppRoot(),
    loadedPaths,
    nodeEnv,
  };

  return cachedEnvState;
}

module.exports = {
  getAppRoot,
  getEnvPaths,
  getMonorepoRoot,
  getNodeEnv,
  loadEnv,
};
