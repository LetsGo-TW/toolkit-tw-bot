const path = require('path')
const Dotenv = require('dotenv-webpack')

function getEnvFilename(buildEnv) {
  if (buildEnv === 'prod') {
    return '.env.production'
  }

  if (buildEnv === 'prod-local') {
    return '.env.local'
  }

  return '.env.development'
}

function makeDotenvPlugin() {
  const buildEnv = process.env.WEBPACK_BUILD_ENV || 'dev'
  const envPath = path.resolve(__dirname, '..', getEnvFilename(buildEnv))

  return new Dotenv({
    path: envPath,
    systemvars: true,
    silent: true,
  })
}

module.exports = {
  makeDotenvPlugin,
}
