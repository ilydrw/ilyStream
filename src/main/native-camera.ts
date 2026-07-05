/**
 * Native camera server — stub.
 *
 * The original implementation of this module was lost (it existed only as an
 * uncommitted working-tree file and could not be recovered from git). These
 * no-op stubs preserve the module's public surface so the app builds and runs;
 * native-camera capture simply falls back to the standard getUserMedia path.
 *
 * If the native camera server is reintroduced, restore the real
 * startNativeCameraServer / stopAllNativeCameras implementations here.
 */

export function startNativeCameraServer(): void {
  // no-op: native camera server unavailable
}

export function stopAllNativeCameras(): void {
  // no-op
}
