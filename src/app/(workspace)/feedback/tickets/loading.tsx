export default function Loading() {
  return (
    <div className="space-y-5">
      {/* Header row */}
      <div className="flex items-center justify-between">
        <div className="h-7 w-32 rounded bg-[#F4F5F7] animate-pulse" />
        <div className="flex items-center gap-2">
          <div className="h-9 w-20 rounded bg-[#F4F5F7] animate-pulse" />
          <div className="h-9 w-20 rounded bg-[#F4F5F7] animate-pulse" />
          <div className="h-9 w-24 rounded bg-[#F4F5F7] animate-pulse" />
        </div>
      </div>

      {/* Kanban columns */}
      <div className="grid grid-cols-4 gap-4">
        {["草稿", "工作中", "Review", "上版"].map((label) => (
          <div
            key={label}
            className="min-h-[480px] bg-[#F4F5F7] rounded-lg p-3 space-y-3"
          >
            <div className="flex items-center justify-between">
              <div className="h-3.5 w-16 rounded bg-white animate-pulse" />
              <div className="h-3.5 w-5 rounded bg-white animate-pulse" />
            </div>
            {[0, 1].map((i) => (
              <div
                key={i}
                className="bg-white rounded p-3 space-y-2 border border-[#DFE1E6]"
              >
                <div className="h-4 w-4/5 rounded bg-[#F4F5F7] animate-pulse" />
                <div className="h-5 w-20 rounded bg-[#F4F5F7] animate-pulse" />
                <div className="flex items-center justify-between pt-1">
                  <div className="h-3 w-16 rounded bg-[#F4F5F7] animate-pulse" />
                  <div className="h-5 w-5 rounded-full bg-[#F4F5F7] animate-pulse" />
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
