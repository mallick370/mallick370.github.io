// ---------------------------------------------------------------------------
// Next Level — endless side-scroller built from the hero's own assets.
// Mario has unlimited lives: pits pop him back up, plants only knock him back.
// World units are the 1920x1080 stage pixels.
// ---------------------------------------------------------------------------

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const STAGE_W = 1920;
const GROUND_TOP = 1005;                   // y of the hero's grass
const LEVELS = [1005, 878, 750];           // platform tops Mario can reach by jumping

const P = {
  halfW: 60, height: 320,                  // hitbox (feet-anchored)
  accel: 2400, decel: 2600, maxRun: 560,
  gravity: 2900, jumpV: -1550,             // full jump ≈ 414px
  jumpCut: -1180,                          // a quick tap still clears ≈ 240px
  terminal: 1800,
  coyote: 0.14, buffer: 0.18,              // forgiving edge jumps and early presses
  invuln: 1.5,
};

const $ = (sel, root = document) => root.querySelector(sel);
const rnd = (a, b) => a + Math.random() * (b - a);
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const chance = (p) => Math.random() < p;

const stage = $('#stage'), levelEl = $('#level'), bgEl = $('#bg'), heroScene = $('#hero-scene');
const hud = { coins: $('#hud-coins'), dist: $('#hud-dist') };
const hint = $('#hint');

// ---------- templates cloned from the hero scene ----------
const tpl = {
  coin: $('.coin', heroScene), pipe: $('.pipe', heroScene), piranha: $('.piranha', heroScene),
  grassSm: $('.grass-sm', heroScene), grassMd: $('.grass-md', heroScene), hillUp: $('.hill-up', heroScene), hill: $('.hill', heroScene),
};
function clone(t, style) {
  const el = t.cloneNode(true);
  el.removeAttribute('id');
  el.classList.remove('abs');
  Object.assign(el.style, style);
  return el;
}

// ---------- sfx (through the CRT module's volume bus) ----------
function audio() { return window.__audio ? window.__audio() : null; }
function tone(type, f0, f1, dur, gain, delay = 0) {
  const a = audio(); if (!a) return;
  const { ctx, bus } = a, t = ctx.currentTime + delay;
  const o = ctx.createOscillator(); o.type = type;
  o.frequency.setValueAtTime(f0, t); if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t + dur);
  const g = ctx.createGain(); g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(bus); o.start(t); o.stop(t + dur + 0.02);
}
function noise(dur, gain, freq, delay = 0) {
  const a = audio(); if (!a) return;
  const { ctx, bus } = a, t = ctx.currentTime + delay;
  const len = Math.floor(ctx.sampleRate * dur), buf = ctx.createBuffer(1, len, ctx.sampleRate), d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = ctx.createBufferSource(); src.buffer = buf;
  const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = freq;
  const g = ctx.createGain(); g.gain.value = gain;
  src.connect(f).connect(g).connect(bus); src.start(t);
}
const sfx = {
  jump()    { tone('square', 320, 760, 0.16, 0.22); },
  coin()    { tone('square', 988, 988, 0.08, 0.18); tone('square', 1319, 1319, 0.3, 0.18, 0.08); },
  hit()     { noise(0.18, 0.5, 900); tone('triangle', 320, 70, 0.3, 0.3); },
  respawn() { [523, 659, 784, 1047].forEach((f, i) => tone('square', f, f, 0.12, 0.16, i * 0.09)); },
  step()    { noise(0.03, 0.12, 500); },
  talk()    { tone('square', 620, 880, 0.07, 0.14); tone('square', 880, 1040, 0.07, 0.12, 0.08); },
  sad()     { tone('triangle', 420, 300, 0.22, 0.18); tone('triangle', 300, 170, 0.35, 0.16, 0.22); },
};

