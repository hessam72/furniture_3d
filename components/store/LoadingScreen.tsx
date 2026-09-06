'use client'

/**
 * Config-fetch splash for the walkable gallery — same design language as the
 * /car loading overlay (dark stage, gold hairline, tracked micro-labels).
 * Model streaming afterwards is covered by ModelsLoadingIndicator.
 */
export function LoadingScreen() {
  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-7 bg-[#060608]">
      <div className="flex flex-col items-center gap-2 px-6 text-center">
        <span className="text-[10px] uppercase tracking-[0.45em] text-[#d4af37]/70">Gallery</span>
        <h1
          className="font-[family-name:var(--font-vazir)] text-2xl font-light tracking-wide text-white md:text-3xl"
          dir="rtl"
        >
          ویترین مجازی
        </h1>
        <p className="font-[family-name:var(--font-vazir)] mt-1 text-sm text-white/35" dir="rtl">
          در حال آماده‌سازی تجربه سه‌بعدی...
        </p>
      </div>

      {/* Indeterminate gold hairline */}
      <div className="relative h-px w-64 overflow-hidden bg-white/10">
        <div
          className="absolute h-full w-1/3 animate-[loading-sweep_1.4s_ease-in-out_infinite]"
          style={{ background: 'linear-gradient(to right, #b8860b, #d4af37, #f5e6b8)' }}
        />
      </div>

      <style jsx>{`
        @keyframes loading-sweep {
          0% { left: -33%; }
          100% { left: 100%; }
        }
      `}</style>
    </div>
  )
}
