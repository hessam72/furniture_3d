"use client";

import { useCallback, useEffect, useRef } from "react";
import Link from "next/link";
import { useLenis } from "@/components/layout/LenisProvider";
import { NAV_LINKS, BRAND } from "@/lib/content/home";
import { CloseIcon } from "./icons";

const FOCUSABLE =
  'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])';

export default function MobileMenu({
  open,
  onClose,
  returnFocusTo,
}: {
  open: boolean;
  onClose: () => void;
  returnFocusTo: React.RefObject<HTMLButtonElement>;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const lenis = useLenis();

  /* Scroll lock. Lenis owns the scroll, so stop it; the class is what the
     `.lenis.lenis-stopped { overflow: hidden }` rule in globals.css keys off,
     and the inline overflow covers the case where Lenis never mounted. */
  useEffect(() => {
    if (!open) return;
    const html = document.documentElement;
    const previousOverflow = document.body.style.overflow;

    lenis?.stop();
    html.classList.add("lenis-stopped");
    document.body.style.overflow = "hidden";

    return () => {
      lenis?.start();
      html.classList.remove("lenis-stopped");
      document.body.style.overflow = previousOverflow;
    };
  }, [open, lenis]);

  /* Focus management: move focus in on open, trap Tab, restore on close. */
  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus();

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key !== "Tab") return;

      const nodes = panelRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE);
      if (!nodes?.length) return;
      const first = nodes[0];
      const last = nodes[nodes.length - 1];

      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      returnFocusTo.current?.focus();
    };
  }, [open, onClose, returnFocusTo]);

  /* In-page anchors: close first, then let Lenis animate the scroll. */
  const handleClick = useCallback(
    (href: string) => (e: React.MouseEvent) => {
      if (!href.startsWith("#")) {
        onClose();
        return;
      }
      e.preventDefault();
      const target = document.querySelector(href);
      onClose();
      if (!target) return;
      // Delay scroll until after menu close animation & lenis restart
      setTimeout(() => {
        if (lenis) lenis.scrollTo(target as HTMLElement, { offset: -72 });
        else target.scrollIntoView({ behavior: "smooth" });
      }, 100);
    },
    [lenis, onClose],
  );

  if (!open) return null;

  return (
    <div
      // Opaque enough to hide the page, blurred enough to keep the iOS glass
      // read. Stays under .grain-overlay (z-9999) and CustomCursor (z-99999)
      // so the film grain still carries across the overlay.
      className="fixed inset-0 z-[200] flex flex-col bg-ink-950/92 backdrop-blur-2xl"
      role="dialog"
      aria-modal="true"
      aria-label="منوی اصلی"
    >
      <div
        ref={panelRef}
        className="flex h-full w-full flex-col px-6 pb-10 pt-5"
      >
        <div className="relative flex h-12 items-center">
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label="بستن منو"
            className="absolute right-0 grid h-11 w-11 place-items-center rounded-full border border-gold-line bg-ink-900/40 text-gold shadow-[inset_0_1px_0_rgb(247_235_214/18%)] transition-colors hover:border-gold-line-hi hover:text-gold-edge"
          >
            <CloseIcon className="h-5 w-5" />
          </button>
          <span className="font-persian text-gold-key absolute left-0 text-sm font-extrabold tracking-[0.18em]">
            {BRAND.name}
          </span>
        </div>

        <nav className="mt-10 flex-1">
          <ul className="flex flex-col gap-1">
            {NAV_LINKS.map((link, i) => (
              <li key={link.href}>
                <Link
                  href={link.href}
                  onClick={handleClick(link.href)}
                  className="font-persian flex items-center justify-between border-b border-white/8 py-4 text-lg font-bold text-white transition-colors hover:text-gold-soft"
                >
                  {link.label}
                  {/* <span
                    aria-hidden="true"
                    className="persian-number text-xs text-gold/50"
                  >
                    {["۰۱", "۰۲", "۰۳", "۰۴", "۰۵", "۰۶"][i]}
                  </span> */}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <p className="font-persian text-center text-xs text-white/40">
          {BRAND.tagline}
        </p>
      </div>
    </div>
  );
}
