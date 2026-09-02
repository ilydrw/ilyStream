import fs from 'node:fs'
import path from 'node:path'

const packageJson = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
const electronPackage = JSON.parse(fs.readFileSync(new URL('../node_modules/electron/package.json', import.meta.url), 'utf8'))
const version = electronPackage.version
const profile = process.env.USERPROFILE || process.env.HOME || ''
const candidates = [
  path.join(profile, '.electron-gyp', version),
  path.join(profile, '.node-gyp', version)
]
const root = candidates.find(candidate => fs.existsSync(path.join(candidate, 'include', 'node', 'node.h')))
const headers = root ? path.join(root, 'include', 'node') : null
const libs = root
  ? [path.join(root, 'x64', 'node.lib'), path.join(root, 'win-x64', 'node.lib')]
  : []
const nodeLib = libs.find(candidate => fs.existsSync(candidate))

if (!root || !nodeLib) {
  console.error(`Exact Electron native ABI assets for ${version} were not found.`)
  console.error('Install matching headers/node.lib before packaging; do not use the development fallback.')
  console.error(`One supported setup path is: npx electron-rebuild --version ${version} --force`)
  console.error(`Expected headers under ${path.join(profile, '.electron-gyp', version, 'include', 'node')}`)
  console.error(`ilyStream package: ${packageJson.version}; Electron target: ${version}`)
  process.exit(1)
}

console.log(`Electron ${version} native ABI verified.`)
console.log(`Headers: ${headers}`)
console.log(`node.lib: ${nodeLib}`)
