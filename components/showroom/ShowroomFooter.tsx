import SmoothLink from './SmoothLink'
import type { ShowroomConfig } from '@/lib/showroom/config'
import { BrandMark } from './ShowroomHeader'
import { Icon } from './icons'

/** What each contact line is, said once above the value. Keyed by the icon the
 *  config already picks, so a brand adds a line without adding a label. */
const CONTACT_LABELS: Record<string, string> = {
  pin: 'نشانی',
  phone: 'تلفن',
  mail: 'پیام',
  clock: 'ساعت کاری',
}

/**
 * Light footer: the brand block, the link columns beside it, and the contact
 * details on a row of their own underneath.
 *
 * Contact is the one thing a visitor comes back down here for, so it is not a
 * fourth column of small print — it is a full-width band with each detail given
 * a line, an icon and a label of its own.
 */
export default function ShowroomFooter({
  config,
}: {
  config: ShowroomConfig
}) {
  const footer = config.footer
  if (!footer) return null

  return (
    <footer className="sr-footer" id="footer">
      <div className="sr-shell sr-footer-grid">
        <div className="sr-footer-about">
          <BrandMark brand={config.brand} />
          {footer.about && <p>{footer.about}</p>}
          {footer.social && footer.social.length > 0 && (
            <div className="sr-social">
              {footer.social.map((item) => (
                <a key={item.label} href={item.href} rel="noreferrer">
                  {item.label}
                </a>
              ))}
            </div>
          )}
        </div>

        {footer.columns && footer.columns.length > 0 && (
          <div className="sr-footer-links">
            {footer.columns.map((column) => (
              <div key={column.title}>
                <h4>{column.title}</h4>
                <ul>
                  {column.links.map((link) => (
                    <li key={link.label}>
                      <SmoothLink href={link.href}>{link.label}</SmoothLink>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}

        {footer.contact && (
          <section className="sr-contact" aria-label={footer.contact.title}>
            <h4>{footer.contact.title}</h4>
            <ul>
              {footer.contact.items.map((item) => (
                <li key={item.text}>
                  <span className="sr-contact-icon">
                    <Icon name={item.icon} size={17} />
                  </span>
                  <span className="sr-contact-body">
                    <span className="sr-contact-label">{CONTACT_LABELS[item.icon] ?? ''}</span>
                    <span className="sr-contact-value">{item.text}</span>
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>

      {footer.copyright && (
        <div className="sr-shell">
          <p className="sr-footer-bar">{footer.copyright}</p>
        </div>
      )}
    </footer>
  )
}
