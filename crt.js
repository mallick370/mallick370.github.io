// ---------- CRT post-process overlay + knobs (shared by every page) ----------
// initCRT({ target: '#world', mount: '#chrome-controls' })
//   target: element that gets the glitch tear filter and jitter
//   mount:  element the volume dial and power knob are appended to
import * as THREE from 'three';

const FILTER_SVG = `
<svg width="0" height="0" style="position:absolute" aria-hidden="true">
<filter id="crt-glitch" x="-3%" y="0%" width="106%" height="100%" color-interpolation-filters="sRGB">
  <feImage id="crt-map" preserveAspectRatio="none" result="map"
    href="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNgYGCoBwAAhACAcEIjkAAAAABJRU5ErkJggg==" />
  <feDisplacementMap id="crt-disp" in="SourceGraphic" in2="map" scale="0" xChannelSelector="R" yChannelSelector="G" result="disp" />
  <feColorMatrix in="disp" type="matrix" values="1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0" result="r" />
  <feColorMatrix in="disp" type="matrix" values="0 0 0 0 0  0 1 0 0 0  0 0 0 0 0  0 0 0 1 0" result="g" />
  <feColorMatrix in="disp" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 1 0 0  0 0 0 1 0" result="b" />
  <feOffset id="crt-roff" in="r" dx="-1.2" dy="0" result="ro" />
  <feOffset id="crt-boff" in="b" dx="1.2" dy="0" result="bo" />
  <feComposite in="ro" in2="g" operator="arithmetic" k1="0" k2="1" k3="1" k4="0" result="rg" />
  <feComposite in="rg" in2="bo" operator="arithmetic" k1="0" k2="1" k3="1" k4="0" />
</filter>
</svg>
<canvas id="crt" aria-hidden="true"></canvas>`;

const KNOBS_HTML = `
<div class="knob knob-vol" id="vol-knob" role="slider" tabindex="0" aria-label="Volume" aria-valuemin="0" aria-valuemax="100" aria-valuenow="70" title="Volume 70%">
<span class="knob-label vol" aria-hidden="true">vol</span>
<span class="knob-tick min" aria-hidden="true"></span>
<span class="knob-tick max" aria-hidden="true"></span>
<span class="knob-cap" aria-hidden="true"><span class="knob-dot"></span></span>
</div>
<button class="knob" id="crt-toggle" type="button" aria-pressed="true" aria-label="CRT effect" title="CRT effect: on">
<span class="knob-label on" aria-hidden="true">on</span>
<span class="knob-label off" aria-hidden="true">off</span>
<span class="knob-tick on" aria-hidden="true"></span>
<span class="knob-tick off" aria-hidden="true"></span>
<span class="knob-cap" aria-hidden="true"><span class="knob-bar"></span></span>
</button>`;

export function initCRT({ target, mount }) {
// phones and small tablets: no tube, no knobs (for now)
if (matchMedia('(pointer: coarse)').matches && Math.min(innerWidth, innerHeight) <= 820) {
  document.body.classList.add('no-crt');
  window.crtGlitch = () => {};
  return;
}
document.body.insertAdjacentHTML('beforeend', FILTER_SVG);
const mountEl = document.querySelector(mount);
mountEl.insertAdjacentHTML('beforeend', KNOBS_HTML);
const targetEl = document.querySelector(target);
targetEl.classList.add('crt-target');

const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const canvas = document.getElementById('crt');

// audio state (declared up front: the glitch controller below may call humCrackle during init)
let actx = null, bus = null;
let hum = null, humWanted = false, audioUnlocked = false;
const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: false, premultipliedAlpha: false });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setClearColor(0x000000, 0);

const uniforms = {
  uTime:   { value: 0 },
  uRes:    { value: new THREE.Vector2(1, 1) },
  uPx:     { value: 1 },        // device pixels per CSS pixel
  uGlitch: { value: 0 },        // 0..1 burst strength
  uMotion: { value: reduceMotion ? 0 : 1 },
};

