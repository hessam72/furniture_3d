"use client";

import { useEffect, useState, createContext, useContext, ReactNode } from "react";
import { usePathname } from "next/navigation";
import Lenis from "lenis";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

gsap.registerPlugin(ScrollTrigger);

const LenisContext = createContext<Lenis | null>(null);

export function useLenis() {
  return useContext(LenisContext);
}

/**
 * Routes with nothing to scroll, where Lenis is pure overhead.
 *
 * `gsap.ticker` is an unconditional rAF loop and `lagSmoothing(0)` stops it
 * ever backing off, so on a fixed, full-screen 3D page it runs main-thread work
 * 60 times a second forever, next to a canvas on `frameloop="demand"` that is
 * trying to draw nothing at all while the viewer is still. It also installs
 * touch handlers over a page whose only gesture is a drag on the canvas. The
 * product presentation is `h-screen overflow-hidden` — there is no scroll for
 * smoothing to improve.
 */
const NO_SCROLL_ROUTES = ["/product"];

export function LenisProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const scrolls = !NO_SCROLL_ROUTES.some(
    (route) => pathname === route || pathname?.startsWith(`${route}/`)
  );
  // State, not a ref: a ref assigned inside the effect never re-renders, so
  // the context value stayed null forever and every useLenis() consumer got
  // null. Storing it in state publishes the real instance.
  const [lenis, setLenis] = useState<Lenis | null>(null);

  useEffect(() => {
    if (!scrolls) return;

    const lenis = new Lenis({
      duration: 1.4,
      easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
      orientation: "vertical",
      smoothWheel: true,
      wheelMultiplier: 0.8,
      touchMultiplier: 1.5,
      infinite: false,
    });

    setLenis(lenis);

    // Sync Lenis scroll with GSAP ScrollTrigger
    lenis.on("scroll", ScrollTrigger.update);

    // Keep a stable reference so the same callback can be removed on cleanup —
    // the previous inline arrow was a fresh function and never unregistered.
    const tick = (time: number) => lenis.raf(time * 1000);
    gsap.ticker.add(tick);
    gsap.ticker.lagSmoothing(0);

    return () => {
      gsap.ticker.remove(tick);
      lenis.destroy();
      setLenis(null);
    };
  }, [scrolls]);

  return (
    <LenisContext.Provider value={lenis}>{children}</LenisContext.Provider>
  );
}
