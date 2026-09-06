import { HERO, SHOWROOM } from "@/lib/content/home";
import { ChevronDownIcon } from "./icons";

/** CSS-only scroll gesture. Native anchor jump — Lenis smooths it anyway. */
export default function ScrollCue() {
  return (
    <a
      href={`#${SHOWROOM.id}`}
      className="group flex flex-col items-center gap-2 pt-2"
      aria-label="رفتن به بخش شوروم سه‌بعدی"
    >
      <span className="font-persian text-[0.7rem] text-white/45 transition-colors group-hover:text-white/70">
        {HERO.scrollCue}
      </span>
      <span
        aria-hidden="true"
        className="grid h-10 w-6 place-items-start rounded-full border border-gold-line pt-1.5"
      >
        <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-gold m-auto" />
      </span>
      <ChevronDownIcon
        aria-hidden="true"
        className="h-4 w-4 animate-bounce text-gold/60"
      />
    </a>
  );
}
