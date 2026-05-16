export function reconcileFxChain(
  ctx: AudioContext,
  state: { input: GainNode; output: GainNode; nodes: any[] },
  filters: Array<{ id: string, type: string, params: any, enabled: boolean }>
) {
  // Simple reconciliation: clear and rebuild if anything changed
  state.input.disconnect();
  for (const node of state.nodes) {
    try { node.disconnect(); } catch {}
  }
  state.nodes = [];

  let lastNode: AudioNode = state.input;

  for (const fx of filters) {
    if (!fx.enabled) continue;

    let node: AudioNode | null = null;
    try {
      switch (fx.type) {
        case 'gate': {
          const gate = ctx.createDynamicsCompressor();
          gate.threshold.value = fx.params.threshold || -48;
          gate.ratio.value = fx.params.ratio || 20;
          gate.attack.value = fx.params.attack || 0.003;
          gate.release.value = fx.params.release || 0.1;
          node = gate;
          break;
        }

        case 'compressor': {
          const comp = ctx.createDynamicsCompressor();
          comp.threshold.value = fx.params.threshold || -24;
          comp.ratio.value = fx.params.ratio || 4;
          comp.attack.value = fx.params.attack || 0.005;
          comp.release.value = fx.params.release || 0.15;
          comp.knee.value = fx.params.knee || 12;
          node = comp;
          break;
        }
        case 'limiter': {
          const lim = ctx.createDynamicsCompressor();
          lim.threshold.value = fx.params.threshold || -1;
          lim.ratio.value = 20;
          lim.attack.value = fx.params.attack || 0.001;
          lim.release.value = fx.params.release || 0.05;
          node = lim;
          break;
        }
        case 'eq': {
          const low = ctx.createBiquadFilter();
          low.type = 'lowshelf';
          low.frequency.value = 250;
          low.gain.value = fx.params.low || 0;

          const mid = ctx.createBiquadFilter();
          mid.type = 'peaking';
          mid.frequency.value = 1000;
          mid.gain.value = fx.params.mid || 0;

          const high = ctx.createBiquadFilter();
          high.type = 'highshelf';
          high.frequency.value = 4000;
          high.gain.value = fx.params.high || 0;

          low.connect(mid);
          mid.connect(high);
          node = low;
          // For multi-node FX, we store internal nodes to disconnect them later
          state.nodes.push(mid, high);
          break;
        }
        case 'gain': {
          const g = ctx.createGain();
          g.gain.value = Math.pow(10, (fx.params.gain || 0) / 20);
          node = g;
          break;
        }
        default:
          node = ctx.createGain();
      }
    } catch (e) {
      console.warn('[AudioFX] Failed to create node for', fx.type, e);
    }

    if (node) {
      lastNode.connect(node);
      // If it was the EQ chain, the "exit" node is high
      if (fx.type === 'eq') {
        lastNode = state.nodes[state.nodes.length - 1];
      } else {
        lastNode = node;
      }
      state.nodes.push(node);
    }
  }

  lastNode.connect(state.output);
}
