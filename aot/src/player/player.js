// The soldier: fixed-step body physics (gravity, quadratic drag, ODM wires, gas thrust, swept sphere contacts),
// ground running, blades and nape strikes, being grabbed, and the third-person camera.
import * as THREE from 'three';
import { CFG } from '../config.js';
import { OdmGear } from './odm.js';

const UP = new THREE.Vector3(0, 1, 0);
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(), _d = new THREE.Vector3();
const _e = new THREE.Vector3(), _q = new THREE.Quaternion(), _m = new THREE.Matrix4();
const damp = (k, dt) => 1 - Math.exp(-k * dt);

export class Player {
  constructor(game) {
    this.game = game;
    this.pos = new THREE.Vector3();
    this.prev = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.render = new THREE.Vector3();      // interpolated body centre for drawing
    this.position = this.render;             // public (contract): where the soldier is drawn
    this.velocity = this.vel;
    this.odm = new OdmGear(game, this);
    this.model = null;
    this.yaw = 0; this.pitch = -0.12;
    this.cam = { pos: new THREE.Vector3(), roll: 0, fov: CFG.cam.fov, trauma: 0, dist: CFG.cam.dist, look: new THREE.Vector3() };
    this.forward = new THREE.Vector3(0, 0, 1);
    this.bodyUp = new THREE.Vector3(0, 1, 0);
    this.aim = { valid: false, point: new THREE.Vector3(), distance: 0, lockTitan: false, collider: null, dir: new THREE.Vector3() };
    this._origins = [new THREE.Vector3(), new THREE.Vector3()];
    this.reset(new THREE.Vector3(0, 50.6, 0), 0);
  }

  reset(position, yaw = 0) {
    this.pos.copy(position); this.prev.copy(position); this.render.copy(position);
    this.vel.set(0, 0, 0);
    this.yaw = yaw; this.pitch = -0.15;
    this.alive = true; this.hp = 1; this.lastHurt = -99;
    this.grounded = false; this.groundTime = 0; this.airTime = 0; this.groundN = new THREE.Vector3(0, 1, 0);
    this.wallN = null; this.wallTime = 0;
    this.blade = 1; this.spares = CFG.combat.spares; this.swapT = 0;
    this.slashT = -1; this.slashHit = false; this.spin = false; this.spinT = 0;
    this.dashCd = 0; this.boosting = false; this.boostLevel = 0; this.spaceHeld = 0;
    this.stun = 0; this.grabbedBy = null; this.grabHand = null; this.struggle = 0; this.grabImmune = 0;
    this.reelLevel = 0; this.impactCooldown = 0;
    this.wishF = 0; this.wishR = 0; this.wantBoost = false; this._dashPuff = 0;
    this.odm.reset();
    this.cam.pos.copy(position).add(new THREE.Vector3(Math.sin(yaw) * -5, 2, Math.cos(yaw) * -5));
    this.landed = 0;
    this.stats = { kills: 0, damage: 0, best: 0, start: this.game.time || 0, topSpeed: 0 };
  }

  get speed() { return this.vel.length(); }

