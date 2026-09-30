import { getTranslations } from 'next-intl/server'
import { Link } from '@/i18n/navigation'
import type { Locale } from '@/i18n/routing'
import { formatPrice } from '@/lib/store/catalog'
import type { ShowroomConfig } from '@/lib/showroom/config'
import { presentationPath } from '@/lib/showroom/paths'
import type { ProductDetail } from '@/lib/showroom/products'
import SmoothLink from '../SmoothLink'
import ProductViewer3D from './ProductViewer3D'
import { CubeIcon, LayersIcon, SofaGhostIcon } from '../icons'

/**
 * One product: its photo beside its specs, and the plain turntable under both.
 *
 * With no photo the turntable takes the photo's place rather than leaving an
 * empty plate above a second copy of the piece; with no 3D file the section
 * simply is not there.
 */
export default async function ProductDetailView({
  slug,
  locale,
  detail,
  featured,
}: {
  slug: string
  locale: Locale
  detail: ProductDetail
  /** The homepage's featured block — its stage and ground dress this turntable
   *  too, so a piece stands here the way the brand presents it there. */
  featured: ShowroomConfig['featured']
}) {
  const [t, ts, tc] = await Promise.all([
    getTranslations({ locale, namespace: 'showroomProduct' }),
    getTranslations({ locale, namespace: 'specs' }),
    getTranslations({ locale, namespace: 'common' }),
  ])
  const { key, product, image, viewer } = detail

  const kind = [product.category, product.type].filter(Boolean).join(' · ')
  // A card-length line leads when the backend sends one, and the full text
  // then gets its own block; otherwise the full text is the lead.
  const lead = product.shortDescription || product.detailedDescription
  const description = product.shortDescription ? product.detailedDescription : undefined
  const specs = [
    { label: ts('dimensions'), value: product.dimensions },
    { label: ts('material'), value: product.material },
    { label: ts('fabricType'), value: product.fabricType },
    { label: ts('weight'), value: product.weight },
    { label: ts('seatingCapacity'), value: product.seatingCapacity },
    { label: ts('shelves'), value: product.shelves },
    ...(product.specs ?? []),
  ].filter((row) => row.value)
  const colors = product.colors ?? []
  const fabrics = product.fabricMaterials ?? []

  const turntable = viewer && (
    <ProductViewer3D
      config={viewer.config}
      model={viewer.model}
      plinth={featured.stage}
      background={featured.viewer?.background}
    />
  )

  return (
    <>
      <section className="sr-section sr-pd" aria-labelledby="sr-pd-title">
        <div className="sr-shell sr-pd-grid">
          <div className="sr-pd-media">
            {image ? (
              <>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={image} alt={product.name} />
                <span className="sr-podium" />
              </>
            ) : (
              turntable || (
                <>
                  <SofaGhostIcon size={128} className="sr-card-ghost" />
                  <span className="sr-only">{t('noPhoto')}</span>
                  <span className="sr-podium" />
                </>
              )
            )}
          </div>

          <div className="sr-pd-info">
            {kind && (
              <p className="sr-pd-eyebrow" dir="auto">
                {kind}
              </p>
            )}
            <h1 className="sr-pd-title" id="sr-pd-title" dir="auto">
              {product.name}
            </h1>

            <p className="sr-pd-price" data-on-request={product.price == null}>
              <span>{t('price')}</span>
              <strong>{product.price == null ? tc('priceOnRequest') : formatPrice(product.price, locale)}</strong>
            </p>

            {lead && (
              <p className="sr-pd-lead" dir="auto">
                {lead}
              </p>
            )}

            {colors.length > 0 && (
              <ul className="sr-pd-colors" aria-label={ts('colors')}>
                {colors.map((color) => (
                  <li className="sr-pd-color" key={color.hex + color.name} dir="auto">
                    <i style={{ background: color.hex }} aria-hidden="true" />
                    {color.name}
                  </li>
                ))}
              </ul>
            )}

            {((image && viewer) || detail.hasPresentation) && (
              <div className="sr-pd-actions">
                {image && viewer && (
                  <SmoothLink href="#viewer" className="sr-btn sr-btn-solid">
                    <CubeIcon size={18} />
                    {t('view3d')}
                  </SmoothLink>
                )}
                {detail.hasPresentation && (
                  <Link href={presentationPath(slug, key)} className="sr-btn sr-btn-outline">
                    <LayersIcon size={18} />
                    {t('fullView')}
                  </Link>
                )}
              </div>
            )}

            {specs.length > 0 && (
              <div className="sr-pd-block">
                <h2>{t('specsTitle')}</h2>
                <dl className="sr-pd-specs">
                  {specs.map((row, index) => (
                    <div key={`${index}-${row.label}`}>
                      <dt>{row.label}</dt>
                      <dd dir="auto">{row.value}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            )}

            {fabrics.length > 0 && (
              <div className="sr-pd-block">
                <h2>{ts('fabricComposition')}</h2>
                <ul className="sr-pd-fabrics">
                  {fabrics.map((fabric) => (
                    <li key={fabric} dir="auto">
                      {fabric}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {description && (
              <div className="sr-pd-block">
                <h2>{t('descriptionTitle')}</h2>
                <p className="sr-pd-lead" dir="auto">
                  {description}
                </p>
              </div>
            )}
          </div>
        </div>
      </section>

      {image && turntable && (
        <section className="sr-section sr-pd-viewer" id="viewer" aria-labelledby="sr-pd-viewer-title">
          <div className="sr-shell">
            <div className="sr-pd-viewer-head">
              <h2 className="sr-h2" id="sr-pd-viewer-title">
                {t('viewerTitle')}
              </h2>
              <p>{t('viewerLead')}</p>
            </div>
            {turntable}
          </div>
        </section>
      )}
    </>
  )
}
