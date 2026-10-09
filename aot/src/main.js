// Bootstrap: renderer, the shared `game` object, module loading (each subsystem is optional so a failure in one
// never takes the game down), the fixed-step loop with render interpolation, and the title flyover.
import * as THREE from 'three';
import { CFG } from './config.js';
import { Input } from './input.js';
import { CollisionWorld } from './core/collision.js';
import { Player } from './player/player.js';
import { Game } from './game.js';
import { toonMaterial } from './core/style.js';

const params = new URLSearchParams(location.search);

class Events {
  constructor() { this.map = new Map(); }
  on(n, f) { (this.map.get(n) || this.map.set(n, []).get(n)).push(f); }
  off(n, f) { const a = this.map.get(n); if (a) { const i = a.indexOf(f); if (i >= 0) a.splice(i, 1); } }
  emit(n, p) { const a = this.map.get(n); if (a) for (const f of a.slice()) { try { f(p); } catch (e) { console.error(n, e); } } }
}

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, params.has('lowres') ? 1 : 1.75));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = !params.has('noshadow');
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.NoToneMapping;

document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x9cc4e4);
scene.fog = new THREE.Fog(0xa9c6dc, 200, 1500);
const camera = new THREE.PerspectiveCamera(CFG.cam.fov, innerWidth / innerHeight, 0.1, 4000);
scene.add(camera);

const game = {
  scene, camera, renderer, events: new Events(), time: 0, mode: 'menu', hitstop: 0,
  collision: new CollisionWorld(), settings: { sens: +(params.get('sens') || 1), invertY: params.has('invert') },
};
game.noRender = params.has('norender');
window.game = game; // handy for debugging and the headless test bench
game.input = new Input(renderer.domElement);

async function load(imp, fn) {
  try { const m = await imp(); return await fn(m); }
  catch (e) { console.error('[module failed]', imp.toString(), e); return null; }
}

// ---------------------------------------------------------------- fallback pieces (used only if a module is missing)
function fallbackWorld() {
  const g = new THREE.Mesh(new THREE.PlaneGeometry(4000, 4000).rotateX(-Math.PI / 2), toonMaterial(0x6f9a4a));
  g.receiveShadow = true; scene.add(g);
  game.collision.setGround(() => 0);
  const wall = new THREE.Mesh(new THREE.BoxGeometry(2400, 50, 12), toonMaterial(0xb8ab92));
  wall.position.set(0, 25, 0); scene.add(wall);
  game.collision.addBox({ center: new THREE.Vector3(0, 25, 0), halfExtents: new THREE.Vector3(1200, 25, 6), material: 'stone' });
  const trunkM = toonMaterial(0x6b4a33);
  let s = 7;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 90; i++) {
    const x = (rnd() - 0.5) * 300, z = 60 + rnd() * 600, r = 2.5 + rnd() * 2, h = 70 + rnd() * 40;
    const m = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.8, r, h, 12), trunkM);
    m.position.set(x, h / 2, z); m.castShadow = true; scene.add(m);
    game.collision.addCylinder({ x, z, y0: 0, y1: h, radius: r, material: 'bark' });
  }
  const sun = new THREE.DirectionalLight(0xfff1dc, 2.2);
  sun.position.set(-200, 400, 150); sun.castShadow = true;
  scene.add(sun, sun.target, new THREE.HemisphereLight(0xcfe6ff, 0x5a6b3a, 1.2));
  return { playerSpawn: { position: new THREE.Vector3(0, 50.5, 0), yaw: 0 }, supplyDepots: [{ position: new THREE.Vector3(40, 51, 0), radius: 4 }], titanSpawns: [], sun, update() {} };
}
function fallbackModel() {
  const root = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.28, 1.0, 4, 8), toonMaterial(0x7a5a3a));
  root.add(body); scene.add(root);
  return { root, update(dt, s) { root.position.copy(s.position); root.lookAt(root.position.clone().add(s.forward)); }, hookOrigin: null };
}

