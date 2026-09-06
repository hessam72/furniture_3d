"use client";

import { RefObject, useEffect, useState } from "react";
import { motion, MotionValue } from "framer-motion";
import { RAIL_ACTS, activeActIndex } from "@/lib/homeChapters";

interface Props {
  scrollProgress: MotionValue<number>;
  containerRef: RefObject<HTMLDivElement | null>;
}

/** Vertical chapter dot rail — active act synced to scroll, click to jump. */
export default function ChapterRail({ scrollProgress, containerRef }: Props) {
  const [active, setActive] = useState(0);

  useEffect(() => {
    const unsub = scrollProgress.on("change", (v) => {
      const idx = activeActIndex(v);
      setActive((prev) => (prev === idx ? prev : idx));
    });
    return unsub;
  }, [scrollProgress]);

  const jumpTo = (fraction: number) => {
    const el = containerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const containerTop = rect.top + window.scrollY;
    const scrollable = el.offsetHeight - window.innerHeight;
    window.scrollTo({ top: containerTop + scrollable * fraction, behavior: "smooth" });
  };

  return (
    <div className="absolute left-4 md:left-8 top-1/2 -translate-y-1/2 z-[110] hidden md:flex flex-col gap-5 pointer-events-auto">
      {RAIL_ACTS.map((act, i) => (
        <button
          key={act.id}
          onClick={() => jumpTo(act.jumpTo)}
          className="group flex items-center gap-3 cursor-pointer bg-transparent border-0 p-0"
          aria-label={act.label}
        >
          <motion.span
            className="block rounded-full"
            animate={{
              scale: active === i ? 1.4 : 1,
              backgroundColor: active === i ? "#ffd700" : "rgba(255,215,0,0.3)",
              boxShadow: active === i ? "0 0 12px rgba(255,215,0,0.8)" : "0 0 0px rgba(255,215,0,0)",
            }}
            transition={{ duration: 0.35 }}
            style={{ width: 8, height: 8 }}
          />
          <span
            className="text-[0.6rem] tracking-[0.2em] uppercase transition-opacity duration-300 whitespace-nowrap"
            style={{
              color: "#ffd700",
              opacity: active === i ? 0.95 : 0,
              textShadow: "0 0 10px rgba(255,215,0,0.4)",
            }}
          >
            {act.label}
          </span>
        </button>
      ))}
    </div>
  );
}
