import {
  ParticlesWidgetConfig,
  resolveParticlesWidgetConfig,
  FollowerHeartsLayerConfig,
  FallingRosesLayerConfig,
  GalaxyLayerConfig,
  GGsLayerConfig,
  HeartMeLayerConfig,
  GiftParticleLayerConfig
} from '../../../shared/widgets'
import { getAnimationCss } from './animation-utils'

// Hard ceiling on concurrent particles across all layers. A flood of gifts or
// likes can otherwise stack unbounded bursts, which both tanks the frame rate
// and fills the whole screen. The budget keeps the widget cheap and contained
// no matter how many events arrive.
const PARTICLE_BUDGET = 180
// Cap pending bursts so a spike of events can't queue thousands of particles.
const MAX_BURST_QUEUE = 4

function jsString(value: string): string {
  return JSON.stringify(String(value)).replace(/</g, '\\u003c')
}

function jsStringArray(values: string[]): string {
  return JSON.stringify(values.map(value => String(value))).replace(/</g, '\\u003c')
}

// Static two-stop gradients only. The old defs animated stop-color and rotated
// the gradient transform with SMIL `repeatCount="indefinite"`, which runs on the
// CPU forever (even with no particles) and is unreliable in OBS's embedded
// Chromium. No SVG <filter> is used anywhere — feGaussianBlur / feMerge render
// as opaque black boxes in CEF and are the main "covers the whole screen" bug.
function buildDefs(cfg: ParticlesWidgetConfig): string {
  const parts: string[] = []

  const heartSymbol = (id: string, gradId: string) => `
      <symbol id="${id}" viewBox="-5 -5 42 42">
        <path fill="rgba(0,0,0,0.55)" d="M16 4C19.3333 1 24.3333 1 27.6667 4.33333C31 7.66667 31 12.6667 27.6667 16L16 27.6667L4.33333 16C1 12.6667 1 7.66667 4.33333 4.33333C7.66667 1 12.6667 1 16 4Z"/>
        <path fill="none" stroke="url(#${gradId})" stroke-width="4" stroke-linecap="round" d="M16 4C19.3333 1 24.3333 1 27.6667 4.33333C31 7.66667 31 12.6667 27.6667 16L16 27.6667L4.33333 16C1 12.6667 1 7.66667 4.33333 4.33333C7.66667 1 12.6667 1 16 4Z"/>
      </symbol>`

  const grad = (id: string, from: string, to: string) => `
      <linearGradient id="${id}" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="${from}"/>
        <stop offset="100%" stop-color="${to}"/>
      </linearGradient>`

  if (cfg.followerHearts.enabled) {
    const h = cfg.followerHearts
    parts.push(grad('fh-grad', h.primaryColor, h.secondaryColor) + heartSymbol('fh-sym', 'fh-grad'))
  }

  if (cfg.heartMe.enabled) {
    const h = cfg.heartMe
    parts.push(grad('hm-grad', h.primaryColor, h.secondaryColor) + heartSymbol('hm-sym', 'hm-grad'))
  }

  if (cfg.fallingRoses.enabled) {
    const r = cfg.fallingRoses
    parts.push(grad('rose-grad', r.primaryColor, r.secondaryColor) + `
      <symbol id="rose-sym" viewBox="0 0 100 100">
        <path fill="rgba(0,0,0,0.55)" stroke="url(#rose-grad)" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round" d="M 45,48 C 45,43 55,42 53,49 C 52,53 47,52 45,48 Z"/>
        <path fill="rgba(0,0,0,0.55)" stroke="url(#rose-grad)" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round" d="M 43,45 C 40,38 58,35 60,45 C 62,55 45,58 43,45 Z"/>
        <path fill="rgba(0,0,0,0.55)" stroke="url(#rose-grad)" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round" d="M 38,48 C 35,35 65,30 68,48 C 70,60 40,65 38,48 Z"/>
        <path fill="rgba(0,0,0,0.55)" stroke="url(#rose-grad)" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round" d="M 38,48 C 30,55 35,70 50,70 C 60,70 65,60 68,48 C 65,55 45,58 38,48 Z"/>
        <path fill="rgba(0,0,0,0.55)" stroke="url(#rose-grad)" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round" d="M 38,48 C 25,40 30,20 50,22 C 65,25 65,35 60,45 C 55,35 40,35 38,48 Z"/>
        <path fill="rgba(0,0,0,0.55)" stroke="url(#rose-grad)" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round" d="M 28,45 C 15,50 15,75 40,85 C 55,90 75,80 80,60 C 85,45 75,30 68,48 C 75,55 55,75 40,70 C 30,65 25,55 28,45 Z"/>
        <path fill="rgba(0,0,0,0.55)" stroke="url(#rose-grad)" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round" d="M 40,22 C 20,15 5,35 15,55 C 20,65 30,70 40,70 C 25,65 15,50 25,35 C 30,25 45,25 50,30 C 55,20 45,15 40,22 Z"/>
        <path fill="rgba(0,0,0,0.55)" stroke="url(#rose-grad)" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round" d="M 60,25 C 75,15 95,30 90,55 C 88,65 78,75 68,75 C 80,65 85,45 75,35 C 70,30 55,30 50,35 C 50,25 60,20 60,25 Z"/>
        <path fill="rgba(0,0,0,0.55)" stroke="url(#rose-grad)" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round" d="M 15,55 C 0,70 15,95 45,95 C 65,95 85,90 95,70 C 98,55 90,40 85,45 C 90,55 80,80 50,85 C 25,85 10,70 20,55 Z"/>
        <path fill="rgba(0,0,0,0.55)" stroke="url(#rose-grad)" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round" d="M 30,25 C 10,5 50,0 70,10 C 85,15 95,30 90,40 C 85,25 70,15 55,15 C 40,15 25,25 20,40 C 15,30 20,15 30,25 Z"/>
      </symbol>`)
  }

  if (cfg.galaxy.enabled) {
    const g = cfg.galaxy
    // No glow filter — a plain gradient star plus a white core reads as a spark
    // and renders identically (and cheaply) in OBS CEF.
    parts.push(grad('galaxy-grad', g.primaryColor, g.secondaryColor) + `
      <symbol id="galaxy-sym" viewBox="-10 -10 20 20">
        <path fill="url(#galaxy-grad)" d="M0,-7 L1.2,-1.2 L7,0 L1.2,1.2 L0,7 L-1.2,1.2 L-7,0 L-1.2,-1.2Z"/>
        <circle cx="0" cy="0" r="1.4" fill="white" opacity="0.95"/>
      </symbol>`)
  }

  return parts.length ? '<defs>' + parts.join('') + '</defs>' : '<defs></defs>'
}

