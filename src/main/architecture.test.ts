import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import ts from 'typescript'
import { describe, expect, it } from 'vitest'

const SOURCE_ROOTS = ['src', 'services/tiktok-auth-bridge/src']

function collectModules(root: string, modules: string[]): void {
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const path = join(root, entry.name)
    if (entry.isDirectory()) {
      collectModules(path, modules)
    } else if (/\.(ts|tsx)$/.test(entry.name) && !entry.name.includes('.test.')) {
      modules.push(resolve(path))
    }
  }
}

function resolveRelativeModule(from: string, specifier: string, modules: Set<string>): string | null {
  if (!specifier.startsWith('.')) return null

  const base = resolve(dirname(from), specifier)
  const candidates = [
    `${base}.ts`,
    `${base}.tsx`,
    join(base, 'index.ts'),
    join(base, 'index.tsx')
  ]
  return candidates.find((candidate) => modules.has(candidate)) || null
}

function findImportCycles(): string[][] {
  const files: string[] = []
  for (const root of SOURCE_ROOTS) {
    if (existsSync(root)) collectModules(root, files)
  }

  const moduleSet = new Set(files)
  const graph = new Map<string, string[]>()
  for (const file of files) {
    const source = readFileSync(file, 'utf8')
    const imports = ts.preProcessFile(source, true, true).importedFiles
      .map(({ fileName }) => resolveRelativeModule(file, fileName, moduleSet))
      .filter((dependency): dependency is string => Boolean(dependency))
    graph.set(file, imports)
  }

  const visiting = new Set<string>()
  const visited = new Set<string>()
  const stack: string[] = []
  const cycles: string[][] = []

  const visit = (file: string): void => {
    if (visited.has(file)) return
    if (visiting.has(file)) {
      const cycleStart = stack.indexOf(file)
      cycles.push([...stack.slice(cycleStart), file])
      return
    }

    visiting.add(file)
    stack.push(file)
    for (const dependency of graph.get(file) || []) visit(dependency)
    stack.pop()
    visiting.delete(file)
    visited.add(file)
  }

  for (const file of files) visit(file)
  return cycles.map((cycle) => cycle.map((file) => relative(process.cwd(), file).replaceAll('\\', '/')))
}

describe('source architecture', () => {
  it('keeps the production module graph free of circular imports', () => {
    expect(findImportCycles()).toEqual([])
  })
})