const material = new THREE.ShaderMaterial({
  uniforms, transparent: true, depthTest: false, depthWrite: false,
  vertexShader: `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
  `,
  fragmentShader: `
    precision highp float;
    uniform float uTime, uPx, uGlitch, uMotion;
    uniform vec2 uRes;
    varying vec2 vUv;

    float hash(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }

    // accumulate an overlay layer (straight alpha "over")
    void over(inout vec3 rgb, inout float a, vec3 c, float ca) {
      float w = ca * (1.0 - a);
      rgb += c * w;
      a   += w;
    }

    void main() {
      vec2 uv = vUv;
      vec2 fc = gl_FragCoord.xy;
      vec3 rgb = vec3(0.0); float a = 0.0;
      float t = uTime * uMotion;

      // 1. scanlines (one dark line every ~3 CSS px)
      float period = 3.0 * uPx;
      float s = 0.5 + 0.5 * sin(fc.y / period * 6.28318);
      over(rgb, a, vec3(0.0), (1.0 - s) * 0.30);

      // 2. aperture grille: faint R/G/B vertical stripes
      float gx = mod(floor(fc.x / uPx), 3.0);
      vec3 grille = gx < 1.0 ? vec3(1.0, 0.2, 0.2) : gx < 2.0 ? vec3(0.2, 1.0, 0.2) : vec3(0.2, 0.2, 1.0);
      over(rgb, a, grille, 0.06);

      // 3. rolling sync bar
      float bar = fract(-t * 0.07);
      float db = abs(uv.y - bar); db = min(db, 1.0 - db);
      over(rgb, a, vec3(1.0), smoothstep(0.10, 0.0, db) * 0.045);

      // 4. grain
      float n = hash(floor(fc / uPx) + floor(t * 60.0) * 0.37);
      over(rgb, a, vec3(step(0.5, n)), 0.045);

      // 5. flicker (brightness wobble)
      float fl = hash(vec2(floor(t * 24.0), 1.0)) * 0.03 + 0.015 * sin(t * 50.0);
      over(rgb, a, vec3(0.0), fl * uMotion);

      // 6. glitch bursts: bright static bands + fringe lines
      if (uGlitch > 0.0) {
        float seed = floor(t * 30.0);
        for (int i = 0; i < 4; i++) {
          float fi = float(i);
          float by = hash(vec2(seed, fi * 7.1));
          float bh = 0.004 + 0.03 * hash(vec2(fi, seed * 3.3));
          float inBand = step(abs(uv.y - by), bh);
          float sn = hash(vec2(floor(fc.y / uPx), seed + fi));
          vec3 bc = mix(vec3(0.0), vec3(1.0), step(0.55, sn));
          if (hash(vec2(seed, fi)) > 0.6) bc = bc * vec3(1.0, 0.3, 0.9) + vec3(0.0, 0.6, 0.0) * (1.0 - bc);
          over(rgb, a, bc, inBand * uGlitch * (0.35 + 0.45 * hash(vec2(seed, fi + 9.0))));
        }
        // horizontal interference lines
        float hl = step(0.985, hash(vec2(floor(fc.y / uPx), seed)));
        over(rgb, a, vec3(1.0), hl * uGlitch * 0.5);
      }

      // 7. tube vignette with rounded corners
      vec2 d = abs(uv * 2.0 - 1.0);
      float r = length(pow(d, vec2(5.0)));          // superellipse distance
      float vig = smoothstep(0.55, 1.15, r);
      over(rgb, a, vec3(0.0), vig * 0.7);
      float edge = smoothstep(0.98, 1.04, r);        // black bezel beyond the glass
      over(rgb, a, vec3(0.0), edge);

      gl_FragColor = vec4(a > 0.0 ? rgb / a : vec3(0.0), a);
    }
  `,
});

const scene = new THREE.Scene();
scene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material));
const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

function resize() {
  renderer.setSize(innerWidth, innerHeight, false);
  uniforms.uRes.value.set(innerWidth, innerHeight);
  uniforms.uPx.value = renderer.getPixelRatio();
}
addEventListener('resize', resize); resize();

// ---------- glitch controller: drives the SVG displacement filter ----------
const stage = targetEl;
const disp  = document.getElementById('crt-disp');
const roff  = document.getElementById('crt-roff');
const boff  = document.getElementById('crt-boff');
const mapEl = document.getElementById('crt-map');
const mapCanvas = document.createElement('canvas');
mapCanvas.width = 1; mapCanvas.height = 96;
const mctx = mapCanvas.getContext('2d');

function rnd(a, b) { return a + Math.random() * (b - a); }

// Pre-build a pool of tear maps so a burst never waits on image decoding.
// 128 = no shift; bands with other red values displace those rows horizontally.
const tearMaps = [];
for (let k = 0; k < 12; k++) {
  mctx.fillStyle = 'rgb(128,128,128)';
  mctx.fillRect(0, 0, 1, 96);
  const bands = 2 + Math.floor(Math.random() * 4);
  for (let i = 0; i < bands; i++) {
    const y = Math.floor(rnd(0, 92)), h = 1 + Math.floor(rnd(0, 5));
    const v = Math.random() < 0.5 ? Math.floor(rnd(0, 90)) : Math.floor(rnd(166, 255));
    mctx.fillStyle = `rgb(${v},128,128)`;
    mctx.fillRect(0, y, 1, h);
  }
  const url = mapCanvas.toDataURL();
  tearMaps.push(url);
  const warm = new Image(); warm.src = url;   // decode now, not mid-burst
}
function newTearMap() {
  mapEl.setAttribute('href', tearMaps[Math.floor(Math.random() * tearMaps.length)]);
}

