"use client";

import { useCallback, useRef, useState } from "react";
import SmartImage from "./SmartImage";
import { DragIcon } from "./icons";
import { COLOR_SWAP } from "@/lib/content/home";
import { toFaDigits } from "@/lib/utils";

type Img = { src: string; alt: string; label: string };

const clamp = (n: number) => Math.min(100, Math.max(0, n));
const SIZES = "(max-width: 640px) 92vw, (max-width: 1024px) 80vw, 768px";

/**
 * Image comparison wipe.
 *
 * `clip-path: inset()` and the handle's `left` are *physical* properties, so
 * the widget behaves identically under dir="rtl" and needs no mirroring.
 * A native <input type="range"> is deliberately avoided — browsers invert its
 * value axis in RTL, which desynchronises the visual wipe from aria-valuenow.
 *
 * The divider position is written straight to a CSS variable during the drag,
 * so pointer moves cause zero React re-renders; state is synced once on
 * release purely to keep aria-valuenow honest.
 */
export default function BeforeAfterSlider({
  before,
  after,
}: {
  before: Img;
  after: Img;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const frame = useRef(0);
  const [pos, setPos] = useState(50);
  const [dragging, setDragging] = useState(false);

  const write = useCallback((pct: number) => {
    containerRef.current?.style.setProperty("--pos", `${pct}%`);
  }, []);

  const pctFromEvent = useCallback((clientX: number) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0) return 50;
    return clamp(((clientX - rect.left) / rect.width) * 100);
  }, []);

  const onPointerDown = (e: React.PointerEvent<HTMLElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    setDragging(true);
    const pct = pctFromEvent(e.clientX);
    write(pct);
    setPos(pct);
  };

  const onPointerMove = (e: React.PointerEvent<HTMLElement>) => {
    if (!dragging) return;
    const pct = pctFromEvent(e.clientX);
    cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(() => write(pct));
  };

  const onPointerUp = (e: React.PointerEvent<HTMLElement>) => {
    if (!dragging) return;
    e.currentTarget.releasePointerCapture?.(e.pointerId);
    cancelAnimationFrame(frame.current);
    const pct = pctFromEvent(e.clientX);
    write(pct);
    setPos(pct);
    setDragging(false);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    // Mapped spatially: ArrowRight always moves the divider physically right,
    // which is the least surprising behaviour for a wipe widget in any dir.
    const step =
      e.key === "ArrowRight" ? 2
      : e.key === "ArrowLeft" ? -2
      : e.key === "PageUp" ? 10
      : e.key === "PageDown" ? -10
      : 0;

    let next = pos;
    if (step) next = clamp(pos + step);
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = 100;
    else return;

    e.preventDefault(); // stop Lenis from also scrolling the page
    write(next);
    setPos(next);
  };

  return (
    <div
      ref={containerRef}
      style={{ "--pos": "50%" } as React.CSSProperties}
      className="relative aspect-[4/3] w-full max-w-3xl select-none overflow-hidden rounded-glass glass-flat glass-gold specular"
    >
      {/* Base layer: the recoloured "after" image */}
      <SmartImage src={after.src} alt={after.alt} label={after.label} sizes={SIZES} />

      {/* "Before" is clipped from the left edge up to the divider */}
      <div
        className="absolute inset-0"
        style={{ clipPath: "inset(0 0 0 var(--pos))" }}
      >
        <SmartImage
          src={before.src}
          alt={before.alt}
          label={before.label}
          sizes={SIZES}
        />
      </div>

      {/* Labels — "before" sits on the physical right, the RTL reading start */}
      <span className="font-persian pointer-events-none absolute right-3 top-3 rounded-full glass px-3 py-1 text-[0.7rem] font-bold text-white/85">
        {COLOR_SWAP.beforeLabel}
      </span>
      <span className="font-persian pointer-events-none absolute left-3 top-3 rounded-full glass px-3 py-1 text-[0.7rem] font-bold text-gold-bright">
        {COLOR_SWAP.afterLabel}
      </span>

      {/* Divider line */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-y-0 w-px bg-gold-edge/70 shadow-[0_0_16px_rgb(194_157_104/55%)]"
        style={{ left: "var(--pos)" }}
      />

      {/* Handle — the only drag origin, so vertical swipes over the image
          still scroll the page normally. */}
      <button
        type="button"
        data-drag-handle
        data-lenis-prevent
        role="slider"
        aria-label={COLOR_SWAP.sliderAriaLabel}
        aria-orientation="horizontal"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(pos)}
        aria-valuetext={`${toFaDigits(Math.round(pos))} درصد`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onKeyDown={onKeyDown}
        style={{ left: "var(--pos)", touchAction: "none" }}
        className="absolute top-1/2 grid h-12 w-12 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full glass glass-gold text-gold-bright shadow-[0_0_22px_-4px_rgb(194_157_104/60%)] transition-transform duration-200 ease-lux hover:scale-110 active:scale-105"
      >
        <DragIcon className="h-5 w-5" />
      </button>

      <span className="font-persian pointer-events-none absolute inset-x-0 bottom-3 text-center text-[0.7rem] text-white/50">
        {COLOR_SWAP.dragHint}
      </span>
    </div>
  );
}
