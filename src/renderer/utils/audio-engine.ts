import { AudioSource } from "../../shared/studio";

class AudioEngine {
  private context: AudioContext | null = null;
  private broadcastBus: AudioNode | null = null;
  private ttsBus: AudioNode | null = null;

  getContext(): AudioContext {
    if (!this.context) {
      this.context = new (window.AudioContext || (window as any).webkitAudioContext)({
        latencyHint: 'interactive',
        sampleRate: 48000
      });
      console.log('[AudioEngine] Context initialized:', this.context.sampleRate, 'Hz');
    }
    
    if (this.context.state === 'suspended') {
      void this.context.resume();
    }
    
    return this.context;
  }

  setBroadcastBus(node: AudioNode | null): void {
    this.broadcastBus = node;
  }

  getBroadcastBus(): AudioNode | null {
    return this.broadcastBus;
  }
  
  setTtsBus(node: AudioNode | null): void {
    this.ttsBus = node;
  }

  getTtsBus(): AudioNode | null {
    return this.ttsBus;
  }

  hasMixerRoute(): boolean {
    return Boolean(this.ttsBus || this.broadcastBus);
  }
}

export const audioEngine = new AudioEngine();

export interface ChannelModeStage {
  input: AudioNode;
  output: AudioNode;
  disconnect: () => void;
  setMode: (mode: 'mono' | 'stereo') => void;
}

export function createChannelModeStage(ctx: AudioContext, mode: 'mono' | 'stereo'): ChannelModeStage {
  const input = ctx.createGain();
  const output = ctx.createGain();
  const merger = ctx.createChannelMerger(2);
  const splitter = ctx.createChannelSplitter(2);

  const connect = (m: 'mono' | 'stereo') => {
    input.disconnect();
    if (m === 'mono') {
      input.connect(splitter);
      splitter.connect(merger, 0, 0);
      splitter.connect(merger, 0, 1);
      merger.connect(output);
    } else {
      input.connect(output);
    }
  };

  connect(mode);

  return {
    input,
    output,
    disconnect: () => {
      input.disconnect();
      output.disconnect();
    },
    setMode: (newMode) => {
      connect(newMode);
    }
  };
}

export function sanitizeChannelMode(mode: any, fallback: 'mono' | 'stereo'): 'mono' | 'stereo' {
  if (mode === 'mono' || mode === 'stereo') return mode;
  return fallback;
}

export function sanitizeVolume(v: any): number {
  const n = parseFloat(v);
  return isNaN(n) ? 0.8 : Math.max(0, Math.min(2, n));
}

export function sanitizePan(p: any): number {
  const n = parseFloat(p);
  return isNaN(n) ? 0 : Math.max(-1, Math.min(1, n));
}
