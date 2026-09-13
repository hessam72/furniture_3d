import type { DeviceClass } from '@/lib/config/deviceTier'

/**
 * How many drawing-buffer pixels a device may be asked for, whatever its DPR.
 *
 * The tier's `dpr` is a *ratio*, and a ratio is the wrong unit for this: 1.75
 * is 1.2MP on an iPhone SE, 2.4MP on an iPad and 4.3MP on an iPad Pro. What the
 * GPU pays is absolute pixels, and on iOS what fails is a hard per-tab cap on
 * canvas-backed memory (~256MB on several versions, reported as `Total canvas
 * memory use exceeds the maximum limit`). So the cap has to be stated in pixels
 * or it does not hold as screens get bigger.
 *
 * Priced at 8 bytes a pixel — RGBA8 colour plus a DEPTH24_STENCIL8 buffer, what
 * a single-sampled canvas actually costs:
 *
 *   phone   1.6MP → ~13MB
 *   tablet  2.2MP → ~18MB
 *   desktop 4.5MP → ~36MB
 *
 * The mobile numbers leave the rest of that 256MB for the KTX2 textures the
 * models need. The desktop number is the original budget and means something
 * different: it was only ever about **fill rate** on 4K/5K screens — above
 * ~4.5MP the extra pixels are invisible for these scenes and cost real frame
 * time — and a desktop has no canvas-memory cap to run into. That distinction
 * is why `samples` below does not apply to it.
 *
 * @see arch-docs/MOBILE_GPU_BUDGET.md
 */
export const PIXEL_BUDGET: Record<DeviceClass, number> = {
  phone: 1.6e6,
  tablet: 2.2e6,
  desktop: 4.5e6,
}

/**
 * Cap the tier's max DPR to the budget above. Never clamps below `dpr[0]`,
 * which is 1.0 on every tier above `low` — native CSS resolution, and always
 * affordable.
 *
 * `samples` divides the budget on **touch hardware only**, because there the
 * budget is a memory budget and multisampling multiplies the bytes per pixel
 * rather than the pixel count: a 4x buffer is colour and depth at 4x plus the
 * resolve target, ~36 bytes a pixel against 8. A touch caller that keeps MSAA
 * is priced for it instead of getting the single-sampled allowance.
 *
 * On desktop it is ignored, and that is not an oversight. The desktop budget is
 * a fill-rate ceiling (@see PIXEL_BUDGET), and MSAA does not change how many
 * pixels are worth drawing — dividing by it there would drop a 1080p desktop
 * from DPR 1.47 to 1.0 to save 87MB no desktop GPU would notice.
 */
export function clampDprToBudget(
  dpr: [number, number],
  device: DeviceClass = 'desktop',
  samples = 1
): [number, number] {
  if (typeof window === 'undefined') return dpr
  const area = window.innerWidth * window.innerHeight
  if (!area) return dpr
  const budget = device === 'desktop' ? PIXEL_BUDGET[device] : PIXEL_BUDGET[device] / Math.max(1, samples)
  const budgetMax = Math.max(1, Math.sqrt(budget / area))
  return [dpr[0], Math.max(dpr[0], Math.min(dpr[1], budgetMax))]
}
