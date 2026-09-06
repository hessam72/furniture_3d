import type { Metadata } from "next";
import Link from "next/link";
import productsJson from "@/public/config/products.json";
import { AR_PAGE, BRAND } from "@/lib/content/home";
import { ArrowIcon } from "@/components/landing/icons";
import { Heading } from "@/components/landing/SectionHeading";
import ArDemoClient, { type ArProduct } from "./ArDemoClient";

export const metadata: Metadata = {
  title: "نمایش در واقعیت افزوده | شهر امید",
  description: AR_PAGE.description,
};

type RawProduct = { name: string; glbPath: string; usdzPath: string };

const products: ArProduct[] = Object.entries(
  productsJson as Record<string, RawProduct>,
).map(([slug, product]) => ({
  slug,
  name: AR_PAGE.productNames[slug] ?? product.name,
  glbPath: product.glbPath,
  usdzPath: product.usdzPath,
}));

export default function ArPage() {
  return (
    <div className="landing-root ink-gradient min-h-screen px-5 pb-16 pt-8 sm:px-6">
      <div className="mx-auto flex max-w-3xl flex-col gap-6">
        <div className="flex items-center justify-between">
          <span className="font-persian text-gold-key text-sm font-extrabold tracking-[0.18em]">
            {BRAND.name}
          </span>
          <Link
            href="/"
            className="font-persian inline-flex items-center gap-2 text-xs text-white/60 transition-colors hover:text-gold-soft"
          >
            {AR_PAGE.back}
            <ArrowIcon className="h-4 w-4 rotate-180" />
          </Link>
        </div>

        <div className="flex flex-col gap-3">
          <Heading as="h1" segments={[{ text: AR_PAGE.title, gold: true }]} />
          <p className="font-persian text-sm leading-[2] text-white/65">
            {AR_PAGE.description}
          </p>
        </div>

        <ArDemoClient products={products} />
      </div>
    </div>
  );
}
