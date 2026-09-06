/**
 * Hand-authored inline SVG icons.
 *
 * Deliberately not `react-icons`: its `IconBase` consumes a React context,
 * which throws inside Server Components — and every one of these renders in
 * an RSC. Ten 24×24 `currentColor` paths cost ~1KB total and give exact
 * control over the gold stroke weight.
 */

import type { SVGProps } from "react";
import type { FeatureIcon, WhyIcon } from "@/lib/content/home";

type IconProps = SVGProps<SVGSVGElement>;

function Svg({ children, ...props }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      {children}
    </svg>
  );
}

/* ── Key features ─────────────────────────────────────────── */

const Palette = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 3a9 9 0 1 0 0 18c1.1 0 2-.9 2-2 0-.5-.2-1-.5-1.3-.3-.4-.5-.8-.5-1.2 0-1 .8-1.8 1.8-1.8H16a5 5 0 0 0 5-5c0-3.9-4-6.7-9-6.7Z" />
    <circle cx="7.5" cy="11" r="1.1" fill="currentColor" stroke="none" />
    <circle cx="10.5" cy="7.5" r="1.1" fill="currentColor" stroke="none" />
    <circle cx="15" cy="8.5" r="1.1" fill="currentColor" stroke="none" />
  </Svg>
);

const Cube = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 2.8 20.5 7v10L12 21.2 3.5 17V7L12 2.8Z" />
    <path d="M3.5 7 12 11.4 20.5 7" />
    <path d="M12 11.4v9.8" />
  </Svg>
);

const Catalog = (p: IconProps) => (
  <Svg {...p}>
    <rect x="3" y="3.5" width="7.5" height="7.5" rx="1.4" />
    <rect x="13.5" y="3.5" width="7.5" height="7.5" rx="1.4" />
    <rect x="3" y="13" width="7.5" height="7.5" rx="1.4" />
    <path d="M17.25 13v7.5M13.5 16.75H21" />
  </Svg>
);

const Ar = (p: IconProps) => (
  <Svg {...p}>
    <path d="M3 8V5.6C3 4.7 3.7 4 4.6 4H7" />
    <path d="M21 8V5.6C21 4.7 20.3 4 19.4 4H17" />
    <path d="M3 16v2.4c0 .9.7 1.6 1.6 1.6H7" />
    <path d="M21 16v2.4c0 .9-.7 1.6-1.6 1.6H17" />
    <path d="M12 8.2 16 10.3v4.2L12 16.6 8 14.5v-4.2L12 8.2Z" />
    <path d="M8 10.3 12 12.4l4-2.1M12 12.4v4.2" />
  </Svg>
);

const Mobile = (p: IconProps) => (
  <Svg {...p}>
    <rect x="6.5" y="2.5" width="11" height="19" rx="2.4" />
    <path d="M10.5 5.4h3" />
    <path d="M11 18.4h2" />
  </Svg>
);

const Install = (p: IconProps) => (
  <Svg {...p}>
    <rect x="2.5" y="4.5" width="19" height="13" rx="2" />
    <path d="M2.5 8.4h19" />
    <circle cx="5.6" cy="6.5" r=".7" fill="currentColor" stroke="none" />
    <path d="M8.5 21h7" />
    <path d="M12 13.6V10.6m0 3-1.5-1.5M12 13.6l1.5-1.5" />
  </Svg>
);

/* ── Why us ───────────────────────────────────────────────── */

const Clock = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M12 7.3V12l3.1 1.9" />
  </Svg>
);

const Trust = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 2.8 19 5.5v5.8c0 4.3-2.9 7.9-7 9.9-4.1-2-7-5.6-7-9.9V5.5l7-2.7Z" />
    <path d="m8.9 11.9 2.1 2.1 4.1-4.2" />
  </Svg>
);

const Growth = (p: IconProps) => (
  <Svg {...p}>
    <path d="M3.5 20h17" />
    <path d="M6.5 20v-5.2M11 20V9.6M15.5 20v-7.4M20 20V5.6" />
  </Svg>
);

const Support = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4.5 14v-2a7.5 7.5 0 0 1 15 0v2" />
    <path d="M4.5 13.2h1.4c.8 0 1.4.6 1.4 1.4v2.6c0 .8-.6 1.4-1.4 1.4H4.5a1 1 0 0 1-1-1v-3.4a1 1 0 0 1 1-1Z" />
    <path d="M19.5 13.2h-1.4c-.8 0-1.4.6-1.4 1.4v2.6c0 .8.6 1.4 1.4 1.4h1.4a1 1 0 0 0 1-1v-3.4a1 1 0 0 0-1-1Z" />
    <path d="M19 18.6v.5c0 1.1-.9 2-2 2h-2.5" />
  </Svg>
);

/* ── UI ───────────────────────────────────────────────────── */

export const MenuIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 7h16M4 12h16M4 17h11" />
  </Svg>
);

export const CloseIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M6 6l12 12M18 6L6 18" />
  </Svg>
);

/** Points left — the "forward" direction in an RTL document. */
export const ArrowIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M19 12H5" />
    <path d="m10.5 6.5-5.5 5.5 5.5 5.5" />
  </Svg>
);

export const ChevronDownIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="m6.5 9.5 5.5 5.5 5.5-5.5" />
  </Svg>
);

export const PhoneIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M6.2 3.5h2.6l1.5 3.9-2 1.3a11 11 0 0 0 5 5l1.3-2 3.9 1.5v2.6a2 2 0 0 1-2.2 2A16.5 16.5 0 0 1 4.2 5.7a2 2 0 0 1 2-2.2Z" />
  </Svg>
);

export const ImageIcon = (p: IconProps) => (
  <Svg {...p}>
    <rect x="3" y="4.5" width="18" height="15" rx="2.2" />
    <circle cx="8.6" cy="10" r="1.5" />
    <path d="m3.6 17.4 4.6-4.3a2 2 0 0 1 2.7 0l3 2.8a2 2 0 0 0 2.7 0l2-1.8" />
  </Svg>
);

export const DragIcon = (p: IconProps) => (
  <Svg {...p} strokeWidth={1.8}>
    <path d="m9.5 8.5-3.5 3.5 3.5 3.5" />
    <path d="m14.5 8.5 3.5 3.5-3.5 3.5" />
  </Svg>
);

const FEATURE_ICONS: Record<FeatureIcon, (p: IconProps) => JSX.Element> = {
  palette: Palette,
  cube: Cube,
  catalog: Catalog,
  ar: Ar,
  mobile: Mobile,
  install: Install,
};

const WHY_ICONS: Record<WhyIcon, (p: IconProps) => JSX.Element> = {
  clock: Clock,
  trust: Trust,
  growth: Growth,
  support: Support,
};

export function FeatureGlyph({ name, ...props }: { name: FeatureIcon } & IconProps) {
  const Glyph = FEATURE_ICONS[name];
  return <Glyph {...props} />;
}

export function WhyGlyph({ name, ...props }: { name: WhyIcon } & IconProps) {
  const Glyph = WHY_ICONS[name];
  return <Glyph {...props} />;
}
