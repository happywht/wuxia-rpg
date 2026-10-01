/** Optional authored travel economics. Omitted fields preserve legacy gates. */
export interface TransitionCostData {
  travelMinutes?: number;
  fare?: number;
}

export interface TransitionQuote {
  minutes: number;
  fare: number;
  affordable: boolean;
  missingCurrency: number;
}

/** Quotes only: a blocked/cancelled journey must never change resources. */
export function quoteTransitionCost(
  data: TransitionCostData,
  defaultMinutes: number,
  currency: number,
): TransitionQuote {
  const minutes = data.travelMinutes ?? defaultMinutes;
  const fare = data.fare ?? 0;
  if (!Number.isSafeInteger(minutes) || minutes < 0 || minutes > 1440 ||
      !Number.isSafeInteger(fare) || fare < 0 || fare > 1_000_000 ||
      !Number.isSafeInteger(currency) || currency < 0) {
    throw new RangeError('交通耗时、费用或银两无效');
  }
  return { minutes, fare, affordable: currency >= fare, missingCurrency: Math.max(0, fare - currency) };
}
