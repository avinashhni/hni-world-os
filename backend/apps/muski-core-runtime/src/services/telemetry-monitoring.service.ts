export interface TelemetrySignal {
  tenantId: string;
  signalType: "monitoring_alerts" | "worker_health_metrics" | "api_status_checks" | "queue_depth_snapshots";
  payload: Record<string, unknown>;
  at: string;
}

export interface TelemetryAnomaly {
  tenantId: string;
  category: string;
  reason: string;
  detectedAt: string;
}

export class TelemetryMonitoringService {
  private readonly signals: TelemetrySignal[] = [];
  private readonly anomalies: TelemetryAnomaly[] = [];

  capture(signal: Omit<TelemetrySignal, "at">): TelemetrySignal {
    const next: TelemetrySignal = {
      ...signal,
      at: new Date().toISOString(),
    };

    this.signals.push(next);

    const queueDepth = Number(next.payload.queueDepth ?? 0);
    if (next.signalType === "queue_depth_snapshots" && queueDepth > 1000) {
      this.anomalies.push({
        tenantId: next.tenantId,
        category: "queue_backpressure",
        reason: `Queue depth ${queueDepth} exceeded threshold`,
        detectedAt: new Date().toISOString(),
      });
    }

    return next;
  }

  getTenantSignals(tenantId: string): TelemetrySignal[] {
    return this.signals.filter((item) => item.tenantId === tenantId);
  }

  getTenantAnomalies(tenantId: string): TelemetryAnomaly[] {
    return this.anomalies.filter((item) => item.tenantId === tenantId);
  }
}