// ---------------------------------------------------------------- boot
const boot = async () => {
  const loading = document.getElementById('loading');
  const say = (t) => { if (loading) loading.querySelector('.msg').textContent = t; };

  say('Raising the Walls…');
  game.world = params.has('testworld') ? fallbackWorld()
    : (await load(() => import('./world/world.js'), (m) => m.buildWorld(game))) || fallbackWorld();
  if (game.world.sun) { game.world.sun.shadow.camera.updateProjectionMatrix?.(); }

  say('Waking the Titans…');
  game.fx = await load(() => import('./fx/effects.js'), (m) => new m.Effects(game));
  game.speedLines = await load(() => import('./fx/effects.js'), (m) => (m.SpeedLines ? new m.SpeedLines(renderer) : null));
  game.audio = params.has('noaudio') ? null : await load(() => import('./audio/audio.js'), (m) => new m.Audio());
  game.hud = await load(() => import('./ui/hud.js'), (m) => new m.Hud(game));
  game.titans = params.has('notitans') ? null : await load(() => import('./titans/titans.js'), (m) => new m.TitanManager(game));

  say('Fitting the ODM gear…');
  game.player = new Player(game);
  game.player.model = (await load(() => import('./player/model.js'), (m) => { const pm = new m.PlayerModel(game); pm.autoGas = false; if (pm.root && !pm.root.parent) scene.add(pm.root); return pm; })) || fallbackModel();
  game.flow = new Game(game);

  // comrades in the air: AI soldiers on the same ODM physics
  game.allies = [];
  if (!params.has('noallies')) await load(() => import('./player/ally.js'), async (am) => {
    const mm = await import('./player/model.js');
    const starts = [[-40, 55, 150], [30, 70, 230], [-80, 45, 300], [90, 60, 190], [0, 80, 360]];
    starts.slice(0, +(params.get('allies') ?? 3)).forEach(([x, y, z], i) => {
      const model = new mm.PlayerModel(game);
      model.autoGas = false;
      if (model.root && !model.root.parent) scene.add(model.root);
      game.allies.push(new am.Ally(game, model, new THREE.Vector3(x, y, z), i * 1.37 + 0.5));
    });
  });

  game.input.onLockChange = (locked) => {
    if (!locked && (game.mode === 'expedition' || game.mode === 'free') && game.player.alive) {
      game.paused = true;
      game.hud?.showPause?.(() => { game.paused = false; game.hud?.hidePause?.(); game.input.lock(); });
    }
  };
  game.input.onLockDenied = () => {
    game.hud?.message?.('Mouse capture is blocked here: move the cursor to look, push it against an edge to keep turning', 5, 'info');
  };
  renderer.domElement.addEventListener('click', () => {
    if ((game.mode === 'expedition' || game.mode === 'free') && !game.input.locked && !game.input.lockDenied && game.player.alive) {
      game.paused = false; game.hud?.hidePause?.(); game.input.lock();
    }
  });
  addEventListener('keydown', (e) => {
    if (e.code === 'KeyM') game.audio?.toggleMute?.();
    if (e.code === 'KeyP' && game.mode !== 'menu') { game.paused = !game.paused; if (game.paused) game.hud?.showPause?.(() => { game.paused = false; game.hud?.hidePause?.(); game.input.lock(); }); else game.hud?.hidePause?.(); }
  });
  addEventListener('resize', () => {
    renderer.setSize(innerWidth, innerHeight);
    camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
    game.speedLines?.setSize?.(innerWidth, innerHeight);
  });

  if (loading) loading.remove();
  if (params.has('play')) game.flow.start(params.get('play') || 'free');
  else game.flow.toMenu();
  window.READY = true;
  requestAnimationFrame(frame);
};

// ---------------------------------------------------------------- loop
const STEP = 1 / CFG.physicsHz;
let last = performance.now(), acc = 0, fpsT = 0, frames = 0;
const _v = new THREE.Vector3(), _n = new THREE.Vector3();

function frame(now) {
  requestAnimationFrame(frame);
  let dt = Math.min((now - last) / 1000, 0.05);
  last = now;
  step(dt);
}

