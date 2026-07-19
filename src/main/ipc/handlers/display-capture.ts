export type DisplayCaptureAudioSource = 'loopback' | undefined

export function resolveDisplayCaptureAudioSource(withAudio: boolean): DisplayCaptureAudioSource {
  return withAudio ? 'loopback' : undefined
}
