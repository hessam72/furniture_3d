export default function Loading() {
  return (
    <div className="h-screen w-screen flex items-center justify-center bg-black text-white">
      <div className="flex items-center gap-3">
        <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
        Loading...
      </div>
    </div>
  )
}
