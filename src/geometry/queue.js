/** Single-flight latest-wins queue. Invalidating happens at input time, not send time. */
export class RebuildQueue {
  constructor({
    compute,
    onStart = () => {},
    onAccept = () => {},
    onError = () => {},
    onIdle = () => {},
    delay = 550,
  }) {
    Object.assign(this, { compute, onStart, onAccept, onError, onIdle, delay });
    this.revision = 0;
    this.pending = null;
    this.running = false;
    this.timer = null;
  }
  schedule(payload, meta = {}, automatic = true) {
    const revision = ++this.revision;
    clearTimeout(this.timer);
    this.pending = { payload, meta, revision };
    if (automatic) this.timer = setTimeout(() => this.flush(), this.delay);
    return revision;
  }
  invalidate() {
    ++this.revision;
    clearTimeout(this.timer);
    this.pending = null;
  }
  async flush() {
    clearTimeout(this.timer);
    if (this.running) {
      if (this.pending) this.pending.meta.force = true;
      return;
    }
    if (!this.pending) return;
    const job = this.pending;
    this.pending = null;
    this.running = true;
    this.onStart(job);
    try {
      const value = await this.compute(job.payload, job.revision, job.meta);
      if (job.revision === this.revision) this.onAccept(value, job);
    } catch (error) {
      if (job.revision === this.revision) this.onError(error, job);
    } finally {
      this.running = false;
      if (
        this.pending &&
        (this.pending.meta.automatic !== false || this.pending.meta.force)
      )
        this.timer = setTimeout(() => this.flush(), this.delay);
      else this.onIdle();
    }
  }
}
