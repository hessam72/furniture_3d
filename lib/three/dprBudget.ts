import type { DeviceClass } from '@/lib/config/deviceTier'
import type { GpuClass } from '@/lib/three/gpuClass'

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
 * The unit is **one plain framebuffer's worth of a pixel**: 8 bytes, RGBA8
 * colour plus DEPTH24_STENCIL8, which is what a single-sampled canvas with no
 * post costs. `weight` below prices the pages that hold more than that.
 *
 * **The row is picked by measured hardware, not by screen size.** One number
 * for "tablet" has to serve both a 2012 iPad and an M4 iPad Pro, and there is
 * no value that is both safe on the first and not wasteful on the second —
 * pick the safe one and every modern tablet renders soft for the sake of a
 * device that may not be in the room. So `weak` gets the conservative figure
 * the crash work established and `normal` gets what current hardware can
 * actually hold. @see readGpuClass
 *
 *            weak            normal
 *   phone    1.6MP → 13MB    3.5MP → 28MB
 *   tablet   2.2MP → 18MB    7.0MP → 56MB
 *   desktop  4.5MP           4.5MP
 *
 * The `normal` numbers are affordable because canvas MSAA came off on touch:
 * a 4x multisampled buffer is ~36 bytes a pixel and a plain one is 8, so
 * dropping it bought 4.5x the pixels for the same memory. Spending that on
 * resolution is the right trade — an iPad now renders sharper than it did
 * before any of this work, and still holds less.
 *
 * The desktop number is the original budget and means something different: it
 * was only ever about **fill rate** on 4K/5K screens — above ~4.5MP the extra
 * pixels are invisible for these scenes and cost real frame time — and a desktop
 * has no canvas-memory cap to run into. That distinction is why `weight` below
 * does not apply to it, and why the two rows agree there.
 *
 * `none` shares the `weak` row so the lookup is total; nothing renders on it.
 *
 * @see arch-docs/MOBILE_GPU_BUDGET.md
 */
export const PIXEL_BUDGET: Record<GpuClass, Record<DeviceClass, number>> = {
  normal: { phone: 3.5e6, tablet: 7.0e6, desktop: 4.5e6 },
  weak: { phone: 1.6e6, tablet: 2.2e6, desktop: 4.5e6 },
  none: { phone: 1.6e6, tablet: 2.2e6, desktop: 4.5e6 },
}

/**
 * Cap the tier's max DPR to the budget above. Never clamps below `dpr[0]`,
 * which is 1.0 on every tier above `low` — native CSS resolution, and always
 * affordable.
 *
 * `weight` is how many plain framebuffers' worth **each pixel costs on this
 * page**, and it divides the budget on touch hardware. It exists because the
 * same DPR buys wildly different amounts of memory depending on what is behind
 * the canvas, and a budget that ignores that is a budget for one page only:
 *
 *   1     a plain canvas, single-sampled, no post        — /simple on touch
 *   ~4.5  canvas MSAA 4x (colour and depth at 4x
 *         plus the resolve, ~36 bytes a pixel)           — /simple on desktop
 *   ~4.5  an EffectComposer chain: two RGBA16F buffers,
 *         SMAA's two full-resolution targets and a
 *         bloom mip chain, all sized to the canvas       — /product, /store
 *
 * On desktop it is ignored, and that is not an oversight. The desktop budget is
 * a fill-rate ceiling (@see PIXEL_BUDGET), and none of the above changes how
 * many pixels are worth drawing — dividing by it there would drop a 1080p
 * desktop from DPR 1.47 to 1.0 to save memory no desktop GPU would notice.
 */
export function clampDprToBudget(
  dpr: [number, number],
  device: DeviceClass = 'desktop',
  weight = 1,
  gpu: GpuClass = 'normal'
): [number, number] {
  if (typeof window === 'undefined') return dpr
  const area = window.innerWidth * window.innerHeight
  if (!area) return dpr
  const allowance = PIXEL_BUDGET[gpu][device]
  const budget = device === 'desktop' ? allowance : allowance / Math.max(1, weight)
  const budgetMax = Math.max(1, Math.sqrt(budget / area))
  return [dpr[0], Math.max(dpr[0], Math.min(dpr[1], budgetMax))]
}

/**
 * What an EffectComposer chain costs per pixel, in plain framebuffers.
 *
 * Measured from what the chain actually allocates at the canvas's resolution:
 * the canvas itself (8 bytes), the composer's input and output RGBA16F buffers
 * (16), SMAA's edge and weight targets (8) and the bloom mip chain (~3) — about
 * 35 bytes a pixel against a plain canvas's 8.
 */
export const COMPOSER_PIXEL_WEIGHT = 4.5