function buildContainers(cfg: ParticlesWidgetConfig): string {
  const parts: string[] = []
  if (cfg.followerHearts.enabled) parts.push('<g id="fh-container"></g>')
  if (cfg.fallingRoses.enabled)   parts.push('<g id="rose-container"></g>')
  if (cfg.galaxy.enabled)         parts.push('<g id="galaxy-container"></g>')
  if (cfg.ggs.enabled)            parts.push('<g id="ggs-container"></g>')
  if (cfg.heartMe.enabled)        parts.push('<g id="hm-container"></g>')
  if (cfg.bubbles.enabled)        parts.push('<g id="bubbles-container"></g>')
  if (cfg.confetti.enabled)       parts.push('<g id="confetti-container"></g>')
  if (cfg.fireworks.enabled)      parts.push('<g id="fireworks-container"></g>')
  if (cfg.lightning.enabled)      parts.push('<g id="lightning-container"></g>')
  if (cfg.moneyRain.enabled)      parts.push('<g id="money-container"></g>')
  return parts.join('\n    ')
}

function buildFollowerHeartsScript(h: FollowerHeartsLayerConfig, _isPreview: boolean): string {
  const safeText = h.text.replace(/\\/g, '\\\\').replace(/'/g, "\\'")
  return `
(function() {
  var container = document.getElementById('fh-container');
  if (!container) return;
  var particles = [];
  var cfg = {
    count: ${h.count}, baseSpeed: ${h.speed},
    wobbleAmp: 30, wobbleFreq: 0.015,
    scaleMin: ${h.scale * 0.7}, scaleMax: ${h.scale * 1.2},
    textColor: '${h.textColor}', text: '${safeText}',
    audioReactive: ${h.audioReactive === true}, maxLifetimeMs: 15000
  };
  var NS = 'http://www.w3.org/2000/svg';
  var XL = 'http://www.w3.org/1999/xlink';
  function mkParticle(x) {
    var sc = rnd(cfg.scaleMin, cfg.scaleMax);
    var g = document.createElementNS(NS, 'g');
    var u = document.createElementNS(NS, 'use');
    u.setAttributeNS(XL, 'href', '#fh-sym');
    u.setAttribute('width', '40'); u.setAttribute('height', '40');
    u.setAttribute('x', '-20'); u.setAttribute('y', '-20');
    g.appendChild(u);
    var t = document.createElementNS(NS, 'text');
    t.setAttribute('x', '0'); t.setAttribute('y', '2');
    t.setAttribute('font-family', "'Inter',sans-serif");
    t.setAttribute('font-weight', '700');
    t.setAttribute('font-size', '12px');
    t.setAttribute('fill', cfg.textColor);
    t.setAttribute('text-anchor', 'middle');
    t.textContent = cfg.text || 'ily!';
    g.appendChild(t);
    container.appendChild(g);
    return { dom: g, x: x + rnd(-5, 5), y: 110, spd: cfg.baseSpeed * sc, sc: sc, wo: rnd(0, 6.28), age: 0, bornAt: Date.now(), op: -1 };
  }
  function update() {
    for (var i = particles.length - 1; i >= 0; i--) {
      var p = particles[i];
      p.y -= p.spd; p.age++;
      var wx = Math.sin((p.age + p.wo) * cfg.wobbleFreq) * cfg.wobbleAmp / (10 + p.sc);
      var lf = Math.max(0, p.y) / 100;
      var op = lf < 0.2 ? Math.max(0, lf / 0.2) : 1;
      var volScale = audioScale(cfg.audioReactive);
      p.dom.setAttribute('transform', 'translate(' + ((p.x + wx) * 10) + ',' + (p.y * 10) + ') scale(' + (p.sc * volScale) + ')');
      if (op !== p.op) { p.dom.style.opacity = op; p.op = op; }
      if (p.y < -20 || op <= 0.001 || Date.now() - p.bornAt >= cfg.maxLifetimeMs) {
        container.removeChild(p.dom); particles.splice(i, 1); releaseParticle();
      }
    }
  }
  var burstQueue = 0;
  var isBursting = false;
  function processQueue() {
    if (burstQueue <= 0) { isBursting = false; return; }
    isBursting = true;
    burstQueue--;
    for (var i = 0; i < cfg.count; i++) {
      (function(idx) { setTimeout(function() { spawn(particles, mkParticle, rnd(10, 90)); }, idx * 50); })(i);
    }
    setTimeout(processQueue, Math.max(2500, (cfg.count * 50) + 1500));
  }
  function queueBurst() {
    if (burstQueue < ${MAX_BURST_QUEUE}) burstQueue++;
    if (!isBursting) processQueue();
  }
  layers.push({
    update: update,
    onEvent: function(ev) { if (ev.type === 'follow') queueBurst(); },
    trigger: queueBurst
  });
})();`
}

function buildFallingRosesScript(r: FallingRosesLayerConfig, _isPreview: boolean): string {
  return `
(function() {
  var container = document.getElementById('rose-container');
  if (!container) return;
  var particles = [];
  var cfg = {
    count: ${r.count}, baseSpeed: ${r.speed}, scale: ${r.scale}, wobbleAmp: 12, wobbleFreq: 0.015,
    giftIds: ${jsStringArray(r.giftIds)}, giftNames: ${jsStringArray(r.giftNames)},
    audioReactive: ${r.audioReactive === true}, maxLifetimeMs: 15000
  };
  var NS = 'http://www.w3.org/2000/svg';
  var XL = 'http://www.w3.org/1999/xlink';
  function mkParticle(x, startY) {
    // Roses render at a fixed 30px base (0.3 of the symbol's 100-unit box) so
    // scale behaves like the other layers. Without explicit width/height the
    // <use> sizes against the 1000-unit SVG viewport and roses balloon to
    // ~10x, swallowing the whole screen.
    var sc = rnd(0.24, 0.42) * cfg.scale;
    var g = document.createElementNS(NS, 'g');
    var u = document.createElementNS(NS, 'use');
    u.setAttributeNS(XL, 'href', '#rose-sym');
    u.setAttribute('width', '100'); u.setAttribute('height', '100');
    u.setAttribute('x', '0'); u.setAttribute('y', '0');
    g.appendChild(u);
    container.appendChild(g);
    return {
      dom: g, x: x + rnd(-3, 3), y: startY !== undefined ? startY : rnd(-20, -5),
      spd: cfg.baseSpeed * rnd(0.8, 1.4), sc: sc, rot: rnd(-180, 180), rotSpd: rnd(-0.8, 0.8),
      wo: rnd(0, 6.28), age: 0, bornAt: Date.now(), op: -1
    };
  }
  function update() {
    for (var i = particles.length - 1; i >= 0; i--) {
      var p = particles[i];
      p.y += p.spd; p.age++;
      p.rot += p.rotSpd;
      var wx = Math.sin((p.age + p.wo) * cfg.wobbleFreq) * (cfg.wobbleAmp / 10);
      var lf = p.y / 100;
      var op = lf > 0.85 ? Math.max(0, 1 - ((lf - 0.85) / 0.15)) : 1;
      var volScale = audioScale(cfg.audioReactive);
      p.dom.setAttribute('transform', 'translate(' + ((p.x + wx) * 10) + ',' + (p.y * 10) + ') scale(' + (p.sc * volScale) + ') rotate(' + p.rot + ') translate(-50,-50)');
      if (op !== p.op) { p.dom.style.opacity = op; p.op = op; }
      if (p.y > 115 || op <= 0.001 || Date.now() - p.bornAt >= cfg.maxLifetimeMs) {
        container.removeChild(p.dom); particles.splice(i, 1); releaseParticle();
      }
    }
  }
  var burstQueue = 0;
  var isBursting = false;
  function processQueue() {
    if (burstQueue <= 0) { isBursting = false; return; }
    isBursting = true;
    burstQueue--;
    for (var i = 0; i < cfg.count; i++) {
      (function(idx) { setTimeout(function() { spawn(particles, mkParticle, rnd(2, 98)); }, idx * 50); })(i);
    }
    setTimeout(processQueue, Math.max(3000, (cfg.count * 50) + 2000));
  }
  function queueBurst() {
    if (burstQueue < ${MAX_BURST_QUEUE}) burstQueue++;
    if (!isBursting) processQueue();
  }
  layers.push({
    update: update,
    onEvent: function(ev) {
      if (!isTikTokGift(ev)) return;
      if (!giftSelectionMatches(ev, cfg.giftIds, cfg.giftNames)) return;
      queueBurst();
    },
    trigger: queueBurst
  });
})();`
}

function buildGalaxyScript(g: GalaxyLayerConfig, _isPreview: boolean): string {
  return `
(function() {
  var container = document.getElementById('galaxy-container');
  if (!container) return;
  var particles = [];
  var cfg = {
    count: ${g.count}, baseSpeed: ${g.speed}, scale: ${g.scale}, wobbleAmp: 20, wobbleFreq: 0.01,
    giftIds: ${jsStringArray(g.giftIds)}, giftNames: ${jsStringArray(g.giftNames)},
    audioReactive: ${g.audioReactive === true}, maxLifetimeMs: 15000
  };
  var NS = 'http://www.w3.org/2000/svg';
  var XL = 'http://www.w3.org/1999/xlink';
  function mkParticle(x, startY) {
    var sc = rnd(0.4, 1.0) * cfg.scale;
    var g = document.createElementNS(NS, 'g');
    var u = document.createElementNS(NS, 'use');
    u.setAttributeNS(XL, 'href', '#galaxy-sym');
    u.setAttribute('width', '20'); u.setAttribute('height', '20');
    u.setAttribute('x', '-10'); u.setAttribute('y', '-10');
    g.appendChild(u);
    container.appendChild(g);
    return { dom: g, x: x + rnd(-10, 10), y: startY !== undefined ? startY : rnd(-30, -5), spd: cfg.baseSpeed * sc, sc: sc, wo: rnd(0, 6.28), age: 0, bornAt: Date.now(), op: -1 };
  }
  function update() {
    for (var i = particles.length - 1; i >= 0; i--) {
      var p = particles[i];
      p.y += p.spd; p.age++;
      var wx = Math.sin((p.age + p.wo) * cfg.wobbleFreq) * cfg.wobbleAmp / (10 + p.sc);
      var lf = p.y / 100;
      var op = lf > 0.85 ? Math.max(0, 1 - ((lf - 0.85) / 0.15)) : 1;
      var volScale = audioScale(cfg.audioReactive);
      p.dom.setAttribute('transform', 'translate(' + ((p.x + wx) * 10) + ',' + (p.y * 10) + ') scale(' + (p.sc * volScale) + ')');
      if (op !== p.op) { p.dom.style.opacity = op; p.op = op; }
      if (p.y > 115 || op <= 0.001 || Date.now() - p.bornAt >= cfg.maxLifetimeMs) {
        container.removeChild(p.dom); particles.splice(i, 1); releaseParticle();
      }
    }
  }
  var burstQueue = 0;
  var isBursting = false;
  function processQueue() {
    if (burstQueue <= 0) { isBursting = false; return; }
    isBursting = true;
    burstQueue--;
    for (var i = 0; i < cfg.count; i++) {
      (function(idx) { setTimeout(function() { spawn(particles, mkParticle, rnd(5, 95)); }, idx * 30); })(i);
    }
    setTimeout(processQueue, Math.max(4000, (cfg.count * 30) + 3000));
  }
  function queueBurst() {
    if (burstQueue < ${MAX_BURST_QUEUE}) burstQueue++;
    if (!isBursting) processQueue();
  }
  layers.push({
    update: update,
    onEvent: function(ev) {
      if (!isTikTokGift(ev)) return;
      if (!giftSelectionMatches(ev, cfg.giftIds, cfg.giftNames)) return;
      queueBurst();
    },
    trigger: queueBurst
  });
})();`
}

function buildGGsScript(g: GGsLayerConfig, _isPreview: boolean): string {
  const safeText = g.text.replace(/\\/g, '\\\\').replace(/'/g, "\\'")
  return `
(function() {
  var container = document.getElementById('ggs-container');
  if (!container) return;
  var particles = [];
  var cfg = {
    count: ${g.count}, baseSpeed: ${g.speed}, scale: ${g.scale},
    color: '${g.color}', text: '${safeText}',
    giftIds: ${jsStringArray(g.giftIds)}, giftNames: ${jsStringArray(g.giftNames)},
    wobbleAmp: 18, wobbleFreq: 0.014,
    audioReactive: ${g.audioReactive === true}, maxLifetimeMs: 15000
  };
  var NS = 'http://www.w3.org/2000/svg';
  var sizes = ['48px','56px','64px','40px','52px'];
  function mkParticle(x) {
    var sc = rnd(0.7, 1.3) * cfg.scale;
    var sz = sizes[Math.floor(Math.random() * sizes.length)];
    var g = document.createElementNS(NS, 'text');
    g.setAttribute('x', '0'); g.setAttribute('y', '0');
    g.setAttribute('font-family', "'Inter',sans-serif");
    g.setAttribute('font-weight', '900');
    g.setAttribute('font-size', sz);
    g.setAttribute('fill', cfg.color);
    // Cheap stroke outline for contrast; SVG filters break in OBS CEF.
    g.setAttribute('stroke', 'rgba(0,0,0,0.55)');
    g.setAttribute('stroke-width', '2');
    g.setAttribute('paint-order', 'stroke');
    g.setAttribute('text-anchor', 'middle');
    g.setAttribute('dominant-baseline', 'middle');
    g.textContent = cfg.text;
    container.appendChild(g);
    return { dom: g, x: x + rnd(-8, 8), y: rnd(-30, -5), spd: cfg.baseSpeed * sc * 0.6, sc: sc, wo: rnd(0, 6.28), age: 0, bornAt: Date.now(), op: -1 };
  }
  function update() {
    for (var i = particles.length - 1; i >= 0; i--) {
      var p = particles[i];
      p.y += p.spd; p.age++;
      var wx = Math.sin((p.age + p.wo) * cfg.wobbleFreq) * cfg.wobbleAmp / (10 + p.sc);
      var lf = p.y / 100;
      var op = lf > 0.85 ? Math.max(0, 1 - ((lf - 0.85) / 0.15)) : 1;
      var volScale = audioScale(cfg.audioReactive);
      p.dom.setAttribute('transform', 'translate(' + ((p.x + wx) * 10) + ',' + (p.y * 10) + ') scale(' + (p.sc * volScale) + ')');
      if (op !== p.op) { p.dom.style.opacity = op; p.op = op; }
      if (p.y > 115 || op <= 0.001 || Date.now() - p.bornAt >= cfg.maxLifetimeMs) {
        container.removeChild(p.dom); particles.splice(i, 1); releaseParticle();
      }
    }
  }
  var burstQueue = 0;
  var isBursting = false;
  function processQueue() {
    if (burstQueue <= 0) { isBursting = false; return; }
    isBursting = true;
    burstQueue--;
    for (var i = 0; i < cfg.count; i++) {
      (function(idx) { setTimeout(function() { spawn(particles, mkParticle, rnd(10, 90)); }, idx * 80); })(i);
    }
    setTimeout(processQueue, Math.max(3000, (cfg.count * 80) + 1500));
  }
  function queueBurst() {
    if (burstQueue < ${MAX_BURST_QUEUE}) burstQueue++;
    if (!isBursting) processQueue();
  }
  layers.push({
    update: update,
    onEvent: function(ev) {
      if (!isTikTokGift(ev)) return;
      if (!giftSelectionMatches(ev, cfg.giftIds, cfg.giftNames)) return;
      queueBurst();
    },
    trigger: queueBurst
  });
})();`
}

type GiftRainKind = 'confetti' | 'lightning' | 'money'

interface GiftRainOptions {
  containerId: string
  kind: GiftRainKind
  maxCount: number
  spawnDelayMs: number
  speedMultiplier: number
  wobbleAmp: number
}

function buildGiftRainScript(layer: GiftParticleLayerConfig, options: GiftRainOptions): string {
  const shapeScript = options.kind === 'confetti'
    ? `
    var shape = document.createElementNS(NS, 'rect');
    shape.setAttribute('x', '-5'); shape.setAttribute('y', '-9');
    shape.setAttribute('width', '10'); shape.setAttribute('height', '18');
    shape.setAttribute('rx', '2');
    shape.setAttribute('fill', Math.random() < 0.5 ? cfg.primary : cfg.secondary);
    g.appendChild(shape);`
    : options.kind === 'lightning'
      ? `
    var shape = document.createElementNS(NS, 'path');
    shape.setAttribute('d', 'M-4,-16 L8,-16 L1,-3 L9,-3 L-8,18 L-2,4 L-10,4 Z');
    shape.setAttribute('fill', Math.random() < 0.5 ? cfg.primary : cfg.secondary);
    g.appendChild(shape);`
      : `
    var shape = document.createElementNS(NS, 'text');
    shape.setAttribute('x', '0'); shape.setAttribute('y', '0');
    shape.setAttribute('font-family', "'Inter',sans-serif");
    shape.setAttribute('font-weight', '900');
    shape.setAttribute('font-size', '34px');
    shape.setAttribute('text-anchor', 'middle');
    shape.setAttribute('dominant-baseline', 'middle');
    shape.setAttribute('paint-order', 'stroke');
    shape.setAttribute('stroke', 'rgba(0,0,0,0.45)');
    shape.setAttribute('stroke-width', '2');
    shape.setAttribute('fill', giftContains(ev, ['diamond', 'gem']) ? cfg.secondary : cfg.primary);
    shape.textContent = giftContains(ev, ['diamond', 'gem']) ? '◆' : '$';
    g.appendChild(shape);`

  return `
(function() {
  var container = document.getElementById('${options.containerId}');
  if (!container) return;
  var particles = [];
  var cfg = {
    count: ${layer.count}, baseSpeed: ${layer.speed}, scale: ${layer.scale},
    primary: ${jsString(layer.primaryColor)}, secondary: ${jsString(layer.secondaryColor)},
    giftIds: ${jsStringArray(layer.giftIds)}, giftNames: ${jsStringArray(layer.giftNames)},
    audioReactive: ${layer.audioReactive === true}, maxLifetimeMs: 15000
  };
  var NS = 'http://www.w3.org/2000/svg';
  function mkParticle(x, startY, ev) {
    var sc = rnd(0.7, 1.25) * cfg.scale;
    var g = document.createElementNS(NS, 'g');${shapeScript}
    container.appendChild(g);
    return {
      dom: g, x: x + rnd(-4, 4), y: startY !== undefined ? startY : rnd(-18, -4),
      spd: Math.max(0, cfg.baseSpeed) * rnd(0.75, 1.3) * ${options.speedMultiplier},
      drift: rnd(-0.08, 0.08), sc: sc, rot: rnd(-180, 180), rotSpd: rnd(-2.2, 2.2),
      wo: rnd(0, 6.28), age: 0, bornAt: Date.now(), op: -1
    };
  }
  function update() {
    for (var i = particles.length - 1; i >= 0; i--) {
      var p = particles[i];
      p.y += p.spd; p.x += p.drift; p.rot += p.rotSpd; p.age++;
      var wx = Math.sin((p.age + p.wo) * 0.035) * ${options.wobbleAmp};
      var op = p.y > 82 ? Math.max(0, 1 - ((p.y - 82) / 20)) : 1;
      var volScale = audioScale(cfg.audioReactive);
      p.dom.setAttribute('transform', 'translate(' + ((p.x + wx) * 10) + ',' + (p.y * 10) + ') rotate(' + p.rot + ') scale(' + (p.sc * volScale) + ')');
      if (op !== p.op) { p.dom.style.opacity = op; p.op = op; }
      if (p.y > 115 || op <= 0.001 || Date.now() - p.bornAt >= cfg.maxLifetimeMs) {
        container.removeChild(p.dom); particles.splice(i, 1); releaseParticle();
      }
    }
  }
  var burstQueue = [];
  var isBursting = false;
  function processQueue() {
    if (burstQueue.length === 0) { isBursting = false; return; }
    isBursting = true;
    var ev = burstQueue.shift();
    var count = giftBurstCount(cfg.count, ev, ${options.maxCount});
    for (var i = 0; i < count; i++) {
      (function(idx) {
        setTimeout(function() { spawn(particles, mkParticle, rnd(3, 97), undefined, ev); }, idx * ${options.spawnDelayMs});
      })(i);
    }
    setTimeout(processQueue, Math.max(1400, (count * ${options.spawnDelayMs}) + 700));
  }
  function queueBurst(ev) {
    if (burstQueue.length < ${MAX_BURST_QUEUE}) burstQueue.push(ev || null);
    if (!isBursting) processQueue();
  }
  layers.push({
    update: update,
    onEvent: function(ev) {
      if (!isTikTokGift(ev) || !giftSelectionMatches(ev, cfg.giftIds, cfg.giftNames)) return;
      queueBurst(ev);
    },
    trigger: function() { queueBurst(null); }
  });
})();`
}

function buildBubblesScript(layer: GiftParticleLayerConfig): string {
  return `
(function() {
  var container = document.getElementById('bubbles-container');
  if (!container) return;
  var particles = [];
  var cfg = {
    count: ${layer.count}, baseSpeed: ${layer.speed}, scale: ${layer.scale},
    primary: ${jsString(layer.primaryColor)}, secondary: ${jsString(layer.secondaryColor)},
    giftIds: ${jsStringArray(layer.giftIds)}, giftNames: ${jsStringArray(layer.giftNames)},
    audioReactive: ${layer.audioReactive === true}, maxLifetimeMs: 15000
  };
  var NS = 'http://www.w3.org/2000/svg';
  function mkParticle(x, startY) {
    var g = document.createElementNS(NS, 'g');
    var radius = rnd(11, 25);
    var bubble = document.createElementNS(NS, 'circle');
    bubble.setAttribute('cx', '0'); bubble.setAttribute('cy', '0');
    bubble.setAttribute('r', String(radius));
    bubble.setAttribute('fill', cfg.secondary);
    bubble.setAttribute('fill-opacity', '0.09');
    bubble.setAttribute('stroke', Math.random() < 0.5 ? cfg.primary : cfg.secondary);
    bubble.setAttribute('stroke-width', String(rnd(1.5, 3)));
    g.appendChild(bubble);
    var highlight = document.createElementNS(NS, 'circle');
    highlight.setAttribute('cx', String(-radius * 0.34));
    highlight.setAttribute('cy', String(-radius * 0.34));
    highlight.setAttribute('r', String(Math.max(2, radius * 0.16)));
    highlight.setAttribute('fill', cfg.primary);
    highlight.setAttribute('fill-opacity', '0.72');
    g.appendChild(highlight);
    container.appendChild(g);
    return {
      dom: g, x: x + rnd(-4, 4), y: startY !== undefined ? startY : rnd(102, 112),
      spd: Math.max(0.18, cfg.baseSpeed) * rnd(0.55, 1.15), drift: rnd(-0.035, 0.035),
      sc: cfg.scale * rnd(0.72, 1.28), wo: rnd(0, Math.PI * 2), age: 0,
      bornAt: Date.now(), op: -1
    };
  }
  function update() {
    for (var i = particles.length - 1; i >= 0; i--) {
      var p = particles[i];
      p.y -= p.spd; p.x += p.drift; p.age++;
      var wobble = Math.sin((p.age * 0.035) + p.wo) * 2.2;
      var pulse = 1 + (Math.sin((p.age * 0.08) + p.wo) * 0.05);
      var op = p.y < 18 ? Math.max(0, (p.y + 8) / 26) : Math.min(1, p.age / 12);
      var volScale = audioScale(cfg.audioReactive);
      p.dom.setAttribute('transform', 'translate(' + ((p.x + wobble) * 10) + ',' + (p.y * 10) + ') scale(' + (p.sc * pulse * volScale) + ')');
      if (op !== p.op) { p.dom.style.opacity = op; p.op = op; }
      if (p.y < -10 || op <= 0.001 || Date.now() - p.bornAt >= cfg.maxLifetimeMs) {
        container.removeChild(p.dom); particles.splice(i, 1); releaseParticle();
      }
    }
  }
  var burstQueue = [];
  var isBursting = false;
  function processQueue() {
    if (burstQueue.length === 0) { isBursting = false; return; }
    isBursting = true;
    var ev = burstQueue.shift();
    var count = giftBurstCount(cfg.count, ev, 90);
    for (var i = 0; i < count; i++) {
      (function(idx) {
        setTimeout(function() { spawn(particles, mkParticle, rnd(5, 95), undefined, ev); }, idx * 36);
      })(i);
    }
    setTimeout(processQueue, Math.max(1600, (count * 36) + 650));
  }
  function queueBurst(ev) {
    if (burstQueue.length < ${MAX_BURST_QUEUE}) burstQueue.push(ev || null);
    if (!isBursting) processQueue();
  }
  layers.push({
    update: update,
    onEvent: function(ev) {
      if (!isTikTokGift(ev) || !giftSelectionMatches(ev, cfg.giftIds, cfg.giftNames)) return;
      queueBurst(ev);
    },
    trigger: function() { queueBurst(null); }
  });
})();`
}

function buildFireworksScript(layer: GiftParticleLayerConfig): string {
  return `
(function() {
  var container = document.getElementById('fireworks-container');
  if (!container) return;
  var particles = [];
  var cfg = {
    count: ${layer.count}, baseSpeed: ${layer.speed}, scale: ${layer.scale},
    primary: ${jsString(layer.primaryColor)}, secondary: ${jsString(layer.secondaryColor)},
    giftIds: ${jsStringArray(layer.giftIds)}, giftNames: ${jsStringArray(layer.giftNames)},
    audioReactive: ${layer.audioReactive === true}, maxLifetimeMs: 12000
  };
  var NS = 'http://www.w3.org/2000/svg';
  function colorAt(index) {
    if (index % 5 === 0) return '#FFFFFF';
    return index % 2 === 0 ? cfg.primary : cfg.secondary;
  }
  function mkRocket(x, targetY, context) {
    var g = document.createElementNS(NS, 'g');
    var trail = document.createElementNS(NS, 'line');
    trail.setAttribute('x1', '0'); trail.setAttribute('y1', '4');
    trail.setAttribute('x2', '0'); trail.setAttribute('y2', String(22 * cfg.scale));
    trail.setAttribute('stroke', cfg.secondary);
    trail.setAttribute('stroke-width', String(2.2 * cfg.scale));
    trail.setAttribute('stroke-linecap', 'round');
    trail.setAttribute('stroke-opacity', '0.7');
    g.appendChild(trail);
    var head = document.createElementNS(NS, 'circle');
    head.setAttribute('cx', '0'); head.setAttribute('cy', '0');
    head.setAttribute('r', String(3.4 * cfg.scale));
    head.setAttribute('fill', cfg.primary);
    head.setAttribute('stroke', '#FFFFFF');
    head.setAttribute('stroke-width', String(1.2 * cfg.scale));
    g.appendChild(head);
    container.appendChild(g);
    return {
      kind: 'rocket', dom: g, x: x, y: 105, targetY: targetY,
      vx: rnd(-0.055, 0.055), vy: -Math.max(0.55, cfg.baseSpeed * 0.72) * rnd(0.88, 1.12),
      sparkCount: context.sparkCount, age: 0, bornAt: Date.now(), op: -1
    };
  }
  function mkSpark(x, y, context) {
    var angle = context.angle;
    var velocity = Math.max(0.42, cfg.baseSpeed * 0.76) * rnd(0.72, 1.32);
    var color = colorAt(context.index);
    var g = document.createElementNS(NS, 'g');
    var tail = document.createElementNS(NS, 'line');
    tail.setAttribute('x1', '0'); tail.setAttribute('y1', '0');
    tail.setAttribute('x2', String(-Math.cos(angle) * 13 * cfg.scale));
    tail.setAttribute('y2', String(-Math.sin(angle) * 13 * cfg.scale));
    tail.setAttribute('stroke', color);
    tail.setAttribute('stroke-width', String(rnd(1.2, 2.5) * cfg.scale));
    tail.setAttribute('stroke-linecap', 'round');
    g.appendChild(tail);
    var head = document.createElementNS(NS, 'circle');
    head.setAttribute('cx', '0'); head.setAttribute('cy', '0');
    head.setAttribute('r', String(rnd(1.8, 3.4) * cfg.scale));
    head.setAttribute('fill', color);
    g.appendChild(head);
    container.appendChild(g);
    return {
      kind: 'spark', dom: g, x: x, y: y,
      vx: Math.cos(angle) * velocity, vy: Math.sin(angle) * velocity,
      age: 0, life: rnd(68, 108), bornAt: Date.now(), op: -1
    };
  }
  function explode(rocket) {
    var count = Math.max(12, rocket.sparkCount);
    for (var index = 0; index < count; index++) {
      var ringAngle = (Math.PI * 2 * index / count) + rnd(-0.055, 0.055);
      spawn(particles, mkSpark, rocket.x, rocket.y, { angle: ringAngle, index: index });
    }
  }
  function update() {
    for (var i = particles.length - 1; i >= 0; i--) {
      var p = particles[i];
      p.age++;
      if (p.kind === 'rocket') {
        p.x += p.vx; p.y += p.vy; p.vy += 0.006;
        var rocketScale = audioScale(cfg.audioReactive);
        p.dom.setAttribute('transform', 'translate(' + (p.x * 10) + ',' + (p.y * 10) + ') scale(' + rocketScale + ')');
        p.dom.style.opacity = Math.min(1, p.age / 5);
        if (Date.now() - p.bornAt >= cfg.maxLifetimeMs) {
          container.removeChild(p.dom); particles.splice(i, 1); releaseParticle();
          continue;
        }
        if (p.y <= p.targetY || p.age >= 120) {
          container.removeChild(p.dom); particles.splice(i, 1); releaseParticle();
          explode(p);
        }
        continue;
      }
      p.x += p.vx; p.y += p.vy;
      p.vx *= 0.986; p.vy = (p.vy * 0.986) + 0.014;
      var op = Math.max(0, 1 - (p.age / p.life));
      if (p.age < 8) op = Math.min(1, p.age / 3);
      var volScale = audioScale(cfg.audioReactive);
      p.dom.setAttribute('transform', 'translate(' + (p.x * 10) + ',' + (p.y * 10) + ') scale(' + volScale + ')');
      if (op !== p.op) { p.dom.style.opacity = op; p.op = op; }
      if (p.age >= p.life || op <= 0.001 || Date.now() - p.bornAt >= cfg.maxLifetimeMs) {
        container.removeChild(p.dom); particles.splice(i, 1); releaseParticle();
      }
    }
  }
  var burstQueue = [];
  var isBursting = false;
  function processQueue() {
    if (burstQueue.length === 0) { isBursting = false; return; }
    isBursting = true;
    var ev = burstQueue.shift();
    var sparkCount = giftBurstCount(cfg.count, ev, 72);
    var rocketCount = Math.min(3, Math.max(1, Math.round(giftIntensity(ev))));
    for (var i = 0; i < rocketCount; i++) {
      (function(idx) {
        setTimeout(function() {
          spawn(particles, mkRocket, rnd(16, 84), rnd(20, 56), { sparkCount: sparkCount });
        }, idx * 420);
      })(i);
    }
    setTimeout(processQueue, 2800 + (rocketCount * 420));
  }
  function queueBurst(ev) {
    if (burstQueue.length < ${MAX_BURST_QUEUE}) burstQueue.push(ev || null);
    if (!isBursting) processQueue();
  }
  layers.push({
    update: update,
    onEvent: function(ev) {
      if (!isTikTokGift(ev) || !giftSelectionMatches(ev, cfg.giftIds, cfg.giftNames)) return;
      queueBurst(ev);
    },
    trigger: function() { queueBurst(null); }
  });
})();`
}

function buildHeartMeScript(h: HeartMeLayerConfig, _isPreview: boolean): string {
  return `
(function() {
  var container = document.getElementById('hm-container');
  if (!container) return;
  var particles = [];
  var cfg = {
    burstSize: ${Math.min(h.count, 20)}, baseSpeed: ${h.speed},
    scaleMin: ${h.scale * 0.5}, scaleMax: ${h.scale * 0.9},
    giftIds: ${jsStringArray(h.giftIds)}, giftNames: ${jsStringArray(h.giftNames)},
    wobbleAmp: 22, wobbleFreq: 0.018,
    audioReactive: ${h.audioReactive === true}, maxLifetimeMs: 15000
  };
  var NS = 'http://www.w3.org/2000/svg';
  var XL = 'http://www.w3.org/1999/xlink';
  function mkParticle(x) {
    var sc = rnd(cfg.scaleMin, cfg.scaleMax);
    var g = document.createElementNS(NS, 'g');
    var u = document.createElementNS(NS, 'use');
    u.setAttributeNS(XL, 'href', '#hm-sym');
    u.setAttribute('width', '30'); u.setAttribute('height', '30');
    u.setAttribute('x', '-15'); u.setAttribute('y', '-15');
    g.appendChild(u);
    container.appendChild(g);
    return { dom: g, x: x + rnd(-8, 8), y: 108, spd: cfg.baseSpeed * sc, sc: sc, wo: rnd(0, 6.28), age: 0, bornAt: Date.now(), op: -1 };
  }
  function update() {
    for (var i = particles.length - 1; i >= 0; i--) {
      var p = particles[i];
      p.y -= p.spd; p.age++;
      var wx = Math.sin((p.age + p.wo) * cfg.wobbleFreq) * cfg.wobbleAmp / (10 + p.sc);
      var lf = Math.max(0, p.y) / 100;
      var op = lf < 0.2 ? Math.max(0, lf / 0.2) : 1;
      var volScale = audioScale(cfg.audioReactive);
      p.dom.setAttribute('transform', 'translate(' + ((p.x + wx) * 10) + ',' + (p.y * 10) + ') scale(' + (p.sc * volScale) + ')');
      if (op !== p.op) { p.dom.style.opacity = op; p.op = op; }
      if (p.y < -20 || op <= 0.001 || Date.now() - p.bornAt >= cfg.maxLifetimeMs) {
        container.removeChild(p.dom); particles.splice(i, 1); releaseParticle();
      }
    }
  }
  function burst(ev) {
    var count = giftBurstCount(cfg.burstSize, ev, 60);
    for (var i = 0; i < count; i++) {
      (function(idx) { setTimeout(function() { spawn(particles, mkParticle, rnd(15, 85)); }, idx * 60); })(i);
    }
  }
  layers.push({
    update: update,
    onEvent: function(ev) {
      if (!isTikTokGift(ev)) return;
      if (giftSelectionMatches(ev, cfg.giftIds, cfg.giftNames)) burst(ev);
    },
    trigger: function() { burst(null); }
  });
})();`
}

export function buildParticlesOverlayHtml(widget?: any, isPreview = false): string {
  const cfg = resolveParticlesWidgetConfig(widget?.config)

  const hasAny = cfg.followerHearts.enabled || cfg.fallingRoses.enabled ||
    cfg.galaxy.enabled || cfg.ggs.enabled || cfg.heartMe.enabled ||
    cfg.bubbles.enabled || cfg.confetti.enabled || cfg.fireworks.enabled ||
    cfg.lightning.enabled || cfg.moneyRain.enabled

  const defs = buildDefs(cfg)
  const containers = buildContainers(cfg)

  const layerScripts = [
    cfg.followerHearts.enabled ? buildFollowerHeartsScript(cfg.followerHearts, isPreview) : '',
    cfg.fallingRoses.enabled   ? buildFallingRosesScript(cfg.fallingRoses, isPreview)     : '',
    cfg.galaxy.enabled         ? buildGalaxyScript(cfg.galaxy, isPreview)                 : '',
    cfg.ggs.enabled            ? buildGGsScript(cfg.ggs, isPreview)                       : '',
    cfg.heartMe.enabled        ? buildHeartMeScript(cfg.heartMe, isPreview)               : '',
    cfg.bubbles.enabled        ? buildBubblesScript(cfg.bubbles)                          : '',
    cfg.confetti.enabled       ? buildGiftRainScript(cfg.confetti, {
      containerId: 'confetti-container',
      kind: 'confetti',
      maxCount: 108,
      spawnDelayMs: 18,
      speedMultiplier: 1,
      wobbleAmp: 0.8
    }) : '',
    cfg.fireworks.enabled      ? buildFireworksScript(cfg.fireworks)                      : '',
    cfg.lightning.enabled      ? buildGiftRainScript(cfg.lightning, {
      containerId: 'lightning-container',
      kind: 'lightning',
      maxCount: 54,
      spawnDelayMs: 34,
      speedMultiplier: 1.45,
      wobbleAmp: 0.35
    }) : '',
    cfg.moneyRain.enabled      ? buildGiftRainScript(cfg.moneyRain, {
      containerId: 'money-container',
      kind: 'money',
      maxCount: 84,
      spawnDelayMs: 30,
      speedMultiplier: 1,
      wobbleAmp: 0.9
    }) : '',
  ].filter(Boolean).join('\n')

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Particles</title>
  <style>
    body, html { margin: 0; padding: 0; width: 100%; height: 100%; overflow: hidden;
      background: transparent; }
    #canvas { display: block; width: 100vw; height: 100vh; pointer-events: none; }
    ${getAnimationCss({ style: cfg.animationStyle || 'fade', duration: cfg.animationDuration || 1000 }, '#canvas')}
    ${!hasAny && isPreview ? `.no-layers {
      position: fixed; inset: 0; display: flex; align-items: center; justify-content: center;
      color: rgba(255,255,255,0.3); font-family: Inter, sans-serif; font-size: 14px; }` : ''}
  </style>
</head>
<body>
  ${!hasAny && isPreview ? '<div class="no-layers">No particle layers enabled</div>' : ''}
  <svg id="canvas" xmlns="http://www.w3.org/2000/svg" width="100%" height="100%" viewBox="0 0 1000 1000" preserveAspectRatio="none">
    ${defs}
    ${containers}
  </svg>
  <script>
    var AUDIO_THRESHOLD = ${cfg.audioThreshold || 0.05};
    function rnd(a, b) { return Math.random() * (b - a) + a; }
    var layers = [];
    var isPreview = ${isPreview};

    // Shared particle budget. Every layer spawns through spawn() and frees its
    // slot through releaseParticle(), so the total concurrent count can never
    // exceed the budget no matter how many events land at once.
    var PARTICLE_BUDGET = ${PARTICLE_BUDGET};
    var liveParticles = 0;
    function spawn(list, make, x, startY, context) {
      if (liveParticles >= PARTICLE_BUDGET) return null;
      var p = make(x, startY, context);
      if (!p) return null;
      list.push(p);
      liveParticles++;
      return p;
    }
    function releaseParticle() {
      if (liveParticles > 0) liveParticles--;
    }
    function audioScale(reactive) {
      if (!reactive) return 1;
      var vol = (window.parent && window.parent.__masterVolume) || window.__masterVolume || 0;
      if (vol < AUDIO_THRESHOLD) vol = 0;
      return 1 + (vol * 1.5);
    }
    function normalizedGiftName(ev) {
      return String(ev && ev.giftName || '').trim().toLowerCase();
    }
    function isTikTokGift(ev) {
      return Boolean(ev && ev.type === 'gift' && (!ev.platform || ev.platform === 'tiktok'));
    }
    function giftMatches(ev, names) {
      var name = normalizedGiftName(ev);
      return names.indexOf(name) >= 0;
    }
    function giftSelectionMatches(ev, giftIds, giftNames) {
      var giftId = String(ev && ev.giftId || '').trim();
      if (giftId && giftIds.indexOf(giftId) >= 0) return true;
      return giftMatches(ev, giftNames.map(function(name) { return String(name).trim().toLowerCase(); }));
    }
    function giftContains(ev, fragments) {
      var name = normalizedGiftName(ev);
      for (var i = 0; i < fragments.length; i++) {
        if (name.indexOf(fragments[i]) >= 0) return true;
      }
      return false;
    }
    function giftIntensity(ev) {
      var valueCents = Math.max(0, Number(ev && ev.monetaryValue) || 0);
      var repeatCount = Math.max(1, Number(ev && ev.giftCount) || 1);
      var valueTier = valueCents >= 5000 ? 3 : valueCents >= 500 ? 2 : valueCents >= 50 ? 1.5 : 1;
      var repeatTier = repeatCount >= 100 ? 3 : repeatCount >= 25 ? 2 : repeatCount >= 5 ? 1.5 : 1;
      return Math.max(valueTier, repeatTier);
    }
    function giftBurstCount(baseCount, ev, maxCount) {
      return Math.min(maxCount, Math.max(1, Math.round(baseCount * giftIntensity(ev))));
    }

    ${layerScripts}

    var activeIndex = 0;

    function tick() {
      for (var i = 0; i < layers.length; i++) {
        if (!isPreview || i === activeIndex) {
          layers[i].update();
        }
      }
      requestAnimationFrame(tick);
    }

    function connectSSE() {
      var src = new EventSource('/overlay/events?channel=particles');
      src.onmessage = function(e) {
        var msg;
        try { msg = JSON.parse(e.data); } catch (err) { return; }
        if (!msg) return;
        if (msg.type === 'reload') { window.location.reload(); return; }
        if (msg.type === 'event' && msg.payload) {
          for (var i = 0; i < layers.length; i++) {
            if (layers[i].onEvent) {
              try { layers[i].onEvent(msg.payload); } catch (err) {}
            }
          }
        }
      };
      src.onerror = function() { try { src.close(); } catch (e) {} setTimeout(connectSSE, 2000); };
    }

    // Run init immediately rather than waiting for DOMContentLoaded. This
    // script sits at the end of <body> (the containers already exist — the
    // layer IIFEs above found them), so the DOM is ready. Depending on
    // DOMContentLoaded was fragile: if the event had already dispatched by the
    // time the listener was added, init never ran and the widget never
    // connected to the event stream.
    function init() {
      requestAnimationFrame(tick);
      if (!isPreview) connectSSE();

      if (isPreview && layers.length > 0) {
        function rotatePreview() {
          var containers = [
            'fh-container', 'rose-container', 'galaxy-container', 'ggs-container', 'hm-container',
            'bubbles-container', 'confetti-container', 'fireworks-container', 'lightning-container', 'money-container'
          ];
          containers.forEach(function(id) {
            var el = document.getElementById(id);
            if (el) el.style.display = 'none';
          });

          var layerIds = [];
          if (${cfg.followerHearts.enabled}) layerIds.push('fh-container');
          if (${cfg.fallingRoses.enabled})   layerIds.push('rose-container');
          if (${cfg.galaxy.enabled})         layerIds.push('galaxy-container');
          if (${cfg.ggs.enabled})            layerIds.push('ggs-container');
          if (${cfg.heartMe.enabled})        layerIds.push('hm-container');
          if (${cfg.bubbles.enabled})        layerIds.push('bubbles-container');
          if (${cfg.confetti.enabled})       layerIds.push('confetti-container');
          if (${cfg.fireworks.enabled})      layerIds.push('fireworks-container');
          if (${cfg.lightning.enabled})      layerIds.push('lightning-container');
          if (${cfg.moneyRain.enabled})      layerIds.push('money-container');

          var activeId = layerIds[activeIndex];
          if (activeId) {
            var el = document.getElementById(activeId);
            if (el) el.style.display = 'inline';
            if (layers[activeIndex] && layers[activeIndex].trigger) {
              layers[activeIndex].trigger();
            }
          }

          activeIndex = (activeIndex + 1) % layers.length;
          setTimeout(rotatePreview, 5000);
        }
        setTimeout(rotatePreview, 500);
      }
    }

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', init, { once: true });
    } else {
      init();
    }
  </script>
</body>
</html>`
}
