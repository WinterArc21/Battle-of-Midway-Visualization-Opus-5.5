// Survey Corps horses: grazing in the field and at the forest edge. Run into one to mount it; you ride standing
// on its back like the anime. ↑ gallops, ← → steer, Shift leaps off into the air, Z / X fire a rope straight
// off the running horse. A riderless horse slows, grazes, and bolts from titans.
import * as THREE from 'three';
import { toonMaterial, addOutline } from '../core/style.js';

const _v = new THREE.Vector3(), _w = new THREE.Vector3();
const COATS = [0x5a3a22, 0x3b2a1e, 0x8a5a32, 0x2a2420, 0xb8a58a, 0x6e4a2c];
const SPEED = { walk: 2.2, gallop: 19, max: 22 };

function part(geo, mat, parent, x, y, z, outline = 0.025) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z); m.castShadow = true;
  if (outline) addOutline(m, outline);
  parent.add(m);
  return m;
}

export class Horse {
  constructor(game, pos, yaw, seed) {
    this.game = game;
    this.pos = pos.clone();
    this.vel = new THREE.Vector3();
    this.yaw = yaw; this.speed = 0; this.phase = seed * 7;
    this.rider = null; this.want = { f: 0, turn: 0 };
    this.state = 'graze'; this.t = seed * 3;
    this.home = pos.clone();
    const coat = toonMaterial(COATS[Math.floor(seed * 97) % COATS.length]);
    const dark = toonMaterial(0x1e1712), leather = toonMaterial(0x4a3020), hoof = toonMaterial(0x1a1612);
    const g = this.root = new THREE.Group();
    const body = new THREE.SphereGeometry(1, 14, 10).scale(0.48, 0.55, 1.15);
    this.body = part(body, coat, g, 0, 1.45, 0);
    part(new THREE.BoxGeometry(0.62, 0.12, 0.7), leather, g, 0, 1.98, -0.05, 0.015);            // saddle
    const neck = new THREE.Group(); neck.position.set(0, 1.75, 0.95); neck.rotation.x = -0.75; g.add(neck);
    part(new THREE.CylinderGeometry(0.2, 0.3, 1.0, 10), coat, neck, 0, 0.45, 0);
    this.head = new THREE.Group(); this.head.position.set(0, 0.95, 0.05); neck.add(this.head);
    part(new THREE.BoxGeometry(0.26, 0.28, 0.62), coat, this.head, 0, 0, 0.22).rotation.x = 0.9;
    part(new THREE.BoxGeometry(0.06, 0.5, 0.18), dark, neck, 0, 0.5, -0.24, 0);                   // mane
    this.tail = new THREE.Group(); this.tail.position.set(0, 1.62, -1.12); g.add(this.tail);
    part(new THREE.CylinderGeometry(0.05, 0.13, 0.8, 6), dark, this.tail, 0, -0.38, -0.05, 0);
    this.legs = [];
    const thigh = new THREE.CylinderGeometry(0.1, 0.08, 0.62, 7), shin = new THREE.CylinderGeometry(0.06, 0.055, 0.62, 6);
    for (const [x, z, ph] of [[-0.24, 0.72, 0], [0.24, 0.72, 0.5], [-0.24, -0.72, 0.25], [0.24, -0.72, 0.75]]) {
      const hip = new THREE.Group(); hip.position.set(x, 1.22, z); g.add(hip);
      part(thigh, coat, hip, 0, -0.31, 0, 0.015);
      const knee = new THREE.Group(); knee.position.y = -0.62; hip.add(knee);
      part(shin, coat, knee, 0, -0.31, 0, 0.012);
      part(new THREE.CylinderGeometry(0.075, 0.08, 0.1, 6), hoof, knee, 0, -0.62, 0, 0);
      this.legs.push({ hip, knee, ph, front: z > 0 });
    }
    game.scene.add(g);
    this.mountCd = 0;
  }

  /** Where a rider stands (on the saddle), world space. */
  saddle(out) { return out.set(0, 2.55, -0.05).applyAxisAngle(_w.set(0, 1, 0), this.yaw).add(this.pos); }

