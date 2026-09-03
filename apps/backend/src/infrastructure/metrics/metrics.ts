export class MetricsRegistry {
  private readonly counters = new Map<string, number>();

  increment(name: string, amount = 1): void {
    this.counters.set(name, (this.counters.get(name) ?? 0) + amount);
  }

  snapshot(): Record<string, number> {
    return Object.fromEntries(this.counters.entries());
  }
}

export const metrics = new MetricsRegistry();
