'use client'

import { useEffect, useMemo, useState } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { productPath } from '@/lib/showroom/paths'
import {
  SORT_KEYS,
  parseSort,
  searchIndex,
  searchProducts,
  sortProducts,
  type ProductCard,
  type SortKey,
} from '@/lib/showroom/productQuery'
import ProductTile from './ProductTile'
import { ChevronIcon, CloseIcon, SearchIcon, SofaGhostIcon } from '../icons'

const SORT_LABELS = {
  default: 'sortDefault',
  'price-asc': 'sortPriceAsc',
  'price-desc': 'sortPriceDesc',
  name: 'sortName',
} as const satisfies Record<SortKey, string>

/**
 * The list's state, written to the address bar so a search can be shared and
 * survives a reload. `replaceState` rather than the router: a router replace
 * would refetch the page's server payload for a change only this component
 * reads, and Next keeps `useSearchParams` in step with it either way.
 */
function writeUrl(query: string, sort: SortKey) {
  const url = new URL(window.location.href)
  if (query.trim()) url.searchParams.set('q', query)
  else url.searchParams.delete('q')
  if (sort !== 'default') url.searchParams.set('sort', sort)
  else url.searchParams.delete('sort')
  window.history.replaceState(null, '', url)
}

/**
 * Search, sort and the grid. The server renders the full list in the
 * showroom's own order — what a crawler, a no-JS visitor and the first paint
 * all get — and `?q=` / `?sort=` are applied once hydrated.
 */
export default function ProductBrowser({ slug, cards }: { slug: string; cards: ProductCard[] }) {
  const t = useTranslations('showroomProducts')
  const locale = useLocale()
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState<SortKey>('default')

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    setQuery(params.get('q') ?? '')
    setSort(parseSort(params.get('sort')))
  }, [])

  const index = useMemo(() => cards.map(searchIndex), [cards])
  const shown = useMemo(
    () => sortProducts(searchProducts(cards, index, query), sort, locale),
    [cards, index, query, sort, locale]
  )

  const changeQuery = (value: string) => {
    setQuery(value)
    writeUrl(value, sort)
  }
  const changeSort = (value: SortKey) => {
    setSort(value)
    writeUrl(query, value)
  }

  return (
    <section className="sr-section sr-pl" aria-labelledby="sr-pl-title">
      <div className="sr-shell">
        <div className="sr-pl-head">
          <div>
            <p className="sr-section-eyebrow">{t('eyebrow')}</p>
            <h1 className="sr-h2" id="sr-pl-title">
              {t('title')}
            </h1>
            <p className="sr-pl-count">{t('count', { count: cards.length })}</p>
          </div>

          {cards.length > 0 && (
            <div className="sr-pl-tools" role="search">
              <label className="sr-pl-search">
                <SearchIcon size={18} />
                <span className="sr-only">{t('searchLabel')}</span>
                <input
                  type="search"
                  value={query}
                  placeholder={t('searchPlaceholder')}
                  autoComplete="off"
                  enterKeyHint="search"
                  onChange={(event) => changeQuery(event.target.value)}
                />
                {query && (
                  <button
                    type="button"
                    className="sr-pl-clear"
                    aria-label={t('clearSearch')}
                    onClick={() => changeQuery('')}
                  >
                    <CloseIcon size={15} />
                  </button>
                )}
              </label>

              <label className="sr-pl-sort">
                <span>{t('sortLabel')}</span>
                <select value={sort} onChange={(event) => changeSort(parseSort(event.target.value))}>
                  {SORT_KEYS.map((key) => (
                    <option key={key} value={key}>
                      {t(SORT_LABELS[key])}
                    </option>
                  ))}
                </select>
                <ChevronIcon size={16} />
              </label>
            </div>
          )}
        </div>

        {/* Announced after each keystroke's filter settles, silent otherwise. */}
        <p className="sr-only" aria-live="polite">
          {query.trim() ? t('results', { count: shown.length }) : ''}
        </p>

        {shown.length > 0 ? (
          <ul className="sr-pl-grid">
            {shown.map((card) => (
              <li key={card.key}>
                <ProductTile card={card} href={productPath(slug, card.key)} />
              </li>
            ))}
          </ul>
        ) : (
          <div className="sr-pl-empty">
            <SofaGhostIcon size={72} />
            <h2>{cards.length ? t('emptyTitle') : t('noProductsTitle')}</h2>
            <p>{cards.length ? t('emptyBody') : t('noProductsBody')}</p>
            {cards.length > 0 && (
              <button type="button" className="sr-btn sr-btn-outline" onClick={() => changeQuery('')}>
                {t('showAll')}
              </button>
            )}
          </div>
        )}
      </div>
    </section>
  )
}