// ---------- speech bubble ----------
const GREETINGS = [
  'Another castle? Nah. Another case study.',
  '1-UP your curiosity. Click this.',
  'Hey! Listen! This project is clickable!',
  "Coins are optional. Clicking isn't.",
  'You found a secret level. Open it.',
  'Made with pixels, passion, and questionable sleep schedules.',
  'This pipe leads to a case study. Promise.',
  "Less talking, more clicking. Let's-a-go!",
  'Your next side quest awaits.',
];
const LAMENTS = [
  'Aw, I really wanted to show you this one... 🥺',
  'I walked all this way for nothing?!',
  'But... I rehearsed the whole presentation.',
  'No? Not even a little click? 🥲',
  'My guy, I crossed the entire screen for this.',
];
// random line from a list, never the same one twice in a row
const lastPick = new Map();
function pickLine(list) {
  let i;
  do { i = Math.floor(Math.random() * list.length); } while (i === lastPick.get(list) && list.length > 1);
  lastPick.set(list, i);
  return list[i];
}
const greeting = () => pickLine(GREETINGS);
const lament = () => pickLine(LAMENTS);
const bubbleEl = $('#bubble'), bubbleText = $('#bubble span');
let bubble = null;            // { until, sad }
let sadUntil = 0, nearBoard = null;
function say(text, secs, kind = '') {
  bubble = { until: lastT + secs };
  bubbleText.innerHTML = text;
  bubbleEl.className = 'bubble show ' + kind;
}

// ---------- billboards: work from mayukhmallick.framer.website ----------
const SITE = 'https://mayukhmallick.framer.website';
const IMG = (id) => `assets/work/${id}`;
const BILLBOARDS = [
  { key: 'backstage-catalog',   title: 'BACKSTAGE CATALOG UI',   img: IMG('Hr4E5qZ7QXL4Xa25uwFbxmsG1vA.png'), href: 'backstage-catalog.html' },
  { key: 'cde',                 title: 'CLOUD DEV ENVIRONMENTS', img: IMG('oONAxX7yo8MstWz8AGh56ikWK8.png'),  href: 'cde.html' },
  { key: 'litmus-design-system', title: 'LITMUS DESIGN SYSTEM',  img: IMG('EbQnMl1hU38bJR0YaWKt1hLXsA.png'),  href: 'litmus-design-system.html' },
];
const BB_W = 1200, BB_H = 900, BB_EVERY = 2400;      // min px between billboards (actual spacing ≈ 1.5 screens)
let bbIndex = 0, lastBillboardX = -BB_EVERY;         // first one shows up right after the intro

// ---------- world state ----------
const solids = [];   // {x, y, w, h, el, kind:'plat'|'pipe'}
const slopes = [];   // {x, w, yL, yR, el}
const coins = [];    // {x, y, el, taken}
const plants = [];   // {x, pipeTop, el, slot, phase}
const decor = [];    // {x, el}
const boards = [];   // {x, y, w, h, el} billboards Mario glances at
let genX = 0, genTop = GROUND_TOP, forceGround = false;

const player = {
  x: 580, feet: GROUND_TOP, vx: 0, vy: 0, facing: 1,
  grounded: false, jumpHeld: false, canJump: true, coyote: 0, buffer: 0,
  hurtT: 0, coins: 0, best: 0,
  safeX: 580, safeTop: GROUND_TOP, stepT: 0,
};
let cameraX = 0, playing = false, lastT = 0, hintT = 0;