  fixedUpdate(dt) {
    const col = this.game.collision;
    this.t += dt; this.mountCd -= dt;
    let target = 0, turn = 0;
    if (this.rider) {
      target = this.want.f > 0 ? SPEED.gallop : this.want.f < 0 ? 0 : Math.max(this.speed - 4 * dt, 6);
      turn = this.want.turn;
    } else {
      // riderless: graze, amble back toward home, bolt from nearby titans
      let threat = null, td = 45;
      for (const t of this.game.titans?.titans || []) {
        if (!t.alive) continue;
        const d = t.position.distanceTo(this.pos); if (d < td) { td = d; threat = t; }
      }
      if (threat) {
        const away = Math.atan2(this.pos.x - threat.position.x, this.pos.z - threat.position.z);
        turn = Math.sign(Math.sin(away - this.yaw)); target = SPEED.gallop * 0.8; this.state = 'flee';
      } else {
        if (this.state === 'flee' || this.speed > 3) target = 0;
        if (this.t > 6) { this.t = 0; this.state = Math.random() < 0.5 ? 'walk' : 'graze'; }
        if (this.state === 'walk') {
          target = SPEED.walk;
          const home = Math.atan2(this.home.x - this.pos.x, this.home.z - this.pos.z);
          if (this.pos.distanceTo(this.home) > 25) turn = Math.sign(Math.sin(home - this.yaw)) * 0.6;
        }
      }
    }
    const accel = target > this.speed ? 7 : 10;
    this.speed += THREE.MathUtils.clamp(target - this.speed, -accel * dt, accel * dt);
    this.yaw += turn * (1.9 - this.speed * 0.03) * dt;
    this.vel.set(Math.sin(this.yaw) * this.speed, 0, Math.cos(this.yaw) * this.speed);
    this.pos.addScaledVector(this.vel, dt);
    // stay out of trunks, walls and houses; follow the ground
    _v.copy(this.pos); _v.y = col.groundHeight(this.pos.x, this.pos.z) + 1.2;
    for (const c of col.collideSphere(_v, 1.0, { dynamic: false })) {
      if (c.collider.type === 'ground' || c.depth <= 0) continue;
      this.pos.x += c.normal.x * c.depth; this.pos.z += c.normal.z * c.depth;
      if (this.speed > 6) this.speed *= 0.9;
    }
    this.pos.y = col.groundHeight(this.pos.x, this.pos.z);
    this.pos.x = THREE.MathUtils.clamp(this.pos.x, -1050, 1050);
    this.pos.z = THREE.MathUtils.clamp(this.pos.z, -620, 1020);
    if (this.pos.z > -7 && this.pos.z < 7 && Math.abs(this.pos.x) > 7) this.pos.z = this.pos.z < 0 ? -7 : 7;   // the wall
  }

  update(dt) {
    const g = this.root;
    g.position.copy(this.pos);
    g.rotation.y = this.yaw;
    // gait: walk at low speed, a bounding gallop when fast
    const s = this.speed, gallop = THREE.MathUtils.smoothstep(s, 5, 12);
    this.phase += dt * (s < 0.3 ? 0 : 1.6 + s * 0.16);
    const P = this.phase * Math.PI * 2;
    for (const l of this.legs) {
      const ph = P + (gallop > 0.5 ? (l.front ? 0 : 0.5) + (l.ph % 0.5) * 0.25 : l.ph) * Math.PI * 2;
      const amp = Math.min(1, s / 6) * (0.45 + gallop * 0.35);
      l.hip.rotation.x = Math.sin(ph) * amp;
      l.knee.rotation.x = (l.front ? -1 : 1) * Math.max(0, -Math.cos(ph)) * amp * 1.4;
    }
    this.body.position.y = 1.45 + Math.abs(Math.sin(P)) * 0.12 * gallop;
    g.rotation.x = Math.sin(P) * 0.05 * gallop;
    const graze = this.state === 'graze' && s < 0.5 && !this.rider;
    this.head.rotation.x += ((graze ? 0.9 : 0) - this.head.rotation.x) * Math.min(1, dt * 2);
    this.tail.rotation.x = 0.3 + gallop * 0.6 + Math.sin(this.phase * 3) * 0.1;
  }
}

/** A few horses near the gate (the expedition's mounts) and scattered over the field and forest edge. */
export class Herd {
  constructor(game) {
    this.game = game;
    const spots = [[-14, 22], [14, 26], [0, 34], [-60, 70], [70, 95], [-120, 140], [130, 150], [20, 175], [-40, 185], [210, 60]];
    this.horses = spots.map(([x, z], i) => {
      const y = game.collision.groundHeight(x, z);
      return new Horse(game, new THREE.Vector3(x, y, z), (i * 2.4) % (Math.PI * 2), (i + 1) * 0.137);
    });
  }
  fixedUpdate(dt) { for (const h of this.horses) h.fixedUpdate(dt); }
  update(dt) { for (const h of this.horses) h.update(dt); }
}
