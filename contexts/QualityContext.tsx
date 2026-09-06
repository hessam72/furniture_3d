'use client';

import React, { createContext, useCallback, useContext, useMemo, useState, useEffect, ReactNode } from 'react';
import { QualityPreset, QualitySettings, QUALITY_PRESETS, DEFAULT_QUALITY } from '@/lib/config/quality';

interface QualityContextType {
  preset: QualityPreset;
  settings: QualitySettings;
  setPreset: (preset: QualityPreset) => void;
  /** Experimental SSGI/TRAA runtime toggle (only honored where settings.experimentalSSGI allows it) */
  ssgiEnabled: boolean;
  setSsgiEnabled: (enabled: boolean) => void;
}

const QualityContext = createContext<QualityContextType | undefined>(undefined);

const STORAGE_KEY = 'car-quality-preset';
const SSGI_STORAGE_KEY = 'car-experimental-ssgi';

export function QualityProvider({
  children,
  preset: pinned,
}: {
  children: ReactNode;
  /**
   * Pin the tier, bypassing **both** the stored preset and the phone
   * downgrade below.
   *
   * /car and /store want the remembered choice and the small-screen fallback:
   * they are free-roaming scenes whose cost scales with what the player walks
   * into. A product presentation is a single piece in a booth with a fixed
   * camera — its cost is known and the same on every device — so it is pinned
   * from its manifest instead, and a phone gets the desktop render.
   * `setPreset` still works at runtime; this only decides where it starts.
   */
  preset?: QualityPreset;
}) {
  const [preset, setPresetState] = useState<QualityPreset>(pinned ?? DEFAULT_QUALITY);
  const [settings, setSettings] = useState<QualitySettings>(QUALITY_PRESETS[pinned ?? DEFAULT_QUALITY]);
  const [ssgiEnabled, setSsgiEnabledState] = useState(false);

  // Load from localStorage on mount; first visit on a phone defaults to low
  useEffect(() => {
    setSsgiEnabledState(localStorage.getItem(SSGI_STORAGE_KEY) === '1');
    // Re-applied, not just seeded: a pinned tier is resolved on the client and
    // can change after mount (a `quality.mobile` override landing once the
    // viewport is known), and it must win over both branches below.
    if (pinned) {
      setPresetState(pinned);
      setSettings(QUALITY_PRESETS[pinned]);
      return;
    }

    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored && stored in QUALITY_PRESETS) {
      const loadedPreset = stored as QualityPreset;
      setPresetState(loadedPreset);
      setSettings(QUALITY_PRESETS[loadedPreset]);
    } else if (window.innerWidth < 768) {
      setPresetState('low');
      setSettings(QUALITY_PRESETS.low);
    }
  }, [pinned]);

  const setPreset = useCallback((newPreset: QualityPreset) => {
    setPresetState(newPreset);
    setSettings(QUALITY_PRESETS[newPreset]);
    localStorage.setItem(STORAGE_KEY, newPreset);
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
    () => ({ preset, settings, setPreset, ssgiEnabled, setSsgiEnabled }),
    [preset, settings, setPreset, ssgiEnabled, setSsgiEnabled]
  );

  return <QualityContext.Provider value={value}>{children}</QualityContext.Provider>;
}

// Read-only defaults for consumers rendered outside a provider (e.g. the
// homepage hero embeds ConfigurableCar without one — throwing here crashed
// its whole canvas). Setters are no-ops; the /car page always has the
// real provider.
const FALLBACK_QUALITY: QualityContextType = {
  preset: DEFAULT_QUALITY,
  settings: QUALITY_PRESETS[DEFAULT_QUALITY],
  setPreset: () => {},
  ssgiEnabled: false,
  setSsgiEnabled: () => {},
};

export function useQuality() {
  return useContext(QualityContext) ?? FALLBACK_QUALITY;
}
