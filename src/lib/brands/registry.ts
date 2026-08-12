import type { BrandConfig, BrandKey } from "./types";
import { ducatiBrand } from "./ducati";
import { indianBrand } from "./indian";
import { indianHdsBrand } from "./indian-hds";
import { lambrettaHdsBrand } from "./lambretta-hds";
import { polarisHdsBrand } from "./polaris-hds";

export const brands: Record<BrandKey, BrandConfig> = {
  ducati: ducatiBrand,
  indian: indianBrand,
  "indian-hds": indianHdsBrand,
  "lambretta-hds": lambrettaHdsBrand,
  "polaris-hds": polarisHdsBrand,
};

export const brandKeys: BrandKey[] = [
  "ducati",
  "indian",
  "indian-hds",
  "lambretta-hds",
  "polaris-hds",
];
