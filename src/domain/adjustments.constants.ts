export const EXCEPTIONS_PAGE_SIZE_DEFAULT = 50;

export const ADJUSTMENT_TYPES = [
  { value: "exception_in", label: "例外進貨", direction: "in" as const },
  { value: "exception_out", label: "例外出貨", direction: "out" as const },
  { value: "damage", label: "損耗報廢", direction: "out" as const },
  { value: "manual", label: "手動調整", direction: "both" as const },
  { value: "other", label: "其他", direction: "both" as const },
];