// ---------- level pieces ----------
function addPlatform(x, top, w, kind = 'md') {
  const h = 1080 - top + 120;
  const el = clone(kind === 'sm' ? tpl.grassSm : tpl.grassMd, { left: x + 'px', top: top + 'px', width: w + 'px', height: h + 'px' });
  el.classList.add('plat');
  levelEl.appendChild(el);
  solids.push({ x, y: top, w, h, el, kind: 'plat' });
}
function addSlope(x, base) {               // hill-up ramp: rises 57px over 144px, sits on `base`
  const top = base - 62;
  const el = clone(tpl.hillUp, { left: x + 'px', top: top + 'px' });
  levelEl.appendChild(el);
  slopes.push({ x, w: 144, yL: base, yR: base - 57, el });
}
function addPipe(x, groundTop, h, withPlant) {
  const top = groundTop - h;
  const el = clone(tpl.pipe, { left: x + 'px', top: top + 'px', height: (h + 120) + 'px' });
  levelEl.appendChild(el);
  solids.push({ x, y: top, w: 144, h: h + 120, el, kind: 'pipe' });
  if (withPlant) {
    const slot = document.createElement('div');
    slot.className = 'plant-slot';
    Object.assign(slot.style, { left: (x + 34) + 'px', top: (top - 109) + 'px' });
    const pl = clone(tpl.piranha, {});
    slot.appendChild(pl);
    levelEl.appendChild(slot);
    plants.push({ x: x + 72, pipeTop: top, el: pl, slot, phase: Math.random() * 10, offset: 109 });
  }
}
function addCoin(x, y) {
  const el = clone(tpl.coin, { left: x + 'px', top: y + 'px' });
  levelEl.appendChild(el);
  coins.push({ x, y, el, taken: false });
}
function coinArc(x0, y0, x1, peak, n) {    // n coins on a parabola from x0 to x1
  for (let i = 0; i < n; i++) {
    const u = n === 1 ? 0.5 : i / (n - 1);
    addCoin(x0 + (x1 - x0) * u, y0 - peak * 4 * u * (1 - u) - 53);
  }
}
function addBillboard(x, groundTop) {
  const b = BILLBOARDS[bbIndex++ % BILLBOARDS.length];
  const el = document.createElement('a');
  el.className = 'billboard';
  el.href = b.href;
  if (/^https?:/.test(b.href)) { el.target = '_blank'; el.rel = 'noopener'; }   // external links open in a new tab; our own pages don't
  el.title = `${b.title} — open project`;
  el.style.left = x + 'px'; el.style.top = (groundTop - BB_H + 8) + 'px';
  el.innerHTML = `
    <span class="bb-board"><img src="${b.img}" alt="${b.title}" draggable="false"><span class="bb-tag">VIEW</span></span>
    <span class="bb-plate">${b.title}</span>
    <span class="bb-post l"></span><span class="bb-post r"></span>`;
  levelEl.appendChild(el);
  const board = { x, y: groundTop - BB_H + 8, w: BB_W, h: 690, el, key: b.key, greeted: false, visited: false, mourned: false };
  el.addEventListener('click', () => {
    board.visited = true; say('Here we go!', 1.8, 'happy'); sfx.talk();
    // so coming back (browser back, or Works on the case study page) lands here again
    try { sessionStorage.setItem('returnTo', JSON.stringify({ key: b.key, coins: player.coins, best: player.best })); } catch (e) {}
  });
  boards.push(board);
  lastBillboardX = x;
}
function stageScaleNow() {
  const s = parseFloat(getComputedStyle(document.getElementById('world')).getPropertyValue('--s'));
  return Number.isFinite(s) && s > 0 ? s : 1;
}
function addTower(x, groundTop) {
  const W = 1400, H = 1080, SINK = 210;             // fills the height above the grass; the base sits behind the grass
  const canvas = document.createElement('canvas');
  canvas.className = 'tower';
  Object.assign(canvas.style, { left: x + 'px', top: (groundTop - H + SINK) + 'px', width: W + 'px', height: H + 'px' });
  levelEl.prepend(canvas);                          // behind every platform, pipe and billboard
  // behaves like a billboard for the glance + greeting, but never laments
  boards.push({ x, y: groundTop - H + SINK, w: W, h: H * 0.8, el: canvas, greeted: false, visited: true, mourned: true,
                text: 'I work at Aurasell as a senior product designer',
                zone: [x + W * 0.33, x + W * 0.67] });     // speak only once he is in front of the building itself

  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(60, W / H, 0.1, 2000);   // wide lens for a worm's-eye view
  scene.add(new THREE.HemisphereLight(0xffffff, 0x6986fe, 1.0));
  const key = new THREE.DirectionalLight(0xffffff, 2.2); key.position.set(80, 140, 90); key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048); key.shadow.bias = -0.0008; scene.add(key);
  const fill = new THREE.DirectionalLight(0xffffff, 0.6); fill.position.set(-120, 60, 80); scene.add(fill);
  const pivot = new THREE.Group(); scene.add(pivot);

  // orbit: drag sideways to spin the building, with a little inertia
  let yaw = THREE.MathUtils.degToRad(-32), spin = 0, dragging = null, needsDraw = false, loaded = false;
  const draw = () => {
    renderer.setPixelRatio(Math.min(devicePixelRatio * stageScaleNow(), 2));
    renderer.setSize(W, H, false);
    pivot.rotation.y = yaw;
    renderer.render(scene, camera);
  };
  (function tick() {
    requestAnimationFrame(tick);
    if (!loaded) return;
    if (!dragging && Math.abs(spin) > 0.0004) { yaw += spin; spin *= 0.95; needsDraw = true; }
    if (needsDraw) { draw(); needsDraw = false; }
  })();
  canvas.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    canvas.setPointerCapture(e.pointerId);
    dragging = { x: e.clientX, lastX: e.clientX, lastT: performance.now(), moved: false };
    spin = 0;
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    const dx = e.clientX - dragging.lastX, now = performance.now();
    if (Math.abs(e.clientX - dragging.x) > 4) dragging.moved = true;
    if (dragging.moved) {
      const k = 0.008 / stageScaleNow();
      yaw += dx * k; spin = dx * k * 0.6; needsDraw = true;
      canvas.classList.add('spinning');
    }
    dragging.lastX = e.clientX; dragging.lastT = now;
  });
  const release = () => {
    if (!dragging) return;
    if (!dragging.moved) { keys.jump = true; setTimeout(() => { keys.jump = false; }, 120); }   // a plain click still jumps
    if (performance.now() - dragging.lastT > 80) spin = 0;                                    // held still before letting go
    dragging = null; canvas.classList.remove('spinning');
  };
  canvas.addEventListener('pointerup', release);
  canvas.addEventListener('pointercancel', release);

  new GLTFLoader().load('assets/office-tower.glb', (gltf) => {
    const m = gltf.scene;
    m.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    const box = new THREE.Box3().setFromObject(m);
    const size = box.getSize(new THREE.Vector3()), c = box.getCenter(new THREE.Vector3());
    m.position.set(-c.x, -box.min.y, -c.z);
    pivot.add(m);
    const R = size.length() / 2, h = size.y;
    const r = Math.max(size.x, size.z);
    key.shadow.camera.left = -r; key.shadow.camera.right = r; key.shadow.camera.top = r; key.shadow.camera.bottom = -r;
    key.shadow.camera.near = 1; key.shadow.camera.far = 600; key.shadow.camera.updateProjectionMatrix();
    // street-level camera close to the building, tilted up: Mario's point of view
    const footprint = Math.max(size.x, size.z) / 2;
    const dist = footprint * 2.05;
    camera.position.set(0, h * 0.07, dist);            // eye height of someone on the pavement
    camera.lookAt(0, h * 0.56, 0);                     // looking up, with the roof sign kept in frame
    camera.near = dist * 0.05; camera.updateProjectionMatrix();
    loaded = true; needsDraw = true;
  }, undefined, (err) => console.error('tower failed to load', err));
  addEventListener('stagescale', () => { needsDraw = true; });
}

