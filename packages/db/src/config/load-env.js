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

function getDefaultAppRoot() {
  return path.join(getMonorepoRoot(), "apps", "api");
}

function resolveRuntimeAppRoot(cwd = process.cwd()) {
  const monorepoRoot = getMonorepoRoot();
  const relativeCwd = path.relative(monorepoRoot, cwd);

  if (!relativeCwd || relativeCwd.startsWith("..") || path.isAbsolute(relativeCwd)) {
    return null;
  }

  const segments = relativeCwd.split(path.sep).filter(Boolean);
  if (segments[0] !== "apps" || !segments[1]) {
    return null;
  }

  return path.join(monorepoRoot, "apps", segments[1]);
}

function getAppRoot() {
  return resolveRuntimeAppRoot() || getDefaultAppRoot();
}

function getEnvRoots() {
  return [getAppRoot(), getDefaultAppRoot()].filter(
    (appRoot, index, roots) => roots.indexOf(appRoot) === index,
  );
}

function getEnvPaths(nodeEnv = getNodeEnv(), appRoot = getAppRoot()) {
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
  const envRoots = getEnvRoots();
  const loadedPaths = [];

  envRoots.forEach((appRoot) => {
    getEnvPaths(nodeEnv, appRoot).forEach((envPath) => {
      if (!fs.existsSync(envPath)) {
        return;
      }

      dotenv.config({
        path: envPath,
        quiet: true,
      });

      loadedPaths.push(envPath);
    });
  });

  cachedEnvState = {
    appRoot: getAppRoot(),
    envRoots,
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
