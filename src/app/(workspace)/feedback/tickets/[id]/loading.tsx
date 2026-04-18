export default function Loading() {
  return (
    <div className="-m-8 flex h-[calc(100dvh-4rem)] overflow-hidden">
      {/* ── Left: ticket info skeleton ── */}
      <div className="w-1/2 flex flex-col border-r border-[#DFE1E6] overflow-y-auto">
        <div className="flex-1 px-8 py-6 space-y-5">
          {/* Back link */}
          <div className="h-4 w-16 rounded bg-[#F4F5F7] animate-pulse" />

          {/* Title + status */}
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1 space-y-2">
              <div className="h-6 w-3/4 rounded bg-[#F4F5F7] animate-pulse" />
              <div className="h-3 w-48 rounded bg-[#F4F5F7] animate-pulse" />
            </div>
            <div className="h-6 w-16 rounded-full bg-[#F4F5F7] animate-pulse" />
          </div>

          {/* Fields card */}
          <div className="bg-white border border-[#DFE1E6] rounded-md overflow-hidden">
            <div className="divide-y divide-[#F4F5F7]">
              <div className="flex gap-6 px-5 py-3">
                <div className="h-3 w-12 rounded bg-[#F4F5F7] shrink-0 animate-pulse mt-0.5" />
                <div className="h-4 w-48 rounded bg-[#F4F5F7] animate-pulse" />
              </div>
              <div className="flex gap-6 px-5 py-3">
                <div className="h-3 w-12 rounded bg-[#F4F5F7] shrink-0 animate-pulse mt-0.5" />
                <div className="flex-1 space-y-1.5">
                  <div className="h-3.5 w-full rounded bg-[#F4F5F7] animate-pulse" />
                  <div className="h-3.5 w-5/6 rounded bg-[#F4F5F7] animate-pulse" />
                </div>
              </div>
            </div>
          </div>

          {/* Status row */}
          <div className="bg-white border border-[#DFE1E6] rounded-md px-5 py-3 flex gap-2">
            <div className="h-5 w-12 rounded bg-[#F4F5F7] animate-pulse" />
            <div className="h-5 w-14 rounded bg-[#F4F5F7] animate-pulse" />
            <div className="h-5 w-14 rounded bg-[#F4F5F7] animate-pulse" />
            <div className="h-5 w-14 rounded bg-[#F4F5F7] animate-pulse" />
          </div>

          {/* Activity header */}
          <div className="flex items-center gap-3 pt-2">
            <div className="h-4 w-16 rounded bg-[#F4F5F7] animate-pulse" />
            <div className="h-3 w-12 rounded bg-[#F4F5F7] animate-pulse" />
          </div>

          {/* Comment rows */}
          {[0, 1].map((i) => (
            <div key={i} className="flex gap-3 py-3">
              <div className="w-8 h-8 rounded-full bg-[#F4F5F7] animate-pulse shrink-0" />
              <div className="flex-1 space-y-2">
                <div className="h-3 w-32 rounded bg-[#F4F5F7] animate-pulse" />
                <div className="h-3.5 w-4/5 rounded bg-[#F4F5F7] animate-pulse" />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Right: canvas skeleton ── */}
      <div className="w-1/2 flex items-center justify-center bg-[#FAFBFC]">
        <div className="flex flex-col items-center gap-3 text-[#6B778C]">
          <span
            className="inline-block w-7 h-7 border-[2.5px] border-[#DFE1E6] border-t-[#0052CC] rounded-full animate-spin"
            aria-hidden
          />
          <span className="text-[12px] font-semibold">載入單據⋯</span>
        </div>
      </div>
    </div>
  );
}
