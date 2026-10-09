// Keyboard + mouse state with pointer lock. `pressed` holds edges since the last consume().
export class Input {
  constructor(el) {
    this.el = el;
    this.down = new Set();
    this.pressed = new Set();
    this.released = new Set();
    this.mouseDX = 0; this.mouseDY = 0; this.wheel = 0;
    this.locked = false;
    this.enabled = true;
    const key = (e) => (e.code === 'Space' ? 'Space' : e.code.startsWith('Key') ? e.code.slice(3) : e.code);
    addEventListener('keydown', (e) => {
      if (!this.enabled) return;
      const k = key(e);
      if (['Space', 'Tab', 'ShiftLeft', 'ShiftRight', 'AltLeft', 'AltRight'].includes(k) || (this.locked && !e.metaKey)) e.preventDefault();
      if (!this.down.has(k)) this.pressed.add(k);
      this.down.add(k);
    });
    addEventListener('keyup', (e) => { const k = key(e); this.down.delete(k); this.released.add(k); });
    addEventListener('blur', () => { for (const k of this.down) this.released.add(k); this.down.clear(); });
    el.addEventListener('mousedown', (e) => {
      if (!this.enabled) return;
      const k = 'Mouse' + e.button;
      if (!this.down.has(k)) this.pressed.add(k);
      this.down.add(k);
      e.preventDefault();
    });
    addEventListener('mouseup', (e) => { const k = 'Mouse' + e.button; this.down.delete(k); this.released.add(k); });
    el.addEventListener('contextmenu', (e) => e.preventDefault());
    addEventListener('mousemove', (e) => {
      if (!this.locked) return;
      this.mouseDX += e.movementX || 0; this.mouseDY += e.movementY || 0;
    });
    addEventListener('wheel', (e) => { this.wheel += Math.sign(e.deltaY); }, { passive: true });
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === el;
      if (!this.locked) { for (const k of this.down) this.released.add(k); this.down.clear(); }
      this.onLockChange?.(this.locked);
    });
  }
  lock() { try { const p = this.el.requestPointerLock({ unadjustedMovement: true }); p?.catch?.(() => this.el.requestPointerLock()); } catch { this.el.requestPointerLock?.(); } }
  unlock() { document.exitPointerLock?.(); }
  held(k) { return this.down.has(k); }
  hit(k) { return this.pressed.has(k); }
  up(k) { return this.released.has(k); }
  consume() { this.pressed.clear(); this.released.clear(); this.mouseDX = 0; this.mouseDY = 0; this.wheel = 0; }
}
