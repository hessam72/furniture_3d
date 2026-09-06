import { WHY_US, WHY_US_SECTION } from "@/lib/content/home";
import SectionHeading from "./SectionHeading";
import { WhyGlyph } from "./icons";
import Reveal from "./Reveal";
import Section from "./Section";

export default function WhyUs() {
  return (
    <Section tone="c" id={WHY_US_SECTION.id} labelledBy="why-heading">
      <Reveal className="flex w-full flex-col items-center gap-10">
        <SectionHeading
          eyebrow={WHY_US_SECTION.eyebrow}
          segments={WHY_US_SECTION.heading}
          id="why-heading"
        />

        {/* Four across in a single line at every width, as specified.
            At 375px each cell gets ~80px — enough for the icon and a
            two-line balanced label. */}
        <ul className="grid w-full max-w-4xl grid-cols-4 gap-2 sm:gap-5">
          {WHY_US.map((item) => (
            <li
              key={item.label}
              className="flex flex-col items-center gap-2.5 text-center sm:gap-3"
            >
              <span className="grid h-11 w-11 place-items-center rounded-full border border-gold-line bg-[radial-gradient(120%_120%_at_50%_0%,rgb(194_157_104/18%),transparent_70%)] text-gold shadow-[inset_0_1px_0_rgb(247_235_214/25%)] sm:h-14 sm:w-14">
                <WhyGlyph name={item.icon} className="h-5 w-5 sm:h-6 sm:w-6" />
              </span>
              <span className="font-persian text-[0.62rem] font-bold leading-[1.7] text-white text-balance sm:text-sm">
                {item.label}
              </span>
            </li>
          ))}
        </ul>
      </Reveal>
    </Section>
  );
}
