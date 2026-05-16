import React from 'react'
import type { AudioSource, StudioScene } from '../../../../../shared/studio'
import {
  audioEngine,
  sanitizeChannelMode,
  sanitizePan,
  sanitizeVolume,
  type ChannelModeStage
} from '../../../../utils/audio-engine'

export interface MeterFrame {
  left: number
  right: number
  peak: number
  holdPeak?: number
  spectrum?: number[]
}

export interface AudioTrackStatus {
  hasStream: boolean
  hasAudio: boolean
  live: boolean
  label: string
}

export interface LiveMeterNode {
  stream: MediaStream
  context: AudioContext
  source: MediaStreamAudioSourceNode
  splitter: ChannelSplitterNode
  analyserL: AnalyserNode
  analyserR: AnalyserNode
  channelMode: ChannelModeStage
  fxInput: GainNode
  fxOutput: GainNode
  fxNodes: any[]
  meterPan: StereoPannerNode | null
  silentSink: GainNode
  freqData: Uint8Array
  dataL: Float32Array
  dataR: Float32Array
  lastMode?: string
  lastFxHash?: any[]
  elements?: {
    peakL: HTMLElement[]
    peakR: HTMLElement[]
    clipL: HTMLElement[]
    clipR: HTMLElement[]
    spectrum: HTMLCanvasElement | null
  }
}

export function sanitizeAudioSourceUpdates(updates: Partial<AudioSource>): Partial<AudioSource> {
  const next = { ...updates }
  if ('volume' in next) next.volume = sanitizeVolume(next.volume)
  if ('pan' in next) next.pan = sanitizePan(next.pan)
  if ('channelMode' in next) next.channelMode = sanitizeChannelMode(next.channelMode, 'stereo')
  if ('color' in next) next.color = normalizeTrackColor(next.color)
  if ('filters' in next && !Array.isArray(next.filters)) next.filters = []
  return next
}


export function normalizeTrackColor(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return /^#[0-9a-f]{6}$/i.test(trimmed) ? trimmed : undefined
}

export function getTrackColor(source: AudioSource): string {
  return normalizeTrackColor(source.color) || 'rgb(var(--accent-rgb))'
}

export function linearToDb(value: number): number {
  if (value <= 0.001) return -60
  return Math.max(-60, 20 * Math.log10(value))
}

export function dbToLinear(value: number): number {
  if (value <= -60) return 0
  return Math.min(2.0, Math.pow(10, value / 20))
}

export function formatParam(key: string, value: number): string {
  if (key === 'threshold') return `${Math.round(value)}`
  if (key === 'ratio') return `${value.toFixed(1)}x`
  if (key === 'attack' || key === 'release' || key === 'delay') return `${Math.round(value * 1000)}ms`
  if (key === 'feedback' || key === 'mix' || key === 'reduction') return `${Math.round(value * 100)}%`
  if (key === 'low' || key === 'mid' || key === 'high') return `${value > 0 ? '+' : ''}${value}`
  return `${Math.round(value)}`
}

export function formatPan(value: number): string {
  if (Math.abs(value) < 0.02) return 'C'
  return value < 0 ? `${Math.round(Math.abs(value) * 100)}L` : `${Math.round(value * 100)}R`
}

export function getParamRange(key: string): { min: number; max: number; step: number } {
  if (key === 'threshold') return { min: -72, max: 0, step: 1 }
  if (key === 'ratio') return { min: 1, max: 20, step: 0.5 }
  if (key === 'attack') return { min: 0.001, max: 0.1, step: 0.001 }
  if (key === 'release') return { min: 0.02, max: 1, step: 0.01 }
  if (key === 'knee') return { min: 0, max: 40, step: 1 }
  if (key === 'low' || key === 'mid' || key === 'high') return { min: -24, max: 24, step: 0.5 }
  if (key === 'delay') return { min: 0.04, max: 1, step: 0.01 }
  if (key === 'feedback' || key === 'mix' || key === 'reduction') return { min: 0, max: 0.9, step: 0.01 }
  if (key === 'gain') return { min: -24, max: 24, step: 0.1 }
  if (key === 'drive') return { min: 0, max: 60, step: 1 }
  return { min: 0, max: 1, step: 0.01 }
}


export function getStatusClasses(status?: AudioTrackStatus): string {
  if (!status?.hasStream) return 'bg-white/[0.03] border-white/[0.08] text-white/28'
  if (!status.hasAudio) return 'bg-amber-500/10 border-amber-500/25 text-amber-300'
  if (!status.live) return 'bg-red-500/10 border-red-500/25 text-red-300'
  return 'bg-emerald-500/10 border-emerald-500/25 text-emerald-300'
}

export function cleanupLiveMeterNode(node: LiveMeterNode): void {
  try { node.source.disconnect() } catch {}
  try { node.splitter.disconnect() } catch {}
  try { node.analyserL.disconnect() } catch {}
  try { node.analyserR.disconnect() } catch {}
  node.channelMode.disconnect()
  try { node.fxInput.disconnect() } catch {}
  try { node.fxOutput.disconnect() } catch {}
  try { node.meterPan?.disconnect() } catch {}
  try { node.silentSink.disconnect() } catch {}
  for (const fxNode of node.fxNodes) {
    try { (fxNode as any)?.disconnect?.() } catch {}
  }
}

export function getTrackStatuses(
  activeScene: StudioScene,
  videoRefs: React.MutableRefObject<Record<string, HTMLVideoElement>>,
  audioSources: AudioSource[]
): Record<string, AudioTrackStatus> {
  const activeLayerIds = new Set(activeScene.layers.map(layer => layer.id))
  const statuses: Record<string, AudioTrackStatus> = {}

  for (const source of audioSources) {
    if (source.id !== 'soundboard' && source.id !== 'tts-audio' && !activeLayerIds.has(source.id)) {
      statuses[source.id] = { hasStream: false, hasAudio: false, live: false, label: 'Not in scene' }
      continue
    }

    const stream = source.id === 'soundboard'
      ? ((window as any).__soundboardStream as MediaStream | null) || null
      : source.id === 'tts-audio'
        ? audioEngine.getTtsStream()
        : videoRefs.current[source.id]?.srcObject as MediaStream | null

    const audioTracks = stream?.getAudioTracks() || []
    const liveTrack = audioTracks.find(track => track.readyState === 'live')

    if (!stream) {
      statuses[source.id] = { hasStream: false, hasAudio: false, live: false, label: 'Loading' }
    } else if (!audioTracks.length) {
      statuses[source.id] = { hasStream: true, hasAudio: false, live: false, label: 'No audio' }
    } else if (!liveTrack) {
      statuses[source.id] = { hasStream: true, hasAudio: true, live: false, label: 'Track ended' }
    } else if (source.muted) {
      statuses[source.id] = { hasStream: true, hasAudio: true, live: true, label: 'Muted' }
    } else {
      statuses[source.id] = { hasStream: true, hasAudio: true, live: true, label: liveTrack.label ? 'Audio live' : 'Live' }
    }
  }

  return statuses
}

export function mixMeters(values: Array<MeterFrame | undefined>): MeterFrame {
  const active = values.filter(Boolean) as MeterFrame[]
  if (!active.length) return { left: 0, right: 0, peak: 0 }
  return {
    left: Math.min(1, active.reduce((sum, meter) => sum + meter.left, 0) / Math.sqrt(active.length)),
    right: Math.min(1, active.reduce((sum, meter) => sum + meter.right, 0) / Math.sqrt(active.length)),
    peak: Math.min(1, Math.max(...active.map(meter => meter.peak)))
  }
}
