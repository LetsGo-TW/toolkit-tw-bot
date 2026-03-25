// packages/webpack/src/webpack.obfuscator.options.js
const COMMON_OPTIONS = {
  compact: true,
  debugProtection: false,
  debugProtectionInterval: 0,
  disableConsoleOutput: true,
  identifierNamesGenerator: 'hexadecimal',
  log: false,
  selfDefending: true,
  simplify: true,
  stringArray: true,
  stringArrayIndexShift: true,
  stringArrayRotate: true,
  stringArrayShuffle: true,
  stringArrayWrappersChainedCalls: true,
  unicodeEscapeSequence: false,
}

const PRESETS = {
  high: () => ({
    ...COMMON_OPTIONS,
    controlFlowFlattening: true,
    controlFlowFlatteningThreshold: 1,
    deadCodeInjection: true,
    deadCodeInjectionThreshold: 1,
    debugProtection: true,
    debugProtectionInterval: 4000,
    numbersToExpressions: true,
    renameGlobals: false,
    splitStrings: true,
    splitStringsChunkLength: 5,
    stringArrayCallsTransform: true,
    stringArrayEncoding: ['rc4'],
    stringArrayWrappersCount: 5,
    stringArrayWrappersParametersMaxCount: 5,
    stringArrayWrappersType: 'function',
    stringArrayThreshold: 1,
    transformObjectKeys: true,
  }),

  medium: () => ({
    ...COMMON_OPTIONS,
    controlFlowFlattening: true,
    controlFlowFlatteningThreshold: 0.75,
    deadCodeInjection: true,
    deadCodeInjectionThreshold: 0.4,
    numbersToExpressions: true,
    renameGlobals: false,
    splitStrings: true,
    splitStringsChunkLength: 10,
    stringArrayCallsTransform: true,
    stringArrayCallsTransformThreshold: 0.75,
    stringArrayEncoding: ['base64'],
    stringArrayWrappersCount: 2,
    stringArrayWrappersParametersMaxCount: 4,
    stringArrayWrappersType: 'function',
    stringArrayThreshold: 0.75,
    transformObjectKeys: true,
  }),

  low: () => ({
    ...COMMON_OPTIONS,
    controlFlowFlattening: false,
    deadCodeInjection: false,
    numbersToExpressions: false,
    renameGlobals: false,
    splitStrings: false,
    stringArrayCallsTransform: false,
    stringArrayEncoding: [],
    stringArrayWrappersCount: 1,
    stringArrayWrappersParametersMaxCount: 2,
    stringArrayWrappersType: 'variable',
    stringArrayThreshold: 0.75,
  }),

  default: () => ({
    ...COMMON_OPTIONS,
    controlFlowFlattening: false,
    deadCodeInjection: false,
    numbersToExpressions: false,
    renameGlobals: true,
    splitStrings: true,
    splitStringsChunkLength: 8,
    stringArrayCallsTransform: true,
    stringArrayCallsTransformThreshold: 0.5,
    stringArrayEncoding: ['base64'],
    stringArrayWrappersCount: 2,
    stringArrayWrappersParametersMaxCount: 3,
    stringArrayWrappersType: 'function',
    stringArrayThreshold: 1,
    transformObjectKeys: true,
  }),

  defaultPlus: () => ({
    ...PRESETS.default(),
    splitStrings: true,
    splitStringsChunkLength: 8,
    stringArrayCallsTransform: true,
    stringArrayCallsTransformThreshold: 0.5,
    stringArrayThreshold: 1,
    stringArrayWrappersCount: 2,
    transformObjectKeys: true,
  }),
}

const OVERRIDES = {
  extension: () => ({
    rotateStringArray: true,
  }),
}

function getObfuscatorPreset(level = 'default') {
  const factory = PRESETS[level] || PRESETS.default
  return factory()
}

function getObfuscatorOverride(name) {
  const factory = OVERRIDES[name]

  if (!factory) {
    return {}
  }

  return factory()
}

function getObfuscatorOptions(level = 'default', overrideNames = []) {
  const overrides = Array.isArray(overrideNames) ? overrideNames : [overrideNames]

  return overrides.reduce(
    (acc, overrideName) => ({
      ...acc,
      ...getObfuscatorOverride(overrideName),
    }),
    getObfuscatorPreset(level),
  )
}

function listObfuscatorPresets() {
  return Object.keys(PRESETS)
}

function listObfuscatorOverrides() {
  return Object.keys(OVERRIDES)
}

module.exports = {
  COMMON_OPTIONS,
  PRESETS,
  OVERRIDES,
  getObfuscatorPreset,
  getObfuscatorOverride,
  getObfuscatorOptions,
  listObfuscatorPresets,
  listObfuscatorOverrides,
}
