import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowIcon } from "./icons";
import { cn } from "@/lib/utils";

/**
 * Dark, gold-bordered, glowing CTA. Renders a next/link for internal routes
 * and a plain anchor for `tel:` / external hrefs.
 *
 * `solid` glows and carries the brighter border; `outline` is the quieter
 * sibling for secondary actions.
 */
export default function GoldButton({
  href,
  children,
  icon,
  variant = "solid",
  breathe = false,
  className,
}: {
  href: string;
  children: ReactNode;
  /** Replaces the default arrow. */
  icon?: ReactNode;
  variant?: "solid" | "outline";
  /** Slow breathing glow — reserve for the single primary action. */
  breathe?: boolean;
  className?: string;
}) {
  const classes = cn(
    "font-persian group relative inline-flex items-center justify-center gap-2.5 overflow-hidden rounded-full px-7 py-3.5 text-sm font-bold text-gold-bright transition-all duration-300 ease-lux active:scale-[0.98] sm:text-base",
    variant === "solid"
      ? "cta-glow hover:-translate-y-0.5"
      : "border border-gold-line bg-ink-900/50 hover:border-gold-line-hi hover:text-gold-edge",
    breathe && "cta-breathe",
    className,
  );

  const content = (
    <>
      {/* Sheen sweep on hover — same technique as .btn-primary in globals.css */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -translate-x-full bg-[linear-gradient(90deg,transparent,rgb(247_235_214/22%),transparent)] transition-transform duration-700 ease-lux group-hover:translate-x-full"
      />
      <span className="relative flex items-center gap-2.5">
        {children}
        {icon ?? <ArrowIcon className="h-4 w-4" />}
      </span>
    </>
  );

  const isInternal = href.startsWith("/") || href.startsWith("#");

  return isInternal ? (
    <Link href={href} className={classes}>
      {content}
    </Link>
  ) : (
    <a href={href} className={classes}>
      {content}
    </a>
  );
}
