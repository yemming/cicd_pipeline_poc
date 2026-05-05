import type { BrandConfig, BrandKey } from "./types";
import { ducatiBrand } from "./ducati";
import { indianBrand } from "./indian";

export const brands: Record<BrandKey, BrandConfig> = {
  ducati: ducatiBrand,
  indian: indianBrand,
};

export const brandKeys: BrandKey[] = ["ducati", "indian"];