function addBush(x, base, scale = 1, layer = levelEl) {
  const el = clone(tpl.hill, { left: x + 'px', top: (base - 224 * scale + 12) + 'px', transform: `scale(${scale})`, transformOrigin: 'top left' });
  layer.appendChild(el);
  decor.push({ x, el });
}

// first chunk = the hero scene, so the start is seamless
function buildIntro() {
  addPlatform(0, GROUND_TOP, 1171, 'sm');     // runs under the ramp so there is no hole
  addBush(77, GROUND_TOP + 14);
  addSlope(1018, GROUND_TOP);
  addPlatform(1171, 878, 596);
  addPipe(1772, 878, 279, true);          // pipe top at 599, as in the design
  [[1265, 802], [1345, 724], [1425, 646], [1505, 568]].forEach(([x, y]) => addCoin(x, y));
  // the pipe sits on this platform; continue it under and past the pipe, then a flat run for the tower
  addPlatform(1767, 878, 1250);
  addTower(2010, 878);
  genX = 3017; genTop = 878; forceGround = true;
  lastBillboardX = 1300;                          // first billboard comes a little after the tower
}

// ---------- procedural generation ----------
function generate(untilX) {
  while (genX < untilX) {
    if (forceGround || chance(0.7)) { forceGround = false; genGround(); }
    else genGap();
  }
}
function genGround() {
  // maybe change level (step up needs a jump; step down is free)
  let top = genTop;
  if (chance(0.45)) {
    const opts = LEVELS.filter(l => l !== genTop && Math.abs(l - genTop) <= 260);
    if (opts.length) top = pick(opts);
  }
  const bbDue = genX - lastBillboardX >= BB_EVERY;
  if (bbDue) top = GROUND_TOP;                                       // tall boards only on the base ground, so they fit under the nav
  const w = Math.round(bbDue ? rnd(1700, 2100) : rnd(560, 1300));
  if (top < genTop && genTop - top === 127 && chance(0.6)) {   // decorative ramp into a step up
    addSlope(genX - 100, genTop);
  }
  addPlatform(genX, top, w, top === GROUND_TOP ? 'sm' : 'md');

  // bushes behind
  if (chance(0.5)) addBush(genX + rnd(40, w - 220), top + 14, rnd(0.5, 1));

  // a pipe mid-run (needs room on both sides)
  let pipeX = -1;
  if (!bbDue && w >= 760 && chance(0.55)) {
    pipeX = Math.round(genX + rnd(260, w - 400));
    addPipe(pipeX, top, pick([180, 240]), chance(0.65));
  }

  // a billboard every few screens, on a wide run and away from the pipe
  if (bbDue) addBillboard(Math.round(genX + (w - BB_W) / 2), top);

  // coins: a line, or an arc over the pipe
  if (pipeX > 0) coinArc(pipeX - 110, top - 260, pipeX + 254, 160, 5);
  else if (chance(0.7)) {
    const n = 3 + Math.floor(rnd(0, 3)), cx = genX + rnd(120, Math.max(130, w - 120 - n * 80));
    for (let i = 0; i < n; i++) addCoin(cx + i * 80, top - rnd(150, 230) - 53);
  }

  genX += w; genTop = top;
}
function genGap() {
  const w = Math.round(rnd(230, 390));
  coinArc(genX - 40, genTop - 40, genX + w + 40, 170, 4);
  genX += w; forceGround = true;
}
function genBackground(untilX) {
  while (bgX < untilX) {
    addBush(bgX, GROUND_TOP + 40, rnd(1.0, 1.4), bgEl);
    bgX += rnd(1100, 1800);
  }
}
let bgX = 600;

