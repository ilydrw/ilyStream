/**
 * GPU chroma key. Replaces the per-frame getImageData → JS pixel loop →
 * putImageData path in useRenderLoop (~10ms+ of main-thread time per 1080p
 * layer) with a fragment shader on a shared offscreen WebGL canvas.
 *
 * The shader reproduces the CPU math exactly — including the historical
 * divisor 441.6 (not the exact sqrt(3)*255 = 441.673) — so switching paths
 * never changes the keyed output:
 *
 *   dist  = |rgb - key| / 441.6            (0–255 RGB space)
 *   alpha = 0                              when dist < similarity
 *         = min(a, (dist-sim)/smooth)      when dist < similarity+smoothness
 *   green = avg + (g-avg) * dist/(sim+spill)  when spilling and g > avg(r,b)
 *
 * A/B toggle for eyeballing the two paths on real footage:
 *   window.__ilyChromaGpu(false)  → force the CPU loop (persists)
 *   window.__ilyChromaGpu(true)   → back to the GPU path
 */

export interface ChromaKeyGpuParams {
  keyR: number
  keyG: number
  keyB: number
  /** All 0–1, already divided by 100 like the CPU path. */
  similarity: number
  smoothness: number
  spill: number
}

const GPU_TOGGLE_KEY = 'ilystream.chroma-gpu'

const VERTEX_SHADER = `
attribute vec2 a_pos;
varying vec2 v_uv;
void main() {
  v_uv = a_pos * 0.5 + 0.5;
  gl_Position = vec4(a_pos, 0.0, 1.0);
}`

const FRAGMENT_SHADER = `
precision mediump float;
varying vec2 v_uv;
uniform sampler2D u_source;
uniform vec3 u_key;
uniform float u_similarity;
uniform float u_smoothness;
uniform float u_spill;

void main() {
  vec4 c = texture2D(u_source, v_uv);
  float dist = distance(c.rgb * 255.0, u_key * 255.0) / 441.6;

  float a = c.a;
  if (dist < u_similarity) {
    a = 0.0;
  } else if (dist < u_similarity + u_smoothness) {
    a = min(a, (dist - u_similarity) / max(u_smoothness, 1e-5));
  }

  vec3 rgb = c.rgb;
  if (u_spill > 0.0 && dist < u_similarity + u_spill) {
    float avg = (rgb.r + rgb.b) * 0.5;
    if (rgb.g > avg) {
      rgb.g = avg + (rgb.g - avg) * (dist / (u_similarity + u_spill));
    }
  }

  // Premultiplied output — the context is created premultipliedAlpha:true so
  // drawImage() back into the 2D scratch canvas composites correctly.
  gl_FragColor = vec4(rgb * a, a);
}`

interface GlState {
  canvas: HTMLCanvasElement
  gl: WebGLRenderingContext
  texture: WebGLTexture
  uKey: WebGLUniformLocation
  uSimilarity: WebGLUniformLocation
  uSmoothness: WebGLUniformLocation
  uSpill: WebGLUniformLocation
}

let state: GlState | null = null
/** Permanent init failure (no WebGL, shader compile error) — stop retrying. */
let initFailed = false
let contextLost = false
let lastLoggedPath: 'gpu' | 'cpu' | null = null
let toggleCache = { disabled: false, checkedAt: 0 }

function isGpuDisabled(): boolean {
  const now = Date.now()
  if (now - toggleCache.checkedAt > 1000) {
    let disabled = false
    try {
      disabled = window.localStorage.getItem(GPU_TOGGLE_KEY) === 'off'
    } catch {
      /* storage unavailable — GPU stays on */
    }
    toggleCache = { disabled, checkedAt: now }
  }
  return toggleCache.disabled
}

function logPath(path: 'gpu' | 'cpu', reason: string): void {
  if (lastLoggedPath === path) return
  lastLoggedPath = path
  console.log(`[chroma-key] ${path === 'gpu' ? 'GPU (WebGL) path active' : 'CPU fallback active'} — ${reason}`)
}

function compileShader(gl: WebGLRenderingContext, type: number, source: string): WebGLShader | null {
  const shader = gl.createShader(type)
  if (!shader) return null
  gl.shaderSource(shader, source)
  gl.compileShader(shader)
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    console.warn('[chroma-key] Shader compile failed:', gl.getShaderInfoLog(shader))
    gl.deleteShader(shader)
    return null
  }
  return shader
}

