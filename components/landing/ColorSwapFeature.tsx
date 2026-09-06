import { COLOR_SWAP } from "@/lib/content/home";
import SectionHeading from "./SectionHeading";
import BeforeAfterSlider from "./BeforeAfterSlider";
import Reveal from "./Reveal";
import Section from "./Section";

export default function ColorSwapFeature() {
  return (
    <Section tone="b" id={COLOR_SWAP.id} labelledBy="colorswap-heading">
      <Reveal className="flex w-full flex-col items-center gap-8">
        <SectionHeading
          eyebrow={COLOR_SWAP.eyebrow}
          segments={COLOR_SWAP.heading}
          description={COLOR_SWAP.description}
          id="colorswap-heading"
        />

        <BeforeAfterSlider before={COLOR_SWAP.before} after={COLOR_SWAP.after} />

        {/* Presentational only — not buttons, not focusable, hidden from
            assistive tech, with a visible note explaining why. */}
        <div className="flex flex-col items-center gap-3">
          <ul aria-hidden="true" className="flex items-center gap-3">
            {COLOR_SWAP.swatches.map((swatch, i) => (
              <li
                key={swatch.hex}
                title={swatch.name}
                style={{ backgroundColor: swatch.hex }}
                className={
                  "h-8 w-8 rounded-full ring-1 ring-inset ring-white/20 sm:h-9 sm:w-9 " +
                  (i === 0
                    ? "outline outline-2 outline-offset-[3px] outline-gold"
                    : "")
                }
              />
            ))}
          </ul>
          <p className="font-persian max-w-sm text-center text-[0.72rem] leading-6 text-white/40">
            {COLOR_SWAP.swatchesNote}
          </p>
        </div>
      </Reveal>
    </Section>
  );
}
