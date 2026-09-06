import type { SVGProps } from 'react'

/**
 * The page's whole icon set, inline.
 *
 * Stroke-only on a 24 grid so every glyph inherits `currentColor` and one
 * weight — the same reason components/landing/icons.tsx exists. Keeps the page
 * free of an icon package and of a second font request.
 */

type Props = SVGProps<SVGSVGElement> & { size?: number }

function Svg({ size = 20, children, ...rest }: Props) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...rest}
    >
      {children}
    </svg>
  )
}

export const PinIcon = (p: Props) => (
  <Svg {...p}>
    <path d="M12 21s7-5.6 7-11a7 7 0 1 0-14 0c0 5.4 7 11 7 11Z" />
    <circle cx="12" cy="10" r="2.6" />
  </Svg>
)

export const PhoneIcon = (p: Props) => (
  <Svg {...p}>
    <path d="M6.4 3.5h3l1.4 3.5-1.9 1.4a12 12 0 0 0 5.7 5.7l1.4-1.9 3.5 1.4v3a2 2 0 0 1-2.2 2A16.5 16.5 0 0 1 4.4 5.7a2 2 0 0 1 2-2.2Z" />
  </Svg>
)

export const ClockIcon = (p: Props) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M12 7.5V12l3 1.8" />
  </Svg>
)

export const MailIcon = (p: Props) => (
  <Svg {...p}>
    <rect x="3" y="5.5" width="18" height="13" rx="2.5" />
    <path d="m3.8 7 7.1 5.2a2 2 0 0 0 2.2 0L20.2 7" />
  </Svg>
)

export const VrIcon = (p: Props) => (
  <Svg {...p}>
    <path d="M3.5 9.2A2.2 2.2 0 0 1 5.7 7h12.6a2.2 2.2 0 0 1 2.2 2.2v4.3a2.2 2.2 0 0 1-2.2 2.2h-2.5a2 2 0 0 1-1.6-.8l-.9-1.2a1.7 1.7 0 0 0-2.6 0l-.9 1.2a2 2 0 0 1-1.6.8H5.7a2.2 2.2 0 0 1-2.2-2.2Z" />
  </Svg>
)

export const SofaIcon = (p: Props) => (
  <Svg {...p}>
    <path d="M5 11V8.5A2.5 2.5 0 0 1 7.5 6h9A2.5 2.5 0 0 1 19 8.5V11" />
    <path d="M3.5 12.4a1.9 1.9 0 0 1 3.8 0V15h9.4v-2.6a1.9 1.9 0 0 1 3.8 0V17a1.5 1.5 0 0 1-1.5 1.5h-14A1.5 1.5 0 0 1 3.5 17Z" />
  </Svg>
)

export const TagIcon = (p: Props) => (
  <Svg {...p}>
    <path d="M11.2 3.5H19a1.5 1.5 0 0 1 1.5 1.5v7.8a2 2 0 0 1-.6 1.4l-6 6a2 2 0 0 1-2.8 0l-6.3-6.3a2 2 0 0 1 0-2.8l6-6a2 2 0 0 1 1.4-.6Z" />
    <circle cx="16" cy="8" r="1.4" />
  </Svg>
)

export const TruckIcon = (p: Props) => (
  <Svg {...p}>
    <path d="M2.5 6.5h10.2v9.2H2.5z" />
    <path d="M12.7 9.5h3.6l2.9 3v3.2h-6.5z" />
    <circle cx="7" cy="17.5" r="1.8" />
    <circle cx="16.4" cy="17.5" r="1.8" />
  </Svg>
)

export const CubeIcon = (p: Props) => (
  <Svg {...p}>
    <path d="M12 3.2 20 7.6v8.8L12 20.8 4 16.4V7.6Z" />
    <path d="m4 7.6 8 4.4 8-4.4M12 12v8.8" />
  </Svg>
)

export const HeadsetIcon = (p: Props) => (
  <Svg {...p}>
    <path d="M4.5 14v-2a7.5 7.5 0 0 1 15 0v2" />
    <path d="M4.5 13.5h1.8a1.2 1.2 0 0 1 1.2 1.2v2.6a1.2 1.2 0 0 1-1.2 1.2H5.7A1.2 1.2 0 0 1 4.5 17.3Zm15 0h-1.8a1.2 1.2 0 0 0-1.2 1.2v2.6a1.2 1.2 0 0 0 1.2 1.2h.6a1.2 1.2 0 0 0 1.2-1.2Z" />
  </Svg>
)

