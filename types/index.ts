export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface CursorState {
  x: number;
  y: number;
  /** Normalised -1 → 1 */
  nx: number;
  ny: number;
  isHovering: boolean;
}

export interface ScrollState {
  /** Raw pixel scroll offset */
  offset: number;
  /** 0 → 1 across the full page */
  progress: number;
  /** Velocity pixels/frame */
  velocity: number;
}

export type DeviceTier = "high" | "mid" | "low";
