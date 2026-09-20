"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { AR_PAGE } from "@/lib/content/home";
import GlassCard from "@/components/landing/GlassCard";
import { cn } from "@/lib/utils";

// model-viewer touches `window` at import time — it can never be server-rendered.
const HomeARViewer = dynamic(() => import("@/components/ar/HomeARViewer"), {
  ssr: false,
  loading: () => (
    <GlassCard className="grid min-h-[60svh] place-items-center px-6 text-center">
      <p className="font-persian text-sm text-white/60">{AR_PAGE.loading}</p>
    </GlassCard>
  ),
});

export type ArProduct = {
  slug: string;
  name: string;
  glbPath: string;
  usdzPath: string;
};

export default function ArDemoClient({ products }: { products: ArProduct[] }) {
  const [active, setActive] = useState(0);
  const product = products[active];

  if (!product) return null;

  return (
    <div className="flex flex-col gap-5">
      <ul className="flex snap-x-mandatory scrollbar-hide -mx-5 gap-2 overflow-x-auto px-5 sm:mx-0 sm:flex-wrap sm:justify-center sm:px-0">
        {products.map((item, i) => (
          <li key={item.slug} className="snap-start shrink-0">
            <button
              type="button"
              onClick={() => setActive(i)}
              aria-pressed={i === active}
              className={cn(
                "font-persian rounded-full border px-4 py-2 text-xs font-bold transition-colors",
                i === active
                  ? "border-gold-line-hi bg-gold/15 text-gold-edge"
                  : "border-hairline text-white/60 hover:text-white",
              )}
            >
              {item.name}
            </button>
          </li>
        ))}
      </ul>

      <HomeARViewer
        // Remount on product change so model-viewer reloads cleanly
        key={product.slug}
        glbPath={product.glbPath}
        usdzPath={product.usdzPath}
        productName={product.name}
      />
    </div>
  );
}
