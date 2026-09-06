import { KEY_FEATURES, KEY_FEATURES_SECTION } from "@/lib/content/home";
import SectionHeading from "./SectionHeading";
import GlassCard from "./GlassCard";
import { FeatureGlyph } from "./icons";
import Reveal from "./Reveal";
import Section from "./Section";

export default function KeyFeatures() {
  return (
    <Section tone="b" id={KEY_FEATURES_SECTION.id} labelledBy="keyfeatures-heading">
      <Reveal className="flex w-full flex-col items-center gap-10">
        <SectionHeading
          eyebrow={KEY_FEATURES_SECTION.eyebrow}
          segments={KEY_FEATURES_SECTION.heading}
          id="keyfeatures-heading"
        />

        {/* Two columns on phones as requested; six items means three rows.
            Rebalances to 3 × 2 from md up. */}
        <ul className="grid w-full max-w-4xl grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 md:gap-5">
          {KEY_FEATURES.map((feature) => (
            <li key={feature.label}>
              <GlassCard
                gold
                className="flex h-full flex-col items-center gap-3 px-3 py-6 text-center transition-transform duration-300 ease-lux hover:-translate-y-1 sm:px-4 sm:py-8"
              >
                <span className="grid h-12 w-12 place-items-center rounded-full border border-gold-line bg-[radial-gradient(120%_120%_at_50%_0%,rgb(194_157_104/18%),transparent_70%)] text-gold shadow-[inset_0_1px_0_rgb(247_235_214/25%)]">
                  <FeatureGlyph name={feature.icon} className="h-6 w-6" />
                </span>
                <span className="font-persian text-[0.82rem] font-bold leading-7 text-white text-balance sm:text-sm">
                  {feature.label}
                </span>
              </GlassCard>
            </li>
          ))}
        </ul>
      </Reveal>
    </Section>
  );
}
