import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * An inset glass slab with its own dark-blue→black gradient and a thin gold
 * border. Tones are assigned so no two adjacent sections match, which is what
 * makes the sections read as separate without breaking the palette.
 */
export default function Section({
  children,
  tone,
  id,
  labelledBy,
  className,
}: {
  children: ReactNode;
  tone: "a" | "b" | "c" | "d";
  id?: string;
  labelledBy?: string;
  className?: string;
}) {
  return (
    <section
      id={id}
      aria-labelledby={labelledBy}
      // scroll-mt clears the fixed header when an anchor jumps here
      className="scroll-mt-24 px-3 py-2.5 sm:px-5 sm:py-4"
    >
      <div
        data-tone={tone}
        className={cn(
          "section-panel mx-auto flex max-w-5xl flex-col items-center gap-8 px-4 py-16 sm:px-8 sm:py-20",
          className,
        )}
      >
        {children}
      </div>
    </section>
  );
}
