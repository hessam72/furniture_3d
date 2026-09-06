"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useProgress } from "@react-three/drei";

/** Branded loader overlay — hides the car model pop-in while GLBs stream. */
export default function LoadingScreen() {
  const { progress, active } = useProgress();
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!active && progress >= 100 && !done) {
      const t = setTimeout(() => setDone(true), 400);
      return () => clearTimeout(t);
    }
  }, [active, progress, done]);

  return (
    <AnimatePresence>
      {!done && (
        <motion.div
          key="loader"
          exit={{ opacity: 0, transition: { duration: 0.8, ease: "easeInOut" } }}
          className="fixed inset-0 z-[200] flex flex-col items-center justify-center gap-6 bg-[#060606]"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/images/Furnitures OC LOGO.png"
            alt=""
            className="w-40 h-auto"
            style={{ filter: "brightness(1.15) drop-shadow(0 0 30px rgba(255,215,0,0.25))" }}
            onError={(e) => ((e.target as HTMLImageElement).style.display = "none")}
          />
          <div className="w-52 h-[2px] bg-white/10 rounded-full overflow-hidden">
            <motion.div
              className="h-full rounded-full"
              style={{
                background: "linear-gradient(to right, #b8860b, #ffd700, #fffacd)",
                boxShadow: "0 0 12px rgba(255,215,0,0.6)",
              }}
              animate={{ width: `${progress}%` }}
              transition={{ ease: "easeOut", duration: 0.3 }}
            />
          </div>
          <p className="text-[0.7rem] tracking-[0.3em] uppercase" style={{ color: "rgba(255,215,0,0.75)" }}>
            {Math.round(progress)}%
          </p>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
