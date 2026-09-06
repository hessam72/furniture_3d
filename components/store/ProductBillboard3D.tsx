'use client'

import { Text, RoundedBox, useGLTF } from '@react-three/drei'
import { useRouter } from 'next/navigation'
import { useRef, useState, useMemo, useEffect } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'

interface FurnitureColor {
  name: string
  hex: string
}

interface ProductData {
  id: string
  name: string
  category?: string
  type?: string
  dimensions?: string
  material?: string
  weight?: string
  seatingCapacity?: string
  shelves?: string
  colors?: FurnitureColor[]
  glbPath?: string
  usdzPath?: string
  billboardPosition: [number, number, number]
}

interface ProductBillboard3DProps {
  product: ProductData | null
  onClose: () => void
  onViewAR?: () => void
}

export default function ProductBillboard3D({ product, onClose, onViewAR }: ProductBillboard3DProps) {
  const router = useRouter()
  const groupRef = useRef<THREE.Group>(null)
  const arButtonRef = useRef<THREE.Group>(null)
  const [hovered, setHovered] = useState(false)
  const [billboardRotation, setBillboardRotation] = useState(0)
  const { camera } = useThree()

  // Global scale multiplier - MODIFY THIS to resize entire billboard
  const GLOBAL_SCALE = .35

  // Load billboard GLB model
  const gltf = useGLTF('/models/billboard/billboard.glb')

  // Calculate rotation to face camera when product changes
  useEffect(() => {
    if (product) {
      const billboardPos = new THREE.Vector3(...product.billboardPosition)
      const cameraPos = camera.position.clone()

      // Calculate angle on Y axis
      const direction = new THREE.Vector3()
      direction.subVectors(cameraPos, billboardPos)
      direction.y = 0 // Only rotate on Y axis
      direction.normalize()

      const angle = Math.atan2(direction.x, direction.z)
      setBillboardRotation(angle)
    }
  }, [product, camera])

  // Find surface mesh and calculate dimensions
  const { surfacePosition, surfaceRotation, billboardScale, billboardScene } = useMemo(() => {
    const clone = gltf.scene.clone(true)
    let surface = clone.getObjectByName('surface') as THREE.Mesh

    // Enable shadows on all meshes
    clone.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.castShadow = true
        child.receiveShadow = true
        if (!surface) {
          surface = child
        }
      }
    })

    // Target content dimensions
    const targetWidth = 4
    const targetHeight = 4.5

    if (surface) {
      // Calculate scale based on surface vs content dimensions
      surface.geometry.computeBoundingBox()
      const bbox = surface.geometry.boundingBox!
      const width = bbox.max.x - bbox.min.x
      const height = bbox.max.y - bbox.min.y

      const scaleX = width > 0 ? targetWidth / width : 1
      const scaleY = height > 0 ? targetHeight / height : 1
      const uniformScale = Math.min(scaleX, scaleY)

      // Get world position and rotation of surface mesh
      const worldPos = new THREE.Vector3()
      const worldRot = new THREE.Euler()
      surface.getWorldPosition(worldPos)
      surface.getWorldQuaternion(new THREE.Quaternion().setFromEuler(worldRot))

      return {
        surfacePosition: [worldPos.x, worldPos.y, worldPos.z] as [number, number, number],
        surfaceRotation: [worldRot.x, worldRot.y, worldRot.z] as [number, number, number],
        billboardScale: uniformScale,
        billboardScene: clone
      }
    }

    return {
      surfacePosition: [0, 0, 0] as [number, number, number],
      surfaceRotation: [0, 0, 0] as [number, number, number],
      billboardScale: 1,
      billboardScene: clone
    }
  }, [gltf])

  // Animate AR button glow
  useFrame((state) => {
    if (arButtonRef.current) {
      const pulse = Math.sin(state.clock.elapsedTime * 2) * 0.075 + 0.225
      arButtonRef.current.scale.setScalar(hovered ? 1.05 : 1)
      // @ts-ignore
      arButtonRef.current.children[0].material.emissiveIntensity = pulse
    }
  })

  if (!product) return null

  const handleViewInAR = () => {
    onViewAR?.()
  }

  return (
    <group position={product.billboardPosition} scale={GLOBAL_SCALE} rotation={[0, billboardRotation, 0]}>
      {/* Billboard GLB model */}
      <primitive object={billboardScene} scale={billboardScale} />

      {/* Content group positioned on surface - offset forward on Z axis */}
      <group
        ref={groupRef}
        position={[surfacePosition[0] * billboardScale, surfacePosition[1] * billboardScale, (surfacePosition[2] * billboardScale) + 0.01]}
        rotation={surfaceRotation}
      >
        {/* Close button */}
        <group position={[1.6, 2.15, 0.1]} onClick={onClose}>
          <RoundedBox args={[0.35, 0.35, 0.05]} radius={0.08}>
            <meshPhysicalMaterial
              color="#101a2c"
              metalness={0.3}
              roughness={0.6}
              clearcoat={0.2}
            />
          </RoundedBox>
          <Text
            position={[0, 0, 0.03]}
            fontSize={0.22}
            color="#ffffff"
            anchorX="center"
            anchorY="middle"
            font="/fonts/baloo/BalooBhaijaan2-VariableFont_wght.ttf"
          >
            ×
          </Text>
        </group>

        {/* Title */}
        <Text
          position={[0, 1.6, 0]}
          fontSize={0.32}
          color="#ffffff"
          anchorX="center"
          anchorY="middle"
          maxWidth={3.5}
          textAlign="center"
          font="/fonts/shabnam/Shabnam-Bold-FD.ttf"
        >
          {product.name}
        </Text>

        {/* Title glow effect */}
        <Text
          position={[0, 1.6, -0.01]}
          fontSize={0.32}
          color="#ffffff"
          anchorX="center"
          anchorY="middle"
          maxWidth={3.5}
          textAlign="center"
          fillOpacity={0.1}
          font="/fonts/shabnam/Shabnam-Bold-FD.ttf"
        >
          {product.name}
        </Text>

        {/* Divider line */}
        <mesh position={[0, 1.3, 0]}>
          <planeGeometry args={[3, 0.015]} />
          <meshBasicMaterial color="#1f2d45" opacity={0.6} transparent />
        </mesh>

        {/* Specs - right column (RTL) */}
        <Text
          position={[1.7, 1.0, 0]}
          fontSize={0.13}
          color="#ffffff"
          anchorX="right"
          anchorY="top"
          maxWidth={1.5}
          lineHeight={1.8}
          fillOpacity={0.7}
          font="/fonts/shabnam/Shabnam-Bold-FD.ttf"
        >
          {'ابعاد\nجنس\nوزن'}
        </Text>

        <Text
          position={[0.2, 1.0, 0]}
          fontSize={0.13}
          color="#ffffff"
          anchorX="right"
          anchorY="top"
          maxWidth={1.8}
          lineHeight={1.8}
          font="/fonts/baloo/BalooBhaijaan2-VariableFont_wght.ttf"
        >
          {`${product.dimensions || 'موجود نیست'}\n${product.material || 'موجود نیست'}\n${product.weight || 'موجود نیست'}`}
        </Text>

        {/* Specs - second section (RTL) */}
        <Text
          position={[1.7, 0.0, 0]}
          fontSize={0.13}
          color="#ffffff"
          anchorX="right"
          anchorY="top"
          maxWidth={1.5}
          lineHeight={1.8}
          fillOpacity={0.7}
          font="/fonts/shabnam/Shabnam-Bold-FD.ttf"
        >
          {product.seatingCapacity ? 'ظرفیت نشستن\nدسته‌بندی\nنوع' : product.shelves ? 'تعداد قفسه\nدسته‌بندی\nنوع' : 'دسته‌بندی\nنوع\nرنگ‌ها'}
        </Text>

        <Text
          position={[0.2, 0.0, 0]}
          fontSize={0.13}
          color="#ffffff"
          anchorX="right"
          anchorY="top"
          maxWidth={1.8}
          lineHeight={1.8}
          font="/fonts/baloo/BalooBhaijaan2-VariableFont_wght.ttf"
        >
          {product.seatingCapacity
            ? `${product.seatingCapacity}\n${product.category || 'موجود نیست'}\n${product.type || 'موجود نیست'}`
            : product.shelves
            ? `${product.shelves}\n${product.category || 'موجود نیست'}\n${product.type || 'موجود نیست'}`
            : `${product.category || 'موجود نیست'}\n${product.type || 'موجود نیست'}\n${product.colors?.length || 0} گزینه`}
        </Text>

        {/* View in AR button */}
        <group
          ref={arButtonRef}
          position={[0, -1.6, 0.1]}
          onClick={handleViewInAR}
          onPointerOver={() => setHovered(true)}
          onPointerOut={() => setHovered(false)}
        >
          <RoundedBox args={[3, 0.55, 0.1]} radius={0.12}>
            <meshPhysicalMaterial
              color="#172236"
              metalness={0.7}
              roughness={0.4}
              clearcoat={0.4}
              emissive="#101a2c"
              emissiveIntensity={0.225}
              transmission={0.03}
              thickness={0.3}
            />
          </RoundedBox>
          <Text
            position={[0, 0, 0.06]}
            fontSize={0.19}
            color="#ffffff"
            anchorX="center"
            anchorY="middle"
            fontWeight={700}
            font="/fonts/shabnam/Shabnam-Bold-FD.ttf"
          >
            مشاهده در واقعیت افزوده
          </Text>
        </group>
      </group>
    </group>
  )
}
