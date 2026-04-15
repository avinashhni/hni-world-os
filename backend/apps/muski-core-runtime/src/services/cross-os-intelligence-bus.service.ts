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

  emit(event: Omit<IntelligenceEvent, "createdAt">): IntelligenceEvent {
    const next: IntelligenceEvent = {
      ...event,
      createdAt: new Date().toISOString(),
    };
    this.events.push(next);
    return next;
  }

  process(event: IntelligenceEvent): IntelligenceProcessingResult {
    const fingerprint = `${event.tenantId}:${event.sourceOs}:${event.targetOs}:${event.eventType}:${JSON.stringify(event.payload)}`;
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
