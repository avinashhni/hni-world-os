export interface FraudCheckInput {
  tenantId: string;
  bookingId: string;
  customerId: string;
  retriesIn5Minutes: number;
  quotedPrice: number;
  baselinePrice: number;
  bookingTenantId: string;
}

export interface FraudCheckResult {
  blocked: boolean;
  flags: string[];
}

export class FraudRiskMonitorService {
  evaluate(input: FraudCheckInput): FraudCheckResult {
    const flags: string[] = [];

    if (input.retriesIn5Minutes >= 4) {
      flags.push("rapid_retries");
    }

    if (input.quotedPrice <= 0 || input.quotedPrice > input.baselinePrice * 3) {
      flags.push("abnormal_pricing");
    }

    if (input.tenantId !== input.bookingTenantId) {
      flags.push("cross_tenant_mismatch");
    }

    return {
      blocked: flags.length > 0,
      flags,
    };
  }
}