  // ---------------------------------------------------------------- input (once per frame)
  handleInput(input, dt) {
    if (!this.alive) return;
    const sens = CFG.cam.sens * (this.game.settings?.sens ?? 1);
    this.yaw -= input.mouseDX * sens;
    this.pitch = THREE.MathUtils.clamp(this.pitch - input.mouseDY * sens * (this.game.settings?.invertY ? -1 : 1), -1.45, 1.45);

    if (this.grabbedBy) {
      if (input.hit('Mouse0') || input.hit('Space')) {
        this.struggle += CFG.combat.grabEscapePerPress * (this.blade > 0 ? 1 : 0.55);
        this.game.audio?.slash?.(true);
        this.slashT = 0;
        if (this.struggle >= 1) this._escapeGrab();
      }
      return;
    }

    // anchors: Q = left, E = right, right mouse = both
    const both = input.held('Mouse2');
    const wantL = input.held('Q') || both, wantR = input.held('E') || both;
    const fireL = input.hit('Q') || input.hit('Mouse2'), fireR = input.hit('E') || input.hit('Mouse2');
    if (this.stun <= 0) {
      if (fireL) this._fire(0, both && fireR);
      if (fireR) this._fire(1, both && fireL);
    }
    if (!wantL) this.odm.release(0);
    if (!wantR) this.odm.release(1);

    // gas dash
    if (input.hit('ShiftLeft') || input.hit('ShiftRight')) this._dash(input);

    // kick off a trunk / wall you are clinging to
    if (input.hit('Space') && this.wallTime > 0 && this.wallN && !this.grounded) {
      this.vel.addScaledVector(this.wallN, 9).y += 6;
      this.odm.releaseAll();
      this.wallTime = 0;
      this.game.audio?.land?.(0.3);
    }
    // jump on ground
    if (input.hit('Space') && this.groundTime < CFG.ground.coyote + 0.01 && this.grounded) {
      this.vel.y = Math.max(this.vel.y, CFG.ground.jump);
      this.grounded = false; this.groundTime = 1;
      this.spaceHeld = 0;
    }
    this.spaceHeld = input.held('Space') ? this.spaceHeld + dt : 0;

    // blades
    if (input.hit('R')) this._swapBlades();
    if (input.hit('Mouse0') && this.swapT <= 0) this._slash();
    this.spin = input.held('Mouse0') && !this.grounded && this.speed > CFG.combat.spinMinSpeed && this.blade > 0 && this.swapT <= 0 && (this.slashT < 0 || this.slashT > 0.15);

    // wish direction (camera-relative)
    const f = input.held('W') ? 1 : 0, b = input.held('S') ? 1 : 0, l = input.held('A') ? 1 : 0, r = input.held('D') ? 1 : 0;
    this.wishF = f - b; this.wishR = r - l;
    this.wantBoost = input.held('Space');
  }

  _camBasis() {
    const cy = Math.cos(this.yaw), sy = Math.sin(this.yaw), cp = Math.cos(this.pitch), sp = Math.sin(this.pitch);
    _a.set(sy * cp, sp, cy * cp); // look forward
    return _a;
  }
  /** Horizontal camera-relative wish direction (unit or zero) into out. */
  _wish(out) {
    const sy = Math.sin(this.yaw), cy = Math.cos(this.yaw);
    out.set(sy * this.wishF - cy * this.wishR, 0, cy * this.wishF + sy * this.wishR);
    const l = out.length();
    return l > 0 ? out.multiplyScalar(1 / l) : out;
  }

  launcher(side, out) {
    if (this.model?.hookOrigin) return this.model.hookOrigin(side, out);
    const sy = Math.sin(this.yaw), cy = Math.cos(this.yaw);
    return out.copy(this.render).add(_e.set(cy * (side ? -0.25 : 0.25), -0.1, -sy * (side ? -0.25 : 0.25)));
  }

  _fire(side, twin) {
    const o = _b.copy(this.pos);
    let target = null;
    if (this.aim.valid) {
      target = _c.copy(this.aim.point);
      if (twin) {
        // splay the pair a little either side of the aim point, but keep both on the same surface if possible
        const right = _d.crossVectors(this.aim.dir, UP).normalize();
        const off = this.aim.distance * CFG.hook.spread * (side ? 1 : -1);
        const alt = this.game.collision.raycast(this.cam.pos, _e.copy(this.aim.point).addScaledVector(right, off).sub(this.cam.pos).normalize(), CFG.hook.range + 15, { hookableOnly: true });
        if (alt && alt.point.distanceTo(this.pos) < CFG.hook.range) target.copy(alt.point);
      }
    }
    const fallback = this.aim.dir;
    if (this.odm.fire(side, o, target, fallback) && this.game.fx?.gas) {
      this.launcher(side, _e); this.game.fx.gas(_e, fallback, 0.3);
    }
  }

  _dash(input) {
    if (this.dashCd > 0 || this.grabbedBy || (!this.infiniteGas && this.odm.gas < CFG.gas.dashCost)) return;
    const w = this._wish(_b);
    if (w.lengthSq() === 0) w.copy(this._camBasis());
    else { const look = this._camBasis(); if (this.wishF > 0) w.y = look.y * 0.8; w.normalize(); }
    this.vel.addScaledVector(w, CFG.gas.dashDv);
    if (!this.infiniteGas) this.odm.gas -= CFG.gas.dashCost;
    this.dashCd = CFG.gas.dashCooldown;
    this.game.audio?.setGas?.(1);
    this._dashPuff = 0.18;
    this.cam.trauma = Math.min(1, this.cam.trauma + 0.12);
  }