function initGl(): GlState | null {
  const canvas = document.createElement('canvas')
  const gl = canvas.getContext('webgl', {
    alpha: true,
    premultipliedAlpha: true,
    antialias: false,
    depth: false,
    stencil: false,
    preserveDrawingBuffer: false
  })
  if (!gl) return null

  canvas.addEventListener('webglcontextlost', (event) => {
    event.preventDefault()
    contextLost = true
  })
  canvas.addEventListener('webglcontextrestored', () => {
    // Program/texture handles died with the old context — rebuild lazily.
    state = null
    contextLost = false
  })

  const vs = compileShader(gl, gl.VERTEX_SHADER, VERTEX_SHADER)
  const fs = compileShader(gl, gl.FRAGMENT_SHADER, FRAGMENT_SHADER)
  if (!vs || !fs) return null

  const program = gl.createProgram()
  if (!program) return null
  gl.attachShader(program, vs)
  gl.attachShader(program, fs)
  gl.linkProgram(program)
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    console.warn('[chroma-key] Program link failed:', gl.getProgramInfoLog(program))
    return null
  }
  gl.useProgram(program)

  // Fullscreen quad. With UNPACK_FLIP_Y enabled on upload, uv.y = 1 at the
  // top of clip space samples the top row of the source canvas → upright.
  const buffer = gl.createBuffer()
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW)
  const aPos = gl.getAttribLocation(program, 'a_pos')
  gl.enableVertexAttribArray(aPos)
  gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0)

  const texture = gl.createTexture()
  if (!texture) return null
  gl.bindTexture(gl.TEXTURE_2D, texture)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST)
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true)
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false)
  gl.disable(gl.BLEND)

  const uKey = gl.getUniformLocation(program, 'u_key')
  const uSimilarity = gl.getUniformLocation(program, 'u_similarity')
  const uSmoothness = gl.getUniformLocation(program, 'u_smoothness')
  const uSpill = gl.getUniformLocation(program, 'u_spill')
  if (!uKey || !uSimilarity || !uSmoothness || !uSpill) return null

  gl.uniform1i(gl.getUniformLocation(program, 'u_source'), 0)

  return { canvas, gl, texture, uKey, uSimilarity, uSmoothness, uSpill }
}

/**
 * Key `source` against the given color and return a canvas holding the
 * result at the same dimensions, or null when the caller must run the CPU
 * fallback (WebGL unavailable, context lost, or user-disabled).
 *
 * The returned canvas is shared and only valid until the next call — draw
 * it into your target immediately.
 */
export function applyChromaKeyGpu(
  source: HTMLCanvasElement,
  params: ChromaKeyGpuParams
): HTMLCanvasElement | null {
  if (isGpuDisabled()) {
    logPath('cpu', `disabled via localStorage("${GPU_TOGGLE_KEY}")`)
    return null
  }
  if (initFailed || contextLost) {
    logPath('cpu', contextLost ? 'WebGL context lost' : 'WebGL init failed')
    return null
  }

  if (!state) {
    try {
      state = initGl()
    } catch (err) {
      console.warn('[chroma-key] WebGL init threw:', err)
      state = null
    }
    if (!state) {
      initFailed = true
      logPath('cpu', 'WebGL unavailable')
      return null
    }
  }

  const { canvas, gl, texture } = state
  const width = source.width
  const height = source.height
  if (width === 0 || height === 0) return null

  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width
    canvas.height = height
  }
  gl.viewport(0, 0, width, height)

  gl.bindTexture(gl.TEXTURE_2D, texture)
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source)

  gl.uniform3f(state.uKey, params.keyR / 255, params.keyG / 255, params.keyB / 255)
  gl.uniform1f(state.uSimilarity, params.similarity)
  gl.uniform1f(state.uSmoothness, params.smoothness)
  gl.uniform1f(state.uSpill, params.spill)

  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)

  logPath('gpu', 'WebGL fragment shader')
  return canvas
}

// Console helper for A/B-ing the two paths on live footage.
declare global {
  interface Window {
    __ilyChromaGpu?: (enabled: boolean) => void
  }
}

if (typeof window !== 'undefined' && !window.__ilyChromaGpu) {
  window.__ilyChromaGpu = (enabled: boolean) => {
    try {
      if (enabled) window.localStorage.removeItem(GPU_TOGGLE_KEY)
      else window.localStorage.setItem(GPU_TOGGLE_KEY, 'off')
      toggleCache = { disabled: !enabled, checkedAt: Date.now() }
      console.log(`[chroma-key] GPU path ${enabled ? 'enabled' : 'disabled'} — takes effect next frame`)
    } catch (err) {
      console.warn('[chroma-key] Could not persist toggle:', err)
    }
  }
}
