import type { Metadata, Viewport } from "next";
import { Inter, Cinzel, Cormorant_Garamond } from "next/font/google";
import localFont from "next/font/local";
import "./globals.css";
import { LenisProvider } from "@/components/layout/LenisProvider";
import CustomCursor from "@/components/ui/CustomCursor";

// Self-hosted at build time (next/font) — no runtime Google Fonts requests
// and no render-blocking CSS @import.
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
});

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const cinzel = Cinzel({
  subsets: ["latin"],
  variable: "--font-cinzel",
  display: "swap",
});

const cormorant = Cormorant_Garamond({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
  style: ["normal", "italic"],
  variable: "--font-cormorant",
  display: "swap",
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
