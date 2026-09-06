import * as THREE from 'three'
import { gsap } from 'gsap'

export class DoorController {
  public leftDoorPivot: THREE.Object3D
  public rightDoorPivot: THREE.Object3D
  public leftBackDoorPivot: THREE.Object3D
  public rightBackDoorPivot: THREE.Object3D
  public hoodPivot: THREE.Object3D
  public trunkPivot: THREE.Object3D

  private pivotBasePositions: Map<THREE.Object3D, THREE.Vector3> = new Map()
  private leftDoorMax: number
  private rightDoorMax: number
  private hoodMax: number
  private trunkMax: number
  private duration: number
  private invalidate: () => void

  constructor(
    private scene: THREE.Group,
    invalidate: () => void,
    options: {
      doorAngleDeg?: number
      hoodAngleDeg?: number
      trunkAngleDeg?: number
      durationSec?: number
    } = {}
  ) {
    this.invalidate = invalidate
    const {
      doorAngleDeg = 70,
      hoodAngleDeg = 45,
      trunkAngleDeg = 80,
      durationSec = 1.2,
    } = options

    // Get objects by name (supports both meshes and groups)
    console.log('[DoorController] Searching for objects in scene...')
    const leftFrontDoor = scene.getObjectByName('car_door_left') as THREE.Object3D
    const rightFrontDoor = scene.getObjectByName('car_door_right') as THREE.Object3D
    const leftBackDoor = scene.getObjectByName('car_door_back_left') as THREE.Object3D
    const rightBackDoor = scene.getObjectByName('car_door_back_right') as THREE.Object3D
    const hood = scene.getObjectByName('car_caput') as THREE.Object3D
    const trunk = scene.getObjectByName('car_trunk') as THREE.Object3D

    console.log('[DoorController] Object lookup results:', {
      car_door_left: leftFrontDoor ? '✓ FOUND' : '✗ NOT FOUND',
      car_door_right: rightFrontDoor ? '✓ FOUND' : '✗ NOT FOUND',
      car_door_back_left: leftBackDoor ? '✓ FOUND' : '✗ NOT FOUND',
      car_door_back_right: rightBackDoor ? '✓ FOUND' : '✗ NOT FOUND',
      car_caput: hood ? '✓ FOUND' : '✗ NOT FOUND',
      car_trunk: trunk ? '✓ FOUND' : '✗ NOT FOUND',
    })

    if (!leftFrontDoor || !rightFrontDoor || !hood || !trunk) {
      console.warn('[DoorController] ⚠️ One or more critical parts not found!')
      console.log('[DoorController] Listing ALL object names in scene:')
      scene.traverse((child) => {
        console.log('  - Object name:', child.name || '(unnamed)', 'type:', child.type)
      })
    }

    // Create pivot (hinge) objects for each part
    console.log('[DoorController] Creating pivots for all parts...')

    this.leftDoorPivot = this.createHingePivot(
      scene,
      leftFrontDoor,
      'left',
      'car_window_left',
      ['door_left_attach', 'door_left_attach_2', 'door_dside_f']
    )

    this.rightDoorPivot = this.createHingePivot(
      scene,
      rightFrontDoor,
      'right',
      'car_window_right',
      ['door_right_attach', 'door_right_attach_2', 'door_dside_f001']
    )

    this.leftBackDoorPivot = this.createHingePivot(
      scene,
      leftBackDoor,
      'left',
      'car_window_back_left',
      ['door_left_back_attach']
    )

    this.rightBackDoorPivot = this.createHingePivot(
      scene,
      rightBackDoor,
      'right',
      'car_window_back_right',
      ['door_right_back_attach']
    )

    this.hoodPivot = this.createHingePivot(
      scene,
      hood,
      'hood',
      '',
      ['caput_attach']
    )

    this.trunkPivot = this.createHingePivot(
      scene,
      trunk,
      'trunk',
      'car_window_back',
      ['back_attach', 'back_attach_2', 'back_attach_3']
    )

    console.log('[DoorController] All pivots created:', {
      leftDoorPivot: !!this.leftDoorPivot,
      rightDoorPivot: !!this.rightDoorPivot,
      leftBackDoorPivot: !!this.leftBackDoorPivot,
      rightBackDoorPivot: !!this.rightBackDoorPivot,
      hoodPivot: !!this.hoodPivot,
      trunkPivot: !!this.trunkPivot,
    })

    // Store base positions for movement animations
    const pivots = [
      this.leftDoorPivot,
      this.rightDoorPivot,
      this.leftBackDoorPivot,
      this.rightBackDoorPivot,
      this.hoodPivot,
      this.trunkPivot,
    ]
    pivots.forEach((pivot) => {
      if (pivot) this.pivotBasePositions.set(pivot, pivot.position.clone())
    })

    // Convert angles to radians
    this.leftDoorMax = THREE.MathUtils.degToRad(doorAngleDeg)
    this.rightDoorMax = THREE.MathUtils.degToRad(doorAngleDeg)
    this.hoodMax = THREE.MathUtils.degToRad(hoodAngleDeg)
    this.trunkMax = THREE.MathUtils.degToRad(trunkAngleDeg)
    this.duration = durationSec
  }

