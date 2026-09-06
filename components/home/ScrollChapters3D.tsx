"use client";

import { useMemo, useRef, useEffect } from "react";
import * as THREE from "three";
import { useFrame, useThree } from "@react-three/fiber";
import { Text3D, Billboard, Text, Sparkles } from "@react-three/drei";
import { MotionValue } from "framer-motion";
import { CHAPTERS_3D, PAINT_STOPS, paintForProgress, Chapter3D } from "@/lib/homeChapters";
import { useCarConfig } from "@/stores/carConfigStore";

const FONT_URL = "/fonts/helvetiker_bold.typeface.json";
const GOLD = "#ffd700";
const FADE_LAMBDA = 6; // damp speed for chapter fades

/* ─── Single chapter: Text3D headline + Billboard description ─── */
function Chapter({ chapter, scrollProgress }: { chapter: Chapter3D; scrollProgress: MotionValue<number> }) {
  const invalidate = useThree((s) => s.invalidate);
  const groupRef = useRef<THREE.Group>(null);
  const descRef = useRef<any>(null);
  const visRef = useRef(0); // current animated visibility 0..1

  // Shared gold material for numeral + headline (opacity animated imperatively)
  const goldMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: GOLD,
        metalness: 0.9,
        roughness: 0.25,
        transparent: true,
        opacity: 0,
        depthWrite: false,
      }),
    []
  );
  const ringMat = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        color: GOLD,
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
    []
  );
  useEffect(() => () => { goldMat.dispose(); ringMat.dispose(); }, [goldMat, ringMat]);

  // Face the chapter toward its act's camera position
  const rotationY = useMemo(() => {
    const [px, , pz] = chapter.position;
    const [cx, , cz] = chapter.facing;
    return Math.atan2(cx - px, cz - pz);
  }, [chapter]);

  useFrame((_, delta) => {
    const v = scrollProgress.get();
    const target = v >= chapter.range[0] && v < chapter.range[1] ? 1 : 0;
    const cur = visRef.current;
    if (Math.abs(cur - target) < 0.002 && groupRef.current) {
      // settled — make sure final state applied, no invalidate loop
      if (groupRef.current.visible !== target > 0.5 && target === 0) groupRef.current.visible = false;
      return;
    }
    const next = THREE.MathUtils.damp(cur, target, FADE_LAMBDA, delta);
    visRef.current = next;

    const g = groupRef.current;
    if (g) {
      g.visible = next > 0.01;
      g.position.y = chapter.position[1] - (1 - next) * 0.35; // rise while fading in
    }
    goldMat.opacity = next;
    ringMat.opacity = next * 0.55;
    if (descRef.current) descRef.current.fillOpacity = next * 0.9;
    invalidate(); // keep animating while transitioning (frameloop="demand")
  });

  return (
    <group ref={groupRef} position={chapter.position} rotation={[0, rotationY, 0]} visible={false}>
      {/* Oversized chapter numeral, offset behind the headline */}
      {/* <Text3D font={FONT_URL} size={1.5} height={0.04} position={[-0.3, 0.35, -0.5]} material={goldMat} curveSegments={6}>
        {chapter.index}
      </Text3D> */}

      {/* Headline */}
      <Text3D
        font={FONT_URL}
        size={0.3}
        height={0.07}
        bevelEnabled
        bevelSize={0.008}
        bevelThickness={0.01}
        curveSegments={8}
        material={goldMat}
      >
        {chapter.title}
      </Text3D>

      {/* Description — always faces the camera */}
      <Billboard position={[1.2, -0.35, 0.1]}>
        <Text
          ref={descRef}
          fontSize={0.13}
          maxWidth={3.2}
          color="#f5f0e8"
          anchorX="center"
          anchorY="middle"
          fillOpacity={0}
          outlineWidth={0.004}
          outlineColor="#000000"
          outlineOpacity={0.4}
        >
          {chapter.description}
        </Text>
      </Billboard>

      {/* Paint color orbs (act 02) */}
      {chapter.showOrbs && <ColorOrbs scrollProgress={scrollProgress} visRef={visRef} />}

      {/* Floor spotlight ring under the focused part (world space → counter-rotate) */}
      {chapter.ring && (
        <group rotation={[0, -rotationY, 0]} position={[0, 0, 0]}>
          <mesh
            position={[
              chapter.ring.position[0] - chapter.position[0],
              chapter.ring.position[1] - chapter.position[1],
              chapter.ring.position[2] - chapter.position[2],
            ]}
            rotation={[-Math.PI / 2, 0, 0]}
            material={ringMat}
          >
            <ringGeometry args={[chapter.ring.radius * 0.88, chapter.ring.radius, 48]} />
          </mesh>
        </group>
      )}
    </group>
  );
}

