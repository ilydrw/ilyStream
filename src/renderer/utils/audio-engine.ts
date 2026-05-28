import { AudioSource } from "../../shared/studio";

class AudioEngine {
  private context: AudioContext | null = null;
  private broadcastBus: AudioNode | null = null;
  private masterMeterNodes: MasterMeterNodes | null = null;
  private ttsDestination: MediaStreamAudioDestinationNode | null = null;
  private soundboardDestination: MediaStreamAudioDestinationNode | null = null;
  private ttsGain: GainNode | null = null;
  private soundboardGain: GainNode | null = null;
  private sinkId: string = 'default';

  getContext(): AudioContext {
    if (!this.context || this.context.state === 'closed') {
      const AudioContextCtor = window.AudioContext || (window as any).webkitAudioContext;
      const contextOptions: AudioContextOptions[] = [
        { latencyHint: 0.003, sampleRate: 48000 },
        { latencyHint: 'interactive', sampleRate: 48000 },
        { latencyHint: 'interactive' }
      ];

      for (const options of contextOptions) {
        try {
          this.context = new AudioContextCtor(options);
          break;
        } catch {
          this.context = null;
        }
      }

      if (!this.context) this.context = new AudioContextCtor();

      // Clear gain nodes so they are recreated with the new context
      this.broadcastBus = null;
      this.masterMeterNodes = null;
      this.ttsGain = null;
      this.soundboardGain = null;
      this.ttsDestination = null;
      this.soundboardDestination = null;
      
      // Re-assert the intended hardware output device
      if (this.sinkId && this.sinkId !== 'default' && (this.context as any).setSinkId) {
        console.log('[AudioEngine] Asserting sinkId:', this.sinkId);
        (this.context as any).setSinkId(this.sinkId).catch((err: any) => {
          console.warn('[AudioEngine] Failed to set sinkId on re-init:', err);
        });
      }
      
      const baseLatencyMs = typeof this.context.baseLatency === 'number'
        ? Math.round(this.context.baseLatency * 1000)
        : null;
      const outputLatencyMs = typeof (this.context as any).outputLatency === 'number'
        ? Math.round((this.context as any).outputLatency * 1000)
        : null;
      console.log('[AudioEngine] Context initialized:', this.context.sampleRate, 'Hz', {
        baseLatencyMs,
        outputLatencyMs
      });
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

  setMasterMeterNodes(nodes: MasterMeterNodes | null): void {
    this.masterMeterNodes = nodes;
  }

  getMasterMeterNodes(): MasterMeterNodes | null {
    return this.masterMeterNodes;
  }
  
  getTtsBus(): AudioNode {
    const ctx = this.getContext();
    if (!this.ttsGain) {
      this.ttsGain = ctx.createGain();
      console.log('[AudioEngine] Internal TTS gain initialized');
    }
    return this.ttsGain;
  }

  getTtsDestination(): MediaStreamAudioDestinationNode {
    const ctx = this.getContext();
    if (!this.ttsDestination) {
      this.ttsDestination = ctx.createMediaStreamDestination();
      // Keep them in sync
      this.getTtsBus().connect(this.ttsDestination);
      console.log('[AudioEngine] Virtual TTS destination initialized');
    }
    return this.ttsDestination;
  }

  getTtsStream(): MediaStream {
    return this.getTtsDestination().stream;
  }

  getSoundboardBus(): AudioNode {
    const ctx = this.getContext();
    if (!this.soundboardGain) {
      this.soundboardGain = ctx.createGain();
      console.log('[AudioEngine] Internal Soundboard gain initialized');
    }
    return this.soundboardGain;
  }

  getSoundboardDestination(): MediaStreamAudioDestinationNode {
    const ctx = this.getContext();
    if (!this.soundboardDestination) {
      this.soundboardDestination = ctx.createMediaStreamDestination();
      // Keep them in sync
      this.getSoundboardBus().connect(this.soundboardDestination);
      console.log('[AudioEngine] Virtual Soundboard destination initialized');
    }
    return this.soundboardDestination;
  }

  getSoundboardStream(): MediaStream {
    return this.getSoundboardDestination().stream;
  }

  hasMixerRoute(): boolean {
    return Boolean(this.broadcastBus);
  }

  async setSinkId(id: string): Promise<void> {
    this.sinkId = id || 'default';
    const ctx = this.context;
    if (ctx && (ctx as any).setSinkId) {
      console.log('[AudioEngine] Setting sinkId:', this.sinkId);
      try {
        await (ctx as any).setSinkId(this.sinkId);
      } catch (err) {
        console.error('[AudioEngine] Failed to set context sinkId:', err);
        throw err;
      }
    }
  }
}

export const audioEngine = new AudioEngine();

export interface MasterMeterNodes {
  left: AnalyserNode;
  right: AnalyserNode;
}

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
      // Sum L+R into a single mono signal, then duplicate to both output
      // channels. Stereo USB interfaces (e.g. Focusrite Scarlett) expose a
      // two-channel stream even when the mic is plugged into only one input;
      // picking only channel 0 here silently drops mics wired to input 2.
      // ChannelMergerNode sums multiple connections into the same input.
      input.connect(splitter);
      splitter.connect(merger, 0, 0);
      splitter.connect(merger, 1, 0);
      splitter.connect(merger, 0, 1);
      splitter.connect(merger, 1, 1);
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
