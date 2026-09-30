import { useLocale, useTranslations } from 'next-intl'
import { Link } from '@/i18n/navigation'
import { formatPrice } from '@/lib/store/catalog'
import type { ProductCard } from '@/lib/showroom/productQuery'
import { SofaGhostIcon } from '../icons'

/** How many colour dots a card shows before the rest are only counted. */
const MAX_DOTS = 6

/**
 * One product on the list: the homepage's collection card, made a single link
 * to the product's page. The photo is decorative — the name is the card's text.
 */
export default function ProductTile({ card, href }: { card: ProductCard; href: string }) {
  const t = useTranslations('showroomProducts')
  const tc = useTranslations('common')
  const locale = useLocale()
  const kind = [card.category, card.type].filter(Boolean).join(' · ')

  return (
    <Link href={href} className="sr-card sr-tile">
      <span className="sr-card-media">
        {card.image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={card.image} alt="" loading="lazy" decoding="async" />
        ) : (
          <SofaGhostIcon size={92} className="sr-card-ghost" />
        )}
        <span className="sr-podium" />
      </span>

      <span className="sr-card-foot">
        <span className="sr-card-title">
          {kind && (
            <span className="sr-card-cat" dir="auto">
              {kind}
            </span>
          )}
          <span className="sr-card-name" dir="auto">
            {card.name}
          </span>
        </span>

        <span className="sr-tile-meta">
          <span className="sr-tile-price" data-on-request={card.price === undefined}>
            {card.price === undefined ? tc('priceOnRequest') : formatPrice(card.price, locale)}
          </span>
          {card.colors.length > 0 && (
            <span className="sr-card-dots">
              {card.colors.slice(0, MAX_DOTS).map((color) => (
                <span className="sr-card-dot" key={color.hex + color.name} style={{ background: color.hex }} />
              ))}
              <span className="sr-only">
                {t('colorsAria')}: {new Intl.ListFormat(locale).format(card.colors.map((color) => color.name))}
              </span>
            </span>
          )}
        </span>
      </span>
    </Link>
  )
}
