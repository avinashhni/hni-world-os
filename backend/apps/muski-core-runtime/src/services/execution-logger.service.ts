export interface ExecutionLog {
  id: string;
  type: "task" | "approval" | "dispatch" | "system";
  message: string;
  createdAt: string;
  metadata?: Record<string, unknown>;
}

export class ExecutionLoggerService {
  private logs: ExecutionLog[] = [];

  log(
    type: ExecutionLog["type"],
    message: string,
    metadata?: Record<string, unknown>
  ): ExecutionLog {
    const entry: ExecutionLog = {
      id: crypto.randomUUID(),
      type,
      message,
      createdAt: new Date().toISOString(),
      metadata,
    };

    this.logs.push(entry);
    return entry;
  }

  getAll(): ExecutionLog[] {
    return this.logs;
  }
}