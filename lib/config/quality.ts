export type QualityPreset = 'low' | 'medium' | 'high' | 'ultra';

export type N8AOQuality = 'performance' | 'medium' | 'high';
export type GroundShadowMode = 'contact' | 'accumulative';

export interface QualitySettings {
  /** Device pixel ratio [min, max] — capped by DPR pixel budget on high-res screens */
  dpr: [number, number];
  /** Drop DPR during camera movement, snap back on idle frame (hidden by motion) */
  adaptiveDpr: boolean;
  /** Spotlight self-shadow map size */
  shadowResolution: number;
  /** Mirror floor: the reflection pass re-renders the scene every drawn frame — disabled on low */
  floorReflectionsEnabled: boolean;
  /** MeshReflector render target resolution (128/256/512/512 — capped due to roughness-1 floor) */
  floorReflectionResolution: number;
  /** MSAA samples inside EffectComposer (canvas AA is bypassed by the composer) */
  multisampling: number;
  /** Edge AA via SMAA pass — every tier has AA (SMAA or MSAA or both) */
  enableSMAA: boolean;
  /**
   * Ambient occlusion effect (half-res with depth-aware upsampling).
   *
   * Off below ultra on purpose: N8AO haloes off a large silhouette and the
   * halo reads as a soft shadow floating in the air behind the object — the
   * "ghost" this comment used to name without saying where it came from.
   * Anything that turns AO on over the top of this flag is a bug; /product
   * did exactly that on `high` and produced the ghost on that tier alone.
   */
  enableN8AO: boolean; 
  /** N8AO quality mode — performance/medium/high */
  n8aoQuality: N8AOQuality;
  /** Texture anisotropy — always applied, nearly free on modern GPUs */
  anisotropyLevel: number;
  /** Ground contact: cheap blurred contact vs temporal accumulative soft shadows */
  groundShadows: GroundShadowMode;
  /** Ground shadow catcher resolution (ContactShadows or AccumulativeShadows render target) */
  groundShadowResolution: number;
  /** Store lamps: instantiate real point lights (emissive glow is always on) */
  lampLights: boolean;
  /** Store lamps: cap on total point lights (protects the per-fragment light budget) */
  lampMaxLights: number;
  /** Store lamps: how many lamps cast a (cube-PCF) shadow — 0 disables */
  lampShadowCasters: number;
  /** Studio environment cubemap resolution */
  envResolution: number;
  /** envMapIntensity applied to car materials */
  envIntensity: number;
  /** True reflections of floor/studio on paint via one-shot CubeCamera */
  cubeReflections: boolean;
  /** CubeCamera render target resolution for true reflections (256/512) */
  cubeReflectionResolution: number;
  /** Gates availability of the experimental SSGI/TRAA toggle (ultra only) */
  experimentalSSGI: boolean;
}

export const QUALITY_PRESETS: Record<QualityPreset, QualitySettings> = {
  low: {
    dpr: [0.5, 1],
    adaptiveDpr: true,
    shadowResolution: 512,
    floorReflectionsEnabled: false,
    floorReflectionResolution: 128,
    multisampling: 0,
    enableSMAA: true,
    enableN8AO: false,
    n8aoQuality: 'performance',
    anisotropyLevel: 4,
    groundShadows: 'contact',
    groundShadowResolution: 256,
    lampLights: false,
    lampMaxLights: 0,
    lampShadowCasters: 0,
    envResolution: 256,
    envIntensity: 1.5,
    cubeReflections: false,
    cubeReflectionResolution: 128,
    experimentalSSGI: false,
  },
  medium: {
    dpr: [1, 1.5],
    adaptiveDpr: true,
    shadowResolution: 1024,
    floorReflectionsEnabled: true,
    floorReflectionResolution: 1024,
    multisampling: 4,
    enableSMAA: false,
    enableN8AO: false,
    n8aoQuality: 'performance',
    anisotropyLevel: 4,
    groundShadows: 'contact',
    groundShadowResolution: 512,
    lampLights: true,
    lampMaxLights: 6,
    lampShadowCasters: 0,
    envResolution: 512,
    envIntensity: 1.5,
    cubeReflections: false,
    cubeReflectionResolution: 128,
    experimentalSSGI: false,
  },
  high: {
    dpr: [1, 1.75],
    adaptiveDpr: true,
    shadowResolution: 2048,

    floorReflectionsEnabled: true,
    floorReflectionResolution: 1024,

    multisampling: 4,
    enableSMAA: true,
    enableN8AO: false,
    n8aoQuality: 'performance',
    anisotropyLevel: 8,
    groundShadows: 'contact',
    groundShadowResolution: 512,
    lampLights: true,
    lampMaxLights: 80,
    lampShadowCasters: 1,
    envResolution: 1024,
    envIntensity: 1.5,
    cubeReflections: false,
    cubeReflectionResolution: 1024,
    experimentalSSGI: false,
  },
  ultra: {

    dpr: [1, 2],
    adaptiveDpr: true,
    shadowResolution: 2048,
    floorReflectionsEnabled: true,
    floorReflectionResolution: 2048,
    multisampling: 4,
    enableSMAA: true,
    enableN8AO: true,
    n8aoQuality: 'high',
    anisotropyLevel: 16,
    groundShadows: 'accumulative',
    groundShadowResolution: 1024,
    lampLights: true,
    lampMaxLights: 24,
    lampShadowCasters: 2,
    envResolution: 2048,
    envIntensity: 1.5,
    cubeReflections: true,
    cubeReflectionResolution: 1024,
    experimentalSSGI: false,
  },
};

export const DEFAULT_QUALITY: QualityPreset = 'medium';
