import SmoothLink from './SmoothLink'
import type { ShowroomConfig } from '@/lib/showroom/config'
import { BrandMark } from './ShowroomHeader'
import { Icon } from './icons'

/** Light footer: the brand block, the link columns and the contact lines the
 *  hero already carries, so a visitor who scrolled past them still has them. */
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

        {footer.columns?.map((column) => (
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

        {footer.contact && (
          <div>
            <h4>{footer.contact.title}</h4>
            <ul className="sr-footer-contact">
              {footer.contact.items.map((item) => (
                <li key={item.text}>
                  <Icon name={item.icon} size={16} />
                  {item.text}
                </li>
              ))}
            </ul>
          </div>
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
