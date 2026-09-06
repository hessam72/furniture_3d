// Above ~4.5MP the extra pixels are invisible for these scenes but the
// fill-rate cost (× MSAA, × post) is very real on 4K/5K screens. Caps the
// tier's max DPR to the budget; never clamps below native (1).
export const PIXEL_BUDGET = 4.5e6

export function clampDprToBudget(dpr: [number, number]): [number, number] {
  if (typeof window === 'undefined') return dpr
  const area = window.innerWidth * window.innerHeight
  const budgetMax = Math.max(1, Math.sqrt(PIXEL_BUDGET / area))
  return [dpr[0], Math.max(dpr[0], Math.min(dpr[1], budgetMax))]
}