function cull() {
  const limit = cameraX - 1600;
  const drop = (arr, right) => { for (let i = arr.length - 1; i >= 0; i--) { if (right(arr[i]) < limit) { arr[i].el.remove(); if (arr[i].slot) arr[i].slot.remove(); arr.splice(i, 1); } } };
  drop(solids, o => o.x + o.w); drop(slopes, o => o.x + o.w); drop(coins, o => o.x + 60);
  drop(plants, o => o.x + 80); drop(decor, o => o.x + 400); drop(boards, o => o.x + o.w);
}

// ---------- input ----------
const keys = { left: false, right: false, jump: false };
const KEYMAP = { ArrowLeft: 'left', a: 'left', A: 'left', ArrowRight: 'right', d: 'right', D: 'right', ' ': 'jump', ArrowUp: 'jump', w: 'jump', W: 'jump' };
addEventListener('keydown', (e) => {
  if (!playing) return;
  const k = KEYMAP[e.key]; if (!k) return;
  if (e.target && e.target.closest && e.target.closest('input, textarea, [role=slider], .contact')) return;
  e.preventDefault(); keys[k] = true;
});
addEventListener('keyup', (e) => { const k = KEYMAP[e.key]; if (k) keys[k] = false; });
addEventListener('blur', () => { keys.left = keys.right = keys.jump = false; });

// primary click / trackpad click / tap anywhere = jump (nav, menu and touch buttons excepted)
document.addEventListener('pointerdown', (e) => {
  if (!playing || e.button !== 0) return;
  if (e.target && e.target.closest && e.target.closest('.tbtn, .tools, .crumb, .bar, .help, .billboard, .tower, .contact')) return;
  keys.jump = true; setTimeout(() => { keys.jump = false; }, 120);
});

