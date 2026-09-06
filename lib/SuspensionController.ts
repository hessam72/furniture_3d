import * as THREE from 'three'
import gsap from 'gsap'

export type SuspensionPreset = 'stock' | 'lowered' | 'raised'

/**
 * Controls suspension height animation for the car group
 * Uses GSAP for smooth transitions, similar to DoorController
 */
export class SuspensionController {
  private carGroup: THREE.Group
  private invalidate: () => void
  private baseY: number
  private excludedNodes: THREE.Object3D[]
  private excludedNodesBaseY: Map<THREE.Object3D, number>
  private currentOffset: number = 0

  constructor(carGroup: THREE.Group, invalidate: () => void, excludedNodes: THREE.Object3D[] = []) {
    this.carGroup = carGroup
    this.invalidate = invalidate
    this.baseY = carGroup.position.y
    this.excludedNodes = excludedNodes
    this.excludedNodesBaseY = new Map()

    // Store initial Z positions of excluded nodes (baseline without offset)
    excludedNodes.forEach(node => {
      this.excludedNodesBaseY.set(node, node.position.z)
    })
  }

  /**
   * Set suspension height in centimeters (offset from base position)
   * @param cm Height adjustment in centimeters (-5 to +10)
   */
  setHeight(cm: number) {
    const targetY = this.baseY + cm / 100
    const offset = cm / 100
    this.currentOffset = offset

    console.log('[SuspensionController] Setting height to', cm, 'cm, offset =', offset, ', excluded nodes:', this.excludedNodes.length)

    gsap.to(this.carGroup.position, {
      y: targetY,
      duration: 0.6,
      ease: 'power2.out',
      onUpdate: () => {
        // Apply inverse transform to excluded nodes (wheels stay grounded)
        // When body moves UP (+offset), wheels must move UP too to maintain ground contact
        this.excludedNodes.forEach(node => {
          const baseZ = this.excludedNodesBaseY.get(node) ?? 0
          node.position.z = baseZ - offset
        })
        this.invalidate()
      },
    })
  }

  /**
   * Apply preset suspension configuration
   * @param preset stock (0cm), lowered (-3cm), raised (+5cm)
   */
  setPreset(preset: SuspensionPreset) {
    const offsets: Record<SuspensionPreset, number> = {
      stock: 0,
      lowered: -3,
      raised: 5,
    }

    this.setHeight(offsets[preset])
  }

  /**
   * Update excluded nodes (e.g., when wheels are swapped)
   * @param nodes New array of nodes to exclude from suspension transform
   */
  updateExcludedNodes(nodes: THREE.Object3D[]) {
    console.log('[SuspensionController] Updating excluded nodes:', nodes.length, 'nodes, current offset:', this.currentOffset)
    this.excludedNodes = nodes
    this.excludedNodesBaseY.clear()

    nodes.forEach(node => {
      // Account for current suspension offset when storing baseline
      // If suspension is active, current Z already has offset applied, so add it back to get true baseline
      const baselineZ = node.position.z + this.currentOffset
      console.log('[SuspensionController] Storing baseline Z for node:', node.name, 'current Z =', node.position.z, 'baseline =', baselineZ)
      this.excludedNodesBaseY.set(node, baselineZ)
    })
  }

  /**
   * Reset to stock height
   */
  reset() {
    this.setHeight(0)
  }
}