  _swapBlades() {
    if (this.swapT > 0 || this.spares <= 0 || this.blade >= 0.999) return;
    this.spares--; this.swapT = CFG.combat.swapTime;
    this.game.audio?.bladeSwap?.();
  }

  _slash() {
    if (this.slashT >= 0 && this.slashT < CFG.combat.slashTime * 0.7) return;
    this.slashT = 0; this.slashHit = false;
    this.game.audio?.slash?.(false);
  }

  // ---------------------------------------------------------------- fixed-step physics
  fixedUpdate(dt) {
    this.prev.copy(this.pos);
    if (!this.alive) { this.vel.set(0, 0, 0); return; }
    if (this.grabbedBy) { this._followHand(); return; }

    const odm = this.odm;
    this.launcher(0, this._origins[0]); this.launcher(1, this._origins[1]);
    // the launcher positions are only for visuals; physics fires from the body centre
    odm.step(dt, this._origins);

    const v = this.vel, p = this.pos;
    const acc = _d.set(0, -CFG.gravity, 0);
    const speed = v.length();

    // quadratic drag (+ a hard ramp above the cap so nothing runs away)
    let k = CFG.drag;
    if (speed > CFG.hardCap) k *= 1 + (speed - CFG.hardCap) * 0.15;
    acc.addScaledVector(v, -k * speed);

    const hasGas = this.infiniteGas || odm.gas > 0;
    const anchored = odm.attachedCount();
    const groundedNow = this.grounded;
    this.boosting = this.wantBoost && hasGas && this.stun <= 0 && (!groundedNow || this.spaceHeld > 0.16 || anchored > 0);

    // winch
    this.reelLevel = this.stun > 0 ? 0 : odm.reelAccel(p, v, this.boosting, acc);
    if (anchored && !this.infiniteGas) odm.gas -= CFG.gas.reelRate * anchored * dt * (this.boosting ? 2 : 1);

    // gas thrust
    const wish = this._wish(_b);
    if (this.boosting) {
      const look = this._camBasis();
      const dir = _c.copy(wish.lengthSq() > 0 ? wish : look);
      if (wish.lengthSq() > 0 && this.wishF > 0) dir.y = look.y; // W boosts where you look
      if (wish.lengthSq() > 0 && this.wishF <= 0) dir.y = Math.max(0, look.y) * 0.5;
      dir.normalize();
      acc.addScaledVector(dir, anchored ? CFG.gas.hookedBoostAccel : CFG.gas.boostAccel);
      if (!this.infiniteGas) odm.gas -= CFG.gas.boostRate * dt;
    }
    if (!this.infiniteGas) odm.gas = Math.max(0, odm.gas);

    if (groundedNow && !anchored) {
      // running: accelerate toward the wish velocity, skid off excess speed
      const n = this.groundN;
      const target = _c.copy(wish).multiplyScalar(CFG.ground.run * (this.stun > 0 ? 0.3 : 1));
      const hv = _e.set(v.x, 0, v.z);
      const hs = hv.length();
      if (hs > CFG.ground.run + 0.5 && wish.dot(hv) > 0) {
        // carrying momentum from the air: skid
        v.x -= (v.x / hs) * CFG.ground.skid * dt; v.z -= (v.z / hs) * CFG.ground.skid * dt;
      } else {
        const dx = target.x - v.x, dz = target.z - v.z, dl = Math.hypot(dx, dz);
        const maxStep = CFG.ground.accel * dt * (hs > CFG.ground.run + 0.5 ? 0.4 : 1);
        const s = dl > maxStep ? maxStep / dl : 1;
        v.x += dx * s; v.z += dz * s;
      }
      // stick to slopes
      acc.addScaledVector(n, -2);
    } else if (anchored) {
      // pump the swing: steer perpendicular to the wire(s)
      const pd = odm.pullDir(p, _c);
      if (pd && wish.lengthSq() > 0) {
        const w = _e.copy(wish);
        w.addScaledVector(pd, -w.dot(pd));
        acc.addScaledVector(w, CFG.air.pump);
      }
    } else if (wish.lengthSq() > 0) {
      acc.addScaledVector(wish, CFG.air.control);
    }

    v.addScaledVector(acc, dt);

    // landing assist: about to hit a surface head-on while flying on the wires (or holding gas)?
    // the front vents fire and bleed off the closing speed, so you land on the trunk like in the anime.
    if ((anchored || this.boosting) && hasGas && !groundedNow) {
      const sp = v.length();
      if (sp > CFG.reel.arrive) {
        const look = (sp * sp) / (2 * CFG.reel.brake) + 3;
        const hit = this.game.collision.raycast(p, _c.copy(v).multiplyScalar(1 / sp), look, { dynamic: false });
        if (hit && hit.normal.dot(_c) < -0.35) {
          const vn = -v.dot(hit.normal);
          const allowed = CFG.reel.arrive + Math.sqrt(2 * CFG.reel.brake * Math.max(0, hit.distance - CFG.radius - 0.6));
          if (vn > allowed) {
            const b = Math.min(CFG.reel.brakeMax, (vn - allowed) * 12);
            v.addScaledVector(hit.normal, b * dt);
            this.odm.braking = 0.15;
          }
        }
      }
    }

    // integrate with swept substeps: never move more than 0.3 m per sub-step
    const travel = v.length() * dt;
    const n = Math.min(12, Math.max(1, Math.ceil(travel / 0.3)));
    const h = dt / n;
    this._hitN = 0;
    let groundedStep = false;
    this.wallN = null;
    for (let i = 0; i < n; i++) {
      p.addScaledVector(v, h);
      odm.constrain(p, v);
      if (this._contacts(p, v, dt)) groundedStep = true;
    }
    if (groundedStep) { this.grounded = true; this.groundTime = 0; }
    else { this.groundTime += dt; if (this.groundTime > CFG.ground.coyote) this.grounded = false; }
    if (this.grounded) this.airTime = 0; else this.airTime += dt;

    // timers
    this.dashCd -= dt; this.stun -= dt; this.grabImmune -= dt; this.impactCooldown -= dt;
    if (this._dashPuff > 0) this._dashPuff -= dt;
    if (this.swapT > 0) { this.swapT -= dt; if (this.swapT <= 0) this.blade = 1; }
    if (this.game.time - this.lastHurt > 4 && this.hp < 1) this.hp = Math.min(1, this.hp + dt * 0.04);
    this.stats.topSpeed = Math.max(this.stats.topSpeed, this.speed);

    this._bounds();
  }

