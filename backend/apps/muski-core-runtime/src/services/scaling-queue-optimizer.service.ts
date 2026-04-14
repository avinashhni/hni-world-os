export interface QueueJob<TPayload = Record<string, unknown>> {
  id: string;
  queue: "critical" | "high" | "default";
  payload: TPayload;
  enqueuedAt: string;
}

export interface QueueOptimizationMetrics {
  queued: number;
  throughputPerSecond: number;
  processed: number;
  inFlight: number;
  concurrencyLimit: number;
  nextBatchSize: number;
}

export class ScalingQueueOptimizerService<TPayload = Record<string, unknown>> {
  private readonly critical: QueueJob<TPayload>[] = [];
  private readonly high: QueueJob<TPayload>[] = [];
  private readonly normal: QueueJob<TPayload>[] = [];
  private processed = 0;
  private startedAt = Date.now();
  private inFlight = 0;

  constructor(
    private readonly concurrencyLimit = 64,
    private readonly maxBatchSize = 500,
  ) {}

  enqueue(job: Omit<QueueJob<TPayload>, "enqueuedAt">): QueueJob<TPayload> {
    const queueJob: QueueJob<TPayload> = {
      ...job,
      enqueuedAt: new Date().toISOString(),
    };

    if (queueJob.queue === "critical") this.critical.push(queueJob);
    else if (queueJob.queue === "high") this.high.push(queueJob);
    else this.normal.push(queueJob);

    return queueJob;
  }

  reserveBatch(targetBatchSize?: number): QueueJob<TPayload>[] {
    const capacity = Math.max(this.concurrencyLimit - this.inFlight, 0);
    const batchSize = Math.min(targetBatchSize ?? this.maxBatchSize, capacity, this.maxBatchSize);

    if (batchSize === 0) return [];

    const jobs: QueueJob<TPayload>[] = [];
    const queues = [this.critical, this.high, this.normal];

    for (const queue of queues) {
      while (queue.length && jobs.length < batchSize) {
        const next = queue.shift();
        if (next) jobs.push(next);
      }
      if (jobs.length >= batchSize) break;
    }

    this.inFlight += jobs.length;
    return jobs;
  }

  ack(count: number): void {
    const completed = Math.max(Math.min(count, this.inFlight), 0);
    this.inFlight -= completed;
    this.processed += completed;
  }

  getMetrics(): QueueOptimizationMetrics {
    const runtimeSeconds = Math.max((Date.now() - this.startedAt) / 1000, 1);
    const queued = this.critical.length + this.high.length + this.normal.length;
    const throughput = this.processed / runtimeSeconds;
    const dynamicBatch = Math.max(Math.min(Math.round(throughput * 2), this.maxBatchSize), 25);

    return {
      queued,
      throughputPerSecond: Number(throughput.toFixed(2)),
      processed: this.processed,
      inFlight: this.inFlight,
      concurrencyLimit: this.concurrencyLimit,
      nextBatchSize: dynamicBatch,
    };
  }
}
