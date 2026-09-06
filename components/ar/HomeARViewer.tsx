"use client";

// Registers the <model-viewer> custom element. Without this side-effect
// import the tag renders as an inert unknown element.
// The .min.js bundle is deliberate: model-viewer's ESM entry peers
// three@^0.183 while this project pins three@0.170 — see ARCarViewer.tsx.
import "@google/model-viewer/dist/model-viewer.min.js";

import { useEffect, useRef, useState } from "react";
import { isARCapable, getARModeName } from "@/lib/device-utils";
import { AR_PAGE } from "@/lib/content/home";
import { ImageIcon, ArrowIcon } from "@/components/landing/icons";
import GlassCard from "@/components/landing/GlassCard";
import GoldButton from "@/components/landing/GoldButton";

type Status = "checking" | "missing" | "ready" | "error";

export default function HomeARViewer({
  glbPath,
  usdzPath,
  productName,
}: {
  glbPath: string;
  usdzPath: string;
  productName: string;
}) {
  const ref = useRef<HTMLElement & ModelViewerElement>(null);
  const [status, setStatus] = useState<Status>("checking");
  const [arSupported, setArSupported] = useState(false);

  useEffect(() => {
    setArSupported(isARCapable());
  }, []);

  /* The GLB files are gitignored and may simply not be on the server yet.
     Probe first so we can show a calm explanation instead of mounting a
     viewer that spins forever. */
  useEffect(() => {
    let cancelled = false;
    setStatus("checking");

    fetch(glbPath, { method: "HEAD" })
      .then((res) => {
        if (cancelled) return;
        setStatus(res.ok ? "ready" : "missing");
      })
      .catch(() => {
        if (!cancelled) setStatus("missing");
      });

    return () => {
      cancelled = true;
    };
  }, [glbPath]);

  /* Second net: the model can still fail to parse after it downloads. */
  useEffect(() => {
    const mv = ref.current;
    if (!mv || status !== "ready") return;
    const onError = () => setStatus("error");
    mv.addEventListener("error", onError);
    return () => mv.removeEventListener("error", onError);
  }, [status]);

  if (status === "checking") {
    return (
      <GlassCard className="grid min-h-[60svh] place-items-center px-6 text-center">
        <p className="font-persian text-sm text-white/60">{AR_PAGE.loading}</p>
      </GlassCard>
    );
  }

  if (status === "missing" || status === "error") {
    return (
      <GlassCard
        gold
        className="flex min-h-[60svh] flex-col items-center justify-center gap-4 px-6 py-12 text-center"
      >
        <span className="grid h-14 w-14 place-items-center rounded-full border border-gold-line text-gold">
          <ImageIcon className="h-7 w-7" />
        </span>
        <h2 className="font-persian text-base font-extrabold text-white">
          {AR_PAGE.missingTitle}
        </h2>
        <p className="font-persian max-w-sm text-xs leading-7 text-white/55">
          {AR_PAGE.missingBody}
        </p>
        <GoldButton href="/store" variant="outline">
          {AR_PAGE.toStore}
        </GoldButton>
      </GlassCard>
    );
  }

  return (
    <div className="relative overflow-hidden rounded-glass glass-flat glass-gold">
      {!arSupported && (
        <p className="font-persian border-b border-gold-line px-4 py-3 text-center text-xs text-gold-soft">
          {AR_PAGE.desktopNotice}
        </p>
      )}

      <model-viewer
        ref={ref}
        src={glbPath}
        ios-src={usdzPath}
        alt={productName}
        loading="eager"
        ar
        ar-modes="webxr scene-viewer quick-look"
        ar-scale="auto"
        ar-placement="floor"
        camera-controls
         camera-orbit="45deg 75deg 4m"
        min-camera-orbit="auto auto 1m"
        max-camera-orbit="auto auto 30m"
        field-of-view="40deg"
        // scale="0.5"
        auto-rotate
        auto-rotate-delay={1200}
        shadow-intensity={1}
        shadow-softness={0.6}
        exposure={1}
        interaction-prompt="auto"
        style={{ width: "100%", height: "60svh", backgroundColor: "transparent" }}
      >
        {arSupported && (
          <button
            slot="ar-button"
            className="font-persian cta-glow absolute bottom-4 left-1/2 inline-flex -translate-x-1/2 items-center gap-2 rounded-full px-6 py-3 text-sm font-bold text-gold-bright"
          >
            {AR_PAGE.arButton}
            <ArrowIcon className="h-4 w-4" />
          </button>
        )}
      </model-viewer>

      {arSupported && (
        <p className="font-persian px-4 pb-4 pt-2 text-center text-[0.7rem] text-white/45">
          {getARModeName()}
        </p>
      )}
    </div>
  );
}