// scroll = run: trackpad swipe left/right, or mouse wheel (down = forward, up = back)
let scrollDir = 0, scrollT = 0;
addEventListener('wheel', (e) => {
  if (!playing) return;
  if (e.target && e.target.closest && e.target.closest('.tools, .bar, .contact')) return;   // volume dial keeps its own wheel
  e.preventDefault();
  const d = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
  if (Math.abs(d) < 0.5) return;
  scrollDir = Math.sign(d);
  scrollT = 0.22;                                   // keeps running briefly between wheel events
}, { passive: false });
for (const b of document.querySelectorAll('.tbtn')) {
  const k = b.dataset.key;
  const down = (e) => { e.preventDefault(); keys[k] = true; b.classList.add('held'); };
  const up = () => { keys[k] = false; b.classList.remove('held'); };
  b.addEventListener('pointerdown', down); b.addEventListener('pointerup', up);
  b.addEventListener('pointercancel', up); b.addEventListener('pointerleave', up);
}

// ---------- physics ----------
function groundAt(x) {                      // slope surface height at x, or Infinity
  let y = Infinity;
  for (const s of slopes) if (x >= s.x && x <= s.x + s.w) y = Math.min(y, s.yL + (s.yR - s.yL) * ((x - s.x) / s.w));
  return y;
}
function overlaps(ax, ay, aw, ah, b) { return ax < b.x + b.w && ax + aw > b.x && ay < b.y + b.h && ay + ah > b.y; }

function step(dt) {
  const p = player;
  // horizontal
  if (scrollT > 0) scrollT -= dt;
  const want = ((keys.right ? 1 : 0) - (keys.left ? 1 : 0)) || (scrollT > 0 ? scrollDir : 0);
  if (p.hurtT > P.invuln - 0.35) { /* knocked back: no control for a moment */ }
  else if (want) { p.vx += want * P.accel * dt; p.facing = want; }
  else { const s = Math.sign(p.vx); p.vx -= s * Math.min(Math.abs(p.vx), P.decel * dt); }
  p.vx = Math.max(-P.maxRun, Math.min(P.maxRun, p.vx));

  // jump: coyote time after leaving an edge, and buffered presses just before landing
  if (p.grounded) p.coyote = P.coyote; else p.coyote -= dt;
  if (keys.jump) {
    if (p.canJump) { p.buffer = P.buffer; p.canJump = false; }
  } else {
    p.canJump = true;
    if (p.jumpHeld && p.vy < P.jumpCut) p.vy = P.jumpCut;   // release early = lower jump, but never a tiny hop
    p.jumpHeld = false;
  }
  if (p.buffer > 0) {
    p.buffer -= dt;
    if (p.coyote > 0) { p.vy = P.jumpV; p.grounded = false; p.coyote = 0; p.buffer = 0; p.jumpHeld = keys.jump; sfx.jump(); }
  }
  p.vy = Math.min(P.terminal, p.vy + P.gravity * dt);

  // move X, resolve against solids
  const prevFeet = p.feet;
  p.x += p.vx * dt;
  if (p.x < P.halfW) { p.x = P.halfW; p.vx = 0; }
  let bx = p.x - P.halfW, by = p.feet - P.height;
  for (const s of solids) {
    if (!overlaps(bx, by + 6, P.halfW * 2, P.height - 8, s)) continue;
    if (p.vx > 0 && bx + P.halfW * 2 > s.x && bx < s.x) { p.x = s.x - P.halfW; p.vx = 0; }
    else if (p.vx < 0 && bx < s.x + s.w && bx + P.halfW * 2 > s.x + s.w) { p.x = s.x + s.w + P.halfW; p.vx = 0; }
    bx = p.x - P.halfW;
  }

  // move Y
  p.feet += p.vy * dt;
  p.grounded = false;
  by = p.feet - P.height;
  for (const s of solids) {
    if (!overlaps(bx + 4, by, P.halfW * 2 - 8, P.height, s)) continue;
    if (p.vy >= 0 && prevFeet <= s.y + 1) {            // landed on top
      p.feet = s.y; p.vy = 0; p.grounded = true;
      if (s.kind === 'plat') { p.safeX = Math.min(Math.max(p.x, s.x + 80), s.x + s.w - 80); p.safeTop = s.y; }
    } else if (p.vy < 0 && prevFeet - P.height >= s.y + s.h - 1) {   // bonked the underside
      p.feet = s.y + s.h + P.height; p.vy = 0;
    }
    by = p.feet - P.height;
  }
  // slopes
  const gy = groundAt(p.x);
  if (gy !== Infinity && p.vy >= 0 && p.feet >= gy - 2 && p.feet <= gy + 70) { p.feet = gy; p.vy = 0; p.grounded = true; }

  // pit → pop back up at the last safe spot (unlimited lives)
  if (p.feet > 1500) respawn();

  // coins
  for (const c of coins) {
    if (c.taken) continue;
    if (Math.abs(c.x + 23 - p.x) < P.halfW + 30 && c.y + 53 > p.feet - P.height && c.y < p.feet) {
      c.taken = true; c.el.classList.add('taken'); p.coins++; sfx.coin(); pulse(hud.coins);
    }
  }

  // plants: pop up and down; touching one hurts (knockback + coin loss) but never kills
  for (const pl of plants) {
    pl.phase += dt;
    const cyc = pl.phase % 3.4;
    pl.offset = cyc < 0.35 ? 109 * (1 - cyc / 0.35) : cyc < 1.75 ? 0 : cyc < 2.1 ? 109 * ((cyc - 1.75) / 0.35) : 109;
    pl.el.style.transform = `scaleX(-1) translateY(${pl.offset.toFixed(1)}px)`;
    if (p.hurtT <= 0 && pl.offset < 70) {
      const hb = { x: pl.x - 30, y: pl.pipeTop - 109 + pl.offset, w: 60, h: 109 - pl.offset };
      if (overlaps(bx + 8, by + 10, P.halfW * 2 - 16, P.height - 10, hb)) hurt(Math.sign(p.x - pl.x) || -1);
    }
  }

  if (p.hurtT > 0) p.hurtT -= dt;

  // footsteps
  if (p.grounded && Math.abs(p.vx) > 120) { p.stepT -= dt * Math.abs(p.vx) / 240; if (p.stepT <= 0) { p.stepT = 1; sfx.step(); } }

  // camera: dead zone, never scrolls past the start
  const sx = p.x - cameraX;
  let target = cameraX;
  if (sx > 760) target = p.x - 760; else if (sx < 460) target = p.x - 460;
  cameraX += (Math.max(0, target) - cameraX) * Math.min(1, dt * 9);

  // world upkeep
  generate(cameraX + STAGE_W + 900);
  genBackground(cameraX * 0.35 + STAGE_W + 600);
  if (((lastT * 2) | 0) % 2 === 0) cull();

  // HUD
  p.best = Math.max(p.best, p.x);
  hud.dist.textContent = String(Math.floor(p.best / 100)).padStart(4, '0');
  hud.coins.textContent = String(p.coins).padStart(2, '0');
}