function setGlitch(strength) {
  uniforms.uGlitch.value = strength;
  humCrackle(strength);
  const split = 1.2 + strength * rnd(4, 10);
  roff.setAttribute('dx', (-split).toFixed(2));
  boff.setAttribute('dx', split.toFixed(2));
  disp.setAttribute('scale', (strength * rnd(40, 140)).toFixed(1));
  if (strength > 0 && Math.random() < 0.5) {
    stage.style.setProperty('--gx', `${rnd(-8, 8).toFixed(1)}px`);
    stage.style.setProperty('--gy', `${rnd(-6, 6).toFixed(1)}px`);
  } else {
    stage.style.setProperty('--gx', '0px');
    stage.style.setProperty('--gy', '0px');
  }
}

let glitchTimer = 0;
function scheduleGlitch() {
  clearTimeout(glitchTimer);
  glitchTimer = setTimeout(() => {
    newTearMap();
    const strength = Math.random() < 0.25 ? 1 : rnd(0.35, 0.7);
    setGlitch(strength);
    // a burst is a few quick re-tears
    let hits = 2 + Math.floor(rnd(1, 4));
    const tick = () => {
      if (--hits <= 0) { setGlitch(0); scheduleGlitch(); return; }
      newTearMap(); setGlitch(strength * rnd(0.5, 1));
      setTimeout(tick, rnd(60, 140));
    };
    setTimeout(tick, rnd(70, 140));
  }, rnd(1800, 5500));
}
let on = true;
try { on = (localStorage.getItem('crt-on') ?? 'true') === 'true'; } catch (e) {}
if (on && !reduceMotion) scheduleGlitch(); else setGlitch(0);
window.crtGlitch = (strength = 1, holdMs = 400) => {
  clearTimeout(glitchTimer);
  newTearMap(); setGlitch(strength);
  setTimeout(() => { setGlitch(0); if (on && !reduceMotion) scheduleGlitch(); }, holdMs);
};

// ---------- audio ----------
let volume = 0.7;                                   // 0..1, user-set via the dial
try { const v = parseFloat(localStorage.getItem('crt-volume')); if (!Number.isNaN(v)) volume = Math.min(1, Math.max(0, v)); } catch (e) {}
const volCurve = (v) => v * v;                      // perceptual taper
function audioCtx() {
  actx ??= new (window.AudioContext || window.webkitAudioContext)();
  if (actx.state === 'suspended') actx.resume();
  if (!bus) { bus = actx.createGain(); bus.gain.value = volCurve(volume); bus.connect(actx.destination); }
  return actx;
}

// Continuous tube hum: mains buzz + harmonics, faint flyback whine, hiss bed,
// and a crackle channel that the glitch controller drives.
const HUM_LEVEL = 0.2;           // CRT buzz loudness (0..1)
const GLITCH_LEVEL = 0.2;        // crackle loudness during glitch bursts (0..1)
function buildHum(c) {
  const master = c.createGain(); master.gain.value = 0; master.connect(bus);

  // mains buzz: 60 Hz saw + 120 Hz square + 180 Hz triangle, low-passed so it's a hum not a tone
  const humAmp = c.createGain(); humAmp.gain.value = 1; humAmp.connect(master);
  const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 700; lp.Q.value = 0.8; lp.connect(humAmp);
  const osc = (type, f, g, dest) => {
    const o = c.createOscillator(); o.type = type; o.frequency.value = f;
    const gg = c.createGain(); gg.gain.value = g; o.connect(gg).connect(dest); o.start(); return o;
  };
  osc('sawtooth', 60, 0.55, lp);
  osc('square',   120, 0.28, lp);
  osc('triangle', 180, 0.16, lp);

  // slow electrical flutter on the hum
  const lfo = c.createOscillator(); lfo.type = 'sine'; lfo.frequency.value = 0.6;
  const lfoG = c.createGain(); lfoG.gain.value = 0.18; lfo.connect(lfoG).connect(humAmp.gain); lfo.start();

  // 15.7 kHz horizontal flyback whine, very quiet
  osc('sine', 15734, 0.035, master);

  // hiss bed: looped noise through a band-pass
  const len = c.sampleRate * 2, buf = c.createBuffer(1, len, c.sampleRate), d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  const noise = c.createBufferSource(); noise.buffer = buf; noise.loop = true;
  const hissBP = c.createBiquadFilter(); hissBP.type = 'bandpass'; hissBP.frequency.value = 3800; hissBP.Q.value = 0.5;
  const hissG = c.createGain(); hissG.gain.value = 0.10;
  noise.connect(hissBP).connect(hissG).connect(master); noise.start();

  // crackle channel for glitch bursts: distorted 120 Hz + noise, normally silent
  const crackleOut = c.createGain(); crackleOut.gain.value = GLITCH_LEVEL; crackleOut.connect(bus);
  const crackle = c.createGain(); crackle.gain.value = 0; crackle.connect(crackleOut);
  const shaper = c.createWaveShaper();
  const curve = new Float32Array(256);
  for (let i = 0; i < 256; i++) { const x = i / 128 - 1; curve[i] = Math.tanh(x * 6); }
  shaper.curve = curve;
  const crackBP = c.createBiquadFilter(); crackBP.type = 'bandpass'; crackBP.frequency.value = 1800; crackBP.Q.value = 0.7;
  shaper.connect(crackBP).connect(crackle);
  osc('square', 120, 0.6, shaper);
  const n2 = c.createBufferSource(); n2.buffer = buf; n2.loop = true;
  const n2g = c.createGain(); n2g.gain.value = 0.5; n2.connect(n2g).connect(shaper); n2.start();

  return { master, crackle };
}