  /** Push the sphere out of everything it overlaps; returns true if standing on something. */
  _contacts(p, v, dt) {
    const R = CFG.radius;
    let grounded = false;
    for (let it = 0; it < 3; it++) {
      const cs = this.game.collision.collideSphere(p, R);
      if (!cs.length) break;
      let any = false;
      for (const c of cs) {
        if (c.depth <= 1e-5) continue;
        any = true;
        p.addScaledVector(c.normal, c.depth);
        const vn = v.dot(c.normal);
        if (vn < 0) {
          // impact
          if (-vn > CFG.impact.safe && this.impactCooldown <= 0) this._impact(-vn, c);
          v.addScaledVector(c.normal, -vn);
          // surface friction: strong on floors when not anchored, slick on walls (wall-running on a wire)
          const tang = _e.copy(v);
          const ts = tang.length();
          if (ts > 1e-4) {
            const floor = c.normal.y > 0.6;
            const mu = floor ? (this.odm.attachedCount() ? 0.15 : 0.0) : 0.06;
            const dv = Math.min(ts, -vn * mu);
            v.addScaledVector(tang, -dv / ts);
          }
        }
        if (c.normal.y > 0.6) { grounded = true; this.groundN.copy(c.normal); }
        else if (Math.abs(c.normal.y) < 0.6) { this.wallN = (this.wallN || new THREE.Vector3()).copy(c.normal); this.wallTime = 0.15; }
        if (c.collider?.dynamic && c.collider.userData?.titan) this._touchTitan = c.collider.userData.titan;
      }
      if (!any) break;
    }
    return grounded;
  }

