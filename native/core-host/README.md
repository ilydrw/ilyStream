# ilyStream native core host

`ilystream_core_host.exe` is the migration boundary between the current
Electron shell and the native broadcast runtime. It links the existing engine
C ABI and the pure C++ audio core; it does not load Node or Electron.

The host is intentionally opt-in while parity work continues. Set
`ILYSTREAM_NATIVE_CORE_HOST=1` before launching ilyStream to start it alongside
the established N-API runtime. The app authenticates a versioned JSON-lines
control session and logs the host PID. Media is not sent over JSON: shared GPU
textures and bounded shared-memory audio rings remain the transport boundary.

## Security boundary

- Windows named pipe restricted to SYSTEM, administrators, and the current user.
- Remote pipe clients rejected.
- Random pipe name and 256-bit per-launch capability.
- Capability required before any method is dispatched and compared in constant time.
- Environment copies of the pipe name and capability are cleared after host startup.
- Requests and responses are bounded to 64 KiB.
- Audio mappings use randomized names, bounded capacity, validated metadata,
  seqlock publication, and the same current-user/SYSTEM/administrators ACL.

## Protocol v4

The first request must be `hello` with `protocol: 4` and the launch capability.
Implemented methods are `health`, `engine.initialize`, `engine.shutdown`,
`audio.listDevices`, `audio.status`, `audio.startCapture`, `audio.stopCapture`,
`mixer.evaluate`, `mixer.startTransport`, `mixer.transportStatus`,
`mixer.stopTransport`, and `shutdown`.

`audio.startCapture` returns a randomized `shared-memory-v1` descriptor. The
host writes interleaved f32 PCM to a bounded, current-user-only ring and the
Electron audio service reads it through the temporary compatibility addon.
Capture and its real-time callback no longer run in the Electron process.

`mixer.evaluate` accepts at most 64 sources and bounded routing/transition
metadata. The host independently validates all IDs, enums, flags, and numeric
ranges, then evaluates mute, monitoring, Solo, scene ownership, fade gain, and
fader gain. The same dependency-free C++ mixer also implements bounded stereo
mixing, pan, and mono/stereo channel policy, covered by native unit tests.
The Electron renderer remains the live Program producer for now; it sends
policy snapshots at no more than 10 Hz during transitions and compares the
native decisions in shadow mode. Snapshots are coalesced while a request is in
flight, and mismatch logging is rate bounded.

The v4 mixer transport accepts up to 64 authenticated, current-user-only source
rings. Source zero drives the block clock; late secondary sources contribute
silence and increment bounded underrun telemetry. The native worker applies
gain, pan, and mono/stereo policy and publishes the result to a randomized,
host-owned Program ring. This route remains a shadow transport until per-track
AudioWorklet taps and master-DSP parity are complete.

Set `ILYSTREAM_NATIVE_MIXER_AUDIO_SHADOW=1` together with
`ILYSTREAM_NATIVE_CORE_HOST=1` to attach post-policy per-track AudioWorklet taps
while an output is active. The renderer's pre-master sum is compared with the
native Program blocks using a bounded eight-block queue and `1e-4` sample
tolerance. The encoder remains connected to the established renderer output.
Audio shadow mode is disabled when `ILY_NATIVE_AUDIO=1` because both migration
routes currently share the temporary single-reader N-API adapter.

Device capture still bypasses scene mixer policy such as source faders, mute,
solo, and effects. Testing the end-to-end route therefore requires all three
explicit flags:

```powershell
$env:ILYSTREAM_NATIVE_CORE_HOST = '1'
$env:ILY_NATIVE_AUDIO = '1'
$env:ILY_NATIVE_AUDIO_DEVICE_ONLY_ACK = '1'
```

Without the acknowledgement, the renderer's policy-controlled Program mix
remains authoritative. If host startup or ring attachment fails, the audio
service logs the failure and retains its established fallback behavior.