function setHum(wanted) {
  humWanted = wanted;
  if (!audioUnlocked) return;                 // wait for the first user gesture
  try {
    const c = audioCtx(), t = c.currentTime;
    hum ??= buildHum(c);
    hum.master.gain.cancelScheduledValues(t);
    hum.master.gain.setTargetAtTime(wanted && !document.hidden ? HUM_LEVEL : 0, t, wanted ? 0.6 : 0.12);
  } catch (e) { /* audio unavailable */ }
}
window.__audio = () => { try { audioCtx(); return { ctx: actx, bus }; } catch (e) { return null; } };
window.__crtAudio = () => ({ state: actx && actx.state, unlocked: audioUnlocked, wanted: humWanted, humGain: hum ? +hum.master.gain.value.toFixed(4) : null, volume, bus: bus ? +bus.gain.value.toFixed(4) : null });
function humCrackle(strength) {
  if (!hum) return;
  const t = actx.currentTime;
  hum.crackle.gain.cancelScheduledValues(t);
  hum.crackle.gain.setTargetAtTime(humWanted ? strength : 0, t, 0.015);
}

// Autoplay rules: audio can only start after a click, tap or key press.
function unlockAudio() {
  if (audioUnlocked) return;
  audioUnlocked = true;
  setHum(humWanted);
}
addEventListener('pointerdown', unlockAudio, { once: true, capture: true });
addEventListener('keydown', unlockAudio, { once: true, capture: true });
document.addEventListener('visibilitychange', () => setHum(humWanted));

// ---------- knob sound: mechanical detent + CRT tube whine ----------
function knobSound(turnOn) {
  try {
    audioCtx();
    const t = actx.currentTime, out = bus;

    // detent: a short burst of band-passed noise
    const len = Math.floor(actx.sampleRate * 0.045);
    const buf = actx.createBuffer(1, len, actx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.5);
    const noise = actx.createBufferSource(); noise.buffer = buf;
    const bp = actx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = turnOn ? 2800 : 2000; bp.Q.value = 1.1;
    const ng = actx.createGain(); ng.gain.value = 0.55;
    noise.connect(bp).connect(ng).connect(out); noise.start(t);

    // body of the click: a low thunk
    const thunk = actx.createOscillator(); thunk.type = 'sine';
    thunk.frequency.setValueAtTime(turnOn ? 190 : 150, t);
    thunk.frequency.exponentialRampToValueAtTime(55, t + 0.09);
    const tg = actx.createGain(); tg.gain.setValueAtTime(0.4, t); tg.gain.exponentialRampToValueAtTime(0.001, t + 0.11);
    thunk.connect(tg).connect(out); thunk.start(t); thunk.stop(t + 0.13);

    // tube: whine sweeping up on power-on, down on power-off
    const w = actx.createOscillator(); w.type = 'triangle';
    const wg = actx.createGain();
    if (turnOn) {
      w.frequency.setValueAtTime(300, t + 0.05);  w.frequency.exponentialRampToValueAtTime(3400, t + 0.38);
      wg.gain.setValueAtTime(0.0001, t + 0.05);   wg.gain.exponentialRampToValueAtTime(0.07, t + 0.14);
      wg.gain.exponentialRampToValueAtTime(0.0001, t + 0.45);
    } else {
      w.frequency.setValueAtTime(2600, t + 0.05); w.frequency.exponentialRampToValueAtTime(90, t + 0.5);
      wg.gain.setValueAtTime(0.07, t + 0.05);     wg.gain.exponentialRampToValueAtTime(0.0001, t + 0.55);
    }
    w.connect(wg).connect(out); w.start(t + 0.05); w.stop(t + 0.6);
  } catch (e) { /* audio unavailable: stay silent */ }
}

