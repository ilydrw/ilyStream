import { existsSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { listPackage } from '@electron/asar'

const packagePath = resolve(process.argv[2] || join('dist', 'win-unpacked', 'resources', 'app.asar'))
if (!existsSync(packagePath)) {
  console.error(`[package-check] app.asar was not found: ${packagePath}`)
  process.exit(1)
}

const maxBytes = Number(process.env.ILYSTREAM_MAX_ASAR_BYTES || 250_000_000)
const packageBytes = statSync(packagePath).size
const entries = listPackage(packagePath).map((entry) => entry.replace(/^[/\\]+/, '').replaceAll('\\', '/'))
const allowedRoots = new Set(['out', 'node_modules'])
const forbiddenRoots = new Set([
  '.claude', '.codex', '.git', '.github', '.playwright-mcp',
  'docs', 'native', 'resources', 'scripts', 'services', 'src', 'website'
])

const unexpected = entries.filter((entry) => {
  if (!entry) return false
  if (entry === 'package.json') return false
  const root = entry.split('/')[0]
  return forbiddenRoots.has(root) || !allowedRoots.has(root)
})

if (packageBytes > maxBytes) {
  console.error(`[package-check] app.asar is ${(packageBytes / 1_000_000).toFixed(1)} MB; budget is ${(maxBytes / 1_000_000).toFixed(1)} MB.`)
  process.exitCode = 1
}
if (unexpected.length > 0) {
  console.error('[package-check] unexpected release entries:')
  for (const entry of unexpected.slice(0, 50)) console.error(`  ${entry}`)
  if (unexpected.length > 50) console.error(`  ...and ${unexpected.length - 50} more`)
  process.exitCode = 1
}

if (!process.exitCode) {
  console.log(`[package-check] ${entries.length} entries, ${(packageBytes / 1_000_000).toFixed(1)} MB, allowlist verified.`)
}