  _impact(speed, contact) {
    this.impactCooldown = 0.35;
    const s = THREE.MathUtils.clamp((speed - CFG.impact.safe) / 40, 0, 1);
    this.cam.trauma = Math.min(1, this.cam.trauma + 0.25 + s * 0.6);
    this.game.audio?.impact?.(s);
    this.game.fx?.impact?.(this.pos.clone().addScaledVector(contact.normal, -CFG.radius), contact.normal, contact.collider?.material || 'ground');
    const dmg = (speed - CFG.impact.safe) * CFG.impact.dmg;
    if (dmg > 0.02) this.hurt(dmg, 'impact');
    if (speed > CFG.impact.stun) { this.stun = 0.45; this.odm.releaseAll(); }
  }

  _bounds() {
    const p = this.pos, v = this.vel;
    const push = (val, lo, hi) => (val < lo ? lo - val : val > hi ? hi - val : 0);
    const bx = push(p.x, -1100, 1100), bz = push(p.z, -650, 1050);
    if (bx) { v.x += bx * 4 * (1 / 60); if (Math.sign(v.x) !== Math.sign(bx)) v.x *= 0.96; }
    if (bz) { v.z += bz * 4 * (1 / 60); if (Math.sign(v.z) !== Math.sign(bz)) v.z *= 0.96; }
    if (p.y > 420) v.y = Math.min(v.y, 0);
    if (p.y < -50) this.hurt(1, 'fell');
  }

  hurt(amount, cause) {
    if (!this.alive || this.game.mode === 'menu') return;
    if (this.game.mode === 'free') amount *= 0.25;
    this.hp -= amount; this.lastHurt = this.game.time;
    this.game.audio?.hurt?.();
    this.game.events.emit('player:hurt', { amount, cause });
    if (this.hp <= 0) this.die(cause);
  }

  die(cause) {
    if (!this.alive) return;
    this.hp = 0; this.alive = false;
    this.odm.releaseAll(true);
    this.game.events.emit('player:died', { cause });
  }

  // ---------------------------------------------------------------- titan interaction (contract)
  grab(titan, hand) {
    if (!this.alive || this.grabbedBy || this.grabImmune > 0) return false;
    this.grabbedBy = titan; this.grabHand = hand; this.struggle = 0;
    this.odm.releaseAll(true);
    this.vel.set(0, 0, 0);
    this.cam.trauma = Math.min(1, this.cam.trauma + 0.6);
    this.game.audio?.grabbed?.();
    this.game.events.emit('player:grabbed', { titan });
    return true;
  }
  _followHand() {
    const h = this.grabHand;
    if (!h || !this.grabbedBy || this.grabbedBy.alive === false) { this._release(); return; }
    h.getWorldPosition(this.pos);
    this.vel.set(0, 0, 0);
    this.struggle = Math.max(0, this.struggle - CFG.combat.grabDecay / CFG.physicsHz);
  }
  _escapeGrab() {
    const t = this.grabbedBy;
    this._release();
    t?.onGrabEscape?.();
    this.game.fx?.blood?.(this.pos.clone(), new THREE.Vector3(0, 1, 0), 1.2);
    this.game.audio?.slash?.(true);
    const away = _a.subVectors(this.pos, t?.position || this.pos).setY(0);
    if (away.lengthSq() < 1e-4) away.set(0, 0, 1);
    away.normalize();
    this.vel.copy(away).multiplyScalar(14).setY(10);
    this.blade = Math.max(0, this.blade - 0.25);
    this.game.events.emit('player:escaped', {});
  }
  _release() { this.grabbedBy = null; this.grabHand = null; this.grabImmune = 1.6; }
  eaten(titan) {
    if (!this.alive) return;
    this._release();
    this.game.audio?.eaten?.();
    this.die('eaten');
  }
  applyImpulse(dv, damage = 0) {
    if (!this.alive || this.grabbedBy) return;
    this.vel.add(dv);
    this.cam.trauma = Math.min(1, this.cam.trauma + 0.35);
    if (damage) this.hurt(damage / 100, 'struck');
  }