// ---------- volume dial ----------
const volKnob = document.getElementById('vol-knob');
const volCap = volKnob.querySelector('.knob-cap');
let lastDetent = Math.round(volume * 10);

function detentSound() {                           // tiny tick at every 10% step
  if (!audioUnlocked) return;
  try {
    const c = audioCtx(), t = c.currentTime;
    const len = Math.floor(c.sampleRate * 0.012), buf = c.createBuffer(1, len, c.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = c.createBufferSource(); src.buffer = buf;
    const hp = c.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 2500;
    const g = c.createGain(); g.gain.value = 0.25;
    src.connect(hp).connect(g).connect(c.destination); src.start(t);   // bypasses the bus so it's audible at low volume
  } catch (e) {}
}

function applyVolume(v) {
  volume = Math.min(1, Math.max(0, v));
  volCap.style.setProperty('--knob-angle', `${-135 + volume * 270}deg`);
  const pct = Math.round(volume * 100);
  volKnob.setAttribute('aria-valuenow', pct);
  volKnob.title = `Volume ${pct}%`;
  if (bus) bus.gain.setTargetAtTime(volCurve(volume), actx.currentTime, 0.03);
  const detent = Math.round(volume * 10);
  if (detent !== lastDetent) { lastDetent = detent; detentSound(); }
  try { localStorage.setItem('crt-volume', volume.toFixed(2)); } catch (e) {}
}
applyVolume(volume);

// drag: rotate relative to where the pointer grabbed the cap
const pointerAngle = (e) => {
  const r = volKnob.getBoundingClientRect();
  return Math.atan2(e.clientX - (r.left + r.width / 2), -(e.clientY - (r.top + r.height / 2))) * 180 / Math.PI;
};
let drag = null;
volKnob.addEventListener('pointerdown', (e) => {
  e.preventDefault();
  volKnob.setPointerCapture(e.pointerId);
  volKnob.classList.add('dragging');
  drag = { a0: pointerAngle(e), v0: volume };
});
volKnob.addEventListener('pointermove', (e) => {
  if (!drag) return;
  let da = pointerAngle(e) - drag.a0;
  if (da > 180) da -= 360; else if (da < -180) da += 360;
  applyVolume(drag.v0 + da / 270);
});
const endDrag = () => { drag = null; volKnob.classList.remove('dragging'); };
volKnob.addEventListener('pointerup', endDrag);
volKnob.addEventListener('pointercancel', endDrag);
volKnob.addEventListener('wheel', (e) => { e.preventDefault(); applyVolume(volume - Math.sign(e.deltaY) * 0.05); }, { passive: false });
volKnob.addEventListener('keydown', (e) => {
  const step = { ArrowUp: .05, ArrowRight: .05, ArrowDown: -.05, ArrowLeft: -.05 }[e.key];
  if (step !== undefined) { e.preventDefault(); applyVolume(volume + step); }
  else if (e.key === 'Home') { e.preventDefault(); applyVolume(0); }
  else if (e.key === 'End')  { e.preventDefault(); applyVolume(1); }
});

// ---------- toggle ----------
const toggle = document.getElementById('crt-toggle');
function applyOn() {
  volKnob.setAttribute('aria-hidden', String(!on));
  volKnob.tabIndex = on ? 0 : -1;
  document.body.classList.toggle('no-crt', !on);
  toggle.setAttribute('aria-pressed', String(on));
  toggle.title = on ? 'CRT effect: on' : 'CRT effect: off';
  try { localStorage.setItem('crt-on', String(on)); } catch (e) {}
}
humWanted = on;
applyOn();
toggle.addEventListener('click', () => {
  toggle.blur();                 // so Space in the game never re-toggles the knob
  on = !on;
  knobSound(on);
  setHum(on);
  applyOn();
  if (on && !reduceMotion) scheduleGlitch(); else { clearTimeout(glitchTimer); setGlitch(0); }
});

const clock = new THREE.Clock();
(function loop() {
  requestAnimationFrame(loop);
  if (!on) return;
  uniforms.uTime.value = clock.getElapsedTime();
  renderer.render(scene, camera);
})();
}
