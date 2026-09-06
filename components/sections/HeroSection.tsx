"use client";

import { useRef, useEffect, useState, Suspense } from "react";
import { useRouter } from "next/navigation";
import {
  motion,
  useTransform,
  useScroll,
} from "framer-motion";
import { Canvas } from "@react-three/fiber";
import { Environment, AdaptiveDpr } from "@react-three/drei";
import * as THREE from "three";
import ConfigurableCar from "@/components/car/ConfigurableCar";
import CameraControls from "@/components/car/CameraControls";
import { LightFlickerController } from "@/components/car/LightFlickerController";
import ScrollChapters3D from "@/components/home/ScrollChapters3D";
import ScrollCameraRig from "@/components/home/ScrollCameraRig";
import LoadingScreen from "@/components/home/LoadingScreen";
import ChapterRail from "@/components/home/ChapterRail";
import { useHomeScroll } from "@/hooks/useHomeScroll";
import { useCarConfig } from "@/stores/carConfigStore";
import { HomeReflectiveFloor } from "../store/HomeReflectiveFloor";

/* ─────────────────────────────────────────────────────────────
   Scroll section height — increase for more scroll room per
   second of video. 300vh ≈ comfortable for a 6-10s clip.
───────────────────────────────────────────────────────────── */
const SCROLL_HEIGHT = "700vh";


/* ─────────────────────────────────────────────────────────────
   Logo Component
───────────────────────────────────────────────────────────── */
function ShahrOmidLogo() {
  const [imgFailed, setImgFailed] = useState(false);

  if (!imgFailed) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src="/images/Furnitures OC LOGO.png"
        alt="Lumina Museum"
        style={{
          width: '13rem',
          height: 'auto',
          marginTop: '1rem',
          filter: "brightness(1.15) contrast(1.08) saturate(1.1)",
        }}
        onError={() => setImgFailed(true)}
        className="h-12 md:h-16 w-auto object-contain"
      />
    );
  }

  // Text fallback
  return (
    <div className="flex flex-col items-center gap-1">
      <div className="flex items-center gap-3">
        <span className="font-persian font-bold text-[0.65rem] md:text-[0.72rem] tracking-[0.28em] uppercase" style={{
          color: "#ffd700",
          textShadow: "0 0 20px rgba(255, 215, 0, 0.5)",
          opacity: 0.8,
        }}>
          MUSEUM
        </span>
        <svg viewBox="0 0 20 20" className="w-[22px] h-[22px] md:w-[26px] md:h-[26px]" fill="none">
          <path
            d="M10 2L3 8l7 10 7-10L10 2z"
            stroke="#ffd700"
            strokeWidth="1.5"
            strokeLinejoin="round"
            style={{ filter: "drop-shadow(0 0 8px rgba(255, 215, 0, 0.6))" }}
          />
          <path d="M3 8h14" stroke="#ffd700" strokeWidth="1.2" opacity="0.6" />
        </svg>
      </div>
      <span className="font-persian font-bold text-[1.3rem] md:text-[1.6rem] tracking-[0.25em]" style={{
        background: "linear-gradient(135deg, #c9a227 0%, #ffd700 35%, #fffacd 52%, #ffd700 65%, #b8860b 100%)",
        WebkitBackgroundClip: "text",
        WebkitTextFillColor: "transparent",
        backgroundClip: "text",
        filter: "drop-shadow(0 0 15px rgba(255, 215, 0, 0.4))",
      }}>
        LUMINA
      </span>
    </div>
  );
}

/* Car components will be imported below */

