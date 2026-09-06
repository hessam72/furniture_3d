import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Liquid-glass surface.
 *
 * `blurred` opts into the real backdrop-filter. Leave it off for anything
 * that repeats (card grids) — a stack of blurred layers is the single biggest
 * scroll-jank source on mid-range Android.
 */
export default function GlassCard({
  children,
  className,
  gold = false,
  blurred = false,
}: {
  children: ReactNode;
  className?: string;
  gold?: boolean;
  blurred?: boolean;
}) {
  return (
    <div
      className={cn(
        blurred ? "glass" : "glass-flat",
        "specular rounded-glass",
        gold && "glass-gold",
        className,
      )}
    >
      {children}
    </div>
  );
}