  private createHingePivot(
    carModel: any,
    node: THREE.Object3D,
    part: 'left' | 'right' | 'hood' | 'trunk',
    windowName: string | null = null,
    handleNames: string | string[] = []
  ): THREE.Object3D {
    if (!node) {
      console.warn(`[DoorController] ⚠️ Object for "${part}" not found, skipping pivot creation`)
      return new THREE.Object3D()
    }

    console.log(`[DoorController] Creating hinge pivot for "${part}" (type: ${node.type})...`)

    const handles = Array.isArray(handleNames)
      ? handleNames
      : handleNames
      ? [handleNames]
      : []

    // Compute bounding box (works for both Mesh and Group)
    const bbox = new THREE.Box3().setFromObject(node)

    if (bbox.isEmpty()) {
      console.error(`[DoorController] Could not compute bounding box for "${part}"!`)
      return new THREE.Object3D()
    }
    const hingeLocal = new THREE.Vector3()

    switch (part) {
      case 'left':
        hingeLocal.x = bbox.min.x
        hingeLocal.y = bbox.min.y
        hingeLocal.z = (bbox.min.z + bbox.max.z) / 2
        break

      case 'right':
        hingeLocal.x = bbox.min.x
        hingeLocal.y = bbox.min.y
        hingeLocal.z = (bbox.min.z + bbox.max.z) / 2
        break

      case 'hood':
        hingeLocal.x = bbox.max.x
        hingeLocal.y = (bbox.min.y + bbox.max.y) / 2
        hingeLocal.z = bbox.max.z
        break

      case 'trunk':
        hingeLocal.x = bbox.min.x
        hingeLocal.y = (bbox.min.y + bbox.max.y) / 2
        hingeLocal.z = bbox.max.z
        break
    }

    // World ↔ parent local conversion
    const hingeWorld = node.localToWorld(hingeLocal.clone())
    const parent = node.parent

    if (!parent) {
      console.error(`[DoorController] Object for "${part}" has no parent!`)
      return new THREE.Object3D()
    }

    const hingeParent = parent.worldToLocal(hingeWorld.clone())

    // Build pivot
    const pivot = new THREE.Object3D()
    parent.add(pivot)
    pivot.position.copy(hingeParent)

    // Attach the door/hood/trunk
    pivot.attach(node)

    // Optional: attach the window
    if (windowName) {
      const winObj = carModel.getObjectByName(windowName) as THREE.Object3D
      if (winObj) {
        winObj.updateMatrixWorld(true)
        pivot.attach(winObj)
      } else {
        console.warn(`Window object "${windowName}" not found.`)
      }
    }

    // Optional: attach handle(s)
    handles.forEach((hName) => {
      const handleObj = carModel.getObjectByName(hName) as THREE.Object3D
      if (handleObj) {
        handleObj.updateMatrixWorld(true)
        pivot.attach(handleObj)
      } else {
        console.warn(`[DoorController] Handle object "${hName}" not found.`)
      }
    })

    console.log(`[DoorController] ✓ Pivot created for "${part}" at position:`, pivot.position)
    return pivot
  }

