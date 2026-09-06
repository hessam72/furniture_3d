import {
  CALL_TO_ACTION,
  CONTACT_PHONE_DISPLAY,
  CONTACT_PHONE_HREF,
} from "@/lib/content/home";
import { Heading } from "./SectionHeading";
import GoldButton from "./GoldButton";
import { PhoneIcon } from "./icons";
import Reveal from "./Reveal";
import Section from "./Section";

/** Thin gold L-bracket. Four of these frame the conversion panel. */
function Corner({ className }: { className: string }) {
  return (
    <span
      aria-hidden="true"
      className={`pointer-events-none absolute h-5 w-5 border-gold-line-hi ${className}`}
    />
  );
}

export default function CallToAction() {
  return (
    
    <Section tone="d" id={CALL_TO_ACTION.id} labelledBy="cta-heading" className="relative">
      <Corner className="left-4 top-4 border-l border-t" />
      <Corner className="right-4 top-4 border-r border-t" />
      <Corner className="bottom-4 left-4 border-b border-l" />
      <Corner className="bottom-4 right-4 border-b border-r" />

      <Reveal className="flex w-full flex-col items-center gap-5 text-center">
        <Heading segments={CALL_TO_ACTION.heading} id="cta-heading" />
        <p className="font-persian max-w-md text-sm leading-[2] text-white/65 sm:text-base">
          {CALL_TO_ACTION.description}
        </p>

        <GoldButton
          href={CONTACT_PHONE_HREF}
          icon={<PhoneIcon className="h-4 w-4" />}
          breathe
        >
          {CALL_TO_ACTION.buttonLabel}
          {/* bdi + dir=ltr stops RTL from reordering the digit run */}
          <bdi dir="ltr" className="persian-number tracking-wide">
            {CONTACT_PHONE_DISPLAY}
          </bdi>
        </GoldButton>
      </Reveal>
    </Section>
  );
}
