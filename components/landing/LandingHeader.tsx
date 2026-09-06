"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { BRAND } from "@/lib/content/home";
import { MenuIcon } from "./icons";
import MobileMenu from "./MobileMenu";
import { cn } from "@/lib/utils";

/** Logo, falling back to a gold wordmark until the image file exists. */
function BrandMark() {
  const [failed, setFailed] = useState(false);

  if (failed) {
    return (
      <span className="font-persian text-gold-key text-base font-extrabold tracking-[0.18em] sm:text-lg">
        {BRAND.name}
      </span>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={BRAND.logoSrc}
      alt={BRAND.name}
      onError={() => setFailed(true)}
      className="h-8 w-auto object-contain sm:h-10"
    />
  );
}

export default function LandingHeader() {
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <>
      <header
        // Hidden while the drawer is open — the drawer carries its own brand
        // mark and close button, and a header showing through the overlay
        // reads as a rendering glitch.
        aria-hidden={open}
        className={cn(
          "fixed inset-x-0 top-0 z-[150] transition-all duration-500 ease-lux",
          scrolled && "glass border-x-0 border-t-0 border-b-gold-line",
          open && "pointer-events-none opacity-0",
        )}
      >
        {/* Physical left/right positioning, not flex order: it is immune to
            the document's dir="rtl" and puts the logo on the left and the
            menu button on the right exactly as specified. */}
        <div
          className={cn(
            "relative mx-auto flex max-w-6xl items-center px-4 transition-[height] duration-500 ease-lux sm:px-6",
            scrolled ? "h-14 sm:h-16" : "h-16 sm:h-20",
          )}
        >
          <Link
            href="/"
            className="absolute left-4 flex items-center sm:left-6"
            aria-label={BRAND.name}
          >
            <BrandMark />
          </Link>

          <button
            ref={buttonRef}
            type="button"
            onClick={() => setOpen(true)}
            aria-label="باز کردن منو"
            aria-expanded={open}
            aria-controls="site-menu"
            className="absolute right-4 grid h-11 w-11 place-items-center rounded-full border border-gold-line bg-ink-900/40 text-gold shadow-[inset_0_1px_0_rgb(247_235_214/18%)] transition-colors hover:border-gold-line-hi hover:text-gold-edge sm:right-6"
          >
            <MenuIcon className="h-5 w-5" />
          </button>
        </div>
      </header>

      <div id="site-menu">
        <MobileMenu
          open={open}
          onClose={() => setOpen(false)}
          returnFocusTo={buttonRef}
        />
      </div>
    </>
  );
}