  private animateMovement(
    pivot: THREE.Object3D,
    offset: THREE.Vector3,
    isOpen: boolean
  ) {
    const base = this.pivotBasePositions.get(pivot)!
    const targetPos = isOpen ? base.clone().add(offset) : base.clone()
    gsap.to(pivot.position, {
      x: targetPos.x,
      y: targetPos.y,
      z: targetPos.z,
      duration: this.duration,
      ease: 'power2.inOut',
      onUpdate: () => this.invalidate(),
    })
  }

  public openLeftFrontDoor(isOpen: boolean) {
    console.log(`[DoorController] openLeftFrontDoor(${isOpen})`)
    const target = isOpen ? this.leftDoorMax : 0
    console.log(`  → Rotating to: ${target} radians (${THREE.MathUtils.radToDeg(target)}°)`)
    gsap.to(this.leftDoorPivot.rotation, {
      z: -target,  // Negative to open outward
      duration: this.duration,
      ease: 'power2.inOut',
      onUpdate: () => this.invalidate(),
    })
    this.animateMovement(
      this.leftDoorPivot,
      new THREE.Vector3(0.11, 0, 0),
      isOpen
    )
  }

  public openRightFrontDoor(isOpen: boolean) {
    console.log(`[DoorController] openRightFrontDoor(${isOpen})`)
    const target = isOpen ? this.rightDoorMax : 0
    gsap.to(this.rightDoorPivot.rotation, {
      z: target,  // Positive to open outward
      duration: this.duration,
      ease: 'power2.inOut',
      onUpdate: () => this.invalidate(),
    })
    this.animateMovement(
      this.rightDoorPivot,
      new THREE.Vector3(0.11, 0, 0),
      isOpen
    )
  }

  public openLeftBackDoor(isOpen: boolean) {
    console.log(`[DoorController] openLeftBackDoor(${isOpen})`)
    const target = isOpen ? this.leftDoorMax : 0
    gsap.to(this.leftBackDoorPivot.rotation, {
      z: -target,  // Negative to open outward
      duration: this.duration,
      ease: 'power2.inOut',
      onUpdate: () => this.invalidate(),
    })
  }

  public openRightBackDoor(isOpen: boolean) {
    console.log(`[DoorController] openRightBackDoor(${isOpen})`)
    const target = isOpen ? this.rightDoorMax : 0
    gsap.to(this.rightBackDoorPivot.rotation, {
      z: target,  // Positive to open outward
      duration: this.duration,
      ease: 'power2.inOut',
      onUpdate: () => this.invalidate(),
    })
  }

  public openHood(isOpen: boolean) {
    console.log(`[DoorController] openHood(${isOpen})`)
    const target = isOpen ? this.hoodMax : 0
    gsap.to(this.hoodPivot.rotation, {
      y: target,
      duration: this.duration,
      ease: 'power2.inOut',
      onUpdate: () => this.invalidate(),
    })
    this.animateMovement(
      this.hoodPivot,
      new THREE.Vector3(0.18, 0.3, 0),
      isOpen
    )
  }

  public openTrunk(isOpen: boolean) {
    console.log(`[DoorController] openTrunk(${isOpen})`)
    const target = isOpen ? -this.trunkMax : 0
    gsap.to(this.trunkPivot.rotation, {
      y: target,
      duration: this.duration,
      ease: 'power2.inOut',
      onUpdate: () => this.invalidate(),
    })
    this.animateMovement(
      this.trunkPivot,
      new THREE.Vector3(-0.28, 0.3, 0),
      isOpen
    )
  }
}
