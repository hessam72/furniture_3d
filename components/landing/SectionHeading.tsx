import type { HeadingSegment } from "@/lib/content/home";
import { cn } from "@/lib/utils";

/** Bold white heading where only the flagged segments go gold. */
export function Heading({
  segments,
  as: Tag = "h2",
  id,
  className,
}: {
  segments: readonly HeadingSegment[];
  as?: "h1" | "h2" | "h3";
  id?: string;
  className?: string;
}) {
  return (
    <Tag
      id={id}
      className={cn(
        "font-persian font-extrabold text-white text-balance leading-[1.45]",
        Tag === "h1"
          ? "text-[1.75rem] sm:text-4xl lg:text-5xl"
          : "text-[1.45rem] sm:text-3xl lg:text-[2.5rem]",
        className,
      )}
    >
      {segments.map((segment, i) =>
        segment.gold ? (
          <span key={i} className="text-gold-key">
            {segment.text}
          </span>
        ) : (
          <span key={i}>{segment.text}</span>
        ),
      )}
    </Tag>
  );
}

export function Eyebrow({ children }: { children: string }) {
  return (
    <span className="font-persian inline-flex items-center gap-3 text-[0.7rem] tracking-[0.3em] text-gold-soft/90 sm:text-xs">
      <span
        aria-hidden="true"
        className="h-px w-6 bg-[linear-gradient(90deg,transparent,var(--color-gold-line-hi))]"
      />
      {children}
      <span
        aria-hidden="true"
        className="h-px w-6 bg-[linear-gradient(90deg,var(--color-gold-line-hi),transparent)]"
      />
    </span>
  );
}

export default function SectionHeading({
  eyebrow,
  segments,
  description,
  id,
  align = "center",
}: {
  eyebrow: string;
  segments: readonly HeadingSegment[];
  description?: string;
  id?: string;
  align?: "center" | "start";
}) {
  return (
    <div
      className={cn(
        "flex flex-col gap-3",
        align === "center" ? "items-center text-center" : "items-start text-start",
      )}
    >
      <Eyebrow>{eyebrow}</Eyebrow>
      <Heading segments={segments} id={id} />
      {description ? (
        <p className="font-persian max-w-xl text-sm leading-[2] text-white/65 sm:text-base">
          {description}
        </p>
      ) : null}
    </div>
  );
}
