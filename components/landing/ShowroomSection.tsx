import { SHOWROOM } from "@/lib/content/home";
import SectionHeading from "./SectionHeading";
import SmartImage from "./SmartImage";
import GoldButton from "./GoldButton";
import Reveal from "./Reveal";
import Section from "./Section";

export default function ShowroomSection() {
  return (
    <Section tone="a" id={SHOWROOM.id} labelledBy="showroom-heading">
      <Reveal className="flex w-full flex-col items-center gap-8">
        <SectionHeading
          eyebrow={SHOWROOM.eyebrow}
          segments={SHOWROOM.heading}
          description={SHOWROOM.description}
          id="showroom-heading"
        />

        {/* Hairline, not gold: the panel already carries the gold border and
            two competing gold frames read as clutter. */}
        <div className="relative aspect-[4/3] w-full max-w-3xl overflow-hidden rounded-glass glass-flat specular sm:aspect-[16/10]">
          <SmartImage
            src={SHOWROOM.image.src}
            alt={SHOWROOM.image.alt}
            label={SHOWROOM.image.label}
            sizes="(max-width: 640px) 92vw, (max-width: 1024px) 80vw, 768px"
          />
        </div>

        <GoldButton href={SHOWROOM.cta.href}>{SHOWROOM.cta.label}</GoldButton>
      </Reveal>
    </Section>
  );
}
