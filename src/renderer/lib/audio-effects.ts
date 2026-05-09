import type { VoiceModifiers } from '../../shared/app-settings'

export function createDistortionCurve(amount = 20) {
  const k = typeof amount === 'number' ? amount : 50
  const n_samples = 44100
  const curve = new Float32Array(n_samples)
  const deg = Math.PI / 180
  for (let i = 0; i < n_samples; ++i) {
    const x = (i * 2) / n_samples - 1
    curve[i] = ((3 + k) * x * 20 * deg) / (Math.PI + k * Math.abs(x))
  }
  return curve
}

export function applyVoiceEffects(
  context: AudioContext,
  source: AudioNode,
  modifiers: VoiceModifiers | { id: string, enabled: boolean },
): AudioNode {
  let lastNode = source
  const type = (modifiers as any).id || (modifiers as any).radioFilter ? 'radio' : 'none'

  // 1. Radio Filter (Aggressive High-pass + Distortion)
  if (type === 'radio' || (modifiers as any).radioFilter) {
    const highPass = context.createBiquadFilter()
    highPass.type = 'highpass'
    highPass.frequency.value = 300
    highPass.Q.value = 0.7

    const bandPass = context.createBiquadFilter()
    bandPass.type = 'bandpass'
    bandPass.frequency.value = 1500
    bandPass.Q.value = 0.5

    const distortion = context.createWaveShaper()
    distortion.curve = createDistortionCurve(10)
    distortion.oversample = '4x'

    lastNode.connect(highPass)
    highPass.connect(bandPass)
    bandPass.connect(distortion)
    lastNode = distortion
  }

  // 2. Alien (Resonant Ring Modulation-ish)
  if (type === 'alien') {
    const filter1 = context.createBiquadFilter()
    filter1.type = 'peaking'
    filter1.frequency.value = 2500
    filter1.Q.value = 10
    filter1.gain.value = 20

    const filter2 = context.createBiquadFilter()
    filter2.type = 'peaking'
    filter2.frequency.value = 4000
    filter2.Q.value = 15
    filter2.gain.value = 15

    lastNode.connect(filter1)
    filter1.connect(filter2)
    lastNode = filter2
  }

  // 2b. Chipmunk (High-pass + Brightening)
  if (type === 'chipmunk') {
    const highPass = context.createBiquadFilter()
    highPass.type = 'highpass'
    highPass.frequency.value = 1000
    
    const peaking = context.createBiquadFilter()
    peaking.type = 'peaking'
    peaking.frequency.value = 3000
    peaking.gain.value = 10

    lastNode.connect(highPass)
    highPass.connect(peaking)
    lastNode = peaking
  }

  // 3. Monster (Deep & Dark)
  if (type === 'monster') {
    const lowPass = context.createBiquadFilter()
    lowPass.type = 'lowpass'
    lowPass.frequency.value = 400
    lowPass.Q.value = 1.0

    const distortion = context.createWaveShaper()
    distortion.curve = createDistortionCurve(50)

    const gain = context.createGain()
    gain.gain.value = 1.5

    lastNode.connect(lowPass)
    lowPass.connect(distortion)
    distortion.connect(gain)
    lastNode = gain
  }

  // 4. Robot (Bitcrusher-ish / Distortion)
  if (type === 'robot') {
    const distortion = context.createWaveShaper()
    distortion.curve = createDistortionCurve(100)
    
    const filter = context.createBiquadFilter()
    filter.type = 'bandpass'
    filter.frequency.value = 1000
    filter.Q.value = 0.5

    lastNode.connect(distortion)
    distortion.connect(filter)
    lastNode = filter
  }

  // 5. Deep Space (Infinite Delay)
  if (type === 'echo' || type === 'space') {
    const delay = context.createDelay(2.0)
    delay.delayTime.value = 0.5
    
    const feedback = context.createGain()
    feedback.gain.value = 0.6

    const filter = context.createBiquadFilter()
    filter.type = 'lowpass'
    filter.frequency.value = 1000

    lastNode.connect(delay)
    delay.connect(feedback)
    feedback.connect(filter)
    filter.connect(delay) // Feedback loop

    const dryGain = context.createGain()
    dryGain.gain.value = 1.0
    const wetGain = context.createGain()
    wetGain.gain.value = 0.5

    const output = context.createGain()
    
    source.connect(dryGain)
    dryGain.connect(output)
    
    delay.connect(wetGain)
    wetGain.connect(output)
    
    lastNode = output
  }

  // 6. Telephone (Extreme Bandpass)
  if (type === 'telephone') {
    const filter = context.createBiquadFilter()
    filter.type = 'bandpass'
    filter.frequency.value = 1200
    filter.Q.value = 2.0
    
    const dist = context.createWaveShaper()
    dist.curve = createDistortionCurve(15)

    lastNode.connect(filter)
    filter.connect(dist)
    lastNode = dist
  }

  // 7. Cave (Reverb-ish Delay)
  if (type === 'cave') {
    const delay = context.createDelay(1.0)
    delay.delayTime.value = 0.15
    const feedback = context.createGain()
    feedback.gain.value = 0.4
    const filter = context.createBiquadFilter()
    filter.type = 'lowpass'
    filter.frequency.value = 800

    lastNode.connect(delay)
    delay.connect(feedback)
    feedback.connect(filter)
    filter.connect(delay)

    const mix = context.createGain()
    source.connect(mix)
    delay.connect(mix)
    lastNode = mix
  }

  // 8. Vibrato (Frequency Modulation)
  if (type === 'vibrato') {
    const delay = context.createDelay()
    const lfo = context.createOscillator()
    const lfoGain = context.createGain()

    lfo.frequency.value = 5.0 // 5Hz vibrato
    lfoGain.gain.value = 0.002 // 2ms modulation

    lfo.connect(lfoGain)
    lfoGain.connect(delay.delayTime)
    lfo.start()

    lastNode.connect(delay)
    lastNode = delay
  }

  // 9. Megaphone (Distortion + Mid boost)
  if (type === 'megaphone') {
    const filter = context.createBiquadFilter()
    filter.type = 'peaking'
    filter.frequency.value = 2000
    filter.Q.value = 1.0
    filter.gain.value = 15

    const dist = context.createWaveShaper()
    dist.curve = createDistortionCurve(40)

    lastNode.connect(filter)
    filter.connect(dist)
    lastNode = dist
  }

  // 10. Underwater (Extreme Low-pass)
  if (type === 'underwater') {
    const filter = context.createBiquadFilter()
    filter.type = 'lowpass'
    filter.frequency.value = 500
    filter.Q.value = 2.0

    const lfo = context.createOscillator()
    const lfoGain = context.createGain()
    lfo.frequency.value = 0.5
    lfoGain.gain.value = 100
    lfo.connect(lfoGain)
    lfoGain.connect(filter.frequency)
    lfo.start()

    lastNode.connect(filter)
    lastNode = filter
  }

  return lastNode
}

export function getDynamicPitchAndRate(
  text: string,
  modifiers: VoiceModifiers,
  basePitch: number,
  baseRate: number
) {
  let pitch = basePitch
  let rate = baseRate

  if (modifiers.pitchShifting === 'dynamic') {
    if (text.includes('!') || text.toLowerCase().includes('excited')) {
      pitch *= 1.15
    } else if (text.includes('...') || text.toLowerCase().includes('sarcastic')) {
      pitch *= 0.85
    }
  } else if (modifiers.pitchShifting === 'low') {
    pitch *= 0.8
  } else if (modifiers.pitchShifting === 'high') {
    pitch *= 1.2
  }

  if (modifiers.speedRamping) {
    if (text.includes('...')) {
      rate *= 0.85
    } else if (text.includes('!')) {
      rate *= 1.1
    }
  }

  return { pitch, rate }
}
