export interface AsyncExecutionResult<TResult> {
  completed: TResult[];
  failed: Array<{ index: number; reason: string }>;
  durationMs: number;
}

export class AsyncProcessingService {
  async runWithConcurrency<TInput, TResult>(
    input: TInput[],
    worker: (item: TInput, index: number) => Promise<TResult>,
    concurrency = 32,
  ): Promise<AsyncExecutionResult<TResult>> {
    const startedAt = Date.now();
    const completed: TResult[] = [];
    const failed: Array<{ index: number; reason: string }> = [];
    let cursor = 0;

    const runWorker = async () => {
      while (cursor < input.length) {
        const index = cursor;
        cursor += 1;

        try {
          const result = await worker(input[index], index);
          completed.push(result);
        } catch (error) {
          failed.push({
            index,
            reason: error instanceof Error ? error.message : "unknown_failure",
          });
        }
      }
    };

    const workerCount = Math.max(Math.min(concurrency, input.length || 1), 1);
    await Promise.all(Array.from({ length: workerCount }, () => runWorker()));

    return {
      completed,
      failed,
      durationMs: Date.now() - startedAt,
    };
  }
}
