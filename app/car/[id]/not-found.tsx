import Link from 'next/link'

export default function CarNotFound() {
  return (
    <div
      className="flex h-screen w-screen flex-col items-center justify-center gap-4 bg-[#060608] text-white"
      dir="ltr"
    >
      <p className="text-[10px] uppercase tracking-[0.45em] text-[#d4af37]/70">Configurator</p>
      <h1 className="text-2xl font-extralight uppercase tracking-[0.2em]">Car not found</h1>
      <p className="text-sm text-white/40">The model you are looking for does not exist.</p>
      <Link
        href="/"
        className="mt-4 rounded-full border border-white/15 px-6 py-2.5 text-xs uppercase tracking-[0.2em] text-white/70 transition-colors hover:border-white/40 hover:text-white"
      >
        Back to home
      </Link>
    </div>
  )
}
