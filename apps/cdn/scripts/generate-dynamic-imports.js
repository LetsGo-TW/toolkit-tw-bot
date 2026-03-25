const fs = require('fs')
const path = require('path')
const modulesMap = require('../entries/dynamic-modules')

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

function generateFileContent() {
  const methods = Object.entries(modulesMap)
    .map(([moduleKey, config]) => generateMethod(moduleKey, config))
    .join('\n\n')

  return `// AUTO-GENERATED FILE. DO NOT EDIT MANUALLY.

export class DynamicImports {
${methods}
}
`
}

function main() {
  const outputPath = path.resolve(
    __dirname,
    '../src/dynamic-import/index.js',
  )

  const content = generateFileContent()

  fs.mkdirSync(path.dirname(outputPath), { recursive: true })
  fs.writeFileSync(outputPath, content, 'utf8')

  console.log(`DynamicImports generated at: ${outputPath}`)
}

main()
