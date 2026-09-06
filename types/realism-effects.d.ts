declare module 'realism-effects' {
  import type { Camera, Scene } from 'three'
  import { Effect, Pass } from 'postprocessing'

  export class VelocityDepthNormalPass extends Pass {
    constructor(scene: Scene, camera: Camera)
  }

  export interface SSGIOptions {
    distance?: number
    thickness?: number
    denoiseIterations?: number
    radius?: number
    phi?: number
    depthPhi?: number
    normalPhi?: number
    roughnessPhi?: number
    envBlur?: number
    importanceSampling?: boolean
    steps?: number
    refineSteps?: number
    resolutionScale?: number
    missedRays?: boolean
  }

  export class SSGIEffect extends Effect {
    constructor(
      scene: Scene,
      camera: Camera,
      velocityDepthNormalPass: VelocityDepthNormalPass,
      options?: SSGIOptions
    )
    dispose(): void
  }

  export class SSREffect extends SSGIEffect {}

  export class TRAAEffect extends Effect {
    constructor(scene: Scene, camera: Camera, velocityDepthNormalPass: VelocityDepthNormalPass)
    dispose(): void
  }

  export class HBAOEffect extends Effect {}
  export class MotionBlurEffect extends Effect {}
}