  // ---------------------------------------------------------------- per-frame (variable dt)
  update(dt, alpha) {
    const game = this.game;
    this.render.lerpVectors(this.prev, this.pos, alpha);
    const v = this.vel, speed = v.length();

    // blades & combat
    if (this.slashT >= 0) {
      this.slashT += dt;
      if (!this.slashHit && this.slashT > CFG.combat.slashTime * 0.3) { this.slashHit = true; this._strike(CFG.combat.reach + speed * 0.025, false); }
      if (this.slashT > CFG.combat.slashTime) this.slashT = -1;
    }
    if (this.spin) {
      this.spinT += dt;
      if (this.spinT > CFG.combat.spinInterval) { this.spinT = 0; this._strike(CFG.combat.reach + 1 + speed * 0.02, true); }
    } else this.spinT = CFG.combat.spinInterval;

    // aim: ray from the camera through the crosshair, with a little magnetism toward hookable surfaces
    this._updateAim();

    // body orientation for the model
    const anchored = this.odm.attachedCount();
    const tf = _a;
    if (this.grounded && !anchored) {
      tf.set(v.x, 0, v.z);
      if (tf.lengthSq() < 0.5) tf.set(Math.sin(this.yaw), 0, Math.cos(this.yaw));
    } else if (speed > 2.5) tf.copy(v);
    else tf.set(Math.sin(this.yaw), 0, Math.cos(this.yaw));
    tf.normalize();
    this.forward.lerp(tf, damp(this.grounded ? 14 : 7, dt)).normalize();
    const upT = _b.copy(UP);
    const pd = this.odm.pullDir(this.render, _c);
    if (pd && !this.grounded) upT.lerp(pd, 0.55);
    if (this.wallN && this.wallTime > 0 && anchored) upT.copy(this.wallN);
    upT.addScaledVector(this.forward, -upT.dot(this.forward));
    if (upT.lengthSq() < 1e-4) upT.copy(UP);
    upT.normalize();
    this.bodyUp.lerp(upT, damp(6, dt)).normalize();
    this.wallTime -= dt;

    if (this.model) {
      const hooks = this.odm.hooks.map((h) => ({ attached: h.attached, anchor: h.attached ? h.anchor : null, state: h.state }));
      const run = this.grounded ? Math.min(1, Math.hypot(v.x, v.z) / CFG.ground.run) : (this.wallN && anchored ? 1 : 0);
      const slash = this.slashT >= 0 ? this.slashT / CFG.combat.slashTime : -1;
      this.boostLevel += ((this.boosting || this._dashPuff > 0 ? 1 : 0) - this.boostLevel) * damp(18, dt);
      this.model.update(dt, {
        position: this.render, velocity: v, forward: this.forward, up: this.bodyUp,
        grounded: this.grounded, running: run, hooks, boosting: this.boostLevel, slash,
        spin: this.spin, grabbed: !!this.grabbedBy, blades: this.blade > 0 && this.swapT <= 0, speed,
        alive: this.alive,
      });
      if (this.model.root) this.model.root.visible = this.alive || !!this.grabbedBy;
    }

    // gas puffs
    if ((this.boosting || this._dashPuff > 0) && game.fx?.gas) {
      const np = _c, nd = _d;
      if (this.model?.gasNozzle) this.model.gasNozzle(np, nd);
      else { np.copy(this.render).addScaledVector(this.forward, -0.4); nd.copy(this.forward).negate(); }
      game.fx.gas(np, nd, this._dashPuff > 0 ? 1 : 0.7);
    }

    // wires
    this.launcher(0, this._origins[0]); this.launcher(1, this._origins[1]);
    this.odm.render(this._origins, game.camera, game.time);

    // leaves when blasting through canopies (no collider: we just test the world's foliage callback)
    if (speed > 25 && game.world?.inFoliage?.(this.render) && Math.random() < dt * 20) game.fx?.leaves?.(this.render, 4);

    this._camera(dt);
    this._audio(dt);
    this._supply(dt);
  }

