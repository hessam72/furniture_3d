import { create } from 'zustand'
import { devtools } from 'zustand/middleware'
import type { PresentationZone } from '@/lib/product/presentation'

/** Mirrors PaintConfig in carConfigStore so the lerp code is a direct port. */
export interface ZonePaint {
  color: string
  metalness: number
  roughness: number
  clearcoat: number
}

export type ZonePaintConfig = Record<PresentationZone, ZonePaint>

/** Exclusive, not cumulative: 0 = bare frame, 1 = finished piece (cover only).
 *  Picking a material is what commits to the finished view, so the frame is
 *  hidden at step 1 — except while exploded, where the point is seeing both. */
export type LayerStep = 0 | 1

/** Where the cover layer is in its clip-wipe timeline. */
export type CoverPhase = 'hidden' | 'wipeIn' | 'idle' | 'wipeOut'

export const LAYER_STEPS: LayerStep[] = [0, 1]

export interface PresentationState {
  productKey: string | null
  paint: ZonePaintConfig
  activeZone: PresentationZone
  /** The variant currently mounted. */
  coverId: string | null
  /** Requested while a swap wipe is running. */
  pendingCoverId: string | null
  coverPhase: CoverPhase

  layerStep: LayerStep
  exploded: boolean
  layerErrors: Record<string, string>

  /** Fraction of the viewport height the bottom sheet covers. The camera rig
   *  lifts the piece by half of it so "centred" means centred in the part of
   *  the screen the viewer can actually see. */
  sheetCoverage: number

  /** `startStep` is which layer the page opens on — 1 (the finished piece) by
   *  default, 0 to open on the bare frame. */
  initProduct: (key: string, paint: ZonePaintConfig, coverId: string, startStep?: LayerStep) => void
  setPaint: (partial: Partial<ZonePaint>, zone?: PresentationZone) => void
  setActiveZone: (zone: PresentationZone) => void

  selectCover: (id: string, surface?: Partial<ZonePaint>) => void
  commitCover: () => void
  finishWipe: () => void

  setLayerStep: (step: LayerStep) => void
  toggleExplode: () => void
  setLayerError: (layer: string, message: string | null) => void
  setSheetCoverage: (fraction: number) => void
  reset: () => void
}

const EMPTY_PAINT: ZonePaint = { color: '#ffffff', metalness: 0, roughness: 0.6, clearcoat: 0 }

const INITIAL = {
  productKey: null,
  paint: { wood: EMPTY_PAINT, cover: EMPTY_PAINT, cushion: EMPTY_PAINT } as ZonePaintConfig,
  activeZone: 'cover' as PresentationZone,
  coverId: null,
  pendingCoverId: null,
  coverPhase: 'hidden' as CoverPhase,
  layerStep: 0 as LayerStep,
  exploded: false,
  layerErrors: {} as Record<string, string>,
  sheetCoverage: 0,
}

export const usePresentation = create<PresentationState>()(
  devtools(
    (set, get) => ({
      ...INITIAL,

      // Opening on the cover is the default: the finished piece is what a buyer
      // came to see, and the frame is the thing you step *back* to. `wipeIn`
      // rather than `idle` so it reveals on load the same way a swap does,
      // instead of appearing between frames.
      //
      // Safe to call again on a live page — /product re-runs it to return from
      // AR — with one exception carried through by hand. `sheetCoverage`
      // measures the viewport, not the product: ProductSheet reports it on
      // mount and then only from a ResizeObserver, and the sheet survives an AR
      // round trip untouched (its `hidden` state animates a transform, which
      // changes no box). Zeroing it here would leave nothing to restore it, and
      // the camera would frame the piece behind the drawer.
      initProduct: (key, paint, coverId, startStep = 1) =>
        set((state) => ({
          ...INITIAL,
          sheetCoverage: state.sheetCoverage,
          productKey: key,
          paint,
          coverId,
          layerStep: startStep,
          coverPhase: startStep === 1 ? 'wipeIn' : 'hidden',
        })),

      setPaint: (partial, zone) => {
        const target = zone ?? get().activeZone
        set((state) => ({
          paint: { ...state.paint, [target]: { ...state.paint[target], ...partial } },
        }))
      },

      setActiveZone: (activeZone) => set({ activeZone }),

      // The cover is mounted whenever layerStep === 1 or a wipe-out is still
      // playing; `coverPhase` alone decides what the clip plane is doing.
      // Selecting also advances to step 1 — choosing a material *is* the
      // gesture that says "show me the finished piece".
      selectCover: (id, surface) => {
        const { coverId, coverPhase, layerStep, paint } = get()
        if (id === coverId && layerStep === 1 && (coverPhase === 'idle' || coverPhase === 'wipeIn')) {
          return
        }
        // The variant's surface has to land in the paint state, not just on the
        // cloned materials: useZonePaint damps every cover material toward
        // `paint.cover` every frame, so a roughness that lives only on the
        // clone is undone within ~400ms. That is what made velvet look like
        // leather — the store still held the default variant's 0.45.
        const next = surface ? { paint: { ...paint, cover: { ...paint.cover, ...surface } } } : {}
        if (coverPhase === 'hidden' || !coverId || layerStep === 0) {
          set({ ...next, coverId: id, pendingCoverId: null, coverPhase: 'wipeIn', layerStep: 1 })
          return
        }
        set({ ...next, pendingCoverId: id, coverPhase: 'wipeOut', layerStep: 1 })
      },

      commitCover: () => {
        const { pendingCoverId } = get()
        // A wipe-out with nothing pending means we stepped back off the cover.
        // Keep coverId so returning to step 2 re-reveals the same variant.
        if (!pendingCoverId) {
          set({ coverPhase: 'hidden' })
          return
        }
        set({ coverId: pendingCoverId, pendingCoverId: null, coverPhase: 'wipeIn' })
      },

      finishWipe: () => set({ coverPhase: 'idle' }),

      setLayerStep: (step) => {
        const { layerStep, coverPhase, exploded } = get()
        if (step === layerStep || exploded) return
        if (step === 1) {
          set({
            layerStep: step,
            pendingCoverId: null,
            coverPhase: coverPhase === 'idle' ? 'idle' : 'wipeIn',
          })
          return
        }
        if (layerStep === 1 && coverPhase !== 'hidden') {
          // Stays mounted through the wipe-out; commitCover() hides it.
          set({ layerStep: step, pendingCoverId: null, coverPhase: 'wipeOut' })
          return
        }
        set({ layerStep: step })
      },

      toggleExplode: () =>
        set((state) => {
          if (state.exploded) return { exploded: false }
          // You cannot fan apart layers you have not revealed.
          return {
            exploded: true,
            layerStep: 1 as LayerStep,
            pendingCoverId: null,
            coverPhase: state.coverPhase === 'hidden' ? ('wipeIn' as CoverPhase) : state.coverPhase,
          }
        }),

      setLayerError: (layer, message) =>
        set((state) => {
          const next = { ...state.layerErrors }
          if (message) next[layer] = message
          else delete next[layer]
          return { layerErrors: next }
        }),

      setSheetCoverage: (fraction) => {
        // Quantised: this drives a camera re-frame, and the sheet's height
        // animation would otherwise fire a store write every frame.
        const next = Math.round(Math.min(Math.max(fraction, 0), 0.9) * 40) / 40
        if (next !== get().sheetCoverage) set({ sheetCoverage: next })
      },

      reset: () => set(INITIAL),
    }),
    { name: 'PresentationStore' }
  )
)
