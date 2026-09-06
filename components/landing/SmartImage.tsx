"use client";

import Image from "next/image";
import { useState } from "react";
import { ImageIcon } from "./icons";
import { cn } from "@/lib/utils";

/**
 * `next/image` that degrades to a styled glass placeholder when the file is
 * missing, so the page reads as intentional before any photography is
 * uploaded.
 *
 * `src` is always a plain string (never a static import) — a static import of
 * an absent file is a hard build error, which is exactly what we're avoiding.
 */
export default function SmartImage({
  src,
  alt,
  label,
  sizes,
  priority = false,
  blend = false,
  className,
}: {
  src: string;
  alt: string;
  /** Persian caption shown on the placeholder. */
  label: string;
  sizes: string;
  priority?: boolean;
  /** Fade the image out on every edge so it melts into the page. */
  blend?: boolean;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);

  if (failed) {
    return (
      <div
        // In blend mode the placeholder gets a soft radial wash instead of a
        // flat fill, so the hero still melts into the page while no
        // photography exists rather than reading as a framed rectangle.
        className={cn(
          "absolute inset-0 flex flex-col items-center justify-center gap-3",
          blend
            ? "bg-[radial-gradient(70%_60%_at_50%_45%,rgb(31_45_69/55%),transparent_75%)]"
            : "bg-ink-800/60",
          className,
        )}
      >
        <ImageIcon className="h-9 w-9 text-gold/70" />
        <span className="font-persian text-xs text-white/45">{label}</span>
      </div>
    );
  }

  return (
    <Image
      src={src}
      alt={alt}
      fill
      unoptimized
      sizes={sizes}
      priority={priority}
      onError={() => setFailed(true)}
      // The mask goes on the image, never the wrapper, so the placeholder
      // above stays unmasked and legible while no photography exists.
      className={cn("object-cover", blend && "image-blend", className)}
    />
  );
}