export const RotateIcon = (p: Props) => (
  <Svg {...p}>
    <ellipse cx="12" cy="12" rx="8.5" ry="4" />
    <path d="M12 4.5v15" />
    <path d="m9.8 6.6 2.2-2.1 2.2 2.1" />
  </Svg>
)

export const ArIcon = (p: Props) => (
  <Svg {...p}>
    <path d="M3.5 8V6a2.5 2.5 0 0 1 2.5-2.5h2M16 3.5h2A2.5 2.5 0 0 1 20.5 6v2M20.5 16v2a2.5 2.5 0 0 1-2.5 2.5h-2M8 20.5H6A2.5 2.5 0 0 1 3.5 18v-2" />
    <path d="m12 8 4 2.2v3.6L12 16l-4-2.2v-3.6Z" />
  </Svg>
)

export const LayersIcon = (p: Props) => (
  <Svg {...p}>
    <path d="m12 3.5 8.5 4.2L12 11.9 3.5 7.7Z" />
    <path d="m3.5 12 8.5 4.2 8.5-4.2M3.5 16.3 12 20.5l8.5-4.2" />
  </Svg>
)

export const PaletteIcon = (p: Props) => (
  <Svg {...p}>
    <path d="M12 3.5a8.5 8.5 0 0 0 0 17c1.4 0 2-.9 2-1.8 0-1.4-1.2-1.7-1.2-2.9 0-.8.7-1.4 1.6-1.4h1.5a4.6 4.6 0 0 0 4.6-4.6c0-3.7-3.7-6.3-8.5-6.3Z" />
    <circle cx="8.4" cy="10.2" r="1.1" fill="currentColor" stroke="none" />
    <circle cx="12" cy="7.6" r="1.1" fill="currentColor" stroke="none" />
    <circle cx="15.7" cy="9.7" r="1.1" fill="currentColor" stroke="none" />
  </Svg>
)

export const SearchIcon = (p: Props) => (
  <Svg {...p}>
    <circle cx="11" cy="11" r="6.5" />
    <path d="m16 16 4 4" />
  </Svg>
)

export const MenuIcon = (p: Props) => (
  <Svg {...p}>
    <path d="M4 7h16M4 12h16M4 17h16" />
  </Svg>
)

export const CloseIcon = (p: Props) => (
  <Svg {...p}>
    <path d="m6 6 12 12M18 6 6 18" />
  </Svg>
)

/** Points left; RTL flips it in CSS. @see .sr-root[dir="rtl"] rules */
export const ArrowIcon = (p: Props) => (
  <Svg {...p}>
    <path d="M19 12H5" />
    <path d="m11 6-6 6 6 6" />
  </Svg>
)

export const ChevronIcon = (p: Props) => (
  <Svg {...p}>
    <path d="m6 9 6 6 6-6" />
  </Svg>
)

export const PlayIcon = (p: Props) => (
  <Svg {...p} fill="currentColor" stroke="none">
    <path d="M9 6.8v10.4a.8.8 0 0 0 1.2.7l8.2-5.2a.8.8 0 0 0 0-1.4L10.2 6a.8.8 0 0 0-1.2.7Z" />
  </Svg>
)

export const PlusIcon = (p: Props) => (
  <Svg {...p}>
    <path d="M12 5.5v13M5.5 12h13" />
  </Svg>
)

export const SofaGhostIcon = (p: Props) => (
  <Svg {...p} strokeWidth={1}>
    <path d="M4 12V9a3 3 0 0 1 3-3h10a3 3 0 0 1 3 3v3" />
    <path d="M2.5 13.6a2.2 2.2 0 0 1 4.4 0V16h10.2v-2.4a2.2 2.2 0 0 1 4.4 0V18a1.6 1.6 0 0 1-1.6 1.6H4.1A1.6 1.6 0 0 1 2.5 18Z" />
  </Svg>
)

const ICONS = {
  pin: PinIcon,
  phone: PhoneIcon,
  clock: ClockIcon,
  mail: MailIcon,
  vr: VrIcon,
  sofa: SofaIcon,
  tag: TagIcon,
  truck: TruckIcon,
  cube: CubeIcon,
  headset: HeadsetIcon,
  rotate: RotateIcon,
  ar: ArIcon,
  layers: LayersIcon,
  palette: PaletteIcon,
} as const

export type IconKey = keyof typeof ICONS

/** Renders a config-named icon; unknown names render nothing rather than throw. */
export function Icon({ name, ...rest }: Props & { name: string }) {
  const Glyph = ICONS[name as IconKey]
  return Glyph ? <Glyph {...rest} /> : null
}
