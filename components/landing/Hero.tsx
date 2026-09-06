import { HERO } from "@/lib/content/home";
import { Heading, Eyebrow } from "./SectionHeading";
import SmartImage from "./SmartImage";
import ScrollCue from "./ScrollCue";
import Reveal from "./Reveal";

export default function Hero() {
  return (
    <section
      id="top"
      className="relative flex min-h-[100svh] flex-col items-center justify-end overflow-hidden"
      aria-labelledby="hero-heading"
    >
      {/* Full-cover background image */}
      <div className="absolute inset-0 z-0">
        <SmartImage
          src={HERO.image.src}
          alt={HERO.image.alt}
          label={HERO.image.label}
          priority
          className="object-[center_35%]"
          sizes="100vw"
        />
      </div>

      {/* Dark gradient overlay for text legibility */}
      <div className="absolute inset-0 z-10 bg-gradient-to-b from-transparent from-40% via-ink-950/40 via-70% to-ink-950" />

      {/* Content positioned at bottom */}
      <div className="relative z-20 w-full px-5 pb-24 pt-32">
        <Reveal className="flex flex-col items-center gap-4 text-center">
          <Eyebrow>{HERO.eyebrow}</Eyebrow>

          <Heading as="h1" id="hero-heading" segments={HERO.heading} />

          <p className="font-persian max-w-md text-sm leading-[2] text-white/75 sm:text-base">
            {HERO.description}
          </p>
        </Reveal>
      </div>

      {/* Scroll cue at bottom */}
      <div className="absolute bottom-8 z-20">
        <ScrollCue />
      </div>
    </section>
  );
}
