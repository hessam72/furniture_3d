import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { routing, type Locale } from "@/i18n/routing";
import { getHomeCopy } from "@/lib/content/home";
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

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export async function generateMetadata({
  params,
}: {
  params: { locale: Locale };
}): Promise<Metadata> {
  const { locale } = params;
  const t = await getTranslations({ locale, namespace: "metadata" });
  return {
    title: t("title"),
    description: t("description"),
    alternates: {
      canonical: locale === "fa" ? "/" : "/en",
      languages: { fa: "/", en: "/en" },
    },
    openGraph: { title: t("title"), description: t("description"), type: "website" },
  };
}

export default function Home({ params }: { params: { locale: Locale } }) {
  setRequestLocale(params.locale);
  const { ui } = getHomeCopy(params.locale);

  return (
    <div className="landing-root ink-gradient min-h-screen">
      <a
        href="#main"
        className="font-persian sr-only focus:not-sr-only focus:absolute focus:end-4 focus:top-4 focus:z-[300] focus:rounded-full focus:bg-gold focus:px-4 focus:py-2 focus:text-sm focus:font-bold focus:text-ink-950"
      >
        {ui.skipToContent}
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
