export const ROYALTY_PERCENT = 10
export const PLATFORM_FEE_PERCENT = 5

export function maxResalePrice(faceValueCents: number, capPercent: number): number {
  return Math.floor((faceValueCents * capPercent) / 100)
}

export function resaleSplit(priceCents: number) {
  const association = Math.round((priceCents * ROYALTY_PERCENT) / 100)
  const platform = Math.round((priceCents * PLATFORM_FEE_PERCENT) / 100)
  return {
    association,
    platform,
    reseller: priceCents - association - platform,
  }
}
