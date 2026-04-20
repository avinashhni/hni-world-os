export interface UttPriceEngineOffer {
  price: number;
  currency: string;
}

export interface UttPriceEngineTaxProfile {
  gstPct?: number;
  taxCode?: string;
}

export interface UttPriceEngineInput {
  pricingId: string;
  tenantId: string;
  offer: UttPriceEngineOffer;
  sellCurrency: string;
  marginPct: number;
  exchangeRates: Record<string, number>;
  taxProfile?: UttPriceEngineTaxProfile;
}

export interface UttPriceEngineQuote {
  pricingId: string;
  costCurrency: string;
  sellCurrency: string;
  costAmount: number;
  sellAmount: number;
  marginAmount: number;
  marginPct: number;
  roundedRule: "NO_DECIMALS";
  taxReady: {
    taxCode: string;
    gstPct: number;
    estimatedTax: number;
  };
}

function roundNoDecimals(amount: number): number {
  return Math.round(amount);
}

export class UttPriceEngineService {
  computeQuote(input: UttPriceEngineInput): UttPriceEngineQuote {
    const baseRate = input.exchangeRates[input.offer.currency];
    const targetRate = input.exchangeRates[input.sellCurrency];

    if (!baseRate || !targetRate) {
      throw new Error("Missing exchange rate for pricing conversion");
    }

    const normalizedBase = input.offer.price / baseRate;
    const convertedCost = normalizedBase * targetRate;
    const marginAmount = (convertedCost * input.marginPct) / 100;
    const sellAmount = convertedCost + marginAmount;

    const roundedCost = roundNoDecimals(convertedCost);
    const roundedSell = roundNoDecimals(sellAmount);
    const roundedMargin = roundNoDecimals(roundedSell - roundedCost);
    const gstPct = input.taxProfile?.gstPct ?? 0;

    return {
      pricingId: input.pricingId,
      costCurrency: input.sellCurrency,
      sellCurrency: input.sellCurrency,
      costAmount: roundedCost,
      sellAmount: roundedSell,
      marginAmount: roundedMargin,
      marginPct: input.marginPct,
      roundedRule: "NO_DECIMALS",
      taxReady: {
        taxCode: input.taxProfile?.taxCode ?? "GST_READY",
        gstPct,
        estimatedTax: roundNoDecimals((roundedSell * gstPct) / 100),
      },
    };
  }
}
