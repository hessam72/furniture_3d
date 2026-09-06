'use client'

import { useFrame, useThree } from '@react-three/fiber'
import { useState } from 'react'
import { Html } from '@react-three/drei'

interface PerformanceStats {
  fps: number
  frameTime: number
  memory: number
  geometries: number
  textures: number
  drawCalls: number
  triangles: number
  programs: number
}

export default function PerformanceMonitor() {
  const [visible, setVisible] = useState(true)
  const [stats, setStats] = useState<PerformanceStats>({
    fps: 0,
    frameTime: 0,
    memory: 0,
    geometries: 0,
    textures: 0,
    drawCalls: 0,
    triangles: 0,
    programs: 0,
  })

  const gl = useThree((state) => state.gl)

  useFrame((state, delta) => {
    const fps = Math.round(1 / delta)
    const frameTime = Math.round(delta * 1000 * 10) / 10
    const memory = (performance as any).memory
      ? Math.round((performance as any).memory.usedJSHeapSize / 1048576)
      : 0

    const info = gl.info

    setStats({
      fps,
      frameTime,
      memory,
      geometries: info.memory.geometries,
      textures: info.memory.textures,
      drawCalls: info.render.calls,
      triangles: info.render.triangles,
      programs: info.programs?.length || 0,
    })
  })

  return (
    <Html fullscreen style={{ pointerEvents: 'none' }}>
      {!visible ? (
        <div className="fixed bottom-4 left-4 z-50" style={{ pointerEvents: 'auto' }}>
          <button
            onClick={() => setVisible(true)}
            className="px-3 py-1 bg-black/80 text-white text-xs rounded hover:bg-black/90"
          >
            Show Stats
          </button>
        </div>
      ) : (
        <div className="fixed bottom-4 left-4 z-50 bg-black/90 text-white p-4 rounded-lg font-mono text-xs min-w-[220px] border border-white/10" style={{ pointerEvents: 'auto' }}>
          <div className="flex justify-between items-center mb-2 pb-2 border-b border-white/20">
            <span className="font-bold text-sm">Performance</span>
            <button
              onClick={() => setVisible(false)}
              className="text-white/60 hover:text-white"
            >
              ✕
            </button>
          </div>

          <div className="space-y-1">
            <div className="flex justify-between">
              <span className="text-green-400">FPS:</span>
              <span className={stats.fps < 30 ? 'text-red-400' : stats.fps < 50 ? 'text-yellow-400' : 'text-green-400'}>
                {stats.fps}
              </span>
            </div>

            <div className="flex justify-between">
              <span className="text-blue-400">Frame Time:</span>
              <span>{stats.frameTime}ms</span>
            </div>

            {stats.memory > 0 && (
              <div className="flex justify-between">
                <span className="text-purple-400">Memory:</span>
                <span>{stats.memory}MB</span>
              </div>
            )}

            <div className="border-t border-white/10 my-2"></div>

            <div className="flex justify-between">
              <span className="text-orange-400">Draw Calls:</span>
              <span>{stats.drawCalls}</span>
            </div>

            <div className="flex justify-between">
              <span className="text-cyan-400">Triangles:</span>
              <span>{stats.triangles.toLocaleString()}</span>
            </div>

            <div className="flex justify-between">
              <span className="text-yellow-400">Geometries:</span>
              <span>{stats.geometries}</span>
            </div>

            <div className="flex justify-between">
              <span className="text-pink-400">Textures:</span>
              <span>{stats.textures}</span>
            </div>

            <div className="flex justify-between">
              <span className="text-indigo-400">Programs:</span>
              <span>{stats.programs}</span>
            </div>
          </div>
        </div>
      )}
    </Html>
  )
}
