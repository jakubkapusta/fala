// One button. Any finger on the screen, the left mouse button or the space bar = "holding".
// Multi-touch doesn't add anything: holding is simply "at least one of them is down".

export type InputHooks = {
  /** first user gesture (unlocks audio) */
  gesture: () => void;
  pause: () => void;
  enabled: () => boolean;
};

export class Input {
  isTouch = false;
  private pointers = new Set<number>();
  private keys = new Set<string>();

  constructor(el: HTMLElement, private h: InputHooks) {
    el.addEventListener('pointerdown', this.down, { passive: false });
    el.addEventListener('pointerup', this.up);
    el.addEventListener('pointercancel', this.up);
    el.addEventListener('lostpointercapture', this.up);
    el.addEventListener('contextmenu', (e) => e.preventDefault());
    el.addEventListener('touchstart', (e) => e.preventDefault(), { passive: false });
    window.addEventListener('keydown', (e) => {
      if (e.code === 'Escape') {
        this.h.pause();
        return;
      }
      if (e.code !== 'Space' && e.code !== 'ArrowDown' && e.code !== 'KeyS') return;
      if (!this.h.enabled()) return;
      e.preventDefault();
      this.h.gesture();
      this.keys.add(e.code);
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.reset());
  }

  private down = (e: PointerEvent) => {
    e.preventDefault();
    this.h.gesture();
    if (!this.h.enabled()) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    this.isTouch = e.pointerType !== 'mouse';
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    this.pointers.add(e.pointerId);
  };

  private up = (e: PointerEvent) => {
    this.pointers.delete(e.pointerId);
  };

  get held() {
    return this.pointers.size > 0 || this.keys.size > 0;
  }

  reset() {
    this.pointers.clear();
    this.keys.clear();
  }
}