  _updateAim() {
    const cam = this.game.camera;
    const dir = this.aim.dir.set(0, 0, -1).applyQuaternion(cam.quaternion);
    const col = this.game.collision;
    const range = CFG.hook.range;
    const camToBody = cam.position.distanceTo(this.render);
    let hit = col.raycast(cam.position, dir, range + camToBody + 5, { hookableOnly: true });
    const ok = (h) => h && h.point.distanceTo(this.render) <= range && h.distance > camToBody * 0.6;
    if (!ok(hit)) {
      // magnetism: probe a small cone and take the nearest-to-centre valid surface
      let best = null, bestAng = 1e9;
      const right = _c.crossVectors(dir, UP).normalize(), up = _d.crossVectors(right, dir).normalize();
      for (const ring of [0.035, 0.07]) for (let i = 0; i < 8; i++) {
        const t = (i / 8) * Math.PI * 2;
        const d2 = _e.copy(dir).addScaledVector(right, Math.cos(t) * ring).addScaledVector(up, Math.sin(t) * ring).normalize();
        const hh = col.raycast(cam.position, d2, range + camToBody + 5, { hookableOnly: true });
        if (ok(hh) && ring + i * 1e-4 < bestAng) { best = hh; bestAng = ring + i * 1e-4; }
      }
      if (best) hit = best;
    }
    const valid = ok(hit);
    this.aim.valid = valid;
    if (valid) { this.aim.point.copy(hit.point); this.aim.distance = hit.point.distanceTo(this.render); this.aim.collider = hit.collider; }
    else { this.aim.distance = hit ? hit.point.distanceTo(this.render) : Infinity; this.aim.collider = null; }
    this.aim.lockTitan = !!(valid && hit.collider?.userData?.titan);
  }

  _strike(radius, spin) {
    if (this.blade <= 0 || this.swapT > 0) { if (!spin) this.game.audio?.bladeBreak?.(); return; }
    const titans = this.game.titans;
    if (!titans?.hitTest) return;
    // reach forward along the motion (or the camera), generous like the anime's blur of steel
    const look = this._camBasis();
    const dir = this.speed > 6 ? _b.copy(this.vel).normalize().lerp(look, 0.35).normalize() : _b.copy(look);
    const center = _c.copy(this.render).addScaledVector(dir, spin ? 0.6 : 1.3);
    const hits = titans.hitTest(center, radius);
    if (!hits || !hits.length) return;
    // best part: nape > eye > ankle > others
    const rank = { nape: 5, eye: 4, ankle: 3, hand: 2, arm: 2, body: 1 };
    const seen = new Set();
    hits.sort((x, y) => (rank[y.part] || 0) - (rank[x.part] || 0));
    for (const hit of hits) {
      if (seen.has(hit.titan) || !hit.titan.alive) continue;
      seen.add(hit.titan);
      const tv = hit.titan.velocity || _e.set(0, 0, 0);
      const rel = _d.subVectors(this.vel, tv).length();
      const sharp = 0.55 + 0.45 * this.blade;
      const damage = Math.round((CFG.combat.dmgBase + rel * CFG.combat.dmgPerMs) * sharp * (spin ? 1.1 : 1));
      const res = hit.titan.applyHit({ part: hit.part, damage, point: hit.point.clone(), dir: dir.clone() }) || {};
      this.blade = Math.max(0, this.blade - CFG.combat.wear * (hit.part === 'nape' ? 1 : 0.7));
      this.game.audio?.slash?.(true);
      this.game.fx?.blood?.(hit.point, dir, res.killed ? 2 : 1);
      this.game.events.emit('player:hit', { titan: hit.titan, part: hit.part, damage, result: res, point: hit.point.clone() });
      this.stats.damage += damage;
      if (this.blade <= 0) { this.game.audio?.bladeBreak?.(); this.game.events.emit('player:bladeBroken', {}); }
      this.cam.trauma = Math.min(1, this.cam.trauma + (res.killed ? 0.5 : 0.2));
      if (res.killed) this.game.hitstop = 0.07;
    }
    if (this.game.fx?.slashArc) {
      _q.setFromRotationMatrix(_m.lookAt(_a.set(0, 0, 0), dir, UP));
      this.game.fx.slashArc(center, _q, radius * 0.8);
    }
  }