/* ─── Floating paint swatch orbs, active one glows/scales ─── */
function ColorOrbs({ scrollProgress, visRef }: { scrollProgress: MotionValue<number>; visRef: React.MutableRefObject<number> }) {
  const invalidate = useThree((s) => s.invalidate);
  const orbRefs = useRef<(THREE.Mesh | null)[]>([]);
  const mats = useMemo(
    () =>
      PAINT_STOPS.map(
        (s) =>
          new THREE.MeshStandardMaterial({
            color: s.color,
            metalness: s.metalness,
            roughness: s.roughness,
            emissive: s.color,
            emissiveIntensity: 0,
            transparent: true,
            opacity: 0,
          })
      ),
    []
  );
  useEffect(() => () => mats.forEach((m) => m.dispose()), [mats]);

  useFrame((_, delta) => {
    const v = scrollProgress.get();
    const active = paintForProgress(v);
    let animating = false;
    PAINT_STOPS.forEach((stop, i) => {
      const mesh = orbRefs.current[i];
      if (!mesh) return;
      const isActive = stop === active;
      const targetScale = isActive ? 1.45 : 0.85;
      const s = THREE.MathUtils.damp(mesh.scale.x, targetScale, 8, delta);
      if (Math.abs(s - mesh.scale.x) > 0.001) animating = true;
      mesh.scale.setScalar(s);
      mats[i].opacity = visRef.current;
      mats[i].emissiveIntensity = THREE.MathUtils.damp(mats[i].emissiveIntensity, isActive ? 0.5 : 0, 8, delta);
    });
    if (animating) invalidate();
  });

  return (
    <group position={[0.15, -0.85, 0.2]}>
      {PAINT_STOPS.map((stop, i) => (
        <mesh key={stop.color} ref={(el) => { orbRefs.current[i] = el }} position={[i * 0.55, 0, 0]} material={mats[i]}>
          <sphereGeometry args={[0.14, 16, 16]} />
        </mesh>
      ))}
    </group>
  );
}

/* ─── Sparkle burst when a part swaps ─── */
const BURST_DURATION = 0.7;
function PartSwapBurst() {
  const invalidate = useThree((s) => s.invalidate);
  const selectedParts = useCarConfig((s) => s.selectedParts);
  const prevRef = useRef<Record<string, string>>({});
  const burstRef = useRef<{ pos: THREE.Vector3; t: number } | null>(null);
  const meshRef = useRef<THREE.Mesh>(null);
  const lightRef = useRef<THREE.PointLight>(null);
  const shadowRef = useRef<THREE.Mesh>(null);
  const shadowMat = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        color: "#000000",
        transparent: true,
        opacity: 0,
        depthWrite: false,
      }),
    []
  );
  const mat = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        color: GOLD,
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
    []
  );
  useEffect(() => () => { mat.dispose(); shadowMat.dispose(); }, [mat, shadowMat]);

  useEffect(() => {
    const prev = prevRef.current;
    const anchors: Record<string, [number, number, number]> = {
      wheels: [1.3, -.4, 2],
      // spoilers: [0, 1.3, -1.9],
    };
    for (const cat of Object.keys(anchors)) {
      const cur = selectedParts[cat];
      if (prev[cat] && cur && prev[cat] !== cur) {
        burstRef.current = { pos: new THREE.Vector3(...anchors[cat]), t: 0 };
        invalidate();
      }
    }
    prevRef.current = { ...selectedParts };
  }, [selectedParts, invalidate]);

  useFrame((_, delta) => {
    const burst = burstRef.current;
    const mesh = meshRef.current;
    const light = lightRef.current;
    const shadow = shadowRef.current;
    if (!burst || !mesh) return;
    burst.t += delta;
    const p = Math.min(burst.t / BURST_DURATION, 1);
    const alive = p < 1;

    // Expanding gold ring
    mesh.visible = alive;
    mesh.position.copy(burst.pos);
    mesh.scale.setScalar(0.3 + p * 1.4);
    mat.opacity = (1 - p) * 0.8;

    // Rim-light pulse: fast attack, smooth decay
    if (light) {
      light.visible = alive;
      light.position.set(burst.pos.x, burst.pos.y + 0.4, burst.pos.z);
      const pulse = p < 0.15 ? p / 0.15 : 1 - (p - 0.15) / 0.85;
      light.intensity = pulse * 8;
    }

    // Ground shadow pulse: dark blob under the part, fades as it spreads
    if (shadow) {
      shadow.visible = alive;
      shadow.position.set(burst.pos.x, 0.015, burst.pos.z);
      shadow.scale.setScalar(0.5 + p * 0.9);
      shadowMat.opacity = (1 - p) * 0.5;
    }

    if (p >= 1) burstRef.current = null;
    else invalidate();
  });

  return (
    <>
      <mesh ref={meshRef} visible={false} rotation={[-Math.PI / 2, 0, 0]} material={mat}>
        <ringGeometry args={[0.42, 0.5, 40]} />
      </mesh>
      <pointLight ref={lightRef} visible={false} intensity={0} distance={2.5} decay={2} color={GOLD} />
      <mesh ref={shadowRef} visible={false} rotation={[-Math.PI / 2, 0, 0]} material={shadowMat}>
        <circleGeometry args={[0.5, 32]} />
      </mesh>
    </>
  );
}

/* ─── Root: chapters + ambient gold sparkles + swap bursts ─── */
export default function ScrollChapters3D({ scrollProgress }: { scrollProgress: MotionValue<number> }) {
  const invalidate = useThree((s) => s.invalidate);

  // Kick the demand-mode render loop whenever scroll moves so fades can start
  useEffect(() => {
    const unsub = scrollProgress.on("change", () => invalidate());
    return unsub;
  }, [scrollProgress, invalidate]);

  return (
    <group>
      {CHAPTERS_3D.map((c) => (
        <Chapter key={c.id} chapter={c} scrollProgress={scrollProgress} />
      ))}
      <Sparkles count={40} scale={[8, 3, 8]} size={2} speed={0.35} color={GOLD} position={[0, 1.4, 0]} opacity={0.5} />
      <PartSwapBurst />
    </group>
  );
}
