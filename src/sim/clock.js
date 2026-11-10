import { STEP_MS } from './session.js';

export function createClock(step) {
  let active = false;
  let carry = 0;
  return {
    get active() { return active; },
    get alpha() { return carry / STEP_MS; },
    play() { active = true; },
    pause() { active = false; },
    reset() { active = false; carry = 0; },
    advance(elapsedMs, speed) {
      if (!active || elapsedMs < 0 || elapsedMs > 250) return 0;
      carry += elapsedMs * speed;
      let count = 0;
      while (carry >= STEP_MS) {
        carry -= STEP_MS;
        count++;
        if (!step()) {
          this.reset();
          break;
        }
      }
      return count;
    },
  };
}
