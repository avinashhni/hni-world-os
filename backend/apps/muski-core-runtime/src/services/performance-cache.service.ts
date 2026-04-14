export interface CacheEntry<T> {
  value: T;
  expiresAt: number;
  hits: number;
}

export interface CacheStats {
  size: number;
  maxSize: number;
  hitCount: number;
  missCount: number;
  hitRate: number;
  evictions: number;
}

export class PerformanceCacheService<TValue = unknown> {
  private readonly store = new Map<string, CacheEntry<TValue>>();
  private hitCount = 0;
  private missCount = 0;
  private evictions = 0;

  constructor(
    private readonly maxSize = 10_000,
    private readonly defaultTtlMs = 60_000,
  ) {}

  set(key: string, value: TValue, ttlMs = this.defaultTtlMs): void {
    if (this.store.size >= this.maxSize && !this.store.has(key)) {
      const oldestKey = this.store.keys().next().value as string | undefined;
      if (oldestKey) {
        this.store.delete(oldestKey);
        this.evictions += 1;
      }
    }

    this.store.set(key, {
      value,
      expiresAt: Date.now() + ttlMs,
      hits: 0,
    });
  }

  get(key: string): TValue | null {
    const entry = this.store.get(key);
    if (!entry) {
      this.missCount += 1;
      return null;
    }

    if (entry.expiresAt < Date.now()) {
      this.store.delete(key);
      this.missCount += 1;
      return null;
    }

    this.hitCount += 1;
    entry.hits += 1;

    this.store.delete(key);
    this.store.set(key, entry);

    return entry.value;
  }

  pruneExpired(): number {
    let removed = 0;
    const now = Date.now();
    for (const [key, entry] of this.store.entries()) {
      if (entry.expiresAt < now) {
        this.store.delete(key);
        removed += 1;
      }
    }
    return removed;
  }

  getStats(): CacheStats {
    const totalReads = this.hitCount + this.missCount;
    return {
      size: this.store.size,
      maxSize: this.maxSize,
      hitCount: this.hitCount,
      missCount: this.missCount,
      hitRate: totalReads === 0 ? 0 : this.hitCount / totalReads,
      evictions: this.evictions,
    };
  }
}
