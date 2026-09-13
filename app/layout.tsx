import type { Metadata, Viewport } from "next";
import { Inter, Cinzel, Cormorant_Garamond } from "next/font/google";
import localFont from "next/font/local";
import "./globals.css";
import { LenisProvider } from "@/components/layout/LenisProvider";
import CustomCursor from "@/components/ui/CustomCursor";

// Self-hosted at build time (next/font) — no runtime Google Fonts requests
// and no render-blocking CSS @import.
//
// `preload` is per-family and deliberate. next/font emits a `<link
// rel="preload" as="font">` for **every face** in a family, and this layout
// declares 23 of them across four families — which is why every page logged
// "The resource … was preloaded using link preload but not used within a few
// seconds from the window's load event", once per face it never painted.
// /product/test alone was preloading 12 while rendering Persian body text in
// one of them.
//
// So nothing is preloaded now. Every face still loads through its `@font-face`
// rule the moment a page uses it, and `display: swap` means nothing is blocked
// waiting — they are simply no longer *promised* up front on pages that will
// not touch them. See the note on Vazirmatn for the one that was a real trade.
const vazirmatn = localFont({
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
  /**
   * Off as well, and this one is a judgement call rather than an obvious win.
   *
   * All eight weights are referenced somewhere in the app (200 through 900),
   * but no single page paints more than three or four — and `next/font/local`
   * preloads a family whole or not at all, so keeping it on means five wasted
   * promises per page and five warnings. Splitting into a preloaded "core" and
   * a lazy "extra" family does not work either: CSS font fallback is per
   * character, not per weight, so a `font-weight: 900` would synthesise bold
   * from the core family rather than fall through to the real Black face.
   *
   * `display: "swap"` already means text paints immediately in the fallback and
   * swaps when the real face lands, so what the preload actually bought was a
   * shorter swap for the subset it happened to guess right. If you would rather
   * have that and live with the console noise, this is the one line to flip.
   */
  preload: false,
});

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
  // Only ever the Latin fallback *behind* Vazirmatn on these RTL pages —
  // visible text is Persian, so this rarely paints at all.
  preload: false,
});

const cinzel = Cinzel({
  subsets: ["latin"],
  variable: "--font-cinzel",
  display: "swap",
  // `.font-display`, `.museum-label`, the gold buttons — showroom and homepage
  // chrome. /product and /simple use none of them.
  preload: false,
});

const cormorant = Cormorant_Garamond({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
  style: ["normal", "italic"],
  variable: "--font-cormorant",
  display: "swap",
  // Ten faces (five weights x two styles) for `.font-serif` and /about. The
  // single biggest contributor to the warning, and used on the fewest pages.
  preload: false,
});

export const metadata: Metadata = {
  title: "شهر امید | شوروم مجازی مبلمان",
  description:
    "نمایشگاه سه‌بعدی مبلمان با تغییر رنگ در لحظه و نمایش در واقعیت افزوده. مشتری بدون نصب هیچ برنامه‌ای وارد شوروم اختصاصی شما می‌شود.",
  keywords: [
    "مبلمان",
    "شوروم مجازی",
    "نمایشگاه سه‌بعدی",
    "واقعیت افزوده",
    "مبل",
    "دکوراسیون داخلی",
    "تغییر رنگ مبلمان",
  ],
  authors: [{ name: "شهر امید" }],
  openGraph: {
    title: "شهر امید | شوروم مجازی مبلمان",
    description:
      "نمایشگاه سه‌بعدی مبلمان با تغییر رنگ در لحظه و نمایش در واقعیت افزوده.",
    type: "website",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#172236",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="fa"
      dir="rtl"
      suppressHydrationWarning
      className={`${vazirmatn.variable} ${inter.variable} ${cinzel.variable} ${cormorant.variable}`}
    >
      <body>
        <LenisProvider>
          {/* Cinematic film grain overlay */}
          <div className="grain-overlay" aria-hidden="true" />

          {/* Custom luxury cursor */}
          <CustomCursor />

          {children}
        </LenisProvider>
      </body>
    </html>
  );
}
