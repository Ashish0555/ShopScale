export type CacheStore = {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttlSeconds: number): Promise<void>;
  del(key: string): Promise<void>;
  incr(key: string): Promise<number>;
  expire(key: string, ttlSeconds: number): Promise<void>;
  ping(): Promise<boolean>;
  close(): Promise<void>;
};

export class NoOpCacheStore implements CacheStore {
  async get(): Promise<string | null> {
    return null;
  }

  async set(): Promise<void> {}

  async del(): Promise<void> {}

  async incr(): Promise<number> {
    return 1;
  }

  async expire(): Promise<void> {}

  async ping(): Promise<boolean> {
    return true;
  }

  async close(): Promise<void> {}
}

type MemoryEntry = {
  value: string;
  expiresAt: number | null;
};

export class InMemoryCacheStore implements CacheStore {
  private readonly entries = new Map<string, MemoryEntry>();

  async get(key: string): Promise<string | null> {
    return this.read(key);
  }

  async set(key: string, value: string, ttlSeconds: number): Promise<void> {
    this.entries.set(key, {
      value,
      expiresAt: Date.now() + ttlSeconds * 1000
    });
  }

  async del(key: string): Promise<void> {
    this.entries.delete(key);
  }

  async incr(key: string): Promise<number> {
    const current = Number(this.read(key) ?? "0") + 1;
    const existing = this.entries.get(key);
    this.entries.set(key, {
      value: String(current),
      expiresAt: existing?.expiresAt ?? null
    });
    return current;
  }

  async expire(key: string, ttlSeconds: number): Promise<void> {
    const existing = this.entries.get(key);

    if (existing) {
      existing.expiresAt = Date.now() + ttlSeconds * 1000;
    }
  }

  async ping(): Promise<boolean> {
    return true;
  }

  async close(): Promise<void> {
    this.entries.clear();
  }

  private read(key: string): string | null {
    const entry = this.entries.get(key);

    if (!entry) {
      return null;
    }

    if (entry.expiresAt !== null && entry.expiresAt <= Date.now()) {
      this.entries.delete(key);
      return null;
    }

    return entry.value;
  }
}