/** One rendered frame. Exposed for the headless bench (window.stepGame) to drive time deterministically. */
function step(dt) {
  const { player, input } = game;
  frames++; fpsT += dt; if (fpsT > 1) { game.fps = frames / fpsT; frames = 0; fpsT = 0; }
  if (game.paused) { input.consume(); renderer.render(scene, camera); return; }

  // hit-stop on kills: time slows for a few frames (the anime's freeze-frame on a nape cut)
  let simDt = dt;
  if (game.hitstop > 0) { game.hitstop -= dt; simDt = dt * 0.12; }
  game.time += simDt;

  const playing = game.mode === 'expedition' || game.mode === 'free';
  input.freeLook = playing && !input.locked && input.lockDenied && player.alive;
  input.edgeTurn(dt);
  if (playing) player.handleInput(input, dt);
  acc += simDt;
  let n = 0;
  while (acc >= STEP && n < 12) {
    if (playing) player.fixedUpdate(STEP);
    for (const a of game.allies) a.fixedUpdate(STEP);
    acc -= STEP; n++;
  }
  if (n === 12) acc = 0;
  try { game.titans?.update(simDt); } catch (e) { console.error('titans.update', e); game._titanErr = (game._titanErr || 0) + 1; if (game._titanErr > 5) game.titans = null; }
  game.collision.updateDynamic();
  if (playing) player.update(simDt, acc / STEP);
  else menuCamera(dt);
  for (const a of game.allies) a.update(simDt, acc / STEP);
  game.flow.update(simDt);
  try { game.fx?.update(simDt); } catch (e) { console.error('fx.update', e); }
  try { game.world?.update?.(simDt, camera.position); } catch (e) { console.error('world.update', e); }

  // keep the shadow frustum centred on the action
  const sun = game.world?.sun;
  if (sun) {
    const c = playing ? player.render : camera.position;
    if (!game._sunOff) game._sunOff = sun.position.clone().sub(sun.target.position).normalize().multiplyScalar(300);
    sun.target.position.set(Math.round(c.x / 4) * 4, Math.round(c.y / 4) * 4, Math.round(c.z / 4) * 4);
    sun.position.copy(sun.target.position).add(game._sunOff);
    sun.target.updateMatrixWorld();
  }

  if (game.hud?.update) game.hud.update(hudState(playing));
  input.consume();

  if (game.noRender) return;
  renderer.render(scene, camera);
  if (game.speedLines) {
    const s = playing ? player.speed : 0;
    game.speedLines.setIntensity(THREE.MathUtils.clamp((s - 32) / 50, 0, 1) * (player.alive ? 1 : 0));
    game.speedLines.render();
  }
}
window.stepGame = step;

function hudState(playing) {
  const p = game.player;
  const markers = [];
  if (playing && game.titans?.titans) {
    for (const t of game.titans.titans) {
      if (!t.alive || !t.napeWorld) continue;
      const nw = t.napeWorld();
      if (!nw?.center) continue;
      const d = nw.center.distanceTo(p.render);
      if (d > 110) continue;
      _v.copy(nw.center).project(camera);
      const vis = _v.z < 1 && Math.abs(_v.x) < 1.1 && Math.abs(_v.y) < 1.1;
      markers.push({ x: (_v.x * 0.5 + 0.5) * innerWidth, y: (-_v.y * 0.5 + 0.5) * innerHeight, visible: vis, distance: d });
    }
  }
  return {
    playing, mode: game.mode,
    gas: p.infiniteGas ? 1 : p.odm.gas, blade: p.blade, bladesSpare: p.spares, hp: Math.max(0, p.hp),
    kills: p.stats.kills, score: game.flow.score, speed: playing ? p.speed : 0, combo: game.flow.combo,
    hooks: p.odm.hooks.map((h) => ({ state: h.state === 'retracting' ? 'idle' : h.state })),
    aim: { valid: p.aim.valid, distance: p.aim.distance, lockTitan: p.aim.lockTitan },
    napeMarkers: markers, objective: playing ? game.flow.objective() : '', fps: game.fps,
    grabbed: !!p.grabbedBy, struggle: p.struggle, swapping: p.swapT > 0, wave: game.flow.wave,
  };
}

// cinematic title flyover: drift along the wall, looking out over the field toward the giant forest
function menuCamera(dt) {
  const t = game.time * 0.05;
  const x = Math.sin(t) * 160;
  camera.position.set(x, 64 + Math.sin(t * 1.7) * 6, -18 + Math.cos(t * 0.8) * 8);
  _n.set(x * 0.4 + Math.sin(t * 0.6) * 60, 30, 260);
  camera.up.set(0, 1, 0);
  camera.lookAt(_n);
  if (Math.abs(camera.fov - 62) > 0.01) { camera.fov = 62; camera.updateProjectionMatrix(); }
  game.audio?.setWind?.(6);
  game.audio?.setReel?.(0); game.audio?.setGas?.(0);
  if (game.player?.model?.root) game.player.model.root.visible = false;
}

boot();
