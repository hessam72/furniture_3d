import type { Metadata } from "next";
import LandingHeader from "@/components/landing/LandingHeader";
import Hero from "@/components/landing/Hero";
import ShowroomSection from "@/components/landing/ShowroomSection";
import ColorSwapFeature from "@/components/landing/ColorSwapFeature";
import ArFeature from "@/components/landing/ArFeature";
import KeyFeatures from "@/components/landing/KeyFeatures";
import CallToAction from "@/components/landing/CallToAction";
import WhyUs from "@/components/landing/WhyUs";
import SiteFooter from "@/components/landing/SiteFooter";
import ScrollProgress from "@/components/ui/ScrollProgress";

export const metadata: Metadata = {
  title: "شهر امید | شوروم مجازی مبلمان",
  description:
    "نمایشگاه سه‌بعدی مبلمان با تغییر رنگ در لحظه و نمایش در واقعیت افزوده. مشتری بدون نصب هیچ برنامه‌ای وارد شوروم اختصاصی شما می‌شود.",
};

export default function Home() {
  return (
    <div className="landing-root ink-gradient min-h-screen">
      <a
        href="#main"
        className="font-persian sr-only focus:not-sr-only focus:absolute focus:right-4 focus:top-4 focus:z-[300] focus:rounded-full focus:bg-gold focus:px-4 focus:py-2 focus:text-sm focus:font-bold focus:text-ink-950"
      >
        رفتن به محتوای اصلی
      </a>

      <ScrollProgress />
      <LandingHeader />

      <main id="main">
        <Hero />
        <ShowroomSection />
        <ColorSwapFeature />
        <ArFeature />
        <KeyFeatures />
        <CallToAction />
        <WhyUs />
      </main>

      <SiteFooter />
    </div>
  );
}
