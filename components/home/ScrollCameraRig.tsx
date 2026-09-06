"use client";

import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { useFrame, useThree } from "@react-three/fiber";
import { MotionValue } from "framer-motion";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import { useCameraStore } from "@/stores/cameraStore";

/*
  Scroll-scrubbed camera rig — replaces discrete preset jumps for the
  journey (scroll 0 → 0.90) with a continuous CatmullRom drone path.
  At ≥0.90 the rig goes dormant and the finale preset spring +
  auto-rotate (CameraControls) take over.

  Also owns kiosk "attract mode": idle ≥8s at the top → slow orbit
  around the car until the user scrolls again.
*/

const LIGHT_INTRO_END = 0.10; // Camera frozen during light intro 0-10%
const SCRUB_END = 1.00; // Camera scrub ends at finale (100%)
const ATTRACT_IDLE_MS = 8000;
const ATTRACT_SPEED = 0.15; // rad/s
const DAMP_LAMBDA = 5;

// Position path through the old preset spots (+ helper point to swing
// around the rear instead of cutting through the car)
// Increase all coordinates → further away 
const POSITION_POINTS = [
  new THREE.Vector3(5, 2, 5),      // home_initial
  new THREE.Vector3(2.5, 0.8, 2.5), // home_front_wheel
  new THREE.Vector3(3, 1.2, -2.5),  // swing around the rear-right
  new THREE.Vector3(-4, -1, -4.5), // home_spoiler
  new THREE.Vector3(6, 3, 6),       // home_finale
];
const TARGET_POINTS = [
  new THREE.Vector3(0, 0.5, 0),
  new THREE.Vector3(1.3, 0.4, 0.2),
  new THREE.Vector3(0.7, -0.2, 2.2), //wheel swing target
  new THREE.Vector3(0, 1.3, -2), //spoiler target
  new THREE.Vector3(0, 0.5, 0),
];

export default function ScrollCameraRig({ scrollProgress }: { scrollProgress: MotionValue<number> }) {
  const camera = useThree((s) => s.camera);
  const controls = useThree((s) => s.controls) as OrbitControlsImpl | null;
  const invalidate = useThree((s) => s.invalidate);

  const posCurve = useMemo(() => new THREE.CatmullRomCurve3(POSITION_POINTS, false, "catmullrom", 0.5), []);
  const tgtCurve = useMemo(() => new THREE.CatmullRomCurve3(TARGET_POINTS, false, "catmullrom", 0.5), []);

  const lastScrollAt = useRef(Date.now());
  const attractAngle = useRef(0);
  const reducedMotion = useRef(false);
  const scratch = useRef({ pos: new THREE.Vector3(), tgt: new THREE.Vector3() });

  // Kill any stale preset transition on mount — a pending transition makes
  // CameraControls' spring force-write the camera every frame against the rig
  useEffect(() => {
    useCameraStore.getState().clearTransition();
  }, []);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    reducedMotion.current = mq.matches;
    const handler = (e: MediaQueryListEvent) => { reducedMotion.current = e.matches; };
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  // Scroll activity: re-arm attract timer + kick the demand render loop
  useEffect(() => {
    const unsub = scrollProgress.on("change", () => {
      lastScrollAt.current = Date.now();
      invalidate();
    });
    return unsub;
  }, [scrollProgress, invalidate]);

  // Heartbeat so attract mode can start while the page is fully idle
  // (demand frameloop renders nothing without an invalidate)
  useEffect(() => {
    const id = setInterval(() => {
      if (
        !reducedMotion.current &&
        document.visibilityState === "visible" &&
        scrollProgress.get() < (LIGHT_INTRO_END + 0.02) &&
        Date.now() - lastScrollAt.current >= ATTRACT_IDLE_MS
      ) {
        invalidate();
      }
    }, 1000);
    return () => clearInterval(id);
  }, [scrollProgress, invalidate]);

  useFrame((_, delta) => {
    const v = scrollProgress.get();

    // Freeze camera during light intro (0-10%)
    if (v < LIGHT_INTRO_END) {
      camera.position.copy(POSITION_POINTS[0]);
      const targetObj = controls ? controls.target : null;
      if (targetObj) {
        targetObj.copy(TARGET_POINTS[0]);
        controls!.update();
      } else {
        camera.lookAt(TARGET_POINTS[0]);
      }
      return;
    }

    if (v >= SCRUB_END) return; // finale: preset spring + auto-rotate own the camera

    const { pos, tgt } = scratch.current;
    const idle = Date.now() - lastScrollAt.current >= ATTRACT_IDLE_MS;
    const attract =
      idle && v < (LIGHT_INTRO_END + 0.02) && !reducedMotion.current && document.visibilityState === "visible";

    if (attract) {
      // Slow orbit tease around the car at the initial-view radius
      attractAngle.current += delta * ATTRACT_SPEED;
      const base = POSITION_POINTS[0];
      const radius = Math.hypot(base.x, base.z);
      const angle0 = Math.atan2(base.x, base.z);
      const a = angle0 + attractAngle.current;
      pos.set(Math.sin(a) * radius, base.y, Math.cos(a) * radius);
      tgt.copy(TARGET_POINTS[0]);
    } else {
      if (!idle) attractAngle.current = 0;
      // Remap scroll [LIGHT_INTRO_END, SCRUB_END] → curve progress [0, 1]
      const u = THREE.MathUtils.clamp((v - LIGHT_INTRO_END) / (SCRUB_END - LIGHT_INTRO_END), 0, 1);
      posCurve.getPoint(u, pos);
      tgtCurve.getPoint(u, tgt);
    }

    // Damp toward the goal — smooths scroll jitter and the return from attract
    const d = 1 - Math.exp(-DAMP_LAMBDA * delta);
    camera.position.lerp(pos, d);
    const targetObj = controls ? controls.target : null;
    if (targetObj) {
      targetObj.lerp(tgt, d);
      controls!.update();
    } else {
      camera.lookAt(tgt);
    }

    const settled =
      camera.position.distanceToSquared(pos) < 1e-6 &&
      (!targetObj || targetObj.distanceToSquared(tgt) < 1e-6);
    if (!settled || attract) invalidate();
  });

  return null;
}
