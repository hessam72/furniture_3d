export type QualityPreset = 'low' | 'medium' | 'high' | 'ultra';

export type N8AOQuality = 'performance' | 'medium' | 'high';
export type GroundShadowMode = 'contact' | 'accumulative';

export interface QualitySettings {
  dpr: [number, number];
  adaptiveDpr: boolean;
  /** Spotlight self-shadow map size */
  shadowResolution: number;
  /** Mirror floor: the reflection pass re-renders the scene every drawn frame — disabled on low */
  floorReflectionsEnabled: boolean;
  floorReflectionResolution: number;
  /** MSAA samples inside EffectComposer (canvas AA is bypassed by the composer) */
  multisampling: number;
  enableSMAA: boolean;
  enableN8AO: boolean;
  n8aoQuality: N8AOQuality;
  /** Texture anisotropy — always applied, nearly free on modern GPUs */
  anisotropyLevel: number;
  /** Ground contact: cheap blurred contact vs temporal accumulative soft shadows */
  groundShadows: GroundShadowMode;
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
    floorReflectionResolution: 256,
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
    floorReflectionResolution: 512,
    multisampling: 4,
    enableSMAA: true,
    enableN8AO: true,
    n8aoQuality: 'medium',
    anisotropyLevel: 8,
    groundShadows: 'accumulative',
    groundShadowResolution: 1024,
    lampLights: true,
    lampMaxLights: 8,
    lampShadowCasters: 1,
    envResolution: 1024,
    envIntensity: 1.5,
    cubeReflections: true,
    cubeReflectionResolution: 256,
    experimentalSSGI: false,
  },
  ultra: {
    dpr: [1, 2],
    adaptiveDpr: true,
    shadowResolution: 2048,
    floorReflectionsEnabled: true,
    floorReflectionResolution: 512,
    multisampling: 4,
    enableSMAA: true,
    enableN8AO: true,
    n8aoQuality: 'high',
    anisotropyLevel: 16,
    groundShadows: 'accumulative',
    groundShadowResolution: 1024,
    lampLights: true,
    lampMaxLights: 12,
    lampShadowCasters: 2,
    envResolution: 1024,
    envIntensity: 1.5,
    cubeReflections: true,
    cubeReflectionResolution: 512,
    experimentalSSGI: true,
  },
};

export const DEFAULT_QUALITY: QualityPreset = 'medium';
