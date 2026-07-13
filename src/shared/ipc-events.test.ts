import { readdirSync, readFileSync } from 'node:fs'
import { relative, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { isRendererEventChannel, RENDERER_EVENT_CHANNELS } from './ipc-events'

const rendererRoot = resolve(process.cwd(), 'src/renderer')
const subscriptionPattern = /window\.api(?:\?\.|\.)on(?:\?\.)?\(\s*['"]([^'"]+)['"]/g

function findRendererSourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const path = resolve(directory, entry.name)
    if (entry.isDirectory()) return findRendererSourceFiles(path)
    return /\.(?:ts|tsx)$/.test(entry.name) && !entry.name.endsWith('.d.ts') ? [path] : []
  })
}

describe('renderer IPC event channels', () => {
  it('contains no duplicate channels', () => {
    expect(new Set(RENDERER_EVENT_CHANNELS).size).toBe(RENDERER_EVENT_CHANNELS.length)
  })

  it('registers every literal renderer subscription', () => {
    const subscriptions = findRendererSourceFiles(rendererRoot).flatMap(path => {
      const source = readFileSync(path, 'utf8')
      return Array.from(source.matchAll(subscriptionPattern))
        .map(match => match[1])
        .map(channel => ({ channel, path: relative(rendererRoot, path) }))
    })
    const unknownSubscriptions = subscriptions
      .filter(({ channel }) => !isRendererEventChannel(channel))
      .map(({ channel, path }) => `${path}: ${channel}`)

    expect(subscriptions.length).toBeGreaterThan(0)
    expect(subscriptions.map(({ channel }) => channel)).toContain('streaming:bitrate-adjusted')
    expect(unknownSubscriptions).toEqual([])
  })
})
