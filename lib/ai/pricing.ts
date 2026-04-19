/**
 * Returns a price suggestion in cents.
 * Today this is a pass-through of the AI-suggested price.
 * Swap the implementation here to integrate market data (eBay, PriceCharting, etc.)
 * without changing any callers.
 */
export async function getPriceSuggestion(
  _item: string,
  _location: string,
  aiPrice: number,
): Promise<number> {
  return aiPrice
}