function hurt(dir) {
  const p = player;
  p.hurtT = P.invuln; p.vx = dir * 520; p.vy = -720; p.grounded = false;
  sfx.hit();
  const lost = Math.min(3, p.coins); p.coins -= lost;
  for (let i = 0; i < lost; i++) {
    const el = clone(tpl.coin, { left: (p.x - 23) + 'px', top: (p.feet - 240) + 'px' });
    el.className = 'lost-coin';
    el.style.setProperty('--dx', `${rnd(-220, 220)}px`); el.style.setProperty('--dy', `${rnd(-320, -120)}px`);
    levelEl.appendChild(el); setTimeout(() => el.remove(), 1000);
  }
  pulse(hud.coins);
}
function respawn() {
  const p = player;
  p.x = p.safeX; p.feet = p.safeTop - 260; p.vx = 0; p.vy = 0; p.hurtT = P.invuln;
  p.coins = Math.max(0, p.coins - 2);
  sfx.respawn(); pulse($('#hud .inf'));
}
function pulse(el) { el.classList.remove('pulse'); void el.offsetWidth; el.classList.add('pulse'); }

// ---------- render ----------
function render(dt, t) {
  levelEl.style.transform = `translateX(${(-cameraX).toFixed(1)}px)`;
  bgEl.style.transform = `translateX(${(-cameraX * 0.35).toFixed(1)}px)`;
  const p = player;
  // glance at a billboard when he's near one; talk about it
  let look = null, here = null;
  for (const b of boards) {
    if (p.x > b.x - 350 && p.x < b.x + b.w + 350) {
      here = b;
      look = { dx: (b.x + b.w / 2) - p.x, dy: (b.y + b.h / 2) - (p.feet - 330) };
      break;
    }
  }
  if (here && !here.greeted && (!here.zone || (p.x > here.zone[0] && p.x < here.zone[1]))) {
    here.greeted = true;
    say(here.text || greeting(), here.text ? 3.8 : 3.2); sfx.talk();
  }
  if (!here && nearBoard && !nearBoard.visited && !nearBoard.mourned) {
    nearBoard.mourned = true;
    say(lament(), 3.4, 'sad'); sfx.sad();
    sadUntil = t + 3.2;
  }
  nearBoard = here;

  const sad = t < sadUntil;
  window.plumber.pose({
    screenX: p.x - cameraX, feetY: p.feet, facing: p.facing, vx: p.vx,
    grounded: p.grounded, hurt: p.hurtT > 0, dt, t, look: sad ? null : look, mood: sad ? 'sad' : null,
  });

  // bubble follows his head
  if (bubble && t < bubble.until) {
    const bx = Math.max(300, Math.min(STAGE_W - 300, p.x - cameraX + 30));
    bubbleEl.style.transform = `translate(${bx.toFixed(0)}px, ${(p.feet - 445).toFixed(0)}px) translate(-50%, -100%)`;
  } else if (bubble) { bubble = null; bubbleEl.classList.remove('show'); }
}

