/**
 * Adapter boundary for the future Laya/Jev browser model.
 * No page data leaves the browser. Until a compatible model artifact and
 * tokenizer are supplied, the deterministic risk engine remains authoritative.
 */
export class LocalModelAdapter {
  constructor({ enabled = false } = {}) {
    this.enabled = enabled;
  }

  async evaluate() {
    return {
      available: false,
      provider: "deterministic-fallback",
      scores: {},
      explanation: "Local model artifact is not installed; deterministic multi-signal analysis was used."
    };
  }
}