"use client";

import { motion, useScroll, useSpring } from "framer-motion";

export default function ScrollProgress() {
  const { scrollYProgress } = useScroll();
  const scaleX = useSpring(scrollYProgress, {
    stiffness: 100,
    damping: 30,
    restDelta: 0.001,
  });

  return (
    <motion.div
      // origin-left is deliberate even under dir="rtl": the bar tracks scroll
      // depth, which is a vertical quantity, not reading direction.
      className="fixed left-0 right-0 top-0 z-[100] h-[2px] origin-left"
      style={{
        scaleX,
        background: "linear-gradient(90deg, #8a6a40, #f7ebd6, #c29d68)",
        boxShadow: "0 0 12px rgb(194 157 104 / 55%)",
      }}
    />
  );
}
