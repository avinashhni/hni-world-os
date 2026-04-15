export interface IntelligenceEvent {
  eventId: string;
  tenantId: string;
  sourceOs: string;
  targetOs: string;
  eventType: string;
  payload: Record<string, unknown>;
  createdAt: string;
}

export interface IntelligenceProcessingResult {
  eventId: string;
  deduplicated: boolean;
  processorsApplied: string[];
  syncedTargets: string[];
  processedAt: string;
}

export class CrossOsIntelligenceBusService {
  private readonly events: IntelligenceEvent[] = [];
  private readonly seenFingerprints = new Set<string>();
  private static stableStringify(value: unknown): string {
    if (value === null || typeof value !== "object") {
      return JSON.stringify(value);
    }

    if (Array.isArray(value)) {
      return `[${value.map((item) => CrossOsIntelligenceBusService.stableStringify(item)).join(",")}]`;
    }

    const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b));
    return `{${entries
      .map(([key, item]) => `${JSON.stringify(key)}:${CrossOsIntelligenceBusService.stableStringify(item)}`)
      .join(",")}}`;
  }

  emit(event: Omit<IntelligenceEvent, "createdAt">): IntelligenceEvent {
    const next: IntelligenceEvent = {
      ...event,
      createdAt: new Date().toISOString(),
    };
    this.events.push(next);
    return next;
  }

  process(event: IntelligenceEvent): IntelligenceProcessingResult {
    const fingerprint = `${event.tenantId}:${event.eventId}:${event.sourceOs}:${event.targetOs}:${event.eventType}:${CrossOsIntelligenceBusService.stableStringify(event.payload)}`;
    const deduplicated = this.seenFingerprints.has(fingerprint);
    if (!deduplicated) {
      this.seenFingerprints.add(fingerprint);
    }

    return {
      eventId: event.eventId,
      deduplicated,
      processorsApplied: ["event_listener", "intelligence_processor", "command_router"],
      syncedTargets: deduplicated ? [] : [event.targetOs],
      processedAt: new Date().toISOString(),
    };
  }

  getEventCount(): number {
    return this.events.length;
  }
}
