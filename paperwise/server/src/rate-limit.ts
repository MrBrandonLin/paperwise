/**
 * Requests-per-minute budget for Gemini, so we never trip the quota (a 429 costs far more
 * time than waiting a moment). Free tier for flash-lite = 15 RPM (seen 2026-10-24); a paid key
 * has thousands. Set GEMINI_RPM to your key's limit.
 *
 *   user        a person is waiting: always first in line
 *   background  pre-building demo forms: only uses spare budget, never the last few slots
 *   hedge       a duplicate of a slow request: only if a slot is free right now, else skipped
 */
export type Priority = 'user' | 'background' | 'hedge';

const WINDOW_MS = 60_000;

export class RateLimiter {
  private stamps: number[] = [];
  private queue: { priority: Priority; resolve: () => void }[] = [];
  private timer: ReturnType<typeof setTimeout> | undefined;
  private pausedUntil = 0;

  constructor(
    private readonly rpm: number,
    /** Slots kept free for users: background and hedges stop below this. */
    private readonly reserve = Math.min(5, Math.floor(rpm / 3)),
  ) {}

  /** Free slots right now. */
  available(): number {
    this.prune();
    if (Date.now() < this.pausedUntil) return 0;
    return this.rpm - this.stamps.length;
  }

  /** Take a slot now if possible (hedges). */
  tryAcquire(priority: Priority = 'hedge'): boolean {
    const free = this.available();
    const ok = priority === 'user' ? free > 0 : free > this.reserve;
    if (ok && this.queue.length === 0) {
      this.stamps.push(Date.now());
      return true;
    }
    return false;
  }

  /** Wait for a slot. Users jump ahead of background work. */
  acquire(priority: Exclude<Priority, 'hedge'>): Promise<void> {
    if (this.queue.length === 0 && this.tryAcquire(priority)) return Promise.resolve();
    return new Promise((resolve) => {
      const entry = { priority, resolve };
      if (priority === 'user') {
        const firstBackground = this.queue.findIndex((q) => q.priority !== 'user');
        this.queue.splice(firstBackground === -1 ? this.queue.length : firstBackground, 0, entry);
      } else {
        this.queue.push(entry);
      }
      this.drain();
    });
  }

  /** Gemini said 429: stop sending for a while. */
  pause(ms: number) {
    this.pausedUntil = Math.max(this.pausedUntil, Date.now() + ms);
    this.drain();
  }

  private drain() {
    clearTimeout(this.timer);
    this.timer = undefined;
    while (this.queue.length) {
      const next = this.queue[0]!;
      const free = this.available();
      const allowed = next.priority === 'user' ? free > 0 : free > this.reserve;
      if (!allowed) break;
      this.queue.shift();
      this.stamps.push(Date.now());
      next.resolve();
    }
    if (this.queue.length) {
      this.prune();
      const oldest = this.stamps[0] ?? Date.now();
      const wait = Math.max(50, Math.max(this.pausedUntil, oldest + WINDOW_MS) - Date.now());
      this.timer = setTimeout(() => this.drain(), wait);
      this.timer.unref?.();
    }
  }

  private prune() {
    const cutoff = Date.now() - WINDOW_MS;
    while (this.stamps.length && this.stamps[0]! < cutoff) this.stamps.shift();
  }
}
