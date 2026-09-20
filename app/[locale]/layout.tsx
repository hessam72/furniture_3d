import type { Metadata, Viewport } from "next";
import { notFound } from "next/navigation";
import { NextIntlClientProvider, hasLocale } from "next-intl";
import { getMessages, getTranslations, setRequestLocale } from "next-intl/server";
import { routing, type Locale } from "@/i18n/routing";
import { fontVariables } from "@/app/fonts";
import "@/app/globals.css";
import { LenisProvider } from "@/components/layout/LenisProvider";
import AssetCache from "@/components/layout/AssetCache";
import CustomCursor from "@/components/ui/CustomCursor";

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
    // No metadataBase: this repo has no configured production domain yet
    // (no NEXT_PUBLIC_SITE_URL or similar). Add one and set it here once a
    // domain is live — Next.js otherwise resolves alternates/OG URLs
    // relative to each request, which is correct but logs a dev warning.
    alternates: { languages: { fa: "/", en: "/en" } },
  };
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#172236",
};

export default async function LocaleLayout({
  children,
  params,
}: Readonly<{
  children: React.ReactNode;
  params: { locale: string };
}>) {
  const { locale } = params;
  if (!hasLocale(routing.locales, locale)) notFound();

  // Enables static rendering for this and every static page below it — see
  // https://next-intl.dev/docs/getting-started/app-router/with-i18n-routing
  setRequestLocale(locale);

  // The whole message bundle is a few KB — negligible next to the multi-MB
  // GLB/HDR/KTX2 assets the 3D routes already load, so one provider at the
  // root (next-intl's own recommended setup) beats hand-splitting namespaces
  // per page: that trades a real payload win this app doesn't have for a
  // sharp edge — any nested provider that forgets to re-include a shared
  // namespace silently breaks translations under it.
  const messages = await getMessages();

  return (
    <html
      lang={locale}
      dir={locale === "fa" ? "rtl" : "ltr"}
      suppressHydrationWarning
      className={fontVariables}
    >
      <body>
        <NextIntlClientProvider locale={locale} messages={messages}>
          {/* Keeps the big immutable assets out of the network on a second
              visit — Safari's HTTP cache will not hold them. @see public/sw.js */}
          <AssetCache />
          <LenisProvider>
            {/* Cinematic film grain overlay */}
            <div className="grain-overlay" aria-hidden="true" />

            {/* Custom luxury cursor */}
            <CustomCursor />

            {children}
          </LenisProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
