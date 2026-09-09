/**
 * React Context: Quality Tier Management
 *
 * Purpose: the render tier every 3D scene sizes its allocations from.
 * Why Context: infrastructure state, set once per page, read deep inside the
 *   canvas by components that own GPU buffers.
 * Pattern: Provider per page → consumed by Canvas components → DPR, effects,
 *   shadows, anisotropy.
 *
 * The provider used to own the policy as well as the state: a `pinned` prop
 * that bypassed everything, a `localStorage` branch, and an `innerWidth < 768`
 * phone test that disagreed with the rest of the codebase. All three now live
 * in `lib/config/deviceTier`, which explains at length why. What is left here
 * is the wiring: resolve once, on the first render, and hand it down.
 */
'use client';

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState, ReactNode } from 'react';
import { QualityPreset, QualitySettings, QUALITY_PRESETS } from '@/lib/config/quality';
import {
  SURFACE_POLICY,
  readStoredTier,
  resolveTier,
  writeStoredTier,
  type DeviceClass,
  type RenderSurface,
} from '@/lib/config/deviceTier';
import { useDeviceClass } from '@/hooks/useDeviceClass';

interface QualityContextType {
  preset: QualityPreset;
  settings: QualitySettings;
  setPreset: (preset: QualityPreset) => void;
  /** What is drawing this page. Consumers size shadow maps and composer buffers
   *  from it directly. @see SHADOW_BUDGET */
  device: DeviceClass;
  /** The highest rung this device may be handed here. A picker offers no more. */
  ceiling: QualityPreset;
  /** Experimental SSGI/TRAA runtime toggle (only honored where settings.experimentalSSGI allows it) */
  ssgiEnabled: boolean;
  setSsgiEnabled: (enabled: boolean) => void;
}

const QualityContext = createContext<QualityContextType | undefined>(undefined);

const SSGI_STORAGE_KEY = 'car-experimental-ssgi';

export function QualityProvider({
  children,
  surface,
  preset: manifest,
  downgrades = 0,
}: {
  children: ReactNode;
  /** Which budget this page is spending. @see SURFACE_POLICY */
  surface: RenderSurface;
  /**
   * What the product's manifest asked for.
   *
   * It no longer *pins* — it is one input among three, and whether it beats a
   * remembered choice is a property of the surface (`honoursStored`), which is
   * where that knowledge belongs. A presentation is a single piece in a booth
   * under a camera that only dollies, so its cost is known up front and the
   * manifest wins there; a walkable scene's is not, so the visitor's choice
   * wins. Neither may exceed the device ceiling.
   */
  preset?: QualityPreset | null;
  /** Rungs surrendered to a lost context this page view. @see useContextRecovery */
  downgrades?: number;
}) {
  const device = useDeviceClass();

  /**
   * Resolved in the initialiser, not an effect.
   *
   * The effect this replaces is what made a phone's first render the desktop
   * tier — and the canvas underneath could mount, size its buffers and compile
   * its programs against that before the correction arrived. Reading storage
   * synchronously is safe because nothing tier-dependent is server-rendered:
   * every Canvas is `dynamic(..., { ssr: false })`, and the only other consumer
   * is `QualityChips`, which renders behind a probe that is still `checking`
   * during SSR. Keep that true, or hydration will start warning.
   */
  const [chosen, setChosen] = useState<QualityPreset | null>(() => readStoredTier());

  const preset = resolveTier({ surface, device, manifest, stored: chosen, downgrades });
  const ceiling = SURFACE_POLICY[surface].ceiling[device];
  const settings = QUALITY_PRESETS[preset];

  const [ssgiEnabled, setSsgiEnabledState] = useState(false);
  useEffect(() => {
    setSsgiEnabledState(localStorage.getItem(SSGI_STORAGE_KEY) === '1');
  }, []);

  // The raw choice is stored, and capped again on the way back out. Capping on
  // write would look equivalent and would not be — @see deviceTier's header.
  const setPreset = useCallback((next: QualityPreset) => {
    setChosen(next);
    writeStoredTier(next);
  }, []);

  const setSsgiEnabled = useCallback((enabled: boolean) => {
    setSsgiEnabledState(enabled);
    localStorage.setItem(SSGI_STORAGE_KEY, enabled ? '1' : '0');
  }, []);

  /**
   * Memoised, because a context value is a dependency of every consumer.
   *
   * The providers all wrap a page component that holds its own state — /product
   * keeps AR, splash and error flags right alongside this — so an object
   * literal here re-rendered every `useQuality()` consumer in the canvas on an
   * unrelated setState, several of which own GPU allocations that are rebuilt
   * on a prop-identity change. With this the tier is what re-renders them, and
   * a tier change is exactly when they should rebuild.
   */
  const value = useMemo(
    () => ({ preset, settings, setPreset, device, ceiling, ssgiEnabled, setSsgiEnabled }),
    [preset, settings, setPreset, device, ceiling, ssgiEnabled, setSsgiEnabled]
  );

  return <QualityContext.Provider value={value}>{children}</QualityContext.Provider>;
}

// Read-only defaults for consumers rendered outside a provider (e.g. the
// homepage hero embeds ConfigurableCar without one — throwing here crashed
// its whole canvas). Setters are no-ops.
const FALLBACK_QUALITY: QualityContextType = {
  preset: 'low',
  settings: QUALITY_PRESETS.low,
  setPreset: () => {},
  // The safe assumption when nobody has said: a page with no provider is a page
  // that never thought about its budget, and `low` is what every device holds.
  device: 'phone',
  ceiling: 'low',
  ssgiEnabled: false,
  setSsgiEnabled: () => {},
};

export function useQuality() {
  return useContext(QualityContext) ?? FALLBACK_QUALITY;
}
