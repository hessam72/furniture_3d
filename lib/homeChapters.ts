// Shared scroll-narrative constants for the homepage 3D experience.
// Single source of truth for paint thresholds (useHomeScroll + ScrollChapters3D)
// and chapter definitions (ScrollChapters3D + ChapterRail).

export interface PaintStop {
  until: number // active while scroll progress < until
  color: string
  metalness: number
  roughness: number
  clearcoat: number
  label: string
}

export const PAINT_STOPS: PaintStop[] = [
  { until: 0.25, color: '#ff0000', metalness: 0.9, roughness: 0.2, clearcoat: 1.0, label: 'Gloss Red' },
  { until: 0.35, color: '#1a1a1a', metalness: 0.8, roughness: 0.4, clearcoat: 1.0, label: 'Satin Black'},
  { until: 1,  color: '#f5f5f5', metalness: 0.8, roughness: 0.1, clearcoat: 1.0, label: 'Pearl White' },
  // { until: 1.01, color: '#f5f5f5', metalness: 0.8, roughness: 0.1, clearcoat: 1.0, label: 'Pearl White' },
]

export function paintForProgress(v: number): PaintStop {
  return PAINT_STOPS.find((s) => v < s.until) ?? PAINT_STOPS[PAINT_STOPS.length - 1]
}

export interface Chapter3D {
  id: string
  index: string // "01".."04" displayed numeral
  range: [number, number] // scroll progress window where visible
  title: string
  description: string
  position: [number, number, number] // world position of the text group
  facing: [number, number, number] // camera position the text should face
  showOrbs?: boolean // paint color orbs (act 02)
  ring?: { position: [number, number, number]; radius: number } // floor spotlight ring
}

export const CHAPTERS_3D: Chapter3D[] = [
  {
    id: 'experience',
    index: '01',
    range: [0.14, 0.245],
    title: 'EXPERIENCE IN 3D',
    description: 'Explore every angle in a real-time showroom',
    position: [-4.6, 1.5, -2.6],
    facing: [3, 2, 5], // home_initial camera
  },
  {
    id: 'color',
    index: '02',
    range: [0.25, 0.55],
    title: 'CHOOSE YOUR COLOR',
    description: 'Factory-grade paint, rendered live',
    position: [-2.9, 1.7, -1.6],
    facing: [3, 2, 5], // still home_initial camera
    showOrbs: true,
  },
  {
    id: 'tune',
    index: '03',
    range: [0.50, 0.68],
    title: 'TUNE YOUR TASTE',
    description: 'Wheels & parts, swapped instantly',
    position: [3, 1.2, 3],
    
    facing: [3.2, 0.8, 2.5], // home_front_wheel camera
    // ring: { position: [-1.3, 0.02, 2], radius: 0.55 },
  },
  {
    id: 'aero',
    index: '04',
    range: [0.70, 0.9],
    title: 'AERO UPGRADES',
    description: 'Performance styling on demand',
    position: [2.4, 2.0, 0],
    facing: [-2, 1.8, -3.5], // home_spoiler camera
    // ring: { position: [0, 0.02, -1.9], radius: 0.8 },
  },
]

// Chapter rail acts (includes finale) with click-to-jump scroll fractions
export const RAIL_ACTS = [
  { id: 'experience', label: '3D Showroom', jumpTo: 0.16 },
  { id: 'color', label: 'Color', jumpTo: 0.35 },
  { id: 'tune', label: 'Wheels', jumpTo: 0.55 },
  { id: 'aero', label: 'Aero', jumpTo: 0.85 },
  { id: 'finale', label: 'Finale', jumpTo: 1.0 },
]

export function activeActIndex(v: number): number {
  if (v >= 1.00) return 4
  if (v >= 0.70) return 3
  if (v >= 0.50) return 2
  if (v >= 0.25) return 1
  return 0
}