function loop(now) {
  if (!playing) return;
  requestAnimationFrame(loop);
  const t = now / 1000;
  let dt = Math.min(0.033, t - (lastT || t)); lastT = t;
  // sub-step for stable collisions at high speed
  const n = 2; for (let i = 0; i < n; i++) step(dt / n);
  render(dt, t);
  if (hintT > 0) { hintT -= dt; if (hintT <= 0) hint.classList.remove('show'); }
}

// ---------- start ----------
function startGame() {
  if (playing) return;
  playing = true;
  document.body.classList.add('playing');
  if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
  buildIntro();
  generate(STAGE_W + 1200);
  genBackground(STAGE_W + 600);
  window.plumber.setGame(true);
  hint.classList.add('show'); hintT = 5;
  if (matchMedia('(pointer: coarse)').matches) hint.textContent = 'BUTTONS MOVE   A JUMP';
  lastT = 0;
  requestAnimationFrame(loop);
}
$('.cta').addEventListener('click', startGame);
window.startGame = startGame;

// ---------- coming back from a case study: resume at that billboard ----------
function resumeAt(key, saved) {
  const idx = BILLBOARDS.findIndex(b => b.key === key);
  if (idx < 0 || playing) return false;
  bbIndex = idx;                                          // the next billboard generated is this project's
  startGame();
  let board = null;
  for (let guard = 0; guard < 40 && !board; guard++) { generate(genX + 800); board = boards.find(b => b.key === key); }
  if (!board) return false;
  board.greeted = true; board.visited = true; board.mourned = true;
  const p = player, ground = board.y + BB_H - 8;
  p.x = board.x - 340; p.feet = ground; p.safeX = p.x; p.safeTop = ground; p.vx = 0; p.vy = 0;
  if (saved) { p.coins = saved.coins || 0; p.best = Math.max(p.x, saved.best || 0); }
  cameraX = Math.max(0, p.x - 640);
  generate(cameraX + STAGE_W + 900); genBackground(cameraX * 0.35 + STAGE_W + 600);
  hint.classList.remove('show'); hintT = 0;
  return true;
}
(() => {
  let saved = null;
  try { saved = JSON.parse(sessionStorage.getItem('returnTo') || 'null'); sessionStorage.removeItem('returnTo'); } catch (e) {}
  const key = location.hash.slice(1) || (saved && saved.key);
  if (key && resumeAt(key, saved)) history.replaceState(null, '', location.pathname + location.search);
})();
window.__game = { player, hurt, respawn, keys, get cameraX() { return cameraX; } };
