import { useEffect, useMemo } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { EffectComposer, Bloom, Vignette } from '@react-three/postprocessing'
import { SSGIEffect, TRAAEffect, VelocityDepthNormalPass } from 'realism-effects'

/**
 * Experimental (ultra + opt-in): screen-space global illumination with
 * temporal reprojection AA from realism-effects. Replaces N8AO (SSGI covers
 * AO), SMAA and MSAA (TRAA is the AA). Temporal accumulation needs a steady
 * stream of frames, so the demand loop is driven continuously while active —
 * this mode trades idle efficiency for maximum fidelity.
 *
 * Lives in its own chunk (React.lazy in PostProcessing) so realism-effects
 * only downloads when the toggle is actually switched on.
 */
export default function SSGIComposer() {
  const scene = useThree((s) => s.scene)
  const camera = useThree((s) => s.camera)
  const invalidate = useThree((s) => s.invalidate)

  const rig = useMemo(() => {
    const velocity = new VelocityDepthNormalPass(scene, camera)
    const ssgi = new SSGIEffect(scene, camera, velocity, {
      distance: 10,
      thickness: 10,
      denoiseIterations: 2,
      radius: 3,
      phi: 0.5,
      depthPhi: 2,
      normalPhi: 50,
      roughnessPhi: 50,
      envBlur: 0.5,
      importanceSampling: true,
      steps: 20,
      refineSteps: 5,
      resolutionScale: 1,
      missedRays: false,
    })
    const traa = new TRAAEffect(scene, camera, velocity)
    return { velocity, ssgi, traa }
  }, [scene, camera])

  useEffect(() => {
    return () => {
      rig.ssgi.dispose()
      rig.traa.dispose()
      rig.velocity.dispose()
    }
  }, [rig])

  useFrame(() => invalidate())

  return (
    <EffectComposer multisampling={0}>
      <primitive object={rig.velocity} />
      <primitive object={rig.ssgi} />
      <primitive object={rig.traa} />
      <Bloom intensity={0.15} luminanceThreshold={0.9} luminanceSmoothing={0.2} mipmapBlur radius={0.3} />
      <Vignette eskil={false} offset={0.32} darkness={0.62} />
    </EffectComposer>
  )
}
