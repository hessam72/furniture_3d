import {
  BRAND,
  FOOTER,
  CONTACT_PHONE_DISPLAY,
  CONTACT_PHONE_HREF,
} from "@/lib/content/home";

export default function SiteFooter() {
  return (
    <footer className="px-5 pb-12 pt-6 sm:px-6">
      <div className="mx-auto flex max-w-3xl flex-col items-center gap-4">
        {/* Not the legacy .gold-divider — that one is hardcoded to the old
            #b8860b and is still used by /store and /car. */}
        <div aria-hidden="true" className="flex w-full items-center gap-4">
          <span className="h-px flex-1 bg-[linear-gradient(90deg,transparent,var(--color-gold-line-hi))]" />
          <span className="h-1.5 w-1.5 rotate-45 bg-gold/70" />
          <span className="h-px flex-1 bg-[linear-gradient(90deg,var(--color-gold-line-hi),transparent)]" />
        </div>

        <span className="font-persian text-gold-key text-sm font-extrabold tracking-[0.18em]">
          {BRAND.name}
        </span>

        <p className="font-persian text-center text-xs leading-6 text-white/45">
          {FOOTER.description}
        </p>

        <a
          href={CONTACT_PHONE_HREF}
          className="font-persian text-sm font-bold text-white transition-colors hover:text-gold-soft"
        >
          <bdi dir="ltr" className="persian-number tracking-wide">
            {CONTACT_PHONE_DISPLAY}
          </bdi>
        </a>

        <p className="font-persian text-[0.68rem] text-white/30">
          © {BRAND.name} — {FOOTER.rights}
        </p>
      </div>
    </footer>
  );
}