/* ═══════════════════════════════════════════════════════════
   HeroSection
═══════════════════════════════════════════════════════════ */
export default function HeroSection() {
  const router = useRouter();

  /* ── Refs ──────────────────────────────────────────────── */
  const scrollContainerRef = useRef<HTMLDivElement>(null); // 300vh tall
  const stickyFrameRef     = useRef<HTMLDivElement>(null); // sticky 100svh

  /* ── Scroll progress (0 → 1 across the 300vh container) ── */
  const { scrollYProgress } = useScroll({
    target: scrollContainerRef,
    offset: ["start start", "end end"],
  });

  /* ── Scroll-driven camera and parts ── */
  useHomeScroll(scrollYProgress);

  /* ── Initialize car config on mount ──
     NOTE: no setPreset here — a pending preset transition makes
     CameraControls' spring force-write the camera every frame and
     fight ScrollCameraRig (initial-scroll glitch). The rig owns the
     journey camera; Canvas starts at the curve's first point. */
  const { selectPart } = useCarConfig();

  useEffect(() => {
    // Scroll to top on mount
    window.scrollTo(0, 0);

    // Set initial parts (stock wheel, no spoiler)
    selectPart('wheels', 'wheel-stock');
    selectPart('spoilers', 'spoiler-none');
  }, [selectPart]);


  /* ── Scroll-based animations ── */
  // Logo: starts 35vh (15% higher than center), moves to top (0 → 0.2)
  const logoY = useTransform(scrollYProgress, [0, 0.2], ["35vh", "0vh"]);
  const logoScale = useTransform(scrollYProgress, [0, 0.2], [1.5, 1]);

  // Scroll hint: fades out early (0 → 0.15)
  const scrollHintOpacity = useTransform(scrollYProgress, [0, 0.15], [1, 0]);

  // Hero content: hidden during journey, reveal only at finale (95%+)
  const labelOpacity = useTransform(scrollYProgress, [0, 0.95, 1], [0, 0, 1]);
  const titleOpacity = useTransform(scrollYProgress, [0, 0.95, 0.97, 1], [0, 0, 1, 1]);
  const ornamentOpacity = useTransform(scrollYProgress, [0, 0.96, 0.98, 1], [0, 0, 1, 1]);
  const subtitleOpacity = useTransform(scrollYProgress, [0, 0.97, 0.99, 1], [0, 0, 1, 1]);

  // CTA button: fades in at finale
  const ctaOpacity = useTransform(scrollYProgress, [0, 0.95, 1], [0, 0, 1]);

  // Letterbox cinema bars: slide in as the journey starts, snap open at finale
  const letterboxScale = useTransform(scrollYProgress, [0, 0.04, 0.88, 0.92], [0, 1, 1, 0]);


  /* ── Render ────────────────────────────────────────────── */
  return (
    /*
      Outer div — the scroll container.
      Height = SCROLL_HEIGHT (300vh). Scrolling through it drives
      the video from t=0 to t=duration.
    */
    <div
      ref={scrollContainerRef}
      className="relative w-screen"
      style={{ height: SCROLL_HEIGHT }}
    >

      {/*
        Sticky frame — stays pinned to the top of the viewport
        while the user scrolls through the 300vh container.
        All UI lives inside this frame.
      */}
      <div
        ref={stickyFrameRef}
        dir="ltr"
        aria-label="Lumina Museum Homepage"
        className="sticky top-0 w-full overflow-hidden bg-[#060606]"
        style={{ height: "100svh", minHeight: "100vh" }}
      >

        {/* ════════════════════════════════════════════════
            BACKGROUND IMAGE — Museum backdrop under 3D models
        ════════════════════════════════════════════════ */}
        <div className="absolute inset-0 z-[0]">
          <div
            className="w-full h-full bg-cover bg-center bg-no-repeat"
            style={{
              backgroundImage: "url('/images/museum-bg.webp')",
              opacity: 0.3,
            }}
          />
        </div>

        {/* ════════════════════════════════════════════════
            LOGO — Scroll-controlled position (center → top)
        ════════════════════════════════════════════════ */}
        <motion.div
          className="absolute left-1/2 z-[100] pointer-events-none"
          style={{
            y: logoY,
            scale: logoScale,
            x: "-50%",
            transformOrigin: "center center",
          }}
        >
          <ShahrOmidLogo />

          {/* Scroll hint text + gesture below logo */}
          <motion.div
            className="absolute top-full left-1/2 -translate-x-1/2 mt-8 flex flex-col items-center gap-3"
            style={{ opacity: scrollHintOpacity }}
          >
            <p
              className="font-persian text-[0.7rem] tracking-[0.15em] whitespace-nowrap"
              style={{
                color: "rgba(255,215,0,0.7)",
                textShadow: "0 0 15px rgba(255, 215, 0, 0.3)",
              }}
            >
            Scroll to explore the showroom
            </p>

            {/* Animated scroll gesture */}
            <motion.div
              animate={{ y: [0, 8, 0] }}
              transition={{
                duration: 2,
                repeat: Infinity,
                ease: "easeInOut",
              }}
              className="flex flex-col items-center gap-2"
            >
              {/* Mouse icon */}
              <svg
                width="24"
                height="36"
                viewBox="0 0 24 36"
                fill="none"
                className="opacity-70"
              >
                <rect
                  x="2"
                  y="2"
                  width="20"
                  height="32"
                  rx="10"
                  stroke="#ffd700"
                  strokeWidth="2"
                  fill="none"
                />
                <motion.rect
                  x="10"
                  y="8"
                  width="4"
                  height="8"
                  rx="2"
                  fill="#ffd700"
                  animate={{ y: [8, 14, 8] }}
                  transition={{
                    duration: 2,
                    repeat: Infinity,
                    ease: "easeInOut",
                  }}
                />
              </svg>

              {/* Down arrow */}
              <motion.svg
                width="16"
                height="16"
                viewBox="0 0 16 16"
                fill="none"
                animate={{ y: [0, 4, 0], opacity: [0.5, 1, 0.5] }}
                transition={{
                  duration: 1.5,
                  repeat: Infinity,
                  ease: "easeInOut",
                }}
              >
                <path
                  d="M8 2L8 14M8 14L3 9M8 14L13 9"
                  stroke="#ffd700"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </motion.svg>
            </motion.div>
          </motion.div>
        </motion.div>

        {/* ════════════════════════════════════════════════
            LAYER 0 — 3D CAR MODEL (Scroll-Driven Camera & Parts)
        ════════════════════════════════════════════════ */}
        <div className="absolute inset-0 z-[1]">
          <Canvas
            camera={{ position: [5, 2, 5], fov: 50 }}
            shadows
            frameloop="demand"
            dpr={[0.75, 1.5]}
            gl={{
              antialias: true,
              toneMapping: THREE.ACESFilmicToneMapping,
              toneMappingExposure: 1.2,
            }}
          >
            <LightFlickerController scrollProgress={scrollYProgress}>
              <HomeReflectiveFloor resolution={512} />

              <Suspense fallback={null}>
              
                <ConfigurableCar modelPath="/models/car/car.glb" />
                <ScrollChapters3D scrollProgress={scrollYProgress} />
              </Suspense>

              <CameraControls disableInteraction />
              <ScrollCameraRig scrollProgress={scrollYProgress} />
              <AdaptiveDpr pixelated />
            </LightFlickerController>
          </Canvas>
        </div>

        {/* ════════════════════════════════════════════════
            LAYER 1 — DARK OVERLAYS
            Identical to the previous version; ensure text
            remains readable over any video content.
        ════════════════════════════════════════════════ */}
        <div className="absolute inset-0 z-[2] pointer-events-none">
          {/* Right-side veil — text contrast */}
          {/* <div className="absolute inset-0" style={{
            background:
              "linear-gradient(to left, rgba(5,4,2,0.92) 0%, rgba(5,4,2,0.72) 20%, rgba(5,4,2,0.18) 52%, transparent 100%)",
          }} /> */}
          {/* Top + bottom vignette */}
          <div className="absolute inset-0" style={{
            background:
              "linear-gradient(to bottom, rgba(6,6,6,0.55) 0%, transparent 20%, transparent 68%, rgba(6,6,6,0.88) 100%)",
          }} />
          {/* Emerald left accent */}
          {/* <div className="absolute inset-0" style={{
            background:
              "linear-gradient(to right, rgba(14,50,44,0.45) 0%, rgba(14,50,44,0.10) 38%, transparent 60%)",
          }} /> */}
          {/* Mobile extra veil */}
          <div className="absolute inset-0 md:hidden" style={{ background: "rgba(5,4,2,0.22)" }} />
        </div>

        {/* ════════════════════════════════════════════════
            LAYER 2 — CINEMATIC LIGHT SWEEP
        ════════════════════════════════════════════════ */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none z-[3]">
          <motion.div
            className="absolute top-0 bottom-0"
            style={{
              width: "40%",
              skewX: "-16deg",
              background:
                "linear-gradient(90deg, transparent 0%, rgba(212,175,55,0.04) 35%, rgba(255,240,140,0.08) 50%, rgba(255,250,205,0.10) 55%, rgba(255,240,140,0.08) 65%, rgba(212,175,55,0.04) 80%, transparent 100%)",
            }}
            animate={{ x: ["-140%", "400%"] }}
            transition={{ duration: 12, repeat: Infinity, repeatDelay: 8, ease: "linear" }}
          />
        </div>

        {/* ════════════════════════════════════════════════
            LAYER 3 — GOLD DUST: now real-depth <Sparkles>
            inside the 3D scene (ScrollChapters3D)
        ════════════════════════════════════════════════ */}

        {/* LETTERBOX CINEMA BARS — journey framing, open at finale */}
        <motion.div
          className="absolute top-0 left-0 right-0 z-[15] pointer-events-none bg-black"
          style={{ height: "7svh", scaleY: letterboxScale, transformOrigin: "top" }}
        />
        <motion.div
          className="absolute bottom-0 left-0 right-0 z-[15] pointer-events-none bg-black"
          style={{ height: "7svh", scaleY: letterboxScale, transformOrigin: "bottom" }}
        />

        {/* CHAPTER PROGRESS RAIL — act dots, click to jump */}
        <ChapterRail scrollProgress={scrollYProgress} containerRef={scrollContainerRef} />

        {/* BRANDED LOADING SCREEN — hides model pop-in */}
        <LoadingScreen />

        {/* ════════════════════════════════════════════════
            LAYER 5 — TEXT BLOCK (scroll-controlled staggered reveal)
        ════════════════════════════════════════════════ */}
        <div className="hero-text">

          {/* Label — centered row with flanking lines */}
          <motion.div
            className="flex items-center justify-center gap-4 mb-6 md:mb-8 w-screen md:w-auto px-4"
            style={{ opacity: labelOpacity }}
          >
            <span
              className="block w-10 md:w-12 h-[1.5px] flex-shrink-0"
              style={{
                background: "linear-gradient(to right, transparent, rgba(212, 175, 55, 0.8) 50%, transparent)",
                boxShadow: "0 0 8px rgba(212, 175, 55, 0.3)"
              }}
            />
            <p
              className="font-persian text-[0.62rem] md:text-[0.68rem] tracking-[0.35em] uppercase"
              style={{
                       fontSize: "clamp(.8rem, 1.4vw, 1.3rem)",
              fontWeight:'bold',
                color: "#ffd700",
                textShadow: "0 0 20px rgba(212, 175, 55, 0.6), 0 0 40px rgba(212, 175, 55, 0.3)",
                opacity: 0.95,
              }}
            >
             THE DIGITAL SHOWROOM — CONFIGURE YOUR CAR IN REAL TIME
            </p>
            <span
              className="block w-10 md:w-12 h-[1.5px] flex-shrink-0"
              style={{
                background: "linear-gradient(to left, transparent, rgba(212, 175, 55, 0.8) 50%, transparent)",
                boxShadow: "0 0 8px rgba(212, 175, 55, 0.3)"
              }}
            />
          </motion.div>

          {/* Heading — centered gold title */}
          {/* <motion.h1
            className="font-persian font-bold leading-[1.15] mb-5 md:mb-6"
            style={{ textAlign: "center", opacity: titleOpacity }}
          >
            <span
              className="block"
              style={{
                fontSize: "clamp(3.6rem, 9vw, 10rem)",
                background: "linear-gradient(135deg, #c9a227 0%, #ffd700 25%, #fffacd 45%, #fff 52%, #fffacd 60%, #ffd700 75%, #b8860b 100%)",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
                backgroundClip: "text",
                filter: "drop-shadow(0 0 40px rgba(255, 215, 0, 0.4)) drop-shadow(0 4px 20px rgba(0, 0, 0, 0.6))",
                position: "relative",
              }}
            >
              شهر امید
            </span>
          </motion.h1> */}
            <motion.div
            className="flex justify-center mb-5 md:mb-6"
            style={{ opacity: titleOpacity }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/images/Lumina-single.png"
              alt="Lumina"
              className="w-auto"
              style={{
                height: "auto",
                filter: "drop-shadow(0 0 40px rgba(255, 215, 0, 0.4)) drop-shadow(0 4px 20px rgba(0, 0, 0, 0.6))",
              }}
            />
          </motion.div>


          {/* Gold accent ornament — centered */}
          <motion.div
            className="mb-6 md:mb-8 flex items-center gap-2 origin-center"
            style={{ opacity: ornamentOpacity }}
          >
            <span className="w-1 h-1 rounded-full bg-[#D4AF37]" style={{ boxShadow: "0 0 8px rgba(212, 175, 55, 0.8)" }} />
            <div
              className="h-[2px] w-20 md:w-28"
              style={{
                background: "linear-gradient(to right, transparent, #ffd700 30%, #fffacd 50%, #ffd700 70%, transparent)",
                boxShadow: "0 0 12px rgba(255, 215, 0, 0.5)",
              }}
            />
            <svg width="16" height="16" viewBox="0 0 16 16" className="flex-shrink-0">
              <path d="M8 2L10 6L14 6L11 9L12 14L8 11L4 14L5 9L2 6L6 6Z" fill="#ffd700" opacity="0.9" />
            </svg>
            <div
              className="h-[2px] w-20 md:w-28"
              style={{
                background: "linear-gradient(to left, transparent, #ffd700 30%, #fffacd 50%, #ffd700 70%, transparent)",
                boxShadow: "0 0 12px rgba(255, 215, 0, 0.5)",
              }}
            />
            <span className="w-1 h-1 rounded-full bg-[#D4AF37]" style={{ boxShadow: "0 0 8px rgba(212, 175, 55, 0.8)" }} />
          </motion.div>

          {/* Subtitle — centered */}
          <motion.p
            className="font-persian font-light leading-[2.2]"
            style={{
              fontSize: "clamp(1rem, 1.4vw, 1.3rem)",
              fontWeight:'bold',
              color: "rgba(245, 240, 232, 0.85)",
              maxWidth: "42ch",
              textAlign: "center",
              textShadow: "0 2px 16px rgba(0, 0, 0, 0.6)",
              opacity: subtitleOpacity,
            }}
          >
See it. Style it. Own it — every detail is yours before you buy.
          </motion.p>
        </div>

        {/* ════════════════════════════════════════════════
            PILL CTA — Bottom center, scroll-controlled reveal
            Fades in at 80-95% scroll progress
        ════════════════════════════════════════════════ */}
        <motion.div
          className="hero-cta-anchor"
          style={{ opacity: ctaOpacity }}
        >
          <motion.button
            onClick={() => router.push("/store")}
            whileHover={{
              boxShadow:
                "0 0 100px rgba(255,215,0,0.6), 0 0 50px rgba(212,175,55,0.4), 0 12px 48px rgba(0,0,0,0.75), inset 0 2px 0 rgba(255,250,205,0.5), inset 0 -2px 0 rgba(184,134,11,0.6)",
              borderColor: "rgba(255,235,100,1.0)",
              y: -4,
              scale: 1.05,
            }}
            whileTap={{ scale: 0.95 }}
            transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
            className="relative overflow-hidden font-persian font-bold flex items-center justify-center gap-3 group pointer-events-auto"
            style={{
              padding: "1rem 3.2rem",
              border: "2px solid rgba(212,175,55,0.85)",
              borderRadius: "9999px",
              background: "linear-gradient(135deg, rgba(10,7,1,0.85) 0%, rgba(20,15,2,0.75) 100%)",
              backdropFilter: "blur(40px)",
              WebkitBackdropFilter: "blur(40px)",
              boxShadow:
                "0 0 60px rgba(212,175,55,0.3), 0 6px 32px rgba(0,0,0,0.6), inset 0 2px 0 rgba(255,235,120,0.25), inset 0 -2px 0 rgba(130,88,0,0.4)",
              color: "#ffd700",
              fontSize: "0.9rem",
              minWidth: "200px",
              textShadow: "0 0 20px rgba(255, 215, 0, 0.5)",
            }}
          >
            {/* Continuous shimmer on the border */}
            <motion.span
              aria-hidden
              className="pointer-events-none absolute inset-0 rounded-[9999px]"
              style={{
                background:
                  "linear-gradient(105deg, transparent 15%, rgba(255,250,205,0.15) 40%, rgba(255,248,160,0.35) 52%, rgba(255,250,205,0.15) 65%, transparent 85%)",
              }}
              animate={{ x: ["-140%", "240%"] }}
              transition={{ duration: 3.8, repeat: Infinity, repeatDelay: 2.2, ease: "easeInOut" }}
            />
            {/* RTL arrow */}
            <svg
              className=" relative w-5 h-5 flex-shrink-0 transition-transform duration-500 group-hover:-translate-x-2"
              viewBox="0 0 16 16"
              fill="none"
            >
              <path
                d="M13 8H3M7 4l-4 4 4 4"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            <span className="relative tracking-wider">Enter the Showroom</span>
          </motion.button>
        </motion.div>

        {/* ════════════════════════════════════════════════
            DECORATIVE CORNER ORNAMENTS — Persian-inspired
        ════════════════════════════════════════════════ */}
        {/* Top-right corner */}
        <motion.div
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 1.2, delay: 1.5, ease: [0.16, 1, 0.3, 1] }}
          className="absolute top-4 right-4 md:top-8 md:right-8 w-12 h-12 md:w-16 md:h-16 hidden md:block z-[21] pointer-events-none"
        >
          <svg viewBox="0 0 64 64" fill="none" className="w-full h-full opacity-40">
            <path d="M64 0 L64 20 C64 35 50 45 35 45 L20 45" stroke="#ffd700" strokeWidth="1.5" opacity="0.6" />
            <path d="M64 0 L64 12 C64 22 56 28 46 28 L32 28" stroke="#ffd700" strokeWidth="1" opacity="0.4" />
            <circle cx="60" cy="4" r="2" fill="#ffd700" opacity="0.7" />
            <circle cx="54" cy="10" r="1.5" fill="#d4af37" opacity="0.5" />
          </svg>
        </motion.div>

        {/* Top-left corner */}
        <motion.div
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 1.2, delay: 1.6, ease: [0.16, 1, 0.3, 1] }}
          className="absolute top-4 left-4 md:top-8 md:left-8 w-12 h-12 md:w-16 md:h-16 hidden md:block z-[21] pointer-events-none"
        >
          <svg viewBox="0 0 64 64" fill="none" className="w-full h-full opacity-40">
            <path d="M0 0 L0 20 C0 35 14 45 29 45 L44 45" stroke="#ffd700" strokeWidth="1.5" opacity="0.6" />
            <path d="M0 0 L0 12 C0 22 8 28 18 28 L32 28" stroke="#ffd700" strokeWidth="1" opacity="0.4" />
            <circle cx="4" cy="4" r="2" fill="#ffd700" opacity="0.7" />
            <circle cx="10" cy="10" r="1.5" fill="#d4af37" opacity="0.5" />
          </svg>
        </motion.div>

        {/* GOLD VERTICAL LINE — desktop right edge */}
        <motion.div
          initial={{ scaleY: 0, opacity: 0 }}
          animate={{ scaleY: 1, opacity: 1 }}
          transition={{ duration: 1.8, delay: 1.4, ease: [0.16, 1, 0.3, 1] }}
          className="absolute top-20 bottom-20 right-0 w-[2px] hidden md:block origin-top z-[21]"
          style={{
            background:
              "linear-gradient(to bottom, transparent, rgba(255,215,0,0.25) 15%, rgba(212,175,55,0.6) 50%, rgba(255,215,0,0.25) 85%, transparent)",
            boxShadow: "0 0 12px rgba(255, 215, 0, 0.3)",
          }}
        />

        {/* ════════════════════════════════════════════════
            SCROLL INDICATOR — desktop only
        ════════════════════════════════════════════════ */}
      

        {/* ════════════════════════════════════════════════
            STATS / FEATURE BAR
        ════════════════════════════════════════════════ */}
        {/* <motion.div
          {...fadeIn(1.7)}
          className="absolute bottom-0 left-0 right-0 z-[30]"
          style={{
            background: "linear-gradient(to top, rgba(6,5,3,0.95) 0%, rgba(8,7,4,0.88) 100%)",
            backdropFilter: "blur(32px)",
            WebkitBackdropFilter: "blur(32px)",
            borderTop: "1.5px solid rgba(212,175,55,0.18)",
            boxShadow: "0 -4px 32px rgba(0, 0, 0, 0.5), inset 0 1px 0 rgba(255, 215, 0, 0.08)",
          }}
        >
          <div
            className="w-full h-[2px]"
            style={{
              background:
                "linear-gradient(to right, transparent 2%, rgba(255,215,0,0.15) 15%, rgba(255,215,0,0.45) 50%, rgba(255,215,0,0.15) 85%, transparent 98%)",
              boxShadow: "0 0 16px rgba(255, 215, 0, 0.3)",
            }}
          />
          <div className="flex flex-row-reverse items-stretch">
            {STATS.map((stat, i) => (
              <motion.div
                key={stat.title}
                whileHover={{
                  background: "rgba(212,175,55,0.08)",
                  boxShadow: "inset 0 0 30px rgba(255, 215, 0, 0.12)",
                }}
                transition={{ duration: 0.35 }}
                className={`
                  flex-1 flex flex-col items-center justify-center gap-1.5
                  py-4 px-2 md:py-6 md:px-6 text-center cursor-default
                  ${i < STATS.length - 1 ? "border-l border-[rgba(212,175,55,0.15)]" : ""}
                `}
              >
                <motion.span
                  whileHover={{ scale: 1.3, rotate: 180 }}
                  transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
                  className="block leading-none"
                  style={{
                    color: "#ffd700",
                    fontSize: "0.75rem",
                    opacity: 0.9,
                    textShadow: "0 0 12px rgba(255, 215, 0, 0.5)",
                  }}
                >
                  {stat.icon}
                </motion.span>
                <p
                  className="font-persian font-medium leading-tight px-1"
                  style={{
                    fontSize: "clamp(0.56rem, 1.2vw, 0.74rem)",
                    color: "rgba(245, 240, 232, 0.7)",
                  }}
                >
                  {stat.title}
                </p>
                <p
                  className="font-persian font-semibold"
                  style={{
                    fontSize: "clamp(0.54rem, 1.1vw, 0.68rem)",
                    color: "rgba(255,215,0,0.85)",
                    textShadow: "0 0 10px rgba(255, 215, 0, 0.3)",
                  }}
                >
                  {stat.value}
                </p>
              </motion.div>
            ))}
          </div>
        </motion.div> */}

      </div>{/* /sticky frame */}
    </div>  /* /scroll container */
  );
}
