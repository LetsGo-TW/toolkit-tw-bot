const manifestVersion = 3
const compatVersion = '2.0'
const extensionVersion = '2.0.0'
const cdnVersion = '2.0.0'
const assetBasePath = `/cdn/${compatVersion}`
const extensionZipBasename = `Extension.v${manifestVersion}-${extensionVersion}`
const extensionZipFilename = `${extensionZipBasename}.zip`

module.exports = {
  manifestVersion,
  compatVersion,
  extensionVersion,
  cdnVersion,
  assetBasePath,
  cdnBasePath: assetBasePath,
  cdnPaths: {
    base: assetBasePath,
    web: `${assetBasePath}/web`,
    workers: `${assetBasePath}/workers`,
  },
  extensionZipBasename,
  extensionZipFilename,
}
