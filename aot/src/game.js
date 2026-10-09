// Game flow: title flyover, the Expedition (waves of titans, the Colossal on wave 3), Free Flight, score and combos.
import * as THREE from 'three';

const WAVES = [
  { msg: 'WAVE 1 — TITANS IN THE FIELD', field: 4, forest: 0, town: 0, abnormal: 0, sizes: [4, 9] },
  { msg: 'WAVE 2 — THEY ARE COMING FROM THE FOREST', field: 3, forest: 3, town: 0, abnormal: 1, sizes: [5, 13] },
  { msg: 'WAVE 3', field: 2, forest: 0, town: 3, abnormal: 1, sizes: [4, 12], colossal: true },
  { msg: 'WAVE 4 — THE FOREST OF GIANT TREES', field: 1, forest: 6, town: 0, abnormal: 2, sizes: [6, 15] },
];

export class Game {
  constructor(game) {
    this.g = game;
    this.wave = 0; this.score = 0; this.combo = 1; this.comboT = 0;
    this.waveClear = 0;
    this.menuT = 0;
    const ev = game.events;
    ev.on('titan:killed', (e) => this._onKill(e));
    ev.on('player:hit', (e) => this._onHit(e));
    ev.on('player:died', (e) => this._onDeath(e));
    ev.on('titan:step', (e) => this._onStep(e));
    ev.on('colossal:appear', () => {
      game.hud?.message?.('THE COLOSSAL TITAN HAS APPEARED', 4.5, 'big');
      game.player.cam.trauma = 1;
      this.colossal = true;
    });
    ev.on('player:grabbed', () => game.hud?.message?.('GRABBED! — MASH LEFT MOUSE TO CUT FREE', 2.2, 'warn'));
    ev.on('player:escaped', () => game.hud?.message?.('CUT FREE!', 1.2, 'info'));
    ev.on('player:bladeBroken', () => game.hud?.message?.(game.player.spares > 0 ? 'BLADES DULL — PRESS R' : 'NO BLADES LEFT — FIND A SUPPLY DEPOT', 2, 'warn'));
  }

  // ---------------------------------------------------------------- modes
  toMenu() {
    const g = this.g;
    g.mode = 'menu';
    g.titans?.clear?.();
    // a few titans wandering the field behind the menu for atmosphere
    this._spawnSome('field', 3, [5, 12], 0);
    g.hud?.showMenu?.((mode) => this.start(mode));
  }

  start(mode) {
    const g = this.g;
    g.hud?.hideMenu?.(); g.hud?.hideDeath?.(); g.hud?.hidePause?.();
    g.audio?.init?.();
    g.mode = mode;
    g.titans?.clear?.();
    const sp = g.world?.playerSpawn || { position: new THREE.Vector3(0, 50.6, 0), yaw: 0 };
    g.player.reset(sp.position.clone().add(new THREE.Vector3(0, 0.6, 0)), sp.yaw);
    g.player.infiniteGas = mode === 'free';
    this.wave = 0; this.score = 0; this.combo = 1; this.comboT = 0; this.colossal = false; this.waveClear = 0;
    this.startTime = g.time;
    g.input.lock();
    if (mode === 'expedition') {
      g.hud?.message?.('DEDICATE YOUR HEART', 2.6, 'big');
      this.waveClear = 2.5; // first wave after the title card
      g.audio?.setMusic?.(0.5);
    } else {
      g.hud?.message?.('FREE FLIGHT — the forest is yours. Infinite gas.', 3.5, 'info');
      g.audio?.setMusic?.(0.25);
    }
  }

  _nextWave() {
    const g = this.g;
    const idx = this.wave;
    const w = WAVES[Math.min(idx, WAVES.length - 1)];
    const scale = 1 + Math.max(0, idx - WAVES.length + 1) * 0.35;
    this.wave++;
    g.hud?.message?.(idx >= WAVES.length ? `WAVE ${this.wave} — THE HORDE GROWS` : w.msg, 3, 'big');
    this._spawnSome('field', Math.round(w.field * scale), w.sizes, Math.round(w.abnormal * scale * 0.5));
    this._spawnSome('forest', Math.round(w.forest * scale), w.sizes, Math.round(w.abnormal * scale * 0.5));
    this._spawnSome('town', Math.round(w.town * scale), w.sizes, 0);
    if (w.colossal && !this.colossalSpawned) {
      this.colossalSpawned = true;
      setTimeout(() => { if (g.mode === 'expedition') g.titans?.spawn?.({ kind: 'colossal', position: new THREE.Vector3(0, 0, 28), yaw: Math.PI }); }, 3500);
    }
    g.audio?.setMusic?.(Math.min(1, 0.55 + this.wave * 0.12));
  }

