import type * as THREE from 'three'

/**
 * Locating a product's object inside the room GLB.
 *
 * The room is authored elsewhere, and the two identifiers we hold for a product
 * don't agree with each other: products.json is *keyed* by one name
 * (`modern-sofa`) while its `id` is another (`modern-sofa-01`), and
 * ProductInteraction matches the raycast hit against the `id`. Exact matching on
 * either one alone is a coin flip, and when it loses the feature silently does
 * nothing — which is exactly how the camera flight shipped broken.
 *
 * So: try every identifier we have, tolerate the common authoring variations,
 * and prefer the closest match rather than the first one traversal happens to
 * reach.
 */

/** Lower tier number = better match. */
const enum Tier {
  Exact = 0,
  ScenePrefixedByName = 1,
  NamePrefixedByScene = 2,
  Contains = 3,
  None = 4
}

function tierFor(sceneName: string, candidate: string): Tier {
  if (sceneName === candidate) return Tier.Exact
  if (sceneName.startsWith(candidate)) return Tier.ScenePrefixedByName
  if (candidate.startsWith(sceneName)) return Tier.NamePrefixedByScene
  if (sceneName.includes(candidate) || candidate.includes(sceneName)) return Tier.Contains
  return Tier.None
}

/**
 * Finds the best object in `root` matching any of `names`.
 *
 * `names` is in priority order — pass the products.json key first, then the
 * product id. A better tier always wins; ties go to the earlier candidate.
 * Returns null only when nothing matches at all.
 */
export function findSceneObject(
  root: THREE.Object3D,
  names: (string | undefined | null)[]
): THREE.Object3D | null {
  const candidates = names
    .filter((n): n is string => !!n && n.trim().length > 0)
    .map((n) => n.trim().toLowerCase())

  if (candidates.length === 0) return null

  let best: THREE.Object3D | null = null
  let bestTier: Tier = Tier.None
  let bestRank = Number.MAX_SAFE_INTEGER

  root.traverse((child) => {
    const sceneName = child.name?.toLowerCase()
    if (!sceneName) return

    for (let rank = 0; rank < candidates.length; rank++) {
      const tier = tierFor(sceneName, candidates[rank])
      if (tier === Tier.None) continue

      if (tier < bestTier || (tier === bestTier && rank < bestRank)) {
        best = child
        bestTier = tier
        bestRank = rank
      }
      break // this candidate's tier is the best this object can score
    }
  })

  return best
}

/**
 * Named objects in the scene, for diagnostics only. A miss should always be
 * able to say what *was* there — the absence of that is what made the broken
 * lookup cost a debugging round-trip.
 */
export function describeSceneNames(root: THREE.Object3D, limit = 40): string[] {
  const seen = new Set<string>()
  root.traverse((child) => {
    if (seen.size >= limit) return
    const name = child.name?.trim()
    if (name) seen.add(name)
  })
  return [...seen]
}
