import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import cars from '@/public/config/cars.json'
import CarPageClient, { type Car } from './CarPageClient'

export function generateStaticParams() {
  return (cars as Car[]).map((car) => ({ id: car.id }))
}

export function generateMetadata({ params }: { params: { id: string } }): Metadata {
  const car = (cars as Car[]).find((c) => c.id === params.id)
  if (!car) return { title: 'Car Not Found' }

  const title = `${car.name} — 3D Tuning Configurator`
  const description =
    `Configure the ${car.name} in real-time 3D: paint, wheels, aero and more. ` +
    `${car.specs.engine}, ${car.specs.horsepower} hp, top speed ${car.specs.top_speed}.`

  return {
    title,
    description,
    openGraph: { title, description, type: 'website' },
  }
}

export default function CarPage({ params }: { params: { id: string } }) {
  const car = (cars as Car[]).find((c) => c.id === params.id)
  if (!car) notFound()
  return <CarPageClient car={car} />
}
