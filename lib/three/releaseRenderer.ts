import type { RootState } from '@react-three/fiber'
import type { WebGLRenderer } from 'three'

/**
 * Give a WebGL context back, properly, when a Canvas goes away.
 *
 * R3F does part of this already, and the part it skips is the one that matters.
 * `unmountComponentAtNode` (fiber 8.17, events-*.esm.js) sets `internal.active =
 * false`, then 500ms later disposes the render lists and calls
 * `forceContextLoss()` inside a swallowing try/catch. What it never calls is
 * **`gl.dispose()`** — which is what frees the program cache (every compiled
 * shader), the material and texture property maps, the binding states, the
 * render states and the shadow-map targets, and removes three's own context
 * listener. Its `dispose(state)` helper iterates the state object's *string
 * keys* and disposes nothing at all.
 *
 * On desktop that is untidy. On iOS Safari it is the bug: a WebGL2 backing
 * store released only by garbage collection is reclaimed when the collector
 * feels pressure, which on a page that is still drawing is later than the OS's
 * patience. Contexts accumulate — every `canvasKey` bump, every AR round trip,
 * every route change — until the tab is reloaded out from under the customer.
 *
 * So: stop the loop, drop our own listener, dispose, lose the context, shrink
 * the buffer. In that order, and the order is the whole function.
 */

export interface ReleaseOptions {
  /** Names the surface in the `?debug` line. */
  label?: string
  /** Detached before the loss is forced. @see the note in step 2. */
  detachListeners?: () => void
  debug?: boolean
}

/**
 * Idempotent by renderer, so a double call is a no-op rather than a second
 * `loseContext()`. A `key` bump racing an unmount, StrictMode, or a page that
 * releases explicitly and then unmounts all reach here twice.
 */
const released = new WeakSet<WebGLRenderer>()

export function releaseRenderer(state: RootState | null | undefined, options: ReleaseOptions = {}): void {
  const gl = state?.gl
  if (!gl || released.has(gl)) return
  released.add(gl)

  const before = options.debug
    ? `programs ${gl.info.programs?.length ?? 0} · geometries ${gl.info.memory.geometries} · textures ${gl.info.memory.textures}`
    : ''

  // 1. Nothing may draw past this point: every step below invalidates state a
  //    frame in flight would read. `internal.active` is already false by the
  //    time a React unmount reaches us, but not when a host releases by hand.
  try {
    state.setFrameloop?.('never')
    gl.setAnimationLoop(null)
  } catch {
    /* a renderer already torn down elsewhere */
  }

  // 2. Drop our own `webglcontextlost` handler BEFORE forcing the loss.
  //    `forceContextLoss()` dispatches a real event, and if the recovery
  //    listener is still attached a *deliberate* teardown fires the page's
  //    "graphics memory is full" ladder and burns a downgrade rung. Easiest
  //    bug in this file to ship, and it looks exactly like the crash it is
  //    meant to be fixing.
  options.detachListeners?.()

  // 3. Dispose before the loss, never after: once the context is gone,
  //    deleteProgram and deleteTexture are silent no-ops and the driver-side
  //    objects live until the context object itself is collected.
  try {
    gl.dispose()
  } catch {
    /* nothing further to free */
  }

  // 4. WEBGL_lose_context is absent under some Safari lockdown and low-power
  //    configurations; three guards the extension lookup, not every UA.
  try {
    gl.forceContextLoss()
  } catch {
    /* the browser will get there on its own */
  }

  // 5. Shrink the drawing buffer. Set the attributes directly — `gl.setSize()`
  //    walks disposed renderer state and rewrites inline styles. This is the
  //    step that actually makes Safari drop the backing store while the element
  //    is still referenced by the compositor or by a detached fragment.
  try {
    const canvas = gl.domElement
    canvas.width = 1
    canvas.height = 1
  } catch {
    /* the element is already gone, which is the outcome we wanted */
  }

  if (options.debug) {
    console.log(`[teardown] ${options.label ?? 'canvas'} · ${before} → released`)
  }
}

/**
 * Deliberately not part of the above: walking the scene to dispose geometries,
 * materials and textures.
 *
 * Everything under a Canvas here is either owned by drei's GLTF cache — shared
 * with the next mount on purpose, which is what makes an AR round trip or a
 * retry instant (@see ProductPageClient's `retry`) — or already paired with a
 * `disposeTargets` on the component that cloned it (@see lib/three/layerMaterials).
 * Cache lifetime is a page-level decision. Add a `scene.traverse(dispose)` here
 * and the AR return path comes back to an empty stage.
 */
