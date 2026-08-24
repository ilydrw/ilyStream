import { EventEmitter } from 'node:events'
import { PixelFormat, type NativeEngine } from './native-engine'

export interface ProgramVideoExportDescription {
  generation: string
  adapterLuidHigh: number
  adapterLuidLow: number
  width: number
  height: number
}

export interface ProgramVideoExportLease extends ProgramVideoExportDescription {
  duplicatedHandles: [string, string]
  controlHandle: string
}

const events = new EventEmitter()
let programEngine: NativeEngine | null = null
let programDemanded = false

export function setProgramExportEngine(engine: NativeEngine): void {
  if (programEngine === engine) return
  programEngine = engine
  engine.setProgramExportEnabled(programDemanded)
  events.emit('changed')
}

export function clearProgramExportEngine(engine?: NativeEngine | null): void {
  if (!programEngine || (engine && programEngine !== engine)) return
  try { programEngine.setProgramExportEnabled(false) } catch {}
  programEngine = null
  events.emit('changed')
}

export function setProgramExportDemanded(demanded: boolean): void {
  if (programDemanded === demanded) return
  programDemanded = demanded
  programEngine?.setProgramExportEnabled(demanded)
}

export function onProgramExportChanged(listener: () => void): () => void {
  events.on('changed', listener)
  return () => events.off('changed', listener)
}

/**
 * Duplicate the current Program pool into one authenticated OBS process and
 * return a wire-safe lease. Local engine handle values never leave this module.
 */
export function describeProgramVideoExport(): ProgramVideoExportDescription | null {
  const engine = programEngine
  if (!engine) return null

  let descriptor
  try {
    descriptor = engine.getProgramExportDescriptor()
  } catch {
    // The native pool intentionally does not exist while demand is disabled.
    // Treat that lifecycle edge the same as an offline producer.
    return null
  }
  if (
    descriptor.version !== 1 ||
    descriptor.generation <= 0n ||
    descriptor.format !== PixelFormat.RGBA8 ||
    descriptor.slotCount !== 2 ||
    descriptor.producerAcquireKey !== 0n ||
    descriptor.consumerAcquireKey !== 1n ||
    descriptor.controlBlockVersion !== 1 ||
    descriptor.controlBlockSize !== 128 ||
    descriptor.adapterLuid === 0n ||
    descriptor.width < 1 ||
    descriptor.height < 1
  ) {
    return null
  }
  const low = Number(descriptor.adapterLuid & 0xffff_ffffn)
  const highUnsigned = Number((descriptor.adapterLuid >> 32n) & 0xffff_ffffn)
  const high = highUnsigned >= 0x8000_0000 ? highUnsigned - 0x1_0000_0000 : highUnsigned

  return {
    generation: descriptor.generation.toString(10),
    adapterLuidHigh: high,
    adapterLuidLow: low,
    width: descriptor.width,
    height: descriptor.height
  }
}

export function acquireProgramVideoExport(
  targetProcessId: number,
  expectedGeneration: string
): ProgramVideoExportLease | null {
  if (!Number.isInteger(targetProcessId) || targetProcessId < 1 || targetProcessId > 0xffff_ffff) {
    return null
  }
  if (!/^[1-9][0-9]{0,19}$/.test(expectedGeneration)) return null
  const engine = programEngine
  const description = describeProgramVideoExport()
  if (!engine || !description || description.generation !== expectedGeneration) return null

  const generation = BigInt(expectedGeneration)
  const duplicated = engine.duplicateProgramExportHandles(targetProcessId, generation, 2)
  if (duplicated.version !== 1 || duplicated.generation !== generation || duplicated.slotCount !== 2) {
    throw new Error('Native engine returned an incompatible Program handle lease.')
  }
  return {
    ...description,
    duplicatedHandles: [
      formatHandle(duplicated.textureHandles[0]),
      formatHandle(duplicated.textureHandles[1])
    ],
    controlHandle: formatHandle(duplicated.controlHandle)
  }
}

function formatHandle(handle: bigint): string {
  if (handle <= 0n || handle > 0xffff_ffff_ffff_ffffn) {
    throw new Error('Native engine returned an invalid duplicated Program handle.')
  }
  return handle.toString(16).padStart(16, '0')
}