  _spawnSome(area, count, sizes, abnormals) {
    const g = this.g;
    if (!g.titans?.spawn || count <= 0) return;
    const zones = (g.world?.titanSpawns || []).filter((z) => z.area === area);
    const fallback = { field: { center: new THREE.Vector3(0, 0, 100), radius: 70 }, forest: { center: new THREE.Vector3(0, 0, 260), radius: 120 }, town: { center: new THREE.Vector3(0, 0, -80), radius: 40 } }[area];
    for (let i = 0; i < count; i++) {
      const z = zones.length ? zones[(Math.random() * zones.length) | 0] : fallback;
      const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * z.radius;
      const pos = new THREE.Vector3(z.center.x + Math.cos(a) * r, 0, z.center.z + Math.sin(a) * r);
      pos.y = g.collision.groundHeight(pos.x, pos.z);
      const h = sizes[0] + Math.random() * (sizes[1] - sizes[0]);
      try { g.titans.spawn({ kind: i < abnormals ? 'abnormal' : 'normal', height: h, position: pos, yaw: Math.random() * Math.PI * 2 }); }
      catch (err) { console.warn('spawn failed', err); }
    }
  }

  // ---------------------------------------------------------------- events
  _onHit(e) {
    const g = this.g;
    const { damage, result, point, part } = e;
    if (!g.hud?.damageNumber) return;
    const sp = point.clone().project(g.camera);
    if (sp.z < 1) {
      const x = (sp.x * 0.5 + 0.5) * innerWidth, y = (-sp.y * 0.5 + 0.5) * innerHeight;
      g.hud.damageNumber(damage, x, y, !!result?.killed);
    }
    if (!result?.killed && part === 'nape' && result?.effect === 'shallow') g.hud?.message?.('TOO SLOW — HIT THE NAPE FASTER', 1.4, 'warn');
    if (result?.effect === 'blind') g.hud?.message?.('BLINDED', 1, 'info');
    if (result?.effect === 'cripple') g.hud?.message?.('ANKLE CUT — IT\'S DOWN', 1.2, 'info');
  }

  _onKill(e) {
    const g = this.g;
    if (g.mode === 'menu') return;
    const t = e.titan;
    const p = g.player;
    if (this.comboT > 0) this.combo = Math.min(9, this.combo + 1); else this.combo = 1;
    this.comboT = 7;
    const base = t?.kind === 'colossal' ? 5000 : Math.round(100 + (t?.height || 8) * 25);
    const speedBonus = Math.round(p.speed * 4);
    this.score += (base + speedBonus) * this.combo;
    p.stats.kills++;
    if (t?.kind === 'colossal') g.hud?.message?.('THE COLOSSAL TITAN HAS FALLEN', 4, 'big');
    else if (this.combo > 1) g.hud?.message?.(`${this.combo}× COMBO`, 1.2, 'info');
  }

  _onDeath(e) {
    const g = this.g;
    const p = g.player;
    const cause = { eaten: 'YOU WERE EATEN', impact: 'YOU HIT THE GROUND TOO HARD', struck: 'CRUSHED BY A TITAN', fell: 'YOU FELL' }[e.cause] || 'YOU DIED';
    g.audio?.setMusic?.(0.1);
    setTimeout(() => {
      g.input.unlock();
      g.hud?.showDeath?.({ cause, kills: p.stats.kills, score: this.score, time: Math.round(g.time - (this.startTime || 0)), wave: this.wave, topSpeed: Math.round(p.stats.topSpeed * 3.6) }, () => this.start(g.mode === 'free' ? 'free' : 'expedition'));
    }, e.cause === 'eaten' ? 1400 : 900);
  }

  _onStep(e) {
    const p = this.g.player;
    if (!e?.position) return;
    const d = e.position.distanceTo(p.render);
    const s = (e.size || 8) / Math.max(8, d);
    p.cam.trauma = Math.min(1, p.cam.trauma + Math.min(0.35, s * s * 0.5));
  }

  // ---------------------------------------------------------------- per frame
  update(dt) {
    const g = this.g;
    this.comboT -= dt;
    if (this.comboT <= 0) this.combo = 1;
    if (g.mode === 'expedition' && g.player.alive) {
      const alive = (g.titans?.titans || []).filter((t) => t.alive && t.kind !== 'colossal').length;
      if (this.waveClear > 0) {
        this.waveClear -= dt;
        if (this.waveClear <= 0) this._nextWave();
      } else if (alive === 0 && !(this.colossalSpawned && this.wave === 3 && (g.titans?.titans || []).some((t) => t.kind === 'colossal' && t.alive))) {
        if (this.wave > 0) g.hud?.message?.(`WAVE ${this.wave} CLEARED`, 2.5, 'info');
        this.waveClear = 4;
      }
    }
  }

  objective() {
    const g = this.g;
    if (g.mode === 'free') return 'FREE FLIGHT · fly through the Forest of Giant Trees · supply depots refill you';
    if (g.mode !== 'expedition') return '';
    const alive = (g.titans?.titans || []).filter((t) => t.alive).length;
    if (this.waveClear > 0 && this.wave > 0) return `Wave ${this.wave} cleared · next wave incoming`;
    return `WAVE ${this.wave} · Titans remaining: ${alive} · Cut the nape`;
  }
}
