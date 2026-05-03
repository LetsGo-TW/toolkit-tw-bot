const fs = require('fs')
const path = require('path')
const modulesMap = require('../entries/dynamic-modules')
const runtimeMap = require('../entries/dynamic-runtime')
const bootstrapMap = require('../entries/dynamic-bootstrap')

function generateMethod(moduleKey, config) {
  const exportName = config.exportName || 'default'

  return `  static "${moduleKey}" = async () => {
    const mod = await import(
      /* webpackChunkName: "${config.chunkName || moduleKey}" */
      '${config.importPath}'
    )
    return mod.${exportName}
  }`
}

function generateFileContent({
  exportName,
  registry,
}) {
  const methods = Object.entries(registry)
    .map(([moduleKey, config]) => generateMethod(moduleKey, config))
    .join('\n\n')

  return `// AUTO-GENERATED FILE. DO NOT EDIT MANUALLY.

export class ${exportName} {
${methods}
}
`
}

function writeGeneratedFile({
  outputFileName,
  exportName,
  registry,
}) {
  const outputPath = path.resolve(
    __dirname,
    `../src/${outputFileName}`,
  )

  const content = generateFileContent({
    exportName,
    registry,
  })

  fs.mkdirSync(path.dirname(outputPath), { recursive: true })
  fs.writeFileSync(outputPath, content, 'utf8')

  console.log(`DynamicImports generated at: ${outputPath}`)
}

function main() {
  writeGeneratedFile({
    outputFileName: 'dynamic-modules.js',
    exportName: 'DynamicModules',
    registry: modulesMap,
  })

  writeGeneratedFile({
    outputFileName: 'dynamic-runtime.js',
    exportName: 'DynamicRuntime',
    registry: runtimeMap,
  })

  writeGeneratedFile({
    outputFileName: 'dynamic-bootstrap.js',
    exportName: 'DynamicBootstrap',
    registry: bootstrapMap,
  })
}

main()
