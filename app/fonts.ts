import { Inter, Cinzel, Cormorant_Garamond } from "next/font/google";
import localFont from "next/font/local";

/**
 * Self-hosted at build time (next/font) — no runtime Google Fonts requests
 * and no render-blocking CSS @import. Lives outside `app/[locale]/` so both
 * `[locale]/layout.tsx` and any future top-level layout can read the same
 * font objects; `next/font/local`'s `src` paths resolve relative to *this*
 * file, so `./fonts/...` still means `app/fonts/*.woff2`.
 *
 * `preload` is per-family and deliberately off on every family here. next/font
 * emits a `<link rel="preload" as="font">` for **every face** in a family, and
 * this app declares 23 of them across four families — which is why every page
 * used to log "The resource … was preloaded using link preload but not used
 * within a few seconds from the window's load event", once per face it never
 * painted. `display: "swap"` already means text paints immediately in the
 * fallback and swaps when the real face lands, so nothing is blocked by
 * leaving preload off — it just stops promising faces a given page may not use.
 */
export const vazirmatn = localFont({
  src: [
    { path: "./fonts/Vazirmatn-ExtraLight.woff2", weight: "200", style: "normal" },
    { path: "./fonts/Vazirmatn-Light.woff2", weight: "300", style: "normal" },
    { path: "./fonts/Vazirmatn-Regular.woff2", weight: "400", style: "normal" },
    { path: "./fonts/Vazirmatn-Medium.woff2", weight: "500", style: "normal" },
    { path: "./fonts/Vazirmatn-SemiBold.woff2", weight: "600", style: "normal" },
    { path: "./fonts/Vazirmatn-Bold.woff2", weight: "700", style: "normal" },
    { path: "./fonts/Vazirmatn-ExtraBold.woff2", weight: "800", style: "normal" },
    { path: "./fonts/Vazirmatn-Black.woff2", weight: "900", style: "normal" },
  ],
  variable: "--font-vazirmatn",
  display: "swap",
  preload: false,
});

export const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
  // Body face for the `en` locale (see globals.css `[lang='en']` rule) as well
  // as the Latin fallback behind Vazirmatn on `fa` pages.
  preload: false,
});

export const cinzel = Cinzel({
  subsets: ["latin"],
  variable: "--font-cinzel",
  display: "swap",
  // `.font-display`, `.museum-label`, the gold buttons — showroom and homepage
  // chrome. /product and /simple use none of them.
  preload: false,
});

export const cormorant = Cormorant_Garamond({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
  style: ["normal", "italic"],
  variable: "--font-cormorant",
  display: "swap",
  // Ten faces (five weights x two styles) for `.font-serif` and /about. The
  // single biggest contributor to the warning, and used on the fewest pages.
  preload: false,
});

/** Combined class string applied to `<html>` in `app/[locale]/layout.tsx`. */
export const fontVariables = `${vazirmatn.variable} ${inter.variable} ${cinzel.variable} ${cormorant.variable}`;