  _camera(dt) {
    const cam = this.game.camera, c = this.cam;
    const speed = this.speed;
    // trauma-based shake
    c.trauma = Math.max(0, c.trauma - dt * 1.4);
    const sh = c.trauma * c.trauma;
    const t = this.game.time;
    const shx = (Math.sin(t * 47.3) + Math.sin(t * 31.1 + 1.3)) * 0.5 * sh, shy = (Math.sin(t * 53.7 + 2.1) + Math.sin(t * 29.3)) * 0.5 * sh;

    const yaw = this.yaw + shx * 0.03, pitch = this.pitch + shy * 0.03;
    const cp = Math.cos(pitch), sp = Math.sin(pitch), cy = Math.cos(yaw), sy = Math.sin(yaw);
    const fwd = _a.set(sy * cp, sp, cy * cp);
    const right = _b.set(-cy, 0, sy);
    const targetDist = CFG.cam.dist + Math.min(speed, 90) * 0.028 + (this.grabbedBy ? 3 : 0);
    c.dist += (targetDist - c.dist) * damp(3, dt);
    // pivot: over the shoulder, a bit higher when standing
    const pivot = _c.copy(this.render).addScaledVector(UP, CFG.cam.height).addScaledVector(right, CFG.cam.side);
    const want = _d.copy(pivot).addScaledVector(fwd, -c.dist);
    // keep the camera out of walls/trees: cast from the body to the wanted spot
    const toCam = _e.subVectors(want, pivot);
    const len = toCam.length();
    toCam.multiplyScalar(1 / len);
    const block = this.game.collision.raycast(pivot, toCam, len + 0.4, { dynamic: false });
    if (block) want.copy(pivot).addScaledVector(toCam, Math.max(0.4, block.distance - 0.4));
    c.pos.copy(want);
    cam.position.copy(c.pos);
    cam.up.copy(UP);
    c.look.copy(pivot).addScaledVector(fwd, 30);
    cam.lookAt(c.look);
    // bank into hard turns (centripetal acceleration from the wire), like an anime camera riding the swing
    let rollT = 0;
    if (this.odm.attachedCount() && !this.grounded) {
      const pd = this.odm.pullDir(this.render, _e);
      if (pd) rollT = THREE.MathUtils.clamp(pd.dot(right) * Math.min(speed, 70) * 0.006, -0.32, 0.32);
    }
    c.roll += (rollT - c.roll) * damp(3, dt);
    cam.rotateZ(-c.roll + shx * 0.02);
    // FOV opens with speed
    const fovT = CFG.cam.fov + (CFG.cam.fovMax - CFG.cam.fov) * THREE.MathUtils.smoothstep(speed, 12, 85);
    c.fov += (fovT - c.fov) * damp(4, dt);
    if (Math.abs(cam.fov - c.fov) > 0.01) { cam.fov = c.fov; cam.updateProjectionMatrix(); }
  }

  _audio() {
    const a = this.game.audio;
    if (!a) return;
    a.setReel?.(this.reelLevel);
    a.setGas?.(this.boosting ? 1 : this._dashPuff > 0 ? 0.8 : 0);
    a.setWind?.(this.speed);
    const cam = this.game.camera;
    a.setListener?.(cam.position, _a.set(0, 0, -1).applyQuaternion(cam.quaternion), _b.set(0, 1, 0).applyQuaternion(cam.quaternion));
  }

  _supply(dt) {
    const depots = this.game.world?.supplyDepots;
    if (!depots || !this.alive) return;
    let inside = false;
    for (const d of depots) if (this.render.distanceTo(d.position) < d.radius) { inside = true; break; }
    if (!inside) { this._supplyT = 0; return; }
    const needs = this.odm.gas < 0.98 || this.spares < CFG.combat.spares || this.blade < 0.99 || this.hp < 0.99;
    if (!needs) return;
    this._supplyT = (this._supplyT || 0) + dt;
    if (this._supplyT > 0.8) {
      this.odm.gas = 1; this.spares = CFG.combat.spares; this.blade = 1; this.hp = 1;
      this._supplyT = -2;
      this.game.audio?.refill?.();
      this.game.hud?.message?.('RESUPPLIED — gas, blades and bandages', 2.2, 'info');
    }
  }
}
